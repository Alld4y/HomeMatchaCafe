import fs from 'fs';
import path from 'path';
import { pool, ensurePgSchema } from './pgPool';

export interface MenuCategory {
    id: string;
    name: string;
    icon: string;
    sortOrder: number;
}

export interface MenuAddonOption {
    id: string;
    name: string;
    price: number;
}

export interface MenuItemRecord {
    id: string;
    thaiName: string;
    englishName: string;
    price: number;
    category: string;
    description: string;
    notes: string;
    imageUrl: string;
    isPromotion: boolean;
    isSignature: boolean;
    isFermented: boolean;
    isAvailable: boolean;
    tags: string[];
    addons?: MenuAddonOption[];
    sortOrder: number;
}

const MENU_UPLOADS_DIR = path.resolve(process.cwd(), 'static', 'uploads', 'menus');

function ensureMenuUploadsDir() {
    if (!fs.existsSync(MENU_UPLOADS_DIR)) {
        fs.mkdirSync(MENU_UPLOADS_DIR, { recursive: true });
    }
}

const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'clear', name: 'ชงใส (Clear)', icon: '🌿', sortOrder: 1 },
    { id: 'latte', name: 'ลาเต้ (Latte)', icon: '🥛', sortOrder: 2 },
    { id: 'fruit', name: 'ผลไม้สด (Fruit)', icon: '🥥', sortOrder: 3 },
    { id: 'special', name: 'สูตรพิเศษ (Signature)', icon: '✨', sortOrder: 4 }
];

const DEFAULT_MENUS: MenuItemRecord[] = [
    {
        id: 'pure-matcha',
        thaiName: 'เพียวมัทฉะ',
        englishName: 'PURE MATCHA',
        price: 50,
        category: 'clear',
        description: 'มัทฉะเกรดพิธีการแท้ตีด้วยน้ำแร่ หอมเข้ม สดชื่น ไร้นม ดื่มง่ายดีต่อสุขภาพ',
        notes: 'แนะนำหวาน 0% หรือ 25% เพื่อสัมผัสรสชาติมัทฉะแท้',
        imageUrl: '',
        isPromotion: false,
        isSignature: false,
        isFermented: false,
        isAvailable: true,
        tags: ['0% Fat', 'คลีนแท้', 'ไม่มีนม'],
        sortOrder: 1
    },
    {
        id: 'matcha-latte',
        thaiName: 'มัทฉะลาเต้',
        englishName: 'MATCHA LATTE',
        price: 55,
        category: 'latte',
        description: 'มัทฉะเข้มข้นผสานนมสดแท้รสละมุน หอมมันกลมกล่อมลงตัว รสสัมผัสยอดนิยม',
        notes: 'ระดับความหวาน 50% เป็นสูตรมาตรฐานที่ลงตัวที่สุด',
        imageUrl: '/image/matcha-product1.png',
        isPromotion: false,
        isSignature: true,
        isFermented: false,
        isAvailable: true,
        tags: ['เมนูยอดฮิต', 'นมสดแท้'],
        sortOrder: 2
    },
    {
        id: 'matcha-coconut',
        thaiName: 'มัทฉะมะพร้าว',
        englishName: 'MATCHA COCONUT',
        price: 60,
        category: 'fruit',
        description: 'มัทฉะแท้เลเยอร์บนน้ำมะพร้าวน้ำหอมแท้ 100% หวานธรรมชาติ ดื่มแล้วสดชื่นสุดใจ',
        notes: 'น้ำมะพร้าวมีความหวานธรรมชาติอยู่แล้ว แนะนำหวาน 0% - 25%',
        imageUrl: '',
        isPromotion: true,
        isSignature: true,
        isFermented: false,
        isAvailable: true,
        tags: ['มะพร้าวน้ำหอม', 'หวานธรรมชาติ', 'แนะนำ ✨'],
        sortOrder: 3
    },
    {
        id: 'matcha-oat-latte',
        thaiName: 'มัทฉะลาเต้นมโอ๊ต',
        englishName: 'MATCHA OAT LATTE',
        price: 65,
        category: 'latte',
        description: 'มัทฉะจับคู่กับนมโอ๊ตสูตรบาริสต้าพรีเมียม หอมนวล รสสัมผัสครีมมี่ Plant-Based 100%',
        notes: 'เหมาะสำหรับผู้แพ้นมวัว หรือชื่นชอบความหอมมันของนมโอ๊ต',
        imageUrl: '/image/matcha-product2.png',
        isPromotion: false,
        isSignature: false,
        isFermented: false,
        isAvailable: true,
        tags: ['Plant-Based', 'นมโอ๊ต 100%', 'Vegan'],
        sortOrder: 4
    },
    {
        id: 'cold-fermented-matcha-oat-latte',
        thaiName: 'มัทฉะลาเต้นมโอ๊ตบ่ม',
        englishName: 'COLD FERMENTED MATCHA OAT LATTE',
        price: 70,
        category: 'special',
        description: 'กรรมวิธีบ่มสกัดเย็นพิเศษ เพิ่มมิติรสชาติ Umami นุ่มละมุนลึกซึ้ง เอกลักษณ์เฉพาะร้าน',
        notes: 'เมนู Signature พิเศษ รสชาติลุ่มลึก ละมุนลิ้น',
        imageUrl: '',
        isPromotion: true,
        isSignature: true,
        isFermented: true,
        isAvailable: true,
        tags: ['Signature 🍵', 'Cold Ferment', 'พรีเมียมพิเศษ'],
        sortOrder: 5
    }
];

let seeded = false;

async function ensureMenusSeeded(): Promise<void> {
    await ensurePgSchema();
    if (seeded) return;

    await pool.query(`
        ALTER TABLE public.menu_items
            ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb;
    `);

    const catCount = await pool.query('SELECT COUNT(*) FROM public.menu_categories');
    if (Number(catCount.rows[0].count) === 0) {
        for (const cat of DEFAULT_CATEGORIES) {
            await pool.query(
                `
                INSERT INTO public.menu_categories (id, name, icon, sort_order)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO NOTHING
                `,
                [cat.id, cat.name, cat.icon, cat.sortOrder]
            );
        }
    }

    const menuCount = await pool.query('SELECT COUNT(*) FROM public.menu_items');
    if (Number(menuCount.rows[0].count) === 0) {
        for (const item of DEFAULT_MENUS) {
            await pool.query(
                `
                INSERT INTO public.menu_items (
                    id, thai_name, english_name, price, category, description, notes,
                    image_url, is_promotion, is_signature, is_fermented, is_available, tags, sort_order
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    item.id,
                    item.thaiName,
                    item.englishName,
                    item.price,
                    item.category,
                    item.description,
                    item.notes,
                    item.imageUrl,
                    item.isPromotion,
                    item.isSignature,
                    item.isFermented,
                    item.isAvailable,
                    JSON.stringify(item.tags),
                    item.sortOrder
                ]
            );
        }
    }

    seeded = true;
}

function mapRowToMenu(row: any): MenuItemRecord {
    let tags: string[] = [];
    if (Array.isArray(row.tags)) {
        tags = row.tags;
    } else if (typeof row.tags === 'string') {
        try {
            tags = JSON.parse(row.tags || '[]');
        } catch {
            tags = [];
        }
    }

    let addons: MenuAddonOption[] = [];
    if (Array.isArray(row.addons)) {
        addons = row.addons;
    } else if (typeof row.addons === 'string') {
        try {
            addons = JSON.parse(row.addons || '[]');
        } catch {
            addons = [];
        }
    }

    return {
        id: row.id,
        thaiName: row.thai_name || '',
        englishName: row.english_name || '',
        price: Number(row.price || 0),
        category: row.category || 'clear',
        description: row.description || '',
        notes: row.notes || '',
        imageUrl: row.image_url || '',
        isPromotion: Boolean(row.is_promotion),
        isSignature: Boolean(row.is_signature),
        isFermented: Boolean(row.is_fermented),
        isAvailable: row.is_available !== false,
        tags,
        addons: addons
            .filter((a: any) => a && typeof a.name === 'string' && a.name.trim() !== '')
            .map((a: any, idx: number) => ({
                id: a.id || `addon-${idx + 1}`,
                name: a.name.trim(),
                price: Number(a.price) >= 0 ? Number(a.price) : 0
            })),
        sortOrder: Number(row.sort_order || 0)
    };
}

export async function getAllMenuData(): Promise<{ categories: MenuCategory[]; items: MenuItemRecord[] }> {
    await ensureMenusSeeded();
    const [catRes, itemRes] = await Promise.all([
        pool.query('SELECT * FROM public.menu_categories ORDER BY sort_order ASC, id ASC'),
        pool.query('SELECT * FROM public.menu_items ORDER BY sort_order ASC, created_at ASC')
    ]);

    const categories: MenuCategory[] = catRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        icon: r.icon || '🍵',
        sortOrder: Number(r.sort_order || 0)
    }));

    const items: MenuItemRecord[] = itemRes.rows.map(mapRowToMenu);
    return { categories, items };
}

export async function upsertMenuItem(data: Partial<MenuItemRecord> & { thaiName: string }): Promise<MenuItemRecord> {
    await ensureMenusSeeded();
    const id =
        data.id && data.id.trim() !== ''
            ? data.id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')
            : `menu-${Date.now()}`;

    const englishName = (data.englishName || id).toUpperCase();
    const price = Number(data.price) >= 0 ? Number(data.price) : 55;
    const category = data.category || 'clear';
    const description = data.description || '';
    const notes = data.notes || 'ชงสดใหม่แก้วต่อแก้ว';
    const imageUrl = data.imageUrl || '';
    const isPromotion = Boolean(data.isPromotion);
    const isSignature = Boolean(data.isSignature);
    const isFermented = Boolean(data.isFermented);
    const isAvailable = data.isAvailable !== false;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const addons: MenuAddonOption[] = Array.isArray(data.addons)
        ? data.addons
              .filter((a: any) => a && typeof a.name === 'string' && a.name.trim() !== '')
              .map((a: any, idx: number) => ({
                  id: a.id || `addon-${Date.now()}-${idx}`,
                  name: a.name.trim(),
                  price: Number(a.price) >= 0 ? Number(a.price) : 0
              }))
        : [];
    const sortOrder = Number(data.sortOrder) || 99;

    const res = await pool.query(
        `
        INSERT INTO public.menu_items (
            id, thai_name, english_name, price, category, description, notes,
            image_url, is_promotion, is_signature, is_fermented, is_available, tags, addons, sort_order, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, NOW())
        ON CONFLICT (id) DO UPDATE
        SET thai_name = EXCLUDED.thai_name,
            english_name = EXCLUDED.english_name,
            price = EXCLUDED.price,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            notes = EXCLUDED.notes,
            image_url = EXCLUDED.image_url,
            is_promotion = EXCLUDED.is_promotion,
            is_signature = EXCLUDED.is_signature,
            is_fermented = EXCLUDED.is_fermented,
            is_available = EXCLUDED.is_available,
            tags = EXCLUDED.tags,
            addons = EXCLUDED.addons,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        RETURNING *
        `,
        [
            id,
            data.thaiName.trim(),
            englishName,
            price,
            category,
            description,
            notes,
            imageUrl,
            isPromotion,
            isSignature,
            isFermented,
            isAvailable,
            JSON.stringify(tags),
            JSON.stringify(addons),
            sortOrder
        ]
    );

    return mapRowToMenu(res.rows[0]);
}

export async function deleteMenuItem(id: string): Promise<boolean> {
    await ensureMenusSeeded();
    const res = await pool.query('DELETE FROM public.menu_items WHERE id = $1 RETURNING id', [id]);
    return res.rows.length > 0;
}

export async function upsertMenuCategory(cat: { id?: string; name: string; icon?: string; sortOrder?: number }): Promise<MenuCategory> {
    await ensureMenusSeeded();
    const id =
        cat.id && cat.id.trim() !== ''
            ? cat.id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')
            : `cat-${Date.now()}`;
    const name = cat.name.trim();
    const icon = cat.icon || '🍵';
    const sortOrder = Number(cat.sortOrder) || 10;

    const res = await pool.query(
        `
        INSERT INTO public.menu_categories (id, name, icon, sort_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            icon = EXCLUDED.icon,
            sort_order = EXCLUDED.sort_order
        RETURNING *
        `,
        [id, name, icon, sortOrder]
    );

    const r = res.rows[0];
    return {
        id: r.id,
        name: r.name,
        icon: r.icon || '🍵',
        sortOrder: Number(r.sort_order || 0)
    };
}

export async function deleteMenuCategory(id: string): Promise<boolean> {
    await ensureMenusSeeded();
    const res = await pool.query('DELETE FROM public.menu_categories WHERE id = $1 RETURNING id', [id]);
    return res.rows.length > 0;
}

export async function saveMenuImageFile(file: File): Promise<string> {
    ensureMenuUploadsDir();
    const ext = path.extname(file.name) || '.png';
    const filename = `menu-${Date.now()}${ext}`;
    const filePath = path.join(MENU_UPLOADS_DIR, filename);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/menus/${filename}`;
}
