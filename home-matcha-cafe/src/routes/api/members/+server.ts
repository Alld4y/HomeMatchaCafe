import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getMemberByPhone,
    getAllMembers,
    registerMember,
    loginMember,
    redeemFreeCupPoints,
    updateMemberByAdmin,
    deleteMemberByAdmin,
    updateMemberProfile
} from '$lib/server/members';
import { getStoreSettings } from '$lib/server/settings';
import { getLineUserIdByPhone, sendCustomerNotification } from '$lib/server/notifications';
import { pool } from '$lib/server/pgPool';

export const GET: RequestHandler = async ({ url }) => {
    try {
        const phone = url.searchParams.get('phone');
        const settings = await getStoreSettings();

        if (phone) {
            const member = await getMemberByPhone(phone);
            return json({
                success: true,
                exists: Boolean(member),
                member,
                loyaltySettings: {
                    enabled: settings.loyaltyEnabled !== false,
                    stampsRequired: Number(settings.loyaltyStampsRequired) || 10,
                    expireDays: Number(settings.loyaltyExpireDays) || 60,
                    redeemableItemIds: Array.isArray(settings.loyaltyRedeemableItemIds)
                        ? settings.loyaltyRedeemableItemIds
                        : ['pure-matcha', 'matcha-latte', 'matcha-coconut', 'matcha-latte-oat', 'cold-fermented-matcha-oat-latte']
                }
            });
        }

        const members = await getAllMembers();
        return json({
            success: true,
            members,
            loyaltySettings: {
                enabled: settings.loyaltyEnabled !== false,
                stampsRequired: Number(settings.loyaltyStampsRequired) || 10,
                expireDays: Number(settings.loyaltyExpireDays) || 60,
                redeemableItemIds: Array.isArray(settings.loyaltyRedeemableItemIds)
                    ? settings.loyaltyRedeemableItemIds
                    : ['pure-matcha', 'matcha-latte', 'matcha-coconut', 'matcha-latte-oat', 'cold-fermented-matcha-oat-latte']
            }
        });
    } catch (err: any) {
        console.error('Error in GET /api/members:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const action = body.action || 'login';

        if (action === 'register') {
            const rawPin = String(body.pin || '').trim();
            const result = await registerMember({
                firstName: body.firstName || '',
                lastName: body.lastName || '',
                phone: body.phone || '',
                pin: rawPin
            });

            if (result.success && result.member) {
                try {
                    const cleanPhone = result.member.phone;
                    const lineUserId = await getLineUserIdByPhone(cleanPhone);
                    if (lineUserId) {
                        try {
                            await pool.query(
                                `UPDATE public.members SET line_user_id = $1 WHERE id = $2 AND (line_user_id IS NULL OR line_user_id = '')`,
                                [lineUserId, result.member.id]
                            );
                        } catch (linkErr) {
                            console.warn('⚠️ Error linking line_user_id to member:', linkErr);
                        }

                        // ส่งการ์ดแจ้งเตือนลูกค้าใน LINE OA อัตโนมัติ (Event: ลูกค้าสมัครสมาชิกเสร็จแล้ว)
                        const fullName = `${result.member.firstName} ${result.member.lastName}`.trim();
                        await sendCustomerNotification({
                            phone: cleanPhone,
                            customerName: fullName,
                            title: '🎉 สมัครสมาชิกสำเร็จเรียบร้อยค่ะ',
                            body: `ยินดีต้อนรับคุณ ${fullName || result.member.firstName} เข้าสู่ระบบสมาชิก Home Matcha Cafe รหัส PIN ของคุณคือ ${rawPin}`,
                            eventType: 'member_registered',
                            pin: rawPin,
                            url: `/loyalty?phone=${cleanPhone}`
                        });
                    }
                } catch (notifErr) {
                    console.warn('⚠️ Error sending member_registered notification:', notifErr);
                }
            }

            return json(result, { status: result.success ? 200 : 400 });
        }

        if (action === 'login') {
            const result = await loginMember(body.phone || '', body.pin || '');
            return json(result, { status: result.success ? 200 : 401 });
        }

        if (action === 'redeem') {
            const result = await redeemFreeCupPoints(body.phone || '', body.stampsToDeduct);
            return json(result, { status: result.success ? 200 : 400 });
        }

        if (action === 'update-profile') {
            const result = await updateMemberProfile(
                body.phone || '',
                body.firstName || '',
                body.lastName || ''
            );
            return json(result, { status: result.success ? 200 : 400 });
        }

        return json({ success: false, message: 'Invalid action' }, { status: 400 });
    } catch (err: any) {
        console.error('Error in POST /api/members:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};

export const PATCH: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const id = Number(body.id);
        if (!id) {
            return json({ success: false, message: 'กรุณาระบุรหัสสมาชิก' }, { status: 400 });
        }

        const updated = await updateMemberByAdmin(id, {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            pin: body.pin,
            points: body.points,
            cardExpiresAt: body.cardExpiresAt
        });

        if (!updated) {
            return json({ success: false, message: 'ไม่พบข้อมูลสมาชิก' }, { status: 404 });
        }

        return json({
            success: true,
            member: updated,
            message: 'อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว'
        });
    } catch (err: any) {
        console.error('Error in PATCH /api/members:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ url }) => {
    try {
        const id = Number(url.searchParams.get('id'));
        if (!id) {
            return json({ success: false, message: 'กรุณาระบุรหัสสมาชิก' }, { status: 400 });
        }

        const deleted = await deleteMemberByAdmin(id);
        return json({
            success: deleted,
            message: deleted ? 'ลบข้อมูลสมาชิกเรียบร้อยแล้ว' : 'ไม่พบข้อมูลสมาชิก'
        });
    } catch (err: any) {
        console.error('Error in DELETE /api/members:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
};
