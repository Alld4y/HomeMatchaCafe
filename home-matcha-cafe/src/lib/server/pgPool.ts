import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

export function loadEnvVariables(): Record<string, string> {
    const envPath = path.resolve(process.cwd(), '.env');
    const result: Record<string, string> = {};
    try {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    result[key] = val;
                }
            }
        }
    } catch (e) {
        console.error('Error reading .env file:', e);
    }
    return result;
}

export function getEnvConfig(key: string, fallback = ''): string {
    const envVars = loadEnvVariables();
    return envVars[key] ?? process.env[key] ?? fallback;
}

const envVars = loadEnvVariables();

export const pool = new Pool({
    host: process.env.PG_HOST || envVars.PG_HOST || 'alldaygrow.tplinkdns.com',
    port: Number(process.env.PG_PORT || envVars.PG_PORT || 5432),
    database: process.env.PG_DATABASE || envVars.PG_DATABASE || 'HomeMatchaCafe',
    user: process.env.PG_USER || envVars.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || envVars.PG_PASSWORD || 'icloud03102019',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

/**
 * ตรวจสอบและอัปเดตโครงสร้างตารางใน PostgreSQL อัตโนมัติ
 */
export async function ensurePgSchema(): Promise<void> {
    if (schemaInitialized) return;
    if (schemaInitPromise) return schemaInitPromise;

    schemaInitPromise = (async () => {
        try {
            // 1. สร้างตาราง public."order" หากยังไม่มี
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public."order" (
                    order_id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    address TEXT NOT NULL,
                    message TEXT,
                    slip_image TEXT NOT NULL DEFAULT '',
                    basket TEXT NOT NULL DEFAULT '[]',
                    slip_ref TEXT,
                    status TEXT DEFAULT 'paid'
                );
            `);

            // 2. เพิ่มคอลัมน์สำหรับระบบใหม่ให้กับตาราง public."order"
            await pool.query(`
                ALTER TABLE public."order"
                    ADD COLUMN IF NOT EXISTS order_code TEXT,
                    ADD COLUMN IF NOT EXISTS total_price NUMERIC(10, 2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS slip_amount NUMERIC(10, 2),
                    ADD COLUMN IF NOT EXISTS slip_time_text TEXT,
                    ADD COLUMN IF NOT EXISTS qr_generated_at TEXT,
                    ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS review_reason TEXT,
                    ADD COLUMN IF NOT EXISTS delivery_date TEXT,
                    ADD COLUMN IF NOT EXISTS delivery_round TEXT,
                    ADD COLUMN IF NOT EXISTS delivery_round_id TEXT,
                    ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS redeemed_free_cups INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            `);

            // 3. สร้างตาราง public.store_settings สำหรับเก็บการตั้งค่าร้าน ปฏิทิน รอบจัดส่ง และตั้งค่าบัตรสะสมแต้ม
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public.store_settings (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    settings_data JSONB NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);

            // 4. สร้างตาราง public.members สำหรับระบบสมาชิกและบัตรสะสมแต้ม
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public.members (
                    id SERIAL PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    phone TEXT UNIQUE NOT NULL,
                    pin TEXT NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0,
                    total_stamps_earned INTEGER NOT NULL DEFAULT 0,
                    total_free_redeemed INTEGER NOT NULL DEFAULT 0,
                    card_started_at TIMESTAMPTZ,
                    card_expires_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);

            // 5. สร้างตาราง public.menu_categories และ public.menu_items สำหรับระบบจัดการเมนูและหมวดหมู่
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public.menu_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT DEFAULT '🍵',
                    sort_order INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS public.menu_items (
                    id TEXT PRIMARY KEY,
                    thai_name TEXT NOT NULL,
                    english_name TEXT NOT NULL,
                    price NUMERIC(10, 2) NOT NULL DEFAULT 50,
                    category TEXT NOT NULL DEFAULT 'clear',
                    description TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    image_url TEXT DEFAULT '',
                    is_promotion BOOLEAN DEFAULT FALSE,
                    is_signature BOOLEAN DEFAULT FALSE,
                    is_fermented BOOLEAN DEFAULT FALSE,
                    is_available BOOLEAN DEFAULT TRUE,
                    tags JSONB DEFAULT '[]'::jsonb,
                    addons JSONB DEFAULT '[]'::jsonb,
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                ALTER TABLE public.menu_items
                    ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb;
            `);

            // 6. สร้างตาราง public.push_subscriptions สำหรับระบบ Web Push Notifications
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public.push_subscriptions (
                    id SERIAL PRIMARY KEY,
                    phone TEXT NOT NULL,
                    endpoint TEXT UNIQUE NOT NULL,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    user_agent TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON public.push_subscriptions(phone);
            `);

            schemaInitialized = true;
            console.log('✅ PostgreSQL connected & all tables verified (order, store_settings, members, menu_categories, menu_items, push_subscriptions)');
        } catch (err) {
            schemaInitPromise = null;
            console.error('❌ Error initializing PostgreSQL schema:', err);
            throw err;
        }
    })();

    return schemaInitPromise;
}
