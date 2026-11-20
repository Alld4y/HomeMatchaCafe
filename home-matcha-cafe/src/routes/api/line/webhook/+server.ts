import { json, type RequestHandler } from '@sveltejs/kit';
import crypto from 'crypto';
import { getStoreSettings } from '$lib/server/settings';
import { pool, ensurePgSchema } from '$lib/server/pgPool';

/**
 * ตรวจสอบความถูกต้องของ LINE Webhook Signature ด้วย HMAC-SHA256
 */
function verifyLineSignature(body: string, channelSecret: string, signature: string): boolean {
    if (!channelSecret || !signature) return false;
    try {
        const hash = crypto
            .createHmac('SHA256', channelSecret)
            .update(body)
            .digest('base64');
        return hash === signature;
    } catch {
        return false;
    }
}

/**
 * ส่งข้อความตอบกลับ (Reply Message)
 */
async function replyLineMessage(channelAccessToken: string, replyToken: string, messages: any[]): Promise<boolean> {
    if (!channelAccessToken || !replyToken || !messages.length) return false;
    try {
        const res = await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                replyToken,
                messages
            })
        });
        if (!res.ok) {
            console.error('❌ LINE Reply Error:', res.status, await res.text());
            return false;
        }
        return true;
    } catch (e) {
        console.error('❌ LINE Reply Exception:', e);
        return false;
    }
}

/**
 * ดึงโปรไฟล์ผู้ใช้จาก LINE
 */
async function fetchLineUserProfile(channelAccessToken: string, userId: string): Promise<{ displayName?: string; pictureUrl?: string; statusMessage?: string } | null> {
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

export const GET: RequestHandler = async () => {
    return json({
        status: 'active',
        service: 'Home Matcha Cafe LINE OA Webhook',
        timestamp: new Date().toISOString()
    });
};

export const POST: RequestHandler = async ({ request }) => {
    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    const settings = await getStoreSettings();
    const lineOa = settings.lineOa;

    // ตรวจสอบ Signature
    const channelSecret = lineOa.channelSecret || 'ae1cf62ef3dbe63af73e93dd4b946bb1';
    if (!verifyLineSignature(rawBody, channelSecret, signature)) {
        console.warn('⚠️ Invalid LINE Webhook signature');
        return json({ error: 'Invalid signature' }, { status: 401 });
    }

    let parsed: any;
    try {
        parsed = JSON.parse(rawBody);
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const events = parsed.events || [];
    const token = lineOa.channelAccessToken;

    await ensurePgSchema();

    for (const ev of events) {
        const userId = ev.source?.userId;
        const replyToken = ev.replyToken;

        // 1. จัดการ Event: Follow (ลูกค้าแอดเพื่อน)
        if (ev.type === 'follow' && userId) {
            let displayName = '';
            let pictureUrl = '';
            let statusMessage = '';

            if (token) {
                const profile = await fetchLineUserProfile(token, userId);
                if (profile) {
                    displayName = profile.displayName || '';
                    pictureUrl = profile.pictureUrl || '';
                    statusMessage = profile.statusMessage || '';
                }
            }

            // บันทึก/อัปเดตลงตาราง line_users
            try {
                await pool.query(
                    `
                    INSERT INTO public.line_users (line_user_id, display_name, picture_url, status_message, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (line_user_id) DO UPDATE
                    SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.line_users.display_name),
                        picture_url = COALESCE(NULLIF(EXCLUDED.picture_url, ''), public.line_users.picture_url),
                        status_message = COALESCE(NULLIF(EXCLUDED.status_message, ''), public.line_users.status_message),
                        updated_at = NOW()
                    `,
                    [userId, displayName, pictureUrl, statusMessage]
                );
            } catch (dbErr) {
                console.error('Error saving follow line user:', dbErr);
            }

            // ตอบกลับข้อความต้อนรับ
            if (token && replyToken && lineOa.autoReplyEnabled) {
                const welcomeBubble = {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: '#166534',
                        paddingAll: '16px',
                        contents: [
                            { type: 'text', text: 'HOME MATCHA CAFE', weight: 'bold', size: 'xs', color: '#bbf7d0' },
                            { type: 'text', text: 'ยินดีต้อนรับสู่ร้านมัทฉะ 🍵', weight: 'bold', size: 'lg', color: '#ffffff', margin: 'xs' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '16px',
                        contents: [
                            {
                                type: 'text',
                                text: lineOa.welcomeMessage || 'ยินดีต้อนรับสู่ Home Matcha Cafe ค่ะ!',
                                size: 'sm',
                                color: '#334155',
                                wrap: true
                            },
                            {
                                type: 'box',
                                layout: 'vertical',
                                margin: 'md',
                                paddingAll: '10px',
                                backgroundColor: '#f0fdf4',
                                cornerRadius: '8px',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '💡 เคล็ดลับ: พิมพ์เบอร์โทร 10 หลัก (เช่น 0812345678) เพื่อผูกบัญชีรับแจ้งเตือนสถานะออเดอร์ทันทีค่ะ',
                                        size: 'xs',
                                        color: '#166534',
                                        wrap: true
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
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#166534',
                                action: {
                                    type: 'uri',
                                    label: '🍵 สั่งซื้อเครื่องดื่ม',
                                    uri: 'https://homematchacafe.store'
                                }
                            },
                            {
                                type: 'button',
                                style: 'secondary',
                                action: {
                                    type: 'uri',
                                    label: '⭐ เช็คคะแนนสะสม',
                                    uri: 'https://homematchacafe.store/loyalty'
                                }
                            }
                        ]
                    }
                };

                await replyLineMessage(token, replyToken, [
                    {
                        type: 'flex',
                        altText: 'ยินดีต้อนรับสู่ Home Matcha Cafe 🍵',
                        contents: welcomeBubble
                    }
                ]);
            }
        }

        // 2. จัดการ Event: Message (ลูกค้าส่งข้อความเข้ามา)
        if (ev.type === 'message' && ev.message?.type === 'text' && userId && replyToken && token) {
            const rawText = String(ev.message.text || '').trim();
            const cleanDigits = rawText.replace(/[^0-9]/g, '');

            // ตรวจสอบกรณีพิมพ์เบอร์โทรศัพท์ 10 หลัก เพื่อเชื่อมโยงบัญชีสมาชิก
            if (/^0[689]\d{8}$/.test(cleanDigits) || (cleanDigits.length === 10 && cleanDigits.startsWith('0'))) {
                try {
                    // ดึงโปรไฟล์มาบันทึกคู่กับเบอร์
                    let displayName = '';
                    let pictureUrl = '';
                    const profile = await fetchLineUserProfile(token, userId);
                    if (profile) {
                        displayName = profile.displayName || '';
                        pictureUrl = profile.pictureUrl || '';
                    }

                    // อัปเดตในตาราง line_users
                    await pool.query(
                        `
                        INSERT INTO public.line_users (line_user_id, display_name, picture_url, phone, updated_at)
                        VALUES ($1, $2, $3, $4, NOW())
                        ON CONFLICT (line_user_id) DO UPDATE
                        SET phone = EXCLUDED.phone,
                            display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.line_users.display_name),
                            picture_url = COALESCE(NULLIF(EXCLUDED.picture_url, ''), public.line_users.picture_url),
                            updated_at = NOW()
                        `,
                        [userId, displayName, pictureUrl, cleanDigits]
                    );

                    // อัปเดต line_user_id ในตาราง members
                    const memberUpdate = await pool.query(
                        `
                        UPDATE public.members
                        SET line_user_id = $1, updated_at = NOW()
                        WHERE phone = $2
                        RETURNING name, stamps
                        `,
                        [userId, cleanDigits]
                    );

                    const isMember = memberUpdate.rows.length > 0;
                    const memberName = isMember ? memberUpdate.rows[0].name : '';
                    const memberStamps = isMember ? memberUpdate.rows[0].stamps : 0;

                    const linkedBubble = {
                        type: 'bubble',
                        header: {
                            type: 'box',
                            layout: 'vertical',
                            backgroundColor: '#166534',
                            paddingAll: '16px',
                            contents: [
                                { type: 'text', text: 'HOME MATCHA CAFE', weight: 'bold', size: 'xs', color: '#bbf7d0' },
                                { type: 'text', text: '✅ เชื่อมต่อบัญชีสำเร็จ!', weight: 'bold', size: 'md', color: '#ffffff', margin: 'xs' }
                            ]
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            paddingAll: '16px',
                            contents: [
                                {
                                    type: 'text',
                                    text: `เบอร์โทรศัพท์: ${cleanDigits}`,
                                    weight: 'bold',
                                    size: 'sm',
                                    color: '#1e293b'
                                },
                                isMember
                                    ? {
                                          type: 'text',
                                          text: `ยินดีต้อนรับคุณ ${memberName} ✨\nขณะนี้คุณมีคะแนนสะสม ${memberStamps} ดวง\nระบบจะแจ้งเตือนสถานะออเดอร์ของคุณผ่านช่องทางนี้โดยอัตโนมัติค่ะ 🍵`,
                                          size: 'xs',
                                          color: '#475569',
                                          wrap: true,
                                          margin: 'sm'
                                      }
                                    : {
                                          type: 'text',
                                          text: `ระบบผูกเบอร์โทรนี้กับ LINE ของคุณเรียบร้อยแล้วค่ะ! เมื่อมีคำสั่งซื้อหรือสถานะออเดอร์ใหม่ คุณจะได้รับแจ้งเตือนทันที 🍵`,
                                          size: 'xs',
                                          color: '#475569',
                                          wrap: true,
                                          margin: 'sm'
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
                                        label: 'เข้าสู่ระบบ / บัตรสะสมแต้ม',
                                        uri: `https://homematchacafe.store/loyalty?phone=${cleanDigits}`
                                    }
                                }
                            ]
                        }
                    };

                    await replyLineMessage(token, replyToken, [
                        {
                            type: 'flex',
                            altText: 'เชื่อมต่อบัญชีสำเร็จ!',
                            contents: linkedBubble
                        }
                    ]);
                    continue;
                } catch (linkErr) {
                    console.error('Error linking phone to line_user_id:', linkErr);
                }
            }

            // ตรวจสอบ Keyword Auto Replies
            if (lineOa.autoReplyEnabled) {
                const lowerText = rawText.toLowerCase();
                const matchedKeyword = (lineOa.keywordReplies || []).find((k) => {
                    if (!k.enabled) return false;
                    const kw = k.keyword.trim().toLowerCase();
                    if (!kw) return false;
                    return k.matchType === 'exact' ? lowerText === kw : lowerText.includes(kw);
                });

                if (matchedKeyword) {
                    if (matchedKeyword.replyType === 'flex_menu') {
                        const menuBubble = {
                            type: 'bubble',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                backgroundColor: '#166534',
                                paddingAll: '16px',
                                contents: [
                                    { type: 'text', text: 'HOME MATCHA CAFE', weight: 'bold', size: 'xs', color: '#bbf7d0' },
                                    { type: 'text', text: '🍵 เมนูมัทฉะยอดนิยม', weight: 'bold', size: 'lg', color: '#ffffff', margin: 'xs' }
                                ]
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                paddingAll: '16px',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🍃 Pure Matcha (Cold Whisk) - ฿65\n🍃 Matcha Latte (ชงนมสดนุ่มนวล) - ฿75\n🥥 Matcha Coconut (มัทฉะน้ำมะพร้าวสด) - ฿80\n🌾 Matcha Oat Milk (นมโอ๊ตเข้มข้น) - ฿85\n❄️ Cold-Fermented Matcha Oat Latte - ฿95',
                                        size: 'xs',
                                        color: '#334155',
                                        wrap: true
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
                                            label: 'ดูเมนูทั้งหมด & สั่งซื้อ',
                                            uri: 'https://homematchacafe.store'
                                        }
                                    }
                                ]
                            }
                        };
                        await replyLineMessage(token, replyToken, [
                            { type: 'flex', altText: 'เมนูมัทฉะยอดนิยม Home Matcha Cafe', contents: menuBubble }
                        ]);
                        continue;
                    }

                    if (matchedKeyword.replyType === 'flex_status') {
                        const statusBubble = {
                            type: 'bubble',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                backgroundColor: '#0284c7',
                                paddingAll: '16px',
                                contents: [
                                    { type: 'text', text: 'TRACK ORDER', weight: 'bold', size: 'xs', color: '#e0f2fe' },
                                    { type: 'text', text: '🔍 ตรวจสอบสถานะออเดอร์', weight: 'bold', size: 'lg', color: '#ffffff', margin: 'xs' }
                                ]
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                paddingAll: '16px',
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'คุณสามารถตรวจสอบสถานะคำสั่งซื้อ ประวัติการสั่งซื้อ และเวลาจัดส่งได้แบบเรียลไทม์เลยค่ะ',
                                        size: 'sm',
                                        color: '#334155',
                                        wrap: true
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
                                        color: '#0284c7',
                                        action: {
                                            type: 'uri',
                                            label: 'เปิดดูสถานะออเดอร์',
                                            uri: 'https://homematchacafe.store/history'
                                        }
                                    }
                                ]
                            }
                        };
                        await replyLineMessage(token, replyToken, [
                            { type: 'flex', altText: 'ตรวจสอบสถานะออเดอร์', contents: statusBubble }
                        ]);
                        continue;
                    }

                    if (matchedKeyword.replyType === 'flex_loyalty') {
                        const loyaltyBubble = {
                            type: 'bubble',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                backgroundColor: '#f59e0b',
                                paddingAll: '16px',
                                contents: [
                                    { type: 'text', text: 'LOYALTY CARD', weight: 'bold', size: 'xs', color: '#fef3c7' },
                                    { type: 'text', text: '⭐ บัตรสะสมแต้ม 10 ฟรี 1', weight: 'bold', size: 'lg', color: '#ffffff', margin: 'xs' }
                                ]
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                paddingAll: '16px',
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'สะสมแต้มง่ายๆ ทุกแก้วรับ 1 แต้ม สะสมครบ 10 แต้ม แลกรับเครื่องดื่มฟรี 1 แก้วได้ทันที!',
                                        size: 'sm',
                                        color: '#334155',
                                        wrap: true
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
                                        color: '#f59e0b',
                                        action: {
                                            type: 'uri',
                                            label: 'ดูบัตรสะสมแต้มของฉัน',
                                            uri: 'https://homematchacafe.store/loyalty'
                                        }
                                    }
                                ]
                            }
                        };
                        await replyLineMessage(token, replyToken, [
                            { type: 'flex', altText: 'บัตรสะสมแต้ม Home Matcha Cafe', contents: loyaltyBubble }
                        ]);
                        continue;
                    }

                    // replyType === 'text'
                    if (matchedKeyword.replyText) {
                        await replyLineMessage(token, replyToken, [
                            { type: 'text', text: matchedKeyword.replyText }
                        ]);
                        continue;
                    }
                }

                // Default Reply เมื่อไม่ตรงกับคีย์เวิร์ดใดๆ
                if (lineOa.defaultReplyMessage) {
                    await replyLineMessage(token, replyToken, [
                        { type: 'text', text: lineOa.defaultReplyMessage }
                    ]);
                }
            }
        }
    }

    return json({ success: true, processed: events.length });
};
