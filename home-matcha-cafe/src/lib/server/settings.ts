import fs from 'fs';
import path from 'path';
import { pool, ensurePgSchema } from './pgPool';

export interface DeliveryRound {
    id: string;
    name: string;
    timeSlot: string;
    cutoffTime: string; // 'HH:mm' on same day
    allowFermented: boolean;
    isAllDayOpen?: boolean; // ถ้าเป็น true เมนูไม่บ่มสามารถสั่งได้ตลอดจนจบช่วงเวลาส่ง
    enabled: boolean;
}

export interface DaySchedule {
    isOpen: boolean;
    customRounds?: string[]; // IDs of delivery rounds available on this day
    note?: string;
}

export interface StoreSettings {
    isMasterOpen: boolean;
    closedAlertMessage: string;
    advanceBookingHours: number;
    maxAdvanceDays: number; // สั่งล่วงหน้าได้ไม่เกินกี่วัน (ค่าเริ่มต้น 3 วัน)
    advanceBookingMode?: 'days' | 'hours'; // โหมดนับการสั่งล่วงหน้า เป็นวัน หรือ รายชั่วโมง
    fermentedCutoffTime: string; // 'HH:mm' on day before delivery date
    fermentedItemIds: string[];
    deliveryRounds: DeliveryRound[];
    calendar: Record<string, DaySchedule>; // keyed by 'YYYY-MM-DD'
    loyaltyEnabled: boolean;
    loyaltyStampsRequired: number;
    loyaltyExpireDays: number;
    loyaltyRedeemableItemIds: string[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const ALLDAY_ROUND_DEFAULT: DeliveryRound = {
    id: 'allday',
    name: 'รอบรวมเช้า-บ่าย',
    timeSlot: '09:00–13:00 น.',
    cutoffTime: '13:00',
    allowFermented: true,
    isAllDayOpen: true,
    enabled: true
};

const DEFAULT_SETTINGS: StoreSettings = {
    isMasterOpen: true,
    closedAlertMessage: 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ ขออภัยในความไม่สะดวกนะคะ 🍵',
    advanceBookingHours: 72,
    maxAdvanceDays: 3,
    advanceBookingMode: 'days',
    fermentedCutoffTime: '23:00',
    fermentedItemIds: ['cold-fermented-matcha-oat-latte'],
    loyaltyEnabled: true,
    loyaltyStampsRequired: 10,
    loyaltyExpireDays: 60,
    loyaltyRedeemableItemIds: [
        'pure-matcha',
        'matcha-latte',
        'matcha-coconut',
        'matcha-latte-oat',
        'cold-fermented-matcha-oat-latte'
    ],
    deliveryRounds: [
        {
            id: 'morning',
            name: 'รอบเช้า',
            timeSlot: '07:00–08:00 น.',
            cutoffTime: '06:00',
            allowFermented: true,
            isAllDayOpen: false,
            enabled: true
        },
        {
            id: 'noon',
            name: 'รอบเที่ยง',
            timeSlot: '12:30–13:00 น.',
            cutoffTime: '11:30',
            allowFermented: true,
            isAllDayOpen: false,
            enabled: true
        },
        ALLDAY_ROUND_DEFAULT
    ],
    calendar: {}
};

export function formatDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function buildInitialSettings(): StoreSettings {
    // หากมีไฟล์ settings.json เดิมอยู่ ให้นำค่าเดิมมาใช้เป็นค่าเริ่มต้นเพื่อย้ายขึ้น PostgreSQL อัตโนมัติ
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            return normalizeSettings(parsed);
        } catch {
            // fallback to default below
        }
    }

    const initial: StoreSettings = {
        ...DEFAULT_SETTINGS,
        calendar: {}
    };
    const now = new Date();
    for (let i = 0; i < 14; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const dateStr = formatDateKey(d);
        const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, 5 = Fri, 6 = Sat
        const isOpen = dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 5 || dayOfWeek === 6;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        initial.calendar[dateStr] = {
            isOpen,
            customRounds: isWeekend ? ['allday'] : ['morning', 'noon']
        };
    }
    return initial;
}

function normalizeSettings(parsed: any): StoreSettings {
    let rounds: DeliveryRound[] =
        Array.isArray(parsed?.deliveryRounds) && parsed.deliveryRounds.length > 0
            ? parsed.deliveryRounds
            : DEFAULT_SETTINGS.deliveryRounds;

    if (!rounds.some(r => r.id === 'allday')) {
        rounds = [...rounds, ALLDAY_ROUND_DEFAULT];
    }
    rounds = rounds.map(r => {
        if (r.id === 'allday') {
            return { ...ALLDAY_ROUND_DEFAULT, ...r, isAllDayOpen: true, allowFermented: true };
        }
        return { ...r, allowFermented: true };
    });

    return {
        ...DEFAULT_SETTINGS,
        ...(parsed || {}),
        maxAdvanceDays: typeof parsed?.maxAdvanceDays === 'number' && parsed.maxAdvanceDays > 0 ? parsed.maxAdvanceDays : 3,
        advanceBookingMode: parsed?.advanceBookingMode === 'hours' ? 'hours' : 'days',
        advanceBookingHours: typeof parsed?.advanceBookingHours === 'number' && parsed.advanceBookingHours > 0 ? parsed.advanceBookingHours : 72,
        loyaltyRedeemableItemIds: Array.isArray(parsed?.loyaltyRedeemableItemIds)
            ? parsed.loyaltyRedeemableItemIds
            : DEFAULT_SETTINGS.loyaltyRedeemableItemIds,
        deliveryRounds: rounds,
        calendar: parsed?.calendar || {}
    };
}

export async function getStoreSettings(): Promise<StoreSettings> {
    await ensurePgSchema();
    try {
        const res = await pool.query(`
            SELECT settings_data
            FROM public.store_settings
            WHERE id = 1
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            const initial = buildInitialSettings();
            await pool.query(
                `
                INSERT INTO public.store_settings (id, settings_data, updated_at)
                VALUES (1, $1::jsonb, NOW())
                ON CONFLICT (id) DO UPDATE
                SET settings_data = EXCLUDED.settings_data,
                    updated_at = NOW()
                `,
                [JSON.stringify(initial)]
            );
            return initial;
        }

        const rawData = res.rows[0].settings_data;
        const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        return normalizeSettings(parsed);
    } catch (e) {
        console.error('Error reading store settings from PostgreSQL:', e);
        return DEFAULT_SETTINGS;
    }
}

export async function updateStoreSettings(partial: Partial<StoreSettings>): Promise<StoreSettings> {
    await ensurePgSchema();
    const current = await getStoreSettings();
    const updated: StoreSettings = normalizeSettings({
        ...current,
        ...partial,
        calendar: {
            ...current.calendar,
            ...(partial.calendar || {})
        }
    });

    await pool.query(
        `
        INSERT INTO public.store_settings (id, settings_data, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
        SET settings_data = EXCLUDED.settings_data,
            updated_at = NOW()
        `,
        [JSON.stringify(updated)]
    );

    return updated;
}

export interface DayDisplayInfo {
    dateStr: string;
    dayNum: number;
    monthNameTh: string;
    dayNameEn: string; // 'Mon', 'Tue', etc.
    dayNameTh: string; // 'จันทร์', 'อังคาร', etc.
    dayColor: string; // Hex color code
    dayBgLight: string;
    isOpen: boolean;
    availableRounds: DeliveryRound[];
    canOrderNow: boolean;
    orderOpeningTime?: string;
    closeReason?: string;
    isToday: boolean;
    isPastAllCutoffs?: boolean;
}

export interface ScheduleResponse {
    days: DayDisplayInfo[];
    settings: StoreSettings;
    storeStatus: 'open' | 'closed_today_can_preorder' | 'closed_store';
    storeStatusBadgeText: string;
    storeStatusDesc: string;
    isTodayOrderable: boolean;
    hasAnyOrderableSlot: boolean;
}

const THAI_DAY_COLORS: Record<number, { nameTh: string; nameEn: string; color: string; bgLight: string }> = {
    0: { nameTh: 'อาทิตย์', nameEn: 'Sun', color: '#ef4444', bgLight: '#fef2f2' }, // แดง
    1: { nameTh: 'จันทร์', nameEn: 'Mon', color: '#eab308', bgLight: '#fefce8' },  // เหลือง
    2: { nameTh: 'อังคาร', nameEn: 'Tue', color: '#ec4899', bgLight: '#fdf2f8' },  // ชมพู
    3: { nameTh: 'พุธ', nameEn: 'Wed', color: '#16a34a', bgLight: '#f0fdf4' },     // เขียว
    4: { nameTh: 'พฤหัสบดี', nameEn: 'Thu', color: '#f97316', bgLight: '#fff7ed' },// ส้ม
    5: { nameTh: 'ศุกร์', nameEn: 'Fri', color: '#0ea5e9', bgLight: '#f0f9ff' },   // ฟ้า
    6: { nameTh: 'เสาร์', nameEn: 'Sat', color: '#8b5cf6', bgLight: '#f5f3ff' }    // ม่วง
};

const THAI_MONTHS_SHORT = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export async function getNext7DaysSchedule(): Promise<ScheduleResponse> {
    const settings = await getStoreSettings();
    const now = new Date();
    const days: DayDisplayInfo[] = [];

    // กำหนดจำนวนวันสั่งล่วงหน้าสูงสุด
    const effectiveAdvanceDays = settings.advanceBookingMode === 'hours'
        ? Math.max(1, Math.ceil((settings.advanceBookingHours || 72) / 24))
        : Math.max(1, settings.maxAdvanceDays || 3);

    const maxAdvanceMs = settings.advanceBookingMode === 'hours'
        ? (settings.advanceBookingHours || 72) * 3600 * 1000
        : (settings.maxAdvanceDays || 3) * 24 * 3600 * 1000;

    // แสดงตาราง 7 วันล่วงหน้าเสมอ (1 สัปดาห์)
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const dateStr = formatDateKey(d);
        const dayOfWeek = d.getDay();
        const colorInfo = THAI_DAY_COLORS[dayOfWeek];
        const isToday = i === 0;

        const dayConfig = settings.calendar[dateStr] || { isOpen: false };
        const isConfiguredOpen = Boolean(dayConfig.isOpen);

        const customRoundIds = dayConfig.customRounds || ['morning', 'noon'];
        const activeRounds = settings.deliveryRounds.filter(
            r => r.enabled && customRoundIds.includes(r.id)
        );

        let canOrderNow = isConfiguredOpen && settings.isMasterOpen;
        let isPastAllCutoffs = false;
        let closeReason = '';

        if (!settings.isMasterOpen) {
            canOrderNow = false;
            closeReason = 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์';
        } else if (!isConfiguredOpen) {
            canOrderNow = false;
            closeReason = 'ร้านปิดบริการในวันนี้';
        } else if (isToday) {
            // กรณีเป็น "วันนี้": ตรวจสอบเวลาตัดรอบของทุกรอบส่งในวันนี้
            const availableRoundsToday = activeRounds.filter(round => {
                const [rCutoffH, rCutoffM] = (round.cutoffTime || '06:00').split(':').map(Number);
                const roundDeadline = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rCutoffH, rCutoffM, 59, 999);
                return now.getTime() <= roundDeadline.getTime();
            });

            if (activeRounds.length === 0 || availableRoundsToday.length === 0) {
                // เกินเวลาส่งของทุกรอบในวันนี้แล้ว ➡️ ปิดรับออเดอร์ของวันนี้
                isPastAllCutoffs = true;
                canOrderNow = false;
                closeReason = 'เลยเวลาตัดรอบส่งทั้งหมดของวันนี้แล้ว (ปิดรับรอบวันนี้)';
            }
        } else {
            // กรณีวันล่วงหน้า ตรวจสอบว่าเกินจำนวนวัน/ชั่วโมงสั่งล่วงหน้าสูงสุดหรือไม่
            const dayMidnightMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
            const isExceedingAdvanceLimit = settings.advanceBookingMode === 'hours'
                ? (dayMidnightMs > now.getTime() + maxAdvanceMs)
                : (i > effectiveAdvanceDays);

            if (isExceedingAdvanceLimit) {
                canOrderNow = false;
                closeReason = settings.advanceBookingMode === 'hours'
                    ? `เปิดรับสั่งล่วงหน้าไม่เกิน ${settings.advanceBookingHours} ชม.`
                    : `เปิดรับสั่งล่วงหน้าไม่เกิน ${settings.maxAdvanceDays || 3} วัน`;
            }
        }

        days.push({
            dateStr,
            dayNum: d.getDate(),
            monthNameTh: THAI_MONTHS_SHORT[d.getMonth()],
            dayNameEn: colorInfo.nameEn,
            dayNameTh: colorInfo.nameTh,
            dayColor: colorInfo.color,
            dayBgLight: colorInfo.bgLight,
            isOpen: isConfiguredOpen && settings.isMasterOpen,
            availableRounds: activeRounds,
            canOrderNow,
            closeReason,
            isToday,
            isPastAllCutoffs
        });
    }

    // คำนวณสถานะรวมของร้าน โดยพิจารณาเฉพาะช่วงสั่งล่วงหน้าที่กำหนด (เช่น 3 วันข้างหน้า)
    const windowDays = days.filter((_, idx) => idx <= effectiveAdvanceDays);
    const orderableDaysInWindow = windowDays.filter(d => d.isOpen && d.canOrderNow);
    const hasAnyOrderableSlot = orderableDaysInWindow.length > 0;
    const todayInfo = days.find(d => d.isToday);
    const isTodayOrderable = todayInfo ? Boolean(todayInfo.isOpen && todayInfo.canOrderNow) : false;

    let storeStatus: 'open' | 'closed_today_can_preorder' | 'closed_store' = 'open';
    let storeStatusBadgeText = '🟢 เปิดรับออเดอร์ตามปกติ';
    let storeStatusDesc = 'พร้อมรับออเดอร์และจัดส่งตามรอบ';

    if (!settings.isMasterOpen || !hasAnyOrderableSlot) {
        // หากปิดสวิตช์หลัก หรือในระยะเวลาสั่งล่วงหน้าที่กำหนด (เช่น 3 วัน) ไม่มีวันไหนเปิดให้สั่งได้เลย (ร้านปิด)
        storeStatus = 'closed_store';
        storeStatusBadgeText = '🔴 ขณะนี้ร้านยังไม่เปิดรับออเดอร์';
        storeStatusDesc = settings.closedAlertMessage || 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ ขออภัยในความไม่สะดวกนะคะ 🍵';
    } else if (!isTodayOrderable) {
        // วันนี้เลยเวลาตัดรอบส่งแล้ว แต่ยังมีวันข้างหน้าเปิดให้สั่งล่วงหน้าได้
        storeStatus = 'closed_today_can_preorder';
        storeStatusBadgeText = '🟠 ปิดรับรอบวันนี้แล้ว · สั่งล่วงหน้าได้ 🍵';
        storeStatusDesc = 'รอบจัดส่งวันนี้ปิดรับออเดอร์แล้ว แต่คุณสามารถสั่งล่วงหน้าสำหรับวันถัดไปได้ค่ะ';
    } else {
        storeStatus = 'open';
        storeStatusBadgeText = '🟢 เปิดรับออเดอร์ตามปกติ';
        storeStatusDesc = 'สั่งเครื่องดื่มและจัดส่งตามรอบส่ง';
    }

    return {
        days,
        settings,
        storeStatus,
        storeStatusBadgeText,
        storeStatusDesc,
        isTodayOrderable,
        hasAnyOrderableSlot
    };
}

export async function validateDeliverySlot(
    deliveryDateStr: string,
    roundId: string,
    hasFermentedItem: boolean
): Promise<{ isValid: boolean; message?: string; round?: DeliveryRound }> {
    const settings = await getStoreSettings();

    if (!settings.isMasterOpen) {
        return { isValid: false, message: settings.closedAlertMessage || 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ค่ะ' };
    }

    const dayConfig = settings.calendar[deliveryDateStr];
    if (!dayConfig || !dayConfig.isOpen) {
        return { isValid: false, message: `ร้านปิดรับออเดอร์ในวันที่ ${deliveryDateStr} ค่ะ กรุณาเลือกวันอื่น` };
    }

    const round = settings.deliveryRounds.find(r => r.id === roundId && r.enabled);
    if (!round) {
        return { isValid: false, message: 'ไม่พบรอบเวลาจัดส่งที่เลือก หรือรอบนี้ปิดให้บริการแล้ว' };
    }

    const allowedRounds = dayConfig.customRounds || ['morning', 'noon'];
    if (!allowedRounds.includes(roundId)) {
        return { isValid: false, message: `รอบ ${round.name} ไม่ได้เปิดให้บริการในวันที่ ${deliveryDateStr}` };
    }

    const now = new Date();
    const [y, m, d] = deliveryDateStr.split('-').map(Number);
    const targetDateMidnight = new Date(y, m - 1, d, 0, 0, 0);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const diffDays = Math.round((targetDateMidnight.getTime() - todayMidnight.getTime()) / (86400 * 1000));
    if (diffDays < 0) {
        return { isValid: false, message: 'ไม่สามารถเลือกวันที่ในอดีตได้ค่ะ' };
    }

    // ตรวจสอบระยะเวลาสั่งล่วงหน้าสูงสุด
    if (settings.advanceBookingMode === 'hours') {
        const maxMs = (settings.advanceBookingHours || 72) * 3600 * 1000;
        if (targetDateMidnight.getTime() > now.getTime() + maxMs) {
            return {
                isValid: false,
                message: `สามารถสั่งล่วงหน้าได้ไม่เกิน ${settings.advanceBookingHours || 72} ชั่วโมงค่ะ กรุณาเลือกวันที่ใหม่อีกครั้ง`
            };
        }
    } else {
        const maxDays = settings.maxAdvanceDays || 3;
        if (diffDays > maxDays) {
            return {
                isValid: false,
                message: `สามารถสั่งล่วงหน้าได้ไม่เกิน ${maxDays} วันค่ะ กรุณาเลือกวันที่ใหม่อีกครั้ง`
            };
        }
    }

    // 1. ตรวจสอบเงื่อนไขเมนูบ่ม (ต้องสั่งล่วงหน้าก่อนเวลาตัดรอบ เช่น 23:00 น. ของวันก่อนส่ง)
    if (hasFermentedItem) {
        const [cutoffH, cutoffM] = (settings.fermentedCutoffTime || '23:00').split(':').map(Number);
        const fermentedDeadline = new Date(y, m - 1, d - 1, cutoffH, cutoffM, 59, 999);

        if (now.getTime() > fermentedDeadline.getTime()) {
            return {
                isValid: false,
                message: `เมนูบ่มต้องสั่งล่วงหน้าก่อนเวลา ${settings.fermentedCutoffTime} น. ของวันก่อนจัดส่งค่ะ สำหรับวันที่เลือกสั่งได้เฉพาะเมนูไม่บ่ม (หรือกรุณาเลือกวันจัดส่งถัดไปนะคะ)`
            };
        }
    }

    // 2. ตรวจสอบเวลาตัดรอบของรอบส่งนั้นๆ
    const [roundCutoffH, roundCutoffM] = (round.cutoffTime || '06:00').split(':').map(Number);
    const roundDeadline = new Date(y, m - 1, d, roundCutoffH, roundCutoffM, 59, 999);

    if (now.getTime() > roundDeadline.getTime()) {
        return {
            isValid: false,
            message: diffDays === 0
                ? `รอบ ${round.name} (${round.timeSlot}) ของวันนี้ปิดรับออเดอร์แล้วเมื่อเวลา ${round.cutoffTime} น. ค่ะ กรุณาเลือกวันถัดไปนะคะ`
                : `รอบ ${round.name} (${round.timeSlot}) ของวันที่ ${deliveryDateStr} ปิดรับออเดอร์แล้วเมื่อเวลา ${round.cutoffTime} น. ค่ะ กรุณาเลือกรอบถัดไปหรือวันถัดไปนะคะ`
        };
    }

    return { isValid: true, round };
}
