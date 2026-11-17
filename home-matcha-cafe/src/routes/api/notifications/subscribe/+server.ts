import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { savePushSubscription, removePushSubscription, getSubscriptionsByPhone } from '$lib/server/notifications';

export const GET: RequestHandler = async ({ url }) => {
    const phone = url.searchParams.get('phone');
    if (!phone) {
        return json({ success: false, message: 'กรุณาระบุเบอร์โทร' }, { status: 400 });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const subs = await getSubscriptionsByPhone(cleanPhone);
    return json({
        success: true,
        isSubscribed: subs.length > 0,
        count: subs.length
    });
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { phone, subscription, userAgent } = body;

        if (!phone || !subscription) {
            return json({ success: false, message: 'ข้อมูลไม่ครบถ้วน (ต้องมีเบอร์โทรและ subscription)' }, { status: 400 });
        }

        const cleanPhone = String(phone).replace(/[^0-9]/g, '');
        if (cleanPhone.length < 9) {
            return json({ success: false, message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' }, { status: 400 });
        }

        const ok = await savePushSubscription(cleanPhone, subscription, userAgent || '');
        if (!ok) {
            return json({ success: false, message: 'ไม่สามารถบันทึก subscription ได้' }, { status: 500 });
        }

        return json({
            success: true,
            message: 'เปิดรับการแจ้งเตือนสำเร็จแล้ว 🍵'
        });
    } catch (err: any) {
        console.error('Error in subscribe endpoint:', err);
        return json({ success: false, message: err?.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { endpoint } = body;
        if (!endpoint) {
            return json({ success: false, message: 'กรุณาระบุ endpoint' }, { status: 400 });
        }
        await removePushSubscription(endpoint);
        return json({ success: true, message: 'ยกเลิกการแจ้งเตือนเรียบร้อยแล้ว' });
    } catch (err: any) {
        return json({ success: false, message: err?.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};
