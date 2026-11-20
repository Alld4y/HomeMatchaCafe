import { setVapidDetails, sendNotification } from 'web-push';
import { pool, ensurePgSchema, getEnvConfig } from './pgPool';
import { getStoreSettings } from './settings';
import { getMemberByPhone } from './members';

// 🔔 VAPID Keys สำหรับ Web Push Notifications
export const VAPID_PUBLIC_KEY =
    getEnvConfig('VAPID_PUBLIC_KEY', 'BE8JA8Xwip1-lKD8PFbKlzYIxo_xlAKZb4l-1BUD7ZTszabJ2BAIo5q7jogeM50MA3EcHvF3XNLPxZdwNEfOITo');

const VAPID_PRIVATE_KEY =
    getEnvConfig('VAPID_PRIVATE_KEY', 'T_V9MVis-ndV-ra2RM6jGlXxy56tGqPELG9KyjgF84Y');

const VAPID_SUBJECT =
    getEnvConfig('VAPID_SUBJECT', 'mailto:homematchacafe@gmail.com');

// ตั้งค่า VAPID Details
try {
    setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
    console.warn('⚠️ WebPush setVapidDetails error:', err);
}

export interface PushSubscriptionRecord {
    id: number;
    phone: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
    createdAt: string;
}

/**
 * บันทึกหรืออัปเดต Web Push Subscription ของลูกค้าที่ล็อกอิน
 */
export async function savePushSubscription(
    phone: string,
    subscription: {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    },
    userAgent = ''
): Promise<boolean> {
    if (!phone || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return false;
    }

    await ensurePgSchema();
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    try {
        await pool.query(
            `
            INSERT INTO public.push_subscriptions (phone, endpoint, p256dh, auth, user_agent, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (endpoint) DO UPDATE
            SET phone = EXCLUDED.phone,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                updated_at = NOW()
            `,
            [cleanPhone, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent]
        );
        return true;
    } catch (err) {
        console.error('❌ Error saving push subscription:', err);
        return false;
    }
}

/**
 * ลบ Push Subscription เมื่อกดยกเลิกรับแจ้งเตือนหรือ Token หมดอายุ
 */
export async function removePushSubscription(endpoint: string): Promise<boolean> {
    if (!endpoint) return false;
    await ensurePgSchema();
    try {
        await pool.query('DELETE FROM public.push_subscriptions WHERE endpoint = $1', [endpoint]);
        return true;
    } catch (err) {
        console.error('❌ Error removing push subscription:', err);
        return false;
    }
}

/**
 * ดึงรายการ Subscriptions ของเบอร์โทรนั้นๆ
 */
export async function getSubscriptionsByPhone(phone: string): Promise<PushSubscriptionRecord[]> {
    if (!phone) return [];
    await ensurePgSchema();
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    try {
        const res = await pool.query(
            `
            SELECT id, phone, endpoint, p256dh, auth, user_agent as "userAgent", created_at as "createdAt"
            FROM public.push_subscriptions
            WHERE phone = $1
            ORDER BY updated_at DESC
            `,
            [cleanPhone]
        );
        return res.rows;
    } catch (err) {
        console.error('❌ Error getting push subscriptions by phone:', err);
        return [];
    }
}

export interface CustomerNotificationPayload {
    phone: string;
    customerName?: string;
    orderId?: string;
    orderCode?: string;
    title: string;
    body: string;
    url?: string;
    eventType: 'order_created' | 'slip_approved' | 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled' | 'member_registered' | 'custom';
    itemsSummary?: string;
    totalPrice?: number;
    pin?: string;
}

/**
 * ค้นหา LINE User ID ที่ผูกกับเบอร์โทรศัพท์ (จากตาราง members หรือ line_users)
 */
export async function getLineUserIdByPhone(phone: string): Promise<string | null> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;
    await ensurePgSchema();
    try {
        const memberRes = await pool.query(
            `SELECT line_user_id FROM public.members WHERE phone = $1 AND line_user_id IS NOT NULL AND line_user_id <> '' LIMIT 1`,
            [cleanPhone]
        );
        if (memberRes.rows.length > 0 && memberRes.rows[0].line_user_id) {
            return memberRes.rows[0].line_user_id;
        }

        const lineUserRes = await pool.query(
            `SELECT line_user_id FROM public.line_users WHERE phone = $1 AND line_user_id IS NOT NULL AND line_user_id <> '' LIMIT 1`,
            [cleanPhone]
        );
        if (lineUserRes.rows.length > 0 && lineUserRes.rows[0].line_user_id) {
            return lineUserRes.rows[0].line_user_id;
        }
    } catch (e) {
        console.warn('⚠️ Error querying line_user_id:', e);
    }
    return null;
}

/**
 * ดึงโปรไฟล์ผู้ใช้จาก LINE Messaging API
 */
export async function fetchLineUserProfile(channelAccessToken: string, userId: string): Promise<{ displayName?: string; pictureUrl?: string; statusMessage?: string } | null> {
    if (!channelAccessToken || !userId) return null;
    try {
        const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { Authorization: `Bearer ${channelAccessToken}` }
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('Could not fetch LINE profile:', e);
    }
    return null;
}

/**
 * ส่งการแจ้งเตือนไปยังลูกค้าผ่าน LINE Official Account 100%
 */
export async function sendCustomerNotification(payload: CustomerNotificationPayload): Promise<{
    webPushSent: number;
    lineOaSent: boolean;
    reason?: string;
}> {
    const { phone, customerName, title, body, url = '/loyalty', eventType, orderCode, itemsSummary, totalPrice, pin } = payload;
    if (!phone) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ไม่มีเบอร์โทรลูกค้า' };
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const settings = await getStoreSettings();
    const notifSettings = settings.notifications;
    const lineOaSettings = settings.lineOa;

    let lineOaSuccess = false;

    // ค้นหาชื่อลูกค้าจากระบบสมาชิกหากไม่ได้ส่งมา
    let finalCustomerName = customerName;
    if (!finalCustomerName && cleanPhone) {
        try {
            const memberRow = await pool.query(
                `SELECT first_name, last_name FROM public.members WHERE phone = $1 LIMIT 1`,
                [cleanPhone]
            );
            if (memberRow.rows.length > 0) {
                finalCustomerName = `${memberRow.rows[0].first_name || ''} ${memberRow.rows[0].last_name || ''}`.trim();
            }
        } catch {}
    }

    // ส่งผ่าน LINE Official Account 100%
    const isLineOaAllowed = lineOaSettings?.enabled && (
        eventType === 'order_created' ? lineOaSettings.notifyOnOrderCreated !== false :
        eventType === 'slip_approved' ? lineOaSettings.notifyOnSlipApproved !== false :
        eventType === 'brewing' ? lineOaSettings.notifyOnBrewing !== false :
        eventType === 'ready_to_ship' ? lineOaSettings.notifyOnReadyToShip !== false :
        eventType === 'delivering' ? lineOaSettings.notifyOnDelivering !== false :
        eventType === 'completed' ? lineOaSettings.notifyOnCompleted !== false :
        eventType === 'cancelled' ? lineOaSettings.notifyOnCancelled !== false :
        eventType === 'member_registered' ? lineOaSettings.notifyOnMemberRegistered !== false : true
    );

    const channelToken = lineOaSettings?.channelAccessToken || notifSettings?.lineOaChannelAccessToken;

    if (isLineOaAllowed && channelToken) {
        try {
            const lineUserId = await getLineUserIdByPhone(cleanPhone);
            if (lineUserId) {
                lineOaSuccess = await sendLineStatusFlexMessage(
                    channelToken,
                    lineUserId,
                    {
                        title,
                        body,
                        eventType,
                        orderCode,
                        itemsSummary,
                        totalPrice,
                        url,
                        phone: cleanPhone,
                        pin,
                        customerName: finalCustomerName
                    }
                );
            }
        } catch (lineErr) {
            console.warn('⚠️ LINE OA notification error:', lineErr);
        }
    }

    return { webPushSent: 0, lineOaSent: lineOaSuccess };
}

/**
 * ส่งข้อความสถานะออเดอร์ในรูปแบบ LINE Flex Message
 */
export async function sendLineStatusFlexMessage(
    channelAccessToken: string,
    toUserId: string,
    params: {
        title: string;
        body: string;
        eventType: CustomerNotificationPayload['eventType'];
        orderCode?: string;
        itemsSummary?: string;
        totalPrice?: number;
        url: string;
        phone?: string;
        pin?: string;
        customerName?: string;
    }
): Promise<boolean> {
    if (!channelAccessToken || !toUserId) return false;

    const { title, body, eventType, orderCode, itemsSummary, totalPrice, url, phone, pin, customerName } = params;
    let targetUrl = url;
    if (eventType === 'slip_approved' && (!targetUrl || !targetUrl.includes('/success'))) {
        targetUrl = `/success?orderCode=${encodeURIComponent(orderCode || '')}&phone=${encodeURIComponent(phone || '')}`;
    }
    const trackingUrl = targetUrl.startsWith('http') ? targetUrl : `https://homematchacafe.store${targetUrl}`;

    const nameVal = customerName || '';

    // ตรวจสอบว่าแอดมินตั้งค่าการ์ดแจ้งเตือนสถานะออกแบบเอง (Custom Status Card) สำหรับสถานะนี้หรือไม่
    try {
        const settings = await getStoreSettings();
        const customCfg = settings.lineOa?.customStatusCards?.[eventType];
        if (customCfg?.enabled && customCfg.bubble) {
            let rawJson = JSON.stringify(customCfg.bubble);
            rawJson = rawJson
                .replace(/#\{orderCode\}/g, orderCode ? (orderCode.startsWith('#') ? orderCode : `#${orderCode}`) : '')
                .replace(/\{orderCode\}/g, orderCode || '')
                .replace(/\{itemsSummary\}/g, itemsSummary || '')
                .replace(/\{totalPrice\}/g, totalPrice !== undefined ? `฿${totalPrice.toLocaleString()}` : '')
                .replace(/คุณ\s*\{name\}/g, nameVal ? (nameVal.startsWith('คุณ') ? nameVal : `คุณ ${nameVal}`) : 'คุณลูกค้า')
                .replace(/คุณ\s*\{customerName\}/g, nameVal ? (nameVal.startsWith('คุณ') ? nameVal : `คุณ ${nameVal}`) : 'คุณลูกค้า')
                .replace(/\{name\}/g, nameVal || 'คุณลูกค้า')
                .replace(/\{customerName\}/g, nameVal || 'คุณลูกค้า')
                .replace(/\{url\}/g, trackingUrl)
                .replace(/\{trackingUrl\}/g, trackingUrl)
                .replace(/\{successUrl\}/g, trackingUrl)
                .replace(/\{title\}/g, title)
                .replace(/\{body\}/g, body)
                .replace(/\{phone\}/g, phone || '')
                .replace(/\{pin\}/g, pin || '')
                .replace(/\{loyaltyUrl\}/g, phone ? `https://homematchacafe.store/loyalty?phone=${phone}` : 'https://homematchacafe.store/loyalty');
            const customBubble = JSON.parse(rawJson);
            return sendLineRawFlexMessage(channelAccessToken, toUserId, `${title}: ${body}`, customBubble, {
                customerName: nameVal,
                name: nameVal,
                pin: pin || '',
                phone: phone || '',
                orderCode: orderCode || '',
                itemsSummary: itemsSummary || '',
                totalPrice: totalPrice !== undefined ? `฿${totalPrice.toLocaleString()}` : ''
            });
        }
    } catch (cfgErr) {
        console.warn('⚠️ Error checking custom status card:', cfgErr);
    }

    const themeMap: Record<string, { color: string; badge: string; icon: string; imageUrl: string }> = {
        member_registered: {
            color: '#166534',
            badge: 'สมัครสมาชิกสำเร็จ',
            icon: '🎉',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg'
        },
        order_created: {
            color: '#166534',
            badge: 'รับออเดอร์แล้ว',
            icon: '📝',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg'
        },
        slip_approved: {
            color: '#15803d',
            badge: 'อนุมัติการชำระเงินแล้ว',
            icon: '💳',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-ready.jpg'
        },
        brewing: {
            color: '#0d9488',
            badge: 'บาริสต้ากำลังชงมัทฉะ',
            icon: '🍵',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-brewing.jpg'
        },
        ready_to_ship: {
            color: '#059669',
            badge: 'ชงเสร็จแล้ว แพ็กพร้อมส่ง',
            icon: '✨',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-ready.jpg'
        },
        delivering: {
            color: '#0284c7',
            badge: 'ไรเดอร์กำลังนำส่งถึงที่',
            icon: '🛵',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-delivery.jpg'
        },
        completed: {
            color: '#166534',
            badge: 'จัดส่งสำเร็จเรียบร้อย',
            icon: '🎉',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-completed.jpg'
        },
        cancelled: {
            color: '#dc2626',
            badge: 'ออเดอร์ถูกยกเลิก',
            icon: '❌',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-cancelled.jpg'
        },
        custom: {
            color: '#166534',
            badge: 'แจ้งเตือนจากทางร้าน',
            icon: '📢',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg'
        }
    };

    const theme = themeMap[eventType] || themeMap.custom;

    const contents: any = {
        type: 'bubble',
        hero: {
            type: 'image',
            url: theme.imageUrl,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover'
        },
        header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: theme.color,
            paddingAll: '16px',
            contents: [
                {
                    type: 'text',
                    text: 'HOME MATCHA CAFE',
                    weight: 'bold',
                    size: 'xs',
                    color: '#dcfce7'
                },
                {
                    type: 'text',
                    text: `${theme.icon} ${title}`,
                    weight: 'bold',
                    size: 'lg',
                    color: '#ffffff',
                    margin: 'sm'
                }
            ]
        },
        body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: [
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        {
                            type: 'text',
                            text: 'สถานะ:',
                            size: 'sm',
                            color: '#64748b',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: theme.badge,
                            size: 'sm',
                            weight: 'bold',
                            color: theme.color,
                            flex: 4,
                            align: 'end'
                        }
                    ]
                }
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '14px',
            contents: eventType === 'member_registered' ? [
                {
                    type: 'button',
                    style: 'primary',
                    color: '#166534',
                    action: {
                        type: 'uri',
                        label: '⭐ เปิดบัตรสะสมแต้ม',
                        uri: phone ? `https://homematchacafe.store/loyalty?phone=${phone}` : 'https://homematchacafe.store/loyalty'
                    }
                },
                {
                    type: 'button',
                    style: 'secondary',
                    color: '#0d9488',
                    action: {
                        type: 'uri',
                        label: '🍵 สั่งเครื่องดื่มออนไลน์',
                        uri: 'https://homematchacafe.store/menu'
                    }
                }
            ] : [
                {
                    type: 'button',
                    style: 'primary',
                    color: theme.color,
                    action: {
                        type: 'uri',
                        label: eventType === 'slip_approved' ? '🧾 ดูใบเสร็จ & ออเดอร์' : 'ดูสถานะ / ใบเสร็จ',
                        uri: trackingUrl
                    }
                }
            ]
        }
    };

    if (customerName) {
        contents.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
                {
                    type: 'text',
                    text: eventType === 'member_registered' ? 'ชื่อสมาชิก:' : 'ชื่อลูกค้า:',
                    size: 'sm',
                    color: '#64748b',
                    flex: 3
                },
                {
                    type: 'text',
                    text: customerName,
                    size: 'sm',
                    weight: 'bold',
                    color: '#166534',
                    flex: 4,
                    align: 'end'
                }
            ]
        });
    }

    if (phone) {
        contents.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
                {
                    type: 'text',
                    text: 'เบอร์โทรศัพท์:',
                    size: 'sm',
                    color: '#64748b',
                    flex: 3
                },
                {
                    type: 'text',
                    text: phone,
                    size: 'sm',
                    weight: 'bold',
                    color: '#1e293b',
                    flex: 4,
                    align: 'end'
                }
            ]
        });
    }

    if (pin) {
        contents.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
                {
                    type: 'text',
                    text: 'รหัส PIN (4 หลัก):',
                    size: 'sm',
                    color: '#64748b',
                    flex: 3
                },
                {
                    type: 'text',
                    text: pin,
                    size: 'sm',
                    weight: 'bold',
                    color: '#166534',
                    flex: 4,
                    align: 'end'
                }
            ]
        });
    }

    if (orderCode) {
        contents.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
                {
                    type: 'text',
                    text: 'รหัสออเดอร์:',
                    size: 'sm',
                    color: '#64748b',
                    flex: 2
                },
                {
                    type: 'text',
                    text: `#${orderCode}`,
                    size: 'sm',
                    weight: 'bold',
                    color: '#1e293b',
                    flex: 4,
                    align: 'end'
                }
            ]
        });
    }

    if (itemsSummary) {
        contents.body.contents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '10px',
            backgroundColor: '#f8fafc',
            cornerRadius: '8px',
            contents: [
                {
                    type: 'text',
                    text: itemsSummary,
                    size: 'xs',
                    color: '#475569',
                    wrap: true
                }
            ]
        });
    }

    if (totalPrice !== undefined && totalPrice > 0) {
        contents.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
                {
                    type: 'text',
                    text: 'ยอดรวม:',
                    size: 'sm',
                    color: '#64748b',
                    flex: 2
                },
                {
                    type: 'text',
                    text: `฿${totalPrice.toLocaleString()}`,
                    size: 'sm',
                    weight: 'bold',
                    color: '#166534',
                    flex: 4,
                    align: 'end'
                }
            ]
        });
    }

    contents.body.contents.push({
        type: 'text',
        text: body,
        size: 'xs',
        color: '#64748b',
        wrap: true,
        margin: 'md'
    });

    return sendLineRawFlexMessage(channelAccessToken, toUserId, `${title}: ${body}`, contents);
}

/**
 * ส่ง Flex Message ดิบไปยัง LINE Messaging API
 */
export function sanitizeFlexBubble(bubble: any, fallbackPhone?: string, testVars?: Record<string, string>): any {
    if (!bubble || typeof bubble !== 'object') return bubble;
    try {
        let str = JSON.stringify(bubble);
        // 1. แทนที่ layout: inline ที่ LINE ไม่รองรับ ให้เป็น horizontal
        str = str.replace(/"layout"\s*:\s*"inline"/g, '"layout":"horizontal"');

        // 2. แทนค่า placeholders ที่อาจยังค้างอยู่ในการ์ด (เช่น ตอนทดสอบส่ง) ป้องกัน LINE ตีกลับ Error "invalid uri scheme"
        const phone = testVars?.phone || fallbackPhone || '0812345678';
        const orderCode = testVars?.orderCode || 'HM-TEST88';
        const itemsSummary = testVars?.itemsSummary || 'Cold-Fermented Oat Milk Matcha Latte x1, Clear Matcha Cold Whisk x1';
        const totalPrice = testVars?.totalPrice || '165';
        const name = testVars?.customerName || testVars?.name || 'ลูกค้า';
        const points = testVars?.points || '10';
        const pin = testVars?.pin || '1234';

        const successUrl = `https://homematchacafe.store/success?orderCode=${encodeURIComponent(orderCode)}&phone=${encodeURIComponent(phone)}`;

        str = str.replace(/\{phone\}/g, phone);
        str = str.replace(/\{pin\}/g, pin);
        str = str.replace(/#\{orderCode\}/g, orderCode ? (orderCode.startsWith('#') ? orderCode : `#${orderCode}`) : '');
        str = str.replace(/\{orderCode\}/g, orderCode);
        str = str.replace(/\{itemsSummary\}/g, itemsSummary);
        str = str.replace(/\{totalPrice\}/g, totalPrice);
        str = str.replace(/คุณ\s*\{name\}/g, name.startsWith('คุณ') ? name : `คุณ ${name}`);
        str = str.replace(/คุณ\s*\{customerName\}/g, name.startsWith('คุณ') ? name : `คุณ ${name}`);
        str = str.replace(/\{name\}/g, name);
        str = str.replace(/\{customerName\}/g, name);
        str = str.replace(/\{points\}/g, points);
        str = str.replace(/\{successUrl\}/g, successUrl);
        str = str.replace(/\{url\}/g, successUrl);
        str = str.replace(/\{trackingUrl\}/g, successUrl);
        str = str.replace(/\{loyaltyUrl\}/g, 'https://homematchacafe.store/loyalty');
        str = str.replace(/\{registerUrl\}/g, `https://homematchacafe.store/loyalty?action=register&phone=${phone}`);
        str = str.replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');

        return JSON.parse(str);
    } catch {
        return bubble;
    }
}

export async function sendLineRawFlexMessage(
    channelAccessToken: string,
    toUserId: string,
    altText: string,
    flexContents: any,
    testVars?: Record<string, string>
): Promise<boolean> {
    if (!channelAccessToken || !toUserId) return false;

    try {
        const safeContents = sanitizeFlexBubble(flexContents, undefined, testVars);
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                to: toUserId,
                messages: [
                    {
                        type: 'flex',
                        altText: altText.slice(0, 400),
                        contents: safeContents
                    }
                ]
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error('❌ LINE API Push Error:', res.status, errBody);
            return false;
        }
        return true;
    } catch (e) {
        console.error('❌ Error sending LINE OA Flex message:', e);
        return false;
    }
}

/**
 * ส่ง Flex Message แบบ Broadcast ไปยังเพื่อนทุกคนของ LINE OA
 */
export async function sendLineBroadcastFlexMessage(
    channelAccessToken: string,
    altText: string,
    flexContents: any
): Promise<boolean> {
    if (!channelAccessToken) return false;

    try {
        const safeContents = sanitizeFlexBubble(flexContents);
        const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                messages: [
                    {
                        type: 'flex',
                        altText: (altText || 'Home Matcha Cafe').slice(0, 400),
                        contents: safeContents
                    }
                ]
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error('❌ LINE API Broadcast Error:', res.status, errBody);
            return false;
        }
        return true;
    } catch (e) {
        console.error('❌ Error broadcasting LINE OA Flex message:', e);
        return false;
    }
}

/**
 * ดึงรายการ LINE User ID ทั้งหมดของแอดมิน (รองรับหลายคน จากทั้งช่อง adminLineUserId และ adminPhone)
 */
export async function getAdminLineUserIds(): Promise<string[]> {
    const settings = await getStoreSettings();
    const lineOa = settings.lineOa;
    const userIds = new Set<string>();

    // 1. จาก adminLineUserId (รองรับหลายคน คั่นด้วยจุลภาค , หรือเว้นวรรค)
    if (lineOa?.adminLineUserId) {
        lineOa.adminLineUserId
            .split(/[,;\s]+/)
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(id => {
                if (id.startsWith('U')) userIds.add(id);
            });
    }

    // 2. จาก adminPhone (รองรับหลายเบอร์ คั่นด้วยจุลภาค , หรือเว้นวรรค)
    const phoneRaw = lineOa?.adminPhone || '';
    const phones = phoneRaw
        .split(/[,;\s\n]+/)
        .map(p => p.replace(/[^0-9]/g, ''))
        .filter(p => p.length >= 9);

    for (const ph of phones) {
        const uid = await getLineUserIdByPhone(ph);
        if (uid) userIds.add(uid);
    }

    return Array.from(userIds);
}

/**
 * แปลงรายการตะกร้าสินค้าให้เป็นข้อความสรุปรายละเอียด (ชื่อ, จำนวน, ระดับความหวาน, ท็อปปิ้ง, โน้ต) อย่างชัดเจน
 */
export function formatOrderItemsSummary(basket: any[]): string {
    if (!Array.isArray(basket) || basket.length === 0) return 'ไม่มีรายการเครื่องดื่ม';
    return basket.map(item => {
        const name = item.thaiName || item.name || 'เครื่องดื่ม';
        const qty = Number(item.quantity) || 1;
        const details: string[] = [];
        if (item.sweetness !== undefined && item.sweetness !== null && item.sweetness !== '') {
            details.push(`หวาน ${item.sweetness}%`);
        }
        if (item.addonName) {
            details.push(`+${item.addonName}`);
        }
        if (item.note && String(item.note).trim()) {
            details.push(`โน้ต: ${String(item.note).trim()}`);
        }
        const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
        return `• ${name} x${qty}${detailStr}`;
    }).join('\n');
}

/**
 * แจ้งเตือนแอดมินทาง LINE เมื่อมีออเดอร์ใหม่, ลูกค้าแนบสลิป, หรือเมื่อออเดอร์ได้รับการยืนยันรับยอดแล้ว (ส่งหาแอดมินทุกคน)
 */
export async function notifyAdminLine(params: {
    eventType: 'new_order' | 'slip_uploaded' | 'order_paid';
    orderCode: string;
    customerName: string;
    memberName?: string;
    phone: string;
    totalPrice: number;
    address?: string;
    customerMessage?: string;
    itemsSummary?: string;
    deliveryDate?: string;
    deliveryRound?: string;
    reviewReason?: string;
    slipImageUrl?: string;
}): Promise<boolean> {
    const settings = await getStoreSettings();
    const lineOa = settings.lineOa;

    if (!lineOa?.enabled || !lineOa?.channelAccessToken) {
        return false;
    }

    const adminUserIds = await getAdminLineUserIds();
    if (!adminUserIds.length) {
        return false;
    }

    if ((params.eventType === 'new_order' || params.eventType === 'order_paid') && !lineOa.notifyAdminOnNewOrder) {
        return false;
    }
    if (params.eventType === 'slip_uploaded' && !lineOa.notifyAdminOnSlipUploaded) {
        return false;
    }

    let title = '🍵 มีออเดอร์ใหม่เข้ามา!';
    let headerTag = 'ADMIN: ออเดอร์ใหม่';
    let headerBg = '#166534';
    let btnLabel = 'เปิดจัดการออเดอร์ (Admin)';
    let btnColor = '#166534';

    if (params.eventType === 'order_paid') {
        title = '🍵 ยืนยันรับยอดแล้ว (พร้อมชง)';
        headerTag = 'ADMIN: ออเดอร์รับยอดแล้ว';
        headerBg = '#15803d'; // Green
        btnLabel = 'เปิดจัดการออเดอร์ (Admin)';
        btnColor = '#15803d';
    } else if (params.eventType === 'slip_uploaded') {
        title = '💳 ลูกค้าส่งสลิป (รอแอดมินตรวจ)';
        headerTag = 'ADMIN: รอยืนยันสลิป';
        headerBg = '#0284c7'; // Blue
        btnLabel = '🔍 ตรวจสอบสลิปใน Admin';
        btnColor = '#0284c7';
    }

    const altText = `${title} ออเดอร์ #${params.orderCode} (฿${params.totalPrice.toLocaleString()})`;

    let memberName = params.memberName;
    if (!memberName && params.phone) {
        try {
            const member = await getMemberByPhone(params.phone);
            if (member?.fullName) {
                memberName = member.fullName;
            }
        } catch {
            // ignore
        }
    }

    const customerDisplayText = (memberName && memberName.trim() !== params.customerName.trim())
        ? `${params.customerName} (สมาชิก: ${memberName.trim()})`
        : params.customerName;

    const bodyContents: any[] = [
        {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: 'รหัส:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: `#${params.orderCode}`, size: 'sm', weight: 'bold', color: '#1e293b', flex: 4, align: 'end' }
            ]
        },
        {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'ลูกค้า:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: `${customerDisplayText} (${params.phone})`, size: 'sm', color: '#1e293b', flex: 4, align: 'end', wrap: true }
            ]
        },
        {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'ยอดชำระ:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: `฿${params.totalPrice.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#166534', flex: 4, align: 'end' }
            ]
        }
    ];

    if (params.deliveryDate || params.deliveryRound) {
        bodyContents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'รอบส่ง:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: `${params.deliveryDate || ''} ${params.deliveryRound || ''}`.trim(), size: 'xs', color: '#1e293b', flex: 4, align: 'end', wrap: true }
            ]
        });
    }

    if (params.address && params.address.trim()) {
        bodyContents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'สถานที่ส่ง:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: params.address.trim(), size: 'xs', color: '#1e293b', flex: 4, align: 'end', wrap: true }
            ]
        });
    }

    if (params.customerMessage && params.customerMessage.trim()) {
        bodyContents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'โน้ตลูกค้า:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: params.customerMessage.trim(), size: 'xs', color: '#b45309', flex: 4, align: 'end', wrap: true }
            ]
        });
    }

    if (params.reviewReason) {
        bodyContents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'sm',
            paddingAll: '8px',
            backgroundColor: '#fef2f2',
            cornerRadius: '6px',
            contents: [
                { type: 'text', text: `⚠️ ตรวจสลิป: ${params.reviewReason}`, size: 'xs', color: '#b91c1c', wrap: true, weight: 'bold' }
            ]
        });
    }

    if (params.itemsSummary) {
        bodyContents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '10px',
            backgroundColor: '#f8fafc',
            cornerRadius: '8px',
            borderWidth: '1px',
            borderColor: '#e2e8f0',
            contents: [
                {
                    type: 'text',
                    text: '📋 รายการที่สั่ง:',
                    size: 'xs',
                    weight: 'bold',
                    color: '#0f172a'
                },
                {
                    type: 'text',
                    text: params.itemsSummary,
                    size: 'xs',
                    color: '#334155',
                    wrap: true,
                    margin: 'xs'
                }
            ]
        });
    }

    const bubble: any = {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: headerBg,
            paddingAll: '16px',
            contents: [
                {
                    type: 'text',
                    text: headerTag,
                    weight: 'bold',
                    size: 'xs',
                    color: '#dcfce7'
                },
                {
                    type: 'text',
                    text: title,
                    weight: 'bold',
                    size: 'md',
                    color: '#ffffff',
                    margin: 'sm'
                }
            ]
        },
        body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: bodyContents
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            contents: [
                {
                    type: 'button',
                    style: 'primary',
                    color: btnColor,
                    action: {
                        type: 'uri',
                        label: btnLabel,
                        uri: 'https://homematchacafe.store/admin'
                    }
                }
            ]
        }
    };

    const results = await Promise.all(
        adminUserIds.map(uid => sendLineRawFlexMessage(lineOa.channelAccessToken, uid, altText, bubble))
    );
    return results.some(r => r === true);
}

/**
 * ส่งข้อความทดสอบจากหน้าแอดมิน (รองรับทั้งข้อความทั่วไป และการทดสอบยิงการ์ดแจ้งเตือนสถานะต่างๆ)
 */
export async function sendLineTestMessage(
    param1?: string | {
        targetUserId?: string;
        targetPhone?: string;
        customMessage?: string;
        statusType?: 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled' | 'order_created' | 'slip_approved' | 'admin_order_paid' | 'admin_slip_uploaded';
        testVars?: Record<string, string>;
    },
    legacyCustomMessage?: string
): Promise<{ success: boolean; message: string }> {
    const settings = await getStoreSettings();
    const lineOa = settings.lineOa;

    const token = lineOa.channelAccessToken;
    if (!token) {
        return { success: false, message: 'ยังไม่ได้ระบุ Channel Access Token ในการตั้งค่า LINE OA' };
    }

    let targetUserId: string | undefined;
    let targetPhone: string | undefined;
    let customMessage: string | undefined;
    let statusType: string | undefined;
    let testVars: Record<string, string> | undefined;

    if (typeof param1 === 'object' && param1 !== null) {
        targetUserId = param1.targetUserId;
        targetPhone = param1.targetPhone;
        customMessage = param1.customMessage;
        statusType = param1.statusType;
        testVars = param1.testVars;
    } else {
        targetUserId = param1;
        customMessage = legacyCustomMessage;
    }

    let recipients: string[] = [];

    if (targetUserId) {
        targetUserId
            .split(/[,;\s]+/)
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(id => {
                if (id.startsWith('U')) recipients.push(id);
            });
    }

    if (targetPhone) {
        const phones = targetPhone
            .split(/[,;\s\n]+/)
            .map(p => p.replace(/[^0-9]/g, ''))
            .filter(p => p.length >= 9);

        for (const ph of phones) {
            const uid = await getLineUserIdByPhone(ph);
            if (uid && !recipients.includes(uid)) {
                recipients.push(uid);
            }
        }
    }

    if (!recipients.length) {
        recipients = await getAdminLineUserIds();
    }

    recipients = Array.from(new Set(recipients));

    if (!recipients.length) {
        return {
            success: false,
            message: 'ไม่พบ LINE User ID สำหรับรับข้อความทดสอบ (กรุณาระบุ Admin User ID หรือระบุเบอร์โทรแอดมินที่เคยพิมพ์ในแชท LINE OA ค่ะ)'
        };
    }

    // กรณีทดสอบการ์ดแจ้งเตือนสถานะออเดอร์ (Status Card Test)
    if (statusType) {
        if (statusType === 'admin_order_paid') {
            const success = await notifyAdminLine({
                eventType: 'order_paid',
                orderCode: testVars?.orderCode || 'HM-TEST88',
                customerName: testVars?.customerName || 'คุณนราวิชญ์',
                memberName: testVars?.name || 'นราวิชญ์ อนุวงศ์',
                phone: testVars?.phone || '0641163533',
                totalPrice: Number(testVars?.totalPrice) || 120,
                address: 'ตึกผู้ป่วยใน ชั้น 2',
                customerMessage: 'ฝากวางไว้ที่เคาน์เตอร์พยาบาลค่ะ',
                itemsSummary: testVars?.itemsSummary || '• มัทฉะลาเต้ x1 (หวาน 25%)\n• ชาไทยเย็น x1 (หวาน 50%, +เจลลี่)',
                deliveryDate: '2026-11-21',
                deliveryRound: 'รอบ 10:30 น.'
            });
            return {
                success,
                message: success
                    ? 'ยิงการ์ดแจ้งเตือนแอดมิน: ออเดอร์รับยอดแล้ว (พร้อมรายการที่สั่ง) สำเร็จแล้วค่ะ'
                    : 'ส่งการ์ดทดสอบไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า Admin LINE หรือ Token ค่ะ'
            };
        }

        if (statusType === 'admin_slip_uploaded') {
            const success = await notifyAdminLine({
                eventType: 'slip_uploaded',
                orderCode: testVars?.orderCode || 'HM-TEST88',
                customerName: testVars?.customerName || 'คุณนราวิชญ์',
                memberName: testVars?.name || 'นราวิชญ์ อนุวงศ์',
                phone: testVars?.phone || '0641163533',
                totalPrice: Number(testVars?.totalPrice) || 120,
                address: 'ตึกผู้ป่วยใน ชั้น 2',
                customerMessage: 'ฝากวางไว้ที่เคาน์เตอร์พยาบาลค่ะ',
                itemsSummary: testVars?.itemsSummary || '• มัทฉะลาเต้ x1 (หวาน 25%)\n• ชาไทยเย็น x1 (หวาน 50%, +เจลลี่)',
                deliveryDate: '2026-11-21',
                deliveryRound: 'รอบ 10:30 น.',
                reviewReason: 'ยอดเงินหรือเวลาไม่ตรง รอแอดมินตรวจสอบ'
            });
            return {
                success,
                message: success
                    ? 'ยิงการ์ดแจ้งเตือนแอดมิน: สลิปรอตรวจ (มีปุ่มตรวจสลิป) สำเร็จแล้วค่ะ'
                    : 'ส่งการ์ดทดสอบไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า Admin LINE หรือ Token ค่ะ'
            };
        }

        const statusMetaMap: Record<string, { title: string; body: string; name: string }> = {
            member_registered: {
                name: 'ลูกค้าสมัครสมาชิกเสร็จแล้ว',
                title: '🎉 สมัครสมาชิกสำเร็จเรียบร้อยค่ะ',
                body: 'ยินดีต้อนรับสู่ครอบครัว Home Matcha Cafe ค่ะ 🍵 รหัส PIN สำหรับเข้าสู่ระบบของคุณคือ {pin}'
            },
            order_created: {
                name: 'รับออเดอร์ใหม่',
                title: '📝 ได้รับคำสั่งซื้อเรียบร้อยแล้ว',
                body: 'ทางร้านได้รับออเดอร์ #HM-TEST88 แล้วค่ะ กรุณาแนบสลิปเพื่อเริ่มคิวชงนะคะ'
            },
            slip_approved: {
                name: 'อนุมัติสลิปแล้ว',
                title: '💳 ตรวจสอบการชำระเงินสำเร็จ',
                body: 'ยอดชำระได้รับการยืนยันแล้ว ออเดอร์ของคุณเข้าสู่คิวการชงเรียบร้อยค่ะ'
            },
            brewing: {
                name: 'กำลังชง',
                title: '🍵 บาริสต้ากำลังชงมัทฉะ',
                body: 'บาริสต้ากำลังตั้งใจชงเครื่องดื่มมัทฉะแก้วพิเศษของคุณอย่างพิถีพิถัน'
            },
            ready_to_ship: {
                name: 'ชงเสร็จพร้อมส่ง',
                title: '✨ ชงเสร็จเรียบร้อยแล้ว',
                body: 'เครื่องดื่มของคุณชงเสร็จแล้ว แพ็กเรียบร้อย พร้อมออกเดินทางค่ะ'
            },
            delivering: {
                name: 'กำลังนำส่ง',
                title: '🛵 กำลังนำส่งเครื่องดื่ม',
                body: 'ไรเดอร์กำลังมุ่งหน้าไปส่งเครื่องดื่มเย็นๆ สดชื่นถึงมือคุณแล้วค่ะ'
            },
            completed: {
                name: 'จัดส่งสำเร็จ',
                title: '🎉 จัดส่งเครื่องดื่มสำเร็จแล้ว',
                body: 'ขอบคุณที่อุดหนุน Home Matcha Cafe นะคะ หวังว่าจะถูกใจในรสชาติมัทฉะแท้ค่ะ 🍵'
            },
            cancelled: {
                name: 'ยกเลิกออเดอร์',
                title: '❌ ออเดอร์ถูกยกเลิก',
                body: 'คำสั่งซื้อได้รับการยกเลิกแล้ว หากมีข้อสงสัยสามารถติดต่อแอดมินได้ตลอดค่ะ'
            }
        };

        const meta = statusMetaMap[statusType] || {
            name: statusType,
            title: `📢 แจ้งเตือนสถานะ: ${statusType}`,
            body: 'นี่คือข้อความทดสอบการแจ้งเตือนสถานะคำสั่งซื้อทาง LINE OA'
        };

        const testItems = testVars?.itemsSummary || 'Cold-Fermented Oat Milk Matcha Latte x1, Clear Matcha Cold Whisk x1';
        const testCode = testVars?.orderCode || 'HM-TEST88';
        const testPrice = testVars?.totalPrice ? Number(testVars.totalPrice.replace(/[^0-9.]/g, '')) || 165 : 165;
        const testPhone = targetPhone || lineOa.adminPhone || '0987654321';
        const testPin = testVars?.pin || '8899';
        const testCustomerName = testVars?.customerName || testVars?.name || 'คุณลูกค้า';
        const testUrl = statusType === 'slip_approved'
            ? `/success?orderCode=${encodeURIComponent(testCode)}&phone=${encodeURIComponent(testPhone)}`
            : '/order/test';

        let successCount = 0;
        for (const to of recipients) {
            const ok = await sendLineStatusFlexMessage(token, to, {
                title: meta.title,
                body: meta.body,
                eventType: statusType as any,
                orderCode: testCode,
                itemsSummary: testItems,
                totalPrice: testPrice,
                url: testUrl,
                phone: testPhone,
                pin: testPin,
                customerName: testCustomerName
            });
            if (ok) successCount++;
        }

        if (successCount > 0) {
            return {
                success: true,
                message: `ยิงการ์ดทดสอบสถานะ "${meta.name}" ไปยัง LINE แอดมินสำเร็จแล้ว (${successCount}/${recipients.length} ท่าน) 🍵`
            };
        } else {
            return {
                success: false,
                message: `ส่งการ์ดสถานะไม่สำเร็จ กรุณาตรวจสอบว่าบัญชี LINE แอดมินได้แอดเพื่อนกับ LINE OA หรือยังนะคะ`
            };
        }
    }

    // กรณีทดสอบข้อความทั่วไป
    const testBubble = {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#166534',
            paddingAll: '16px',
            contents: [
                { type: 'text', text: '🍵 HOME MATCHA CAFE', weight: 'bold', size: 'sm', color: '#dcfce7' },
                { type: 'text', text: '🔔 ข้อความทดสอบระบบ LINE OA', weight: 'bold', size: 'md', color: '#ffffff', margin: 'xs' }
            ]
        },
        body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: [
                {
                    type: 'text',
                    text: customMessage || 'การเชื่อมต่อระบบ LINE Official Account กับ Home Matcha Cafe ทำงานได้อย่างถูกต้องสมบูรณ์แล้วค่ะ! 🎉',
                    size: 'sm',
                    color: '#334155',
                    wrap: true
                },
                {
                    type: 'text',
                    text: `ส่งเมื่อ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
                    size: 'xs',
                    color: '#94a3b8',
                    margin: 'lg'
                }
            ]
        }
    };

    let successCount = 0;
    for (const to of recipients) {
        const ok = await sendLineRawFlexMessage(token, to, 'ข้อความทดสอบระบบ LINE OA Home Matcha Cafe', testBubble);
        if (ok) successCount++;
    }

    if (successCount > 0) {
        return { success: true, message: `ส่งข้อความทดสอบไปยัง LINE แอดมินสำเร็จแล้วค่ะ (${successCount}/${recipients.length} ท่าน)!` };
    } else {
        return { success: false, message: 'ส่งข้อความไม่สำเร็จ กรุณาตรวจสอบว่าแอดมินกดแอดเพื่อนกับบอท LINE OA หรือยังนะคะ' };
    }
}
