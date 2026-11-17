import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendCustomerNotification } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { phone } = body;
        if (!phone) {
            return json({ success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' }, { status: 400 });
        }

        const res = await sendCustomerNotification({
            phone,
            title: '🔔 ทดสอบระบบแจ้งเตือน Home Matcha Cafe',
            body: 'ระบบแจ้งเตือนทำงานได้สมบูรณ์แล้วค่ะ พร้อมรับการอัปเดตสถานะออเดอร์นะคะ 🍵',
            url: '/loyalty',
            eventType: 'custom'
        });

        if (res.webPushSent === 0 && !res.lineOaSent) {
            return json({
                success: false,
                message: res.reason || 'ยังไม่มีอุปกรณ์ที่เปิดรับแจ้งเตือนสำหรับเบอร์โทรนี้'
            });
        }

        return json({
            success: true,
            message: `ส่งการแจ้งเตือนสำเร็จ (Web Push: ${res.webPushSent} เครื่อง, LINE OA: ${res.lineOaSent ? 'ส่งสำเร็จ' : 'ไม่ได้เปิดใช้งาน'})`
        });
    } catch (err: any) {
        return json({ success: false, message: err?.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};
