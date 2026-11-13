import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrdersByPhone, getAllOrders } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const phone = body.phone || '';
        
        if (!phone) {
            // หากไม่ระบุเบอร์ ดึงรายการล่าสุด
            const orders = await getAllOrders();
            return json(orders);
        }

        const orders = await getOrdersByPhone(phone);
        return json(orders);
    } catch (err: any) {
        console.error('Error in get-history:', err);
        return json({ error: err.message || 'Failed to fetch history' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const phone = url.searchParams.get('phone') || '';
    if (!phone) {
        return json(await getAllOrders());
    }
    return json(await getOrdersByPhone(phone));
};
