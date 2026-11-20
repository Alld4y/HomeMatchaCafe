import { setVapidDetails, sendNotification } from 'web-push';
import { pool, ensurePgSchema, getEnvConfig } from './pgPool';
import { getStoreSettings } from './settings';

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
    orderId?: string;
    orderCode?: string;
    title: string;
    body: string;
    url?: string;
    eventType: 'order_created' | 'slip_approved' | 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled' | 'custom';
    itemsSummary?: string;
    totalPrice?: number;
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
 * ส่งการแจ้งเตือนไปยังลูกค้าตามการตั้งค่าในระบบ (Web Push + LINE OA)
 */
export async function sendCustomerNotification(payload: CustomerNotificationPayload): Promise<{
    webPushSent: number;
    lineOaSent: boolean;
    reason?: string;
}> {
    const { phone, title, body, url = '/loyalty', eventType, orderCode, itemsSummary, totalPrice } = payload;
    if (!phone) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ไม่มีเบอร์โทรลูกค้า' };
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const settings = await getStoreSettings();
    const notifSettings = settings.notifications;
    const lineOaSettings = settings.lineOa;

    let webPushCount = 0;
    let lineOaSuccess = false;

    // 1. ส่งผ่าน Web Push Notification (ถ้าเปิดใช้งาน)
    const isWebPushAllowedForEvent =
        eventType === 'slip_approved' ? notifSettings?.notifyOnSlipApproved !== false :
        eventType === 'delivering' ? notifSettings?.notifyOnDelivering !== false :
        eventType === 'completed' ? notifSettings?.notifyOnCompleted !== false : true;

    if (notifSettings?.enabled && notifSettings?.enableWebPush !== false && isWebPushAllowedForEvent) {
        const subs = await getSubscriptionsByPhone(cleanPhone);
        if (subs.length > 0) {
            const pushData = JSON.stringify({
                title,
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                url
            });

            await Promise.all(
                subs.map(async (sub) => {
                    try {
                        await sendNotification(
                            {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth
                                }
                            },
                            pushData,
                            { TTL: 60 * 60 * 24 } // 24 ชั่วโมง
                        );
                        webPushCount++;
                    } catch (err: any) {
                        if (err?.statusCode === 410 || err?.statusCode === 404) {
                            await removePushSubscription(sub.endpoint);
                        } else {
                            console.warn('⚠️ Push notification delivery error:', err?.message || err);
                        }
                    }
                })
            );
        }
    }

    // 2. ส่งผ่าน LINE Official Account
    const isLineOaAllowed = lineOaSettings?.enabled && (
        eventType === 'order_created' ? lineOaSettings.notifyOnOrderCreated !== false :
        eventType === 'slip_approved' ? lineOaSettings.notifyOnSlipApproved !== false :
        eventType === 'brewing' ? lineOaSettings.notifyOnBrewing !== false :
        eventType === 'ready_to_ship' ? lineOaSettings.notifyOnReadyToShip !== false :
        eventType === 'delivering' ? lineOaSettings.notifyOnDelivering !== false :
        eventType === 'completed' ? lineOaSettings.notifyOnCompleted !== false :
        eventType === 'cancelled' ? lineOaSettings.notifyOnCancelled !== false : true
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
                        phone: cleanPhone
                    }
                );
            }
        } catch (lineErr) {
            console.warn('⚠️ LINE OA notification error:', lineErr);
        }
    }

    return { webPushSent: webPushCount, lineOaSent: lineOaSuccess };
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
    }
): Promise<boolean> {
    if (!channelAccessToken || !toUserId) return false;

    const { title, body, eventType, orderCode, itemsSummary, totalPrice, url, phone } = params;
    const trackingUrl = url.startsWith('http') ? url : `https://homematchacafe.store${url}`;

    // ตรวจสอบว่าแอดมินตั้งค่าการ์ดแจ้งเตือนสถานะออกแบบเอง (Custom Status Card) สำหรับสถานะนี้หรือไม่
    try {
        const settings = await getStoreSettings();
        const customCfg = settings.lineOa?.customStatusCards?.[eventType];
        if (customCfg?.enabled && customCfg.bubble) {
            let rawJson = JSON.stringify(customCfg.bubble);
            rawJson = rawJson
                .replace(/\{orderCode\}/g, orderCode || '')
                .replace(/\{itemsSummary\}/g, itemsSummary || '')
                .replace(/\{totalPrice\}/g, totalPrice !== undefined ? `฿${totalPrice.toLocaleString()}` : '')
                .replace(/\{url\}/g, trackingUrl)
                .replace(/\{trackingUrl\}/g, trackingUrl)
                .replace(/\{title\}/g, title)
                .replace(/\{body\}/g, body)
                .replace(/\{phone\}/g, phone || '')
                .replace(/\{loyaltyUrl\}/g, phone ? `https://homematchacafe.store/loyalty?phone=${phone}` : 'https://homematchacafe.store/loyalty');
            const customBubble = JSON.parse(rawJson);
            return sendLineRawFlexMessage(channelAccessToken, toUserId, `${title}: ${body}`, customBubble);
        }
    } catch (cfgErr) {
        console.warn('⚠️ Error checking custom status card:', cfgErr);
    }

    const themeMap: Record<string, { color: string; badge: string; icon: string; imageUrl: string }> = {
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
            paddingAll: '14px',
            contents: [
                {
                    type: 'button',
                    style: 'primary',
                    color: theme.color,
                    action: {
                        type: 'uri',
                        label: 'ดูสถานะ / ใบเสร็จ',
                        uri: trackingUrl
                    }
                }
            ]
        }
    };

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
export function sanitizeFlexBubble(bubble: any, fallbackPhone?: string): any {
    if (!bubble || typeof bubble !== 'object') return bubble;
    try {
        let str = JSON.stringify(bubble);
        // 1. แทนที่ layout: inline ที่ LINE ไม่รองรับ ให้เป็น horizontal
        str = str.replace(/"layout"\s*:\s*"inline"/g, '"layout":"horizontal"');

        // 2. แทนค่า placeholders ที่อาจยังค้างอยู่ในการ์ด (เช่น ตอนทดสอบส่ง) ป้องกัน LINE ตีกลับ Error "invalid uri scheme"
        const phone = fallbackPhone || '0812345678';
        str = str.replace(/\{phone\}/g, phone);
        str = str.replace(/\{orderCode\}/g, 'HM-TEST88');
        str = str.replace(/\{totalPrice\}/g, '165');
        str = str.replace(/\{name\}/g, 'ลูกค้าคนพิเศษ');
        str = str.replace(/\{points\}/g, '10');
        str = str.replace(/\{url\}/g, 'https://homematchacafe.store/order');
        str = str.replace(/\{trackingUrl\}/g, 'https://homematchacafe.store/order');
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
    flexContents: any
): Promise<boolean> {
    if (!channelAccessToken || !toUserId) return false;

    try {
        const safeContents = sanitizeFlexBubble(flexContents);
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
 * แจ้งเตือนแอดมินทาง LINE เมื่อมีออเดอร์ใหม่ หรือมีการแนบสลิป
 */
export async function notifyAdminLine(params: {
    eventType: 'new_order' | 'slip_uploaded';
    orderCode: string;
    customerName: string;
    phone: string;
    totalPrice: number;
    itemsSummary?: string;
    deliveryDate?: string;
    deliveryRound?: string;
}): Promise<boolean> {
    const settings = await getStoreSettings();
    const lineOa = settings.lineOa;

    if (!lineOa?.enabled || !lineOa?.channelAccessToken || !lineOa?.adminLineUserId) {
        return false;
    }

    if (params.eventType === 'new_order' && !lineOa.notifyAdminOnNewOrder) {
        return false;
    }
    if (params.eventType === 'slip_uploaded' && !lineOa.notifyAdminOnSlipUploaded) {
        return false;
    }

    const title = params.eventType === 'new_order' ? '🍵 มีออเดอร์ใหม่เข้ามา!' : '💳 ลูกค้าแนบสลิปใหม่!';
    const altText = `${title} ออเดอร์ #${params.orderCode} (฿${params.totalPrice})`;

    const bubble: any = {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: params.eventType === 'new_order' ? '#166534' : '#0284c7',
            paddingAll: '16px',
            contents: [
                {
                    type: 'text',
                    text: 'ADMIN NOTIFICATION',
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
            contents: [
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
                        { type: 'text', text: `${params.customerName} (${params.phone})`, size: 'sm', color: '#1e293b', flex: 4, align: 'end' }
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
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            contents: [
                {
                    type: 'button',
                    style: 'primary',
                    color: '#166534',
                    action: {
                        type: 'uri',
                        label: 'เปิดจัดการออเดอร์ (Admin)',
                        uri: 'https://homematchacafe.store/admin'
                    }
                }
            ]
        }
    };

    if (params.deliveryDate || params.deliveryRound) {
        bubble.body.contents.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
                { type: 'text', text: 'รอบส่ง:', size: 'sm', color: '#64748b', flex: 2 },
                { type: 'text', text: `${params.deliveryDate || ''} ${params.deliveryRound || ''}`, size: 'xs', color: '#475569', flex: 4, align: 'end' }
            ]
        });
    }

    if (params.itemsSummary) {
        bubble.body.contents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '10px',
            backgroundColor: '#f1f5f9',
            cornerRadius: '8px',
            contents: [
                { type: 'text', text: params.itemsSummary, size: 'xs', color: '#334155', wrap: true }
            ]
        });
    }

    return sendLineRawFlexMessage(lineOa.channelAccessToken, lineOa.adminLineUserId, altText, bubble);
}

/**
 * ส่งข้อความทดสอบจากหน้าแอดมิน (รองรับทั้งข้อความทั่วไป และการทดสอบยิงการ์ดแจ้งเตือนสถานะต่างๆ)
 */
export async function sendLineTestMessage(
    param1?: string | {
        targetUserId?: string;
        targetPhone?: string;
        customMessage?: string;
        statusType?: 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled' | 'order_created' | 'slip_approved';
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

    if (typeof param1 === 'object' && param1 !== null) {
        targetUserId = param1.targetUserId;
        targetPhone = param1.targetPhone;
        customMessage = param1.customMessage;
        statusType = param1.statusType;
    } else {
        targetUserId = param1;
        customMessage = legacyCustomMessage;
    }

    let to = targetUserId || lineOa.adminLineUserId;
    if (!to && targetPhone) {
        to = (await getLineUserIdByPhone(targetPhone)) || '';
    }
    if (!to && lineOa.adminPhone) {
        to = (await getLineUserIdByPhone(lineOa.adminPhone)) || '';
    }

    if (!to) {
        return {
            success: false,
            message: 'ไม่พบ LINE User ID สำหรับรับข้อความทดสอบ (กรุณาระบุ Admin User ID หรือระบุเบอร์โทรแอดมินที่เคยพิมพ์ในแชท LINE OA ค่ะ)'
        };
    }

    // กรณีทดสอบการ์ดแจ้งเตือนสถานะออเดอร์ (Status Card Test)
    if (statusType) {
        const statusMetaMap: Record<string, { title: string; body: string; name: string }> = {
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

        const ok = await sendLineStatusFlexMessage(token, to, {
            title: meta.title,
            body: meta.body,
            eventType: statusType as any,
            orderCode: 'HM-TEST88',
            itemsSummary: 'Cold-Fermented Oat Milk Matcha Latte x1, Clear Matcha Cold Whisk x1',
            totalPrice: 165,
            url: '/order/test',
            phone: targetPhone || lineOa.adminPhone || '0987654321'
        });

        if (ok) {
            return {
                success: true,
                message: `ยิงการ์ดทดสอบสถานะ "${meta.name}" ไปยัง LINE แอดมินสำเร็จเรียบร้อยแล้วค่ะ! 🍵`
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

    const ok = await sendLineRawFlexMessage(token, to, 'ข้อความทดสอบระบบ LINE OA Home Matcha Cafe', testBubble);
    if (ok) {
        return { success: true, message: `ส่งข้อความทดสอบไปยัง LINE แอดมินสำเร็จแล้วค่ะ! (${to})` };
    } else {
        return { success: false, message: 'ส่งข้อความไม่สำเร็จ กรุณาตรวจสอบว่าแอดมินกดแอดเพื่อนกับบอท LINE OA หรือยังนะคะ' };
    }
}
