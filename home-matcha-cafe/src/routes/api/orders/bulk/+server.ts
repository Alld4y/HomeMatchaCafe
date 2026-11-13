import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateBulkOrderStatus, type Order } from '$lib/server/db';

export const PATCH: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const ids: string[] = body.ids || [];
        const status: Order['status'] = body.status;

        if (!Array.isArray(ids) || ids.length === 0 || !status) {
            return json({ success: false, message: 'กรุณาระบุรหัสคำสั่งซื้อและสถานะที่ต้องการเปลี่ยน' }, { status: 400 });
        }

        const updatedOrders = await updateBulkOrderStatus(ids, status);

        return json({
            success: true,
            message: `อัปเดตสถานะ ${updatedOrders.length} ออเดอร์ เป็น "${status}" เรียบร้อยแล้ว`,
            count: updatedOrders.length,
            orders: updatedOrders
        });
    } catch (err: any) {
        console.error('Error updating bulk order status:', err);
        return json({ success: false, message: err.message }, { status: 500 });
    }
};
