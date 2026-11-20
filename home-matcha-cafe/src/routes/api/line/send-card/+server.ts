import { json, type RequestHandler } from '@sveltejs/kit';
import { getStoreSettings } from '$lib/server/settings';
import { sendLineRawFlexMessage, sendLineBroadcastFlexMessage, getLineUserIdByPhone } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const target = body.target || 'admin'; // 'admin' | 'broadcast' | userId
        const flexBubble = body.flexBubble;
        const altText = body.altText || 'ข้อความจากการ์ดโปรโมชั่น Home Matcha Cafe';

        if (!flexBubble) {
            return json({ success: false, message: 'ไม่มีข้อมูล Flex Bubble Card' }, { status: 400 });
        }

        const settings = await getStoreSettings();
        const token = settings.lineOa.channelAccessToken;
        if (!token) {
            return json({ success: false, message: 'ยังไม่ได้ระบุ Channel Access Token ในการตั้งค่า LINE OA' }, { status: 400 });
        }

        if (target === 'broadcast') {
            const ok = await sendLineBroadcastFlexMessage(token, altText, flexBubble);
            return json({
                success: ok,
                message: ok ? 'ส่งบรอดแคสต์หาลูกค้าทุกคนสำเร็จเรียบร้อยแล้วค่ะ! 📢' : 'ส่งบรอดแคสต์ไม่สำเร็จ'
            });
        }

        let to = target === 'admin' ? settings.lineOa.adminLineUserId : target;
        if (!to && settings.lineOa.adminPhone) {
            to = (await getLineUserIdByPhone(settings.lineOa.adminPhone)) || '';
        }
        if (!to) {
            return json({ success: false, message: 'ไม่พบ User ID ผู้รับ (กรุณาระบุ Admin User ID หรือระบุเบอร์โทรแอดมินในการตั้งค่า LINE OA ค่ะ)' }, { status: 400 });
        }

        const ok = await sendLineRawFlexMessage(token, to, altText, flexBubble);
        return json({
            success: ok,
            message: ok ? `ส่งการ์ดไปยัง LINE สำเร็จแล้วค่ะ! (${to})` : 'ส่งไม่สำเร็จ กรุณาตรวจสอบว่าบัญชี LINE แอดมินได้กดแอดเพื่อนกับ LINE OA หรือยังนะคะ'
        });
    } catch (e: any) {
        return json({ success: false, message: e?.message || 'Internal Server Error' }, { status: 500 });
    }
};
