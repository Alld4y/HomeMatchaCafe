import { json, type RequestHandler } from '@sveltejs/kit';
import { getStoreSettings } from '$lib/server/settings';
import { sendLineRawFlexMessage, sendLineBroadcastFlexMessage, getLineUserIdByPhone, getAdminLineUserIds } from '$lib/server/notifications';

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

        if (target === 'admin') {
            const adminUserIds = await getAdminLineUserIds();
            if (!adminUserIds.length) {
                return json({ success: false, message: 'ไม่พบ User ID แอดมิน (กรุณาระบุ Admin User ID หรือระบุเบอร์โทรแอดมินในการตั้งค่า LINE OA ค่ะ)' }, { status: 400 });
            }
            let successCount = 0;
            for (const uid of adminUserIds) {
                const ok = await sendLineRawFlexMessage(token, uid, altText, flexBubble);
                if (ok) successCount++;
            }
            return json({
                success: successCount > 0,
                message: successCount > 0
                    ? `ส่งการ์ดไปยัง LINE แอดมินสำเร็จแล้ว (${successCount}/${adminUserIds.length} ท่าน) ✨`
                    : 'ส่งไม่สำเร็จ กรุณาตรวจสอบว่าบัญชี LINE แอดมินได้กดแอดเพื่อนกับ LINE OA หรือยังนะคะ'
            });
        }

        let to = target;
        if (!to) {
            return json({ success: false, message: 'ไม่พบ User ID ผู้รับ' }, { status: 400 });
        }

        const ok = await sendLineRawFlexMessage(token, to, altText, flexBubble);
        return json({
            success: ok,
            message: ok ? `ส่งการ์ดไปยัง LINE สำเร็จแล้วค่ะ! (${to})` : 'ส่งไม่สำเร็จ กรุณาตรวจสอบว่าบัญชี LINE ผู้รับได้กดแอดเพื่อนกับ LINE OA หรือยังนะคะ'
        });
    } catch (e: any) {
        return json({ success: false, message: e?.message || 'Internal Server Error' }, { status: 500 });
    }
};
