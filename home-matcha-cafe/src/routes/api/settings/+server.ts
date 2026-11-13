import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoreSettings, updateStoreSettings, getNext7DaysSchedule } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
    try {
        const schedule = await getNext7DaysSchedule();
        return json({
            success: true,
            settings: schedule.settings,
            days: schedule.days,
            storeStatus: schedule.storeStatus,
            storeStatusBadgeText: schedule.storeStatusBadgeText,
            storeStatusDesc: schedule.storeStatusDesc,
            isTodayOrderable: schedule.isTodayOrderable,
            hasAnyOrderableSlot: schedule.hasAnyOrderableSlot
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
        const schedule = await getNext7DaysSchedule();
        return json({
            success: true,
            settings: updated,
            days: schedule.days,
            storeStatus: schedule.storeStatus,
            storeStatusBadgeText: schedule.storeStatusBadgeText,
            storeStatusDesc: schedule.storeStatusDesc,
            isTodayOrderable: schedule.isTodayOrderable,
            hasAnyOrderableSlot: schedule.hasAnyOrderableSlot,
            message: 'บันทึกการตั้งค่าร้านและรอบส่งเรียบร้อยแล้ว'
        });
    } catch (err: any) {
        console.error('Error updating settings:', err);
        return json({ success: false, error: err.message }, { status: 500 });
    }
};
