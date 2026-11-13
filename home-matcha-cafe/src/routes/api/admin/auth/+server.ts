import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnvConfig } from '$lib/server/pgPool';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const inputPassword = String(body.password || '').trim();
        const expectedPassword = getEnvConfig('ADMIN_PASSWORD', 'thip1206').trim();

        if (inputPassword === expectedPassword) {
            return json({
                success: true,
                message: 'เข้าสู่ระบบผู้ดูแลสำเร็จ'
            });
        }

        return json(
            {
                success: false,
                message: 'รหัสผ่านแอดมินไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
            },
            { status: 401 }
        );
    } catch (err: any) {
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};
