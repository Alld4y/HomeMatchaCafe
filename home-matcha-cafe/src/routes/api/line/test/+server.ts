import { json, type RequestHandler } from '@sveltejs/kit';
import { sendLineTestMessage } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const targetUserId = body.targetUserId ? String(body.targetUserId).trim() : undefined;
        const targetPhone = body.targetPhone ? String(body.targetPhone).trim() : undefined;
        const message = body.message ? String(body.message).trim() : undefined;
        const statusType = body.statusType ? String(body.statusType).trim() : undefined;

        const res = await sendLineTestMessage({
            targetUserId,
            targetPhone,
            customMessage: message,
            statusType: statusType as any
        });
        return json(res, { status: res.success ? 200 : 400 });
    } catch (e: any) {
        return json({ success: false, message: e?.message || 'Internal Server Error' }, { status: 500 });
    }
};
