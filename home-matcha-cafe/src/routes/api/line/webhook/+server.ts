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
        const cleanedMessages = JSON.parse(
            JSON.stringify(messages).replace(/"layout"\s*:\s*"inline"/g, '"layout":"horizontal"')
        );
        const res = await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                replyToken,
                messages: cleanedMessages
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
                const welcomeBubble = (lineOa.useCustomWelcomeCard && lineOa.welcomeCardBubble)
                    ? lineOa.welcomeCardBubble
                    : {
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
                                            text: '💡 พิมพ์ "เมนู" เพื่อดูรายการเครื่องดื่ม หรือพิมพ์เบอร์โทรศัพท์ 10 หลัก เพื่อผูกบัญชีรับแจ้งเตือนสถานะออเดอร์นะคะ 🍵',
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
            const isPurePhone = (/^0[689]\d{8}$/.test(cleanDigits) || (cleanDigits.length === 10 && cleanDigits.startsWith('0'))) && rawText.replace(/[-\s]/g, '') === cleanDigits;
            if (isPurePhone) {
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
                        RETURNING first_name, last_name, points
                        `,
                        [userId, cleanDigits]
                    );

                    // อัปเดต line_user_id ในตาราง order สำหรับออเดอร์ของเบอร์นี้
                    try {
                        await pool.query(
                            `
                            UPDATE public."order"
                            SET line_user_id = $1, updated_at = NOW()
                            WHERE phone = $2 AND (line_user_id IS NULL OR line_user_id = '')
                            `,
                            [userId, cleanDigits]
                        );
                    } catch {}

                    const isMember = memberUpdate.rows.length > 0;
                    const memberName = isMember
                        ? `${memberUpdate.rows[0].first_name || ''} ${memberUpdate.rows[0].last_name || ''}`.trim()
                        : '';
                    const memberStamps = isMember ? Number(memberUpdate.rows[0].points || 0) : 0;

                    // ตรวจสอบว่าเปิดส่งข้อความ/การ์ดหลังจากได้รับเบอร์โทรศัพท์ (Event ได้เบอร์) หรือไม่
                    if (lineOa.notifyOnPhoneLinked !== false) {
                        const messagesToSend: any[] = [];

                        if (isMember) {
                            // 🟢 เหตุการณ์ที่ 1: ตรวจพบเบอร์ในระบบ (ลูกค้าเป็นสมาชิกอยู่แล้ว)
                            const replyType = lineOa.phoneLinkedExistingReplyType || 'card';

                            // 1. เตรียมข้อความตัวอักษร
                            const defaultExistingMsg = 'ยินดีต้อนรับคุณ {name} ✨ คุณมีคะแนนสะสม {points} ดวง ระบบเชื่อมต่อ LINE กับบัญชีสมาชิกเรียบร้อยแล้วค่ะ! 🍵';
                            const rawMsg = (lineOa.phoneLinkedExistingMessage && lineOa.phoneLinkedExistingMessage.trim())
                                ? lineOa.phoneLinkedExistingMessage
                                : defaultExistingMsg;
                            const formattedMsg = rawMsg
                                .replace(/\{name\}/g, memberName || 'ลูกค้าคนพิเศษ')
                                .replace(/\{points\}/g, String(memberStamps))
                                .replace(/\{phone\}/g, cleanDigits)
                                .replace(/\{loyaltyUrl\}/g, `https://homematchacafe.store/loyalty?phone=${cleanDigits}`)
                                .replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');

                            if (replyType === 'text' || replyType === 'both') {
                                messagesToSend.push({
                                    type: 'text',
                                    text: formattedMsg
                                });
                            }

                            if (replyType === 'card' || replyType === 'both') {
                                let memberBubble: any = null;
                                if (lineOa.useCustomMemberCard && lineOa.memberCardBubble) {
                                    try {
                                        const rawJson = JSON.stringify(lineOa.memberCardBubble);
                                        const replacedJson = rawJson
                                            .replace(/\{name\}/g, memberName || 'ลูกค้าคนพิเศษ')
                                            .replace(/\{points\}/g, String(memberStamps))
                                            .replace(/\{phone\}/g, cleanDigits)
                                            .replace(/\{loyaltyUrl\}/g, `https://homematchacafe.store/loyalty?phone=${cleanDigits}`)
                                            .replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');
                                        memberBubble = JSON.parse(replacedJson);
                                    } catch (err) {
                                        console.error('Error replacing placeholders in memberCardBubble:', err);
                                        memberBubble = lineOa.memberCardBubble;
                                    }
                                } else {
                                    memberBubble = {
                                        type: 'bubble',
                                        hero: {
                                            type: 'image',
                                            url: 'https://homematchacafe.store/image/mascot/cat-completed.jpg',
                                            size: 'full',
                                            aspectRatio: '1:1',
                                            aspectMode: 'cover'
                                        },
                                        header: {
                                            type: 'box',
                                            layout: 'vertical',
                                            backgroundColor: '#166534',
                                            paddingAll: '16px',
                                            contents: [
                                                { type: 'text', text: 'HOME MATCHA CAFE', weight: 'bold', size: 'xs', color: '#bbf7d0' },
                                                { type: 'text', text: '✅ เชื่อมต่อบัญชีสมาชิกสำเร็จ!', weight: 'bold', size: 'md', color: '#ffffff', margin: 'xs' }
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
                                                {
                                                    type: 'text',
                                                    text: `ยินดีต้อนรับคุณ ${memberName} ✨\nขณะนี้คุณมีคะแนนสะสม ${memberStamps} ดวง\nระบบจะแจ้งเตือนสถานะออเดอร์สดให้คุณทราบทางนี้ทันทีค่ะ 🍵`,
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
                                                        label: `⭐ บัตรสะสมแต้ม (${memberStamps} ดวง)`,
                                                        uri: `https://homematchacafe.store/loyalty?phone=${cleanDigits}`
                                                    }
                                                }
                                            ]
                                        }
                                    };
                                }

                                messagesToSend.push({
                                    type: 'flex',
                                    altText: `ยินดีต้อนรับคุณ ${memberName || 'สมาชิก'} สู่ Home Matcha Cafe ✨`,
                                    contents: memberBubble
                                });
                            }
                        } else {
                            // 🟡 เหตุการณ์ที่ 2: ยังไม่พบเบอร์ในระบบ (ยังไม่เคยเป็นสมาชิก / สมาชิกใหม่)
                            const replyType = lineOa.phoneLinkedNewReplyType || 'card';

                            // 1. เตรียมข้อความตัวอักษร
                            const defaultNewMsg = 'บันทึกเบอร์โทรศัพท์ {phone} เรียบร้อยแล้วค่ะ! คุณยังไม่ได้เป็นสมาชิกสะสมแต้ม กดสมัครสมาชิกสะสมแต้มเพื่อรับสิทธิ์ 10 แก้วฟรี 1 แก้วได้เลยนะคะ 🍵\n👉 สมัครได้ที่: {registerUrl}';
                            const rawMsg = (lineOa.phoneLinkedNewMessage && lineOa.phoneLinkedNewMessage.trim())
                                ? lineOa.phoneLinkedNewMessage
                                : defaultNewMsg;
                            const formattedMsg = rawMsg
                                .replace(/\{phone\}/g, cleanDigits)
                                .replace(/\{registerUrl\}/g, `https://homematchacafe.store/loyalty?action=register&phone=${cleanDigits}`)
                                .replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');

                            if (replyType === 'text' || replyType === 'both') {
                                messagesToSend.push({
                                    type: 'text',
                                    text: formattedMsg
                                });
                            }

                            if (replyType === 'card' || replyType === 'both') {
                                let registerBubble: any = null;
                                if (lineOa.useCustomRegisterCard && lineOa.registerCardBubble) {
                                    try {
                                        const rawJson = JSON.stringify(lineOa.registerCardBubble);
                                        const replacedJson = rawJson
                                            .replace(/\{phone\}/g, cleanDigits)
                                            .replace(/\{registerUrl\}/g, `https://homematchacafe.store/loyalty?action=register&phone=${cleanDigits}`)
                                            .replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');
                                        registerBubble = JSON.parse(replacedJson);
                                    } catch (parseErr) {
                                        console.error('Error replacing {phone} in registerCardBubble:', parseErr);
                                        registerBubble = lineOa.registerCardBubble;
                                    }
                                } else {
                                    registerBubble = {
                                        type: 'bubble',
                                        hero: {
                                            type: 'image',
                                            url: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg',
                                            size: 'full',
                                            aspectRatio: '1:1',
                                            aspectMode: 'cover'
                                        },
                                        header: {
                                            type: 'box',
                                            layout: 'vertical',
                                            backgroundColor: '#166534',
                                            paddingAll: '16px',
                                            contents: [
                                                { type: 'text', text: 'HOME MATCHA CAFE', weight: 'bold', size: 'xs', color: '#bbf7d0' },
                                                { type: 'text', text: '✨ สมาชิกสะสมแต้ม 10 แก้วฟรี 🍵', weight: 'bold', size: 'md', color: '#ffffff', margin: 'xs' }
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
                                                {
                                                    type: 'text',
                                                    text: 'ระบบบันทึกเบอร์โทรของคุณเรียบร้อยแล้วค่ะ! คุณยังไม่ได้เป็นสมาชิกสะสมแต้มของร้าน กดปุ่มด้านล่างเพื่อรับสิทธิ์สะสมแต้ม 10 แก้วฟรี 1 แก้วได้เลยนะคะ (ระบบจะกรอกเบอร์โทรให้อัตโนมัติค่ะ) 🍵',
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
                                            spacing: 'sm',
                                            paddingAll: '14px',
                                            contents: [
                                                {
                                                    type: 'button',
                                                    style: 'primary',
                                                    color: '#166534',
                                                    action: {
                                                        type: 'uri',
                                                        label: '✨ สมัครสมาชิกสะสมแต้ม',
                                                        uri: `https://homematchacafe.store/loyalty?action=register&phone=${cleanDigits}`
                                                    }
                                                },
                                                {
                                                    type: 'button',
                                                    style: 'secondary',
                                                    action: {
                                                        type: 'uri',
                                                        label: '🍵 ดูเมนูสั่งเครื่องดื่ม',
                                                        uri: 'https://homematchacafe.store/menu'
                                                    }
                                                }
                                            ]
                                        }
                                    };
                                }

                                messagesToSend.push({
                                    type: 'flex',
                                    altText: '✨ สมัครสมาชิกสะสมแต้ม Home Matcha Cafe',
                                    contents: registerBubble
                                });
                            }
                        }

                        if (messagesToSend.length > 0) {
                            await replyLineMessage(token, replyToken, messagesToSend);
                        }
                    }
                    continue;
                } catch (linkErr) {
                    console.error('Error linking phone to line_user_id:', linkErr);
                    await replyLineMessage(token, replyToken, [
                        { type: 'text', text: `บันทึกเบอร์โทร ${cleanDigits} ผูกกับ LINE เรียบร้อยแล้วค่ะ! 🍵` }
                    ]);
                    continue;
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
                    if (matchedKeyword.replyType === 'text') {
                        await replyLineMessage(token, replyToken, [
                            { type: 'text', text: matchedKeyword.replyText || 'ขออภัยค่ะ ยังไม่ได้ระบุข้อความตอบกลับ' }
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
