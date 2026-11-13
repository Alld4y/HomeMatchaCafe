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
    closedAlertMessage: 'ขณะนี้ร้านปิดรับออเดอร์ชั่วคราว ขออภัยในความไม่สะดวกนะคะ 🍵',
    advanceBookingHours: 24,
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

export async function getNext7DaysSchedule(): Promise<{ days: DayDisplayInfo[]; settings: StoreSettings }> {
    const settings = await getStoreSettings();
    const now = new Date();
    const days: DayDisplayInfo[] = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const dateStr = formatDateKey(d);
        const dayOfWeek = d.getDay();
        const colorInfo = THAI_DAY_COLORS[dayOfWeek];

        const dayConfig = settings.calendar[dateStr] || { isOpen: false };
        const isConfiguredOpen = Boolean(dayConfig.isOpen);

        const customRoundIds = dayConfig.customRounds || ['morning', 'noon'];
        const activeRounds = settings.deliveryRounds.filter(
            r => r.enabled && customRoundIds.includes(r.id)
        );
        const hasAllDayRound = activeRounds.some(r => r.isAllDayOpen || r.id === 'allday');

        const dayMidnightMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
        const openOrderMs = dayMidnightMs - (settings.advanceBookingHours * 3600 * 1000);

        const isOpen = isConfiguredOpen && settings.isMasterOpen;
        const canOrderNow = isOpen && (hasAllDayRound || now.getTime() >= openOrderMs);

        let closeReason = '';
        if (!settings.isMasterOpen) {
            closeReason = 'ร้านปิดรับออเดอร์ชั่วคราว';
        } else if (!isConfiguredOpen) {
            closeReason = 'ร้านปิดบริการในวันนี้';
        } else if (!hasAllDayRound && now.getTime() < openOrderMs) {
            const openDate = new Date(openOrderMs);
            closeReason = `เปิดรับออเดอร์ ${openDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
        }

        days.push({
            dateStr,
            dayNum: d.getDate(),
            monthNameTh: THAI_MONTHS_SHORT[d.getMonth()],
            dayNameEn: colorInfo.nameEn,
            dayNameTh: colorInfo.nameTh,
            dayColor: colorInfo.color,
            dayBgLight: colorInfo.bgLight,
            isOpen,
            availableRounds: activeRounds,
            canOrderNow,
            closeReason
        });
    }

    return { days, settings };
}

export async function validateDeliverySlot(
    deliveryDateStr: string,
    roundId: string,
    hasFermentedItem: boolean
): Promise<{ isValid: boolean; message?: string; round?: DeliveryRound }> {
    const settings = await getStoreSettings();

    if (!settings.isMasterOpen) {
        return { isValid: false, message: settings.closedAlertMessage || 'ขณะนี้ร้านปิดรับออเดอร์ชั่วคราวค่ะ' };
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
            message: `รอบ ${round.name} (${round.timeSlot}) ของวันที่ ${deliveryDateStr} ปิดรับออเดอร์แล้วเมื่อเวลา ${round.cutoffTime} น. ค่ะ กรุณาเลือกรอบถัดไปหรือวันถัดไปนะคะ`
        };
    }

    return { isValid: true, round };
}
