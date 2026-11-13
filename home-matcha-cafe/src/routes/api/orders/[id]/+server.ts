import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrderById, updateOrderStatus, type Order } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
    const { id } = params;
    const order = await getOrderById(id);
    if (!order) {
        return json({ success: false, message: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
    }
    return json({ success: true, order });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const { id } = params;
    try {
        const body = await request.json();
        const status = body.status as Order['status'];
        
        if (!status) {
            return json({ success: false, message: 'กรุณาระบุสถานะ' }, { status: 400 });
        }

        const updated = await updateOrderStatus(id, status);
        if (!updated) {
            return json({ success: false, message: 'ไม่พบคำสั่งซื้อที่ต้องการอัปเดต' }, { status: 404 });
        }

        return json({
            success: true,
            message: 'อัปเดตสถานะคำสั่งซื้อเรียบร้อยแล้ว',
            order: updated
        });
    } catch (err: any) {
        console.error('Error updating order status:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};
