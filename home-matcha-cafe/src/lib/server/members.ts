import { pool, ensurePgSchema } from './pgPool';
import { getStoreSettings } from './settings';

export interface Member {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    points: number;
    totalStampsEarned: number;
    totalFreeRedeemed: number;
    cardStartedAt: string | null;
    cardExpiresAt: string | null;
    isCardExpired: boolean;
    createdAt: string;
    updatedAt: string;
}

export function cleanPhone(phone: string): string {
    return (phone || '').replace(/[^0-9]/g, '');
}

function mapRowToMember(row: any): Member {
    const nowMs = Date.now();
    const expIso = row.card_expires_at ? new Date(row.card_expires_at).toISOString() : null;
    const isCardExpired = Boolean(expIso && new Date(expIso).getTime() < nowMs && Number(row.points || 0) > 0);

    return {
        id: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        phone: row.phone || '',
        points: isCardExpired ? 0 : Number(row.points || 0),
        totalStampsEarned: Number(row.total_stamps_earned || 0),
        totalFreeRedeemed: Number(row.total_free_redeemed || 0),
        cardStartedAt: row.card_started_at ? new Date(row.card_started_at).toISOString() : null,
        cardExpiresAt: expIso,
        isCardExpired,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
}

export async function getMemberByPhone(phone: string): Promise<Member | null> {
    await ensurePgSchema();
    const cleaned = cleanPhone(phone);
    if (!cleaned) return null;

    const res = await pool.query(
        `
        SELECT *
        FROM public.members
        WHERE phone = $1
        LIMIT 1
        `,
        [cleaned]
    );
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    // หากบัตรหมดอายุแล้วและยังมีแต้มค้าง ให้รีเซ็ตแต้มในฐานข้อมูลเป็น 0 อัตโนมัติ
    if (row.card_expires_at && new Date(row.card_expires_at).getTime() < Date.now() && Number(row.points) > 0) {
        const updated = await pool.query(
            `
            UPDATE public.members
            SET points = 0,
                card_started_at = NULL,
                card_expires_at = NULL,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [row.id]
        );
        return mapRowToMember(updated.rows[0]);
    }

    return mapRowToMember(row);
}

export async function getAllMembers(): Promise<Member[]> {
    await ensurePgSchema();
    const res = await pool.query(`
        SELECT *
        FROM public.members
        ORDER BY updated_at DESC, id DESC
    `);
    return res.rows.map(mapRowToMember);
}

export async function registerMember(data: {
    firstName: string;
    lastName: string;
    phone: string;
    pin: string;
}): Promise<{ success: boolean; member?: Member; message?: string }> {
    await ensurePgSchema();
    const cleanedPhone = cleanPhone(data.phone);
    if (cleanedPhone.length < 9) {
        return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (9-10 หลัก)' };
    }
    if (!data.firstName.trim() || !data.lastName.trim()) {
        return { success: false, message: 'กรุณากรอกชื่อจริงและนามสกุลให้ครบถ้วน' };
    }
    if (!data.pin || data.pin.length < 4) {
        return { success: false, message: 'กรุณาตั้งรหัส PIN 4 หลัก' };
    }

    const existing = await pool.query('SELECT id FROM public.members WHERE phone = $1 LIMIT 1', [cleanedPhone]);
    if (existing.rows.length > 0) {
        return { success: false, message: 'เบอร์โทรศัพท์นี้เคยสมัครสมาชิกไว้แล้ว กรุณาเลือกเข้าสู่ระบบค่ะ' };
    }

    const res = await pool.query(
        `
        INSERT INTO public.members (
            first_name,
            last_name,
            phone,
            pin,
            points,
            total_stamps_earned,
            total_free_redeemed,
            card_started_at,
            card_expires_at,
            created_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, 0, 0, 0, NULL, NULL, NOW(), NOW())
        RETURNING *
        `,
        [data.firstName.trim(), data.lastName.trim(), cleanedPhone, data.pin.trim()]
    );

    return {
        success: true,
        member: mapRowToMember(res.rows[0]),
        message: 'สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ครอบครัว Home Matcha Cafe ค่ะ 🍵'
    };
}

export async function loginMember(
    phone: string,
    pin: string
): Promise<{ success: boolean; member?: Member; message?: string }> {
    await ensurePgSchema();
    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) {
        return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์' };
    }

    const res = await pool.query('SELECT * FROM public.members WHERE phone = $1 LIMIT 1', [cleanedPhone]);
    if (res.rows.length === 0) {
        return { success: false, message: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบสมาชิก กรุณาสมัครสมาชิกใหม่ค่ะ' };
    }

    const row = res.rows[0];
    if (String(row.pin) !== String(pin).trim()) {
        return { success: false, message: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้งค่ะ' };
    }

    const member = await getMemberByPhone(cleanedPhone);
    return {
        success: true,
        member: member || mapRowToMember(row),
        message: 'เข้าสู่ระบบสำเร็จ!'
    };
}

/**
 * บันทึกแต้มสะสมอัตโนมัติเมื่อแอดมินเปลี่ยนสถานะออเดอร์เป็น "completed" (จัดส่งสำเร็จ)
 * - เริ่มนับวันหมดอายุ (เช่น 60 วัน) ตั้งแต่วันที่ได้แต้มแก้วแรกของบัตรรอบนั้น
 */
export async function awardStampsForCompletedOrder(phone: string, cupCount: number): Promise<Member | null> {
    if (cupCount <= 0) return null;
    await ensurePgSchema();
    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) return null;

    const res = await pool.query('SELECT * FROM public.members WHERE phone = $1 LIMIT 1', [cleanedPhone]);
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const settings = await getStoreSettings();
    if (settings.loyaltyEnabled === false) {
        return null;
    }
    const expireDays = Number(settings.loyaltyExpireDays) > 0 ? Number(settings.loyaltyExpireDays) : 60;

    const now = new Date();
    const isExpired = row.card_expires_at && new Date(row.card_expires_at).getTime() < now.getTime();
    const currentPoints = isExpired ? 0 : Number(row.points || 0);

    // ถ้าเป็นแก้วแรกของบัตร (แต้มเดิม = 0 หรือบัตรเดิมหมดอายุ หรือยังไม่มีวันเริ่มบัตร) ให้เริ่มนับ 60 วันตั้งแต่วันนี้
    let startedAt: Date;
    let expiresAt: Date;

    if (currentPoints === 0 || !row.card_started_at || !row.card_expires_at || isExpired) {
        startedAt = now;
        expiresAt = new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000);
    } else {
        startedAt = new Date(row.card_started_at);
        expiresAt = new Date(row.card_expires_at);
    }

    const newPoints = currentPoints + cupCount;
    const newTotalEarned = Number(row.total_stamps_earned || 0) + cupCount;

    const updated = await pool.query(
        `
        UPDATE public.members
        SET points = $2,
            total_stamps_earned = $3,
            card_started_at = $4,
            card_expires_at = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [row.id, newPoints, newTotalEarned, startedAt.toISOString(), expiresAt.toISOString()]
    );

    return mapRowToMember(updated.rows[0]);
}

/**
 * ตัดแต้มเพื่อแลกแก้วฟรี (ทั้งกรณีลูกค้ากดใช้สิทธิ์ตอนสั่งซื้อ และกรณีแอดมินกดตัดแต้มให้)
 */
export async function redeemFreeCupPoints(
    phone: string,
    customStampsToDeduct?: number
): Promise<{ success: boolean; member?: Member; message?: string }> {
    await ensurePgSchema();
    const cleanedPhone = cleanPhone(phone);
    const member = await getMemberByPhone(cleanedPhone);
    if (!member) {
        return { success: false, message: 'ไม่พบข้อมูลสมาชิก' };
    }

    const settings = await getStoreSettings();
    if (settings.loyaltyEnabled === false) {
        return { success: false, message: 'ขณะนี้ระบบสะสมแต้มและแลกแก้วฟรีปิดให้บริการชั่วคราวค่ะ' };
    }
    const requiredStamps = customStampsToDeduct || Number(settings.loyaltyStampsRequired) || 10;

    if (member.points < requiredStamps) {
        return {
            success: false,
            message: `แต้มสะสมยังไม่ครบ (มี ${member.points}/${requiredStamps} ดวง)`
        };
    }

    const remainingPoints = Math.max(0, member.points - requiredStamps);
    const expireDays = Number(settings.loyaltyExpireDays) > 0 ? Number(settings.loyaltyExpireDays) : 60;
    const now = new Date();

    // หากตัดแต้มแล้วยังมีแต้มเหลืออยู่ ให้คงวันหมดอายุเดิมไว้ แต่ถ้าเหลือ 0 ให้รีเซ็ตรอเริ่มนับ 60 วันใหม่เมื่อซื้อแก้วแรกของรอบถัดไป
    const newStartedAt = remainingPoints > 0 ? (member.cardStartedAt || now.toISOString()) : null;
    const newExpiresAt =
        remainingPoints > 0
            ? (member.cardExpiresAt || new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000).toISOString())
            : null;

    const updated = await pool.query(
        `
        UPDATE public.members
        SET points = $2,
            total_free_redeemed = total_free_redeemed + 1,
            card_started_at = $3,
            card_expires_at = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [member.id, remainingPoints, newStartedAt, newExpiresAt]
    );

    return {
        success: true,
        member: mapRowToMember(updated.rows[0]),
        message: `แลกสิทธิ์แก้วฟรีสำเร็จ! (หัก ${requiredStamps} แต้ม คงเหลือ ${remainingPoints} แต้ม)`
    };
}

export async function updateMemberByAdmin(
    id: number,
    data: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        pin?: string;
        points?: number;
        cardExpiresAt?: string | null;
    }
): Promise<Member | null> {
    await ensurePgSchema();
    const existingRes = await pool.query('SELECT * FROM public.members WHERE id = $1 LIMIT 1', [id]);
    if (existingRes.rows.length === 0) return null;
    const current = existingRes.rows[0];

    const settings = await getStoreSettings();
    const expireDays = Number(settings.loyaltyExpireDays) > 0 ? Number(settings.loyaltyExpireDays) : 60;

    const firstName = data.firstName !== undefined ? data.firstName.trim() : current.first_name;
    const lastName = data.lastName !== undefined ? data.lastName.trim() : current.last_name;
    const phone = data.phone !== undefined ? cleanPhone(data.phone) : current.phone;
    const pin = data.pin !== undefined && data.pin.trim() !== '' ? data.pin.trim() : current.pin;
    const prevPoints = Number(current.points || 0);
    const points = data.points !== undefined ? Math.max(0, Number(data.points)) : prevPoints;
    const pointsDelta = points - prevPoints;
    const totalStampsEarned = Math.max(0, Number(current.total_stamps_earned || 0) + pointsDelta);

    let cardStartedAt = current.card_started_at;
    let cardExpiresAt = data.cardExpiresAt !== undefined ? data.cardExpiresAt : current.card_expires_at;

    if (points > 0 && !cardExpiresAt) {
        const now = new Date();
        cardStartedAt = now.toISOString();
        cardExpiresAt = new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000).toISOString();
    } else if (points === 0 && data.cardExpiresAt === undefined) {
        cardStartedAt = null;
        cardExpiresAt = null;
    }

    const updated = await pool.query(
        `
        UPDATE public.members
        SET first_name = $2,
            last_name = $3,
            phone = $4,
            pin = $5,
            points = $6,
            total_stamps_earned = $7,
            card_started_at = $8,
            card_expires_at = $9,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, firstName, lastName, phone, pin, points, totalStampsEarned, cardStartedAt, cardExpiresAt]
    );

    return mapRowToMember(updated.rows[0]);
}

export async function deleteMemberByAdmin(id: number): Promise<boolean> {
    await ensurePgSchema();
    const res = await pool.query('DELETE FROM public.members WHERE id = $1 RETURNING id', [id]);
    return res.rows.length > 0;
}
