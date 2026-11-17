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
    eventType: 'slip_approved' | 'delivering' | 'completed' | 'custom';
}

/**
 * ส่งการแจ้งเตือนไปยังลูกค้าตามการตั้งค่าในระบบ (Web Push + LINE OA สำรอง)
 */
export async function sendCustomerNotification(payload: CustomerNotificationPayload): Promise<{
    webPushSent: number;
    lineOaSent: boolean;
    reason?: string;
}> {
    const { phone, title, body, url = '/loyalty', eventType } = payload;
    if (!phone) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ไม่มีเบอร์โทรลูกค้า' };
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const settings = await getStoreSettings();
    const notifSettings = settings.notifications;

    // 1. ตรวจสอบว่าระบบแจ้งเตือนเปิดอยู่หรือไม่
    if (!notifSettings?.enabled) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ระบบแจ้งเตือนถูกปิดไว้ในการตั้งค่าร้าน' };
    }

    // 2. ตรวจสอบว่าเหตุการณ์นี้เปิดให้ส่งแจ้งเตือนหรือไม่
    if (eventType === 'slip_approved' && notifSettings.notifyOnSlipApproved === false) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ปิดการแจ้งเตือนเมื่ออนุมัติสลิป' };
    }
    if (eventType === 'delivering' && notifSettings.notifyOnDelivering === false) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ปิดการแจ้งเตือนเมื่อเริ่มนำส่ง' };
    }
    if (eventType === 'completed' && notifSettings.notifyOnCompleted === false) {
        return { webPushSent: 0, lineOaSent: false, reason: 'ปิดการแจ้งเตือนเมื่อจัดส่งสำเร็จ' };
    }

    let webPushCount = 0;
    let lineOaSuccess = false;

    // 3. ส่งผ่าน Web Push Notification (ถ้าเปิดใช้งาน)
    if (notifSettings.enableWebPush !== false) {
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
                        // หาก endpoint 410 (Gone) หรือ 404 (Not Found) แสดงว่าลูกค้าถอนสิทธิ์ ให้ลบออก
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

    // 4. ส่งผ่าน LINE Official Account (สำรองไว้ในอนาคต)
    if (notifSettings.enableLineOA && notifSettings.lineOaChannelAccessToken) {
        try {
            // ระบบสำรอง: ถ้าในอนาคตมีการเชื่อมต่อ LINE User ID กับเบอร์โทร
            // สามารถยิง Push Message ไปยัง LINE ได้ทันที
            // หากยังไม่มี LINE User ID หรือยิงไม่ผ่าน จะไม่ error ขัดขวางการทำงานหลัก
            lineOaSuccess = await sendLineOaPushMessage(
                notifSettings.lineOaChannelAccessToken,
                cleanPhone,
                title,
                body,
                url
            );
        } catch (lineErr) {
            console.warn('⚠️ LINE OA notification fallback error:', lineErr);
        }
    }

    return { webPushSent: webPushCount, lineOaSent: lineOaSuccess };
}

/**
 * ฟังก์ชันส่งข้อความผ่าน LINE OA Messaging API (ระบบสำรองพร้อมใช้)
 */
async function sendLineOaPushMessage(
    channelAccessToken: string,
    phone: string,
    title: string,
    body: string,
    url: string
): Promise<boolean> {
    if (!channelAccessToken) return false;

    // ตรวจสอบในฐานข้อมูลว่ามี line_user_id ที่ผูกกับเบอร์โทรนี้หรือไม่
    let lineUserId = '';
    try {
        const res = await pool.query(
            `
            SELECT pin FROM public.members WHERE phone = $1 LIMIT 1
            `,
            [phone]
        );
        // ในอนาคตเมื่อมี LINE Login หรือ Webhook บันทึก LINE User ID ไว้ในฟิลด์หรือตารางคู่
    } catch {}

    // ถ้าไม่มี lineUserId เฉพาะบุคคล จะไม่ยิงผิดพลาด
    if (!lineUserId) {
        return false;
    }

    try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                to: lineUserId,
                messages: [
                    {
                        type: 'flex',
                        altText: `${title}: ${body}`,
                        contents: {
                            type: 'bubble',
                            hero: {
                                type: 'image',
                                url: 'https://homematchacafe.store/image/home-matcha-cafe-logo.png',
                                size: 'full',
                                aspectRatio: '20:13',
                                aspectMode: 'cover'
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'text',
                                        text: title,
                                        weight: 'bold',
                                        size: 'md',
                                        color: '#166534'
                                    },
                                    {
                                        type: 'text',
                                        text: body,
                                        size: 'sm',
                                        color: '#334155',
                                        wrap: true,
                                        margin: 'md'
                                    }
                                ]
                            },
                            footer: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'button',
                                        style: 'primary',
                                        color: '#166534',
                                        action: {
                                            type: 'uri',
                                            label: 'ดูสถานะออเดอร์',
                                            uri: url.startsWith('http') ? url : `https://homematchacafe.store${url}`
                                        }
                                    }
                                ]
                            }
                        }
                    }
                ]
            })
        });
        return res.ok;
    } catch (e) {
        console.error('Error sending LINE OA message:', e);
        return false;
    }
}
