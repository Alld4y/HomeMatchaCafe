import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoreSettings, updateStoreSettings, getNext7DaysSchedule } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
    try {
        const { days, settings } = await getNext7DaysSchedule();
        return json({
            success: true,
            settings,
            days
        });
    } catch (err: any) {
        console.error('Error fetching settings:', err);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};

export const PATCH: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const updated = await updateStoreSettings(body);
        const { days } = await getNext7DaysSchedule();
        return json({
            success: true,
            settings: updated,
            days,
            message: 'บันทึกการตั้งค่าร้านและรอบส่งเรียบร้อยแล้ว'
        });
    } catch (err: any) {
        console.error('Error updating settings:', err);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};
