import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrdersByPhone, getAllOrders } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const phone = (body.phone || '').trim().replace(/[^0-9]/g, '');
        
        if (!phone) {
            // ไม่ส่งคืนรายการทั้งหมดเด็ดขาดเพื่อความเป็นส่วนตัว
            return json([]);
        }

        const orders = await getOrdersByPhone(phone);
        return json(orders);
    } catch (err: any) {
        console.error('Error in get-history:', err);
        return json({ error: err.message || 'Failed to fetch history' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const phone = (url.searchParams.get('phone') || '').trim().replace(/[^0-9]/g, '');
    if (!phone) {
        return json([]);
    }
    return json(await getOrdersByPhone(phone));
};
