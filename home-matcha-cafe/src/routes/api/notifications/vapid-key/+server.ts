import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VAPID_PUBLIC_KEY } from '$lib/server/notifications';

export const GET: RequestHandler = async () => {
    return json({
        success: true,
        publicKey: VAPID_PUBLIC_KEY
    });
};
