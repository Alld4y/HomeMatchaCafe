import { json, type RequestHandler } from '@sveltejs/kit';
import { pool, ensurePgSchema } from '$lib/server/pgPool';

export const GET: RequestHandler = async () => {
    await ensurePgSchema();
    try {
        const res = await pool.query(`
            SELECT 
                lu.line_user_id,
                lu.display_name,
                lu.picture_url,
                lu.phone,
                lu.created_at,
                lu.updated_at,
                m.name as member_name,
                m.stamps as member_stamps
            FROM public.line_users lu
            LEFT JOIN public.members m ON lu.phone = m.phone
            ORDER BY lu.updated_at DESC
            LIMIT 100
        `);
        return json({ success: true, users: res.rows });
    } catch (e: any) {
        console.error('Error fetching line users:', e);
        return json({ success: false, users: [], error: e?.message }, { status: 500 });
    }
};
