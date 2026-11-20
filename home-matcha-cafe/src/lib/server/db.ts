import fs from 'fs';
import path from 'path';
import { pool, ensurePgSchema } from './pgPool';
import { awardStampsForCompletedOrder } from './members';
import { sendCustomerNotification, notifyAdminLine } from './notifications';

export interface OrderItem {
    id: string;
    thaiName?: string;
    englishName?: string;
    name?: string;
    price: number;
    basePrice?: number;
    addonName?: string;
    addonPrice?: number;
    addonId?: string;
    quantity: number;
    sweetness?: number | string;
    note?: string;
}

export interface Order {
    id: string;
    order_id: string;
    name: string;
    phone: string;
    address: string;
    message?: string;
    basket: OrderItem[];
    totalPrice: number;
    slipImage?: string;
    slipRef?: string;
    slipAmount?: number;
    slipTimeText?: string;
    qrGeneratedAt?: string;
    needsManualReview?: boolean;
    reviewReason?: string;
    deliveryDate?: string;
    deliveryRound?: string;
    deliveryRoundId?: string;
    pointsAwarded?: boolean;
    redeemedFreeCups?: number;
    discountAmount?: number;
    status: 'pending' | 'paid' | 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled';
    createdAt: string;
    updatedAt: string;
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'static', 'uploads', 'slips');

const MENU_FALLBACK_MAP: Record<string, { thaiName: string; englishName: string; price: number }> = {
    'pure-matcha': { thaiName: 'เพียวมัทฉะ', englishName: 'PURE MATCHA', price: 50 },
    'matcha-latte': { thaiName: 'มัทฉะลาเต้', englishName: 'MATCHA LATTE', price: 55 },
    'matcha-coconut': { thaiName: 'มัทฉะมะพร้าว', englishName: 'MATCHA COCONUT', price: 60 },
    'matcha-oat-latte': { thaiName: 'มัทฉะลาเต้นมโอ๊ต', englishName: 'MATCHA OAT LATTE', price: 65 },
    'cold-fermented-matcha-oat-latte': { thaiName: 'มัทฉะลาเต้นมโอ๊ตบ่ม', englishName: 'COLD FERMENTED MATCHA OAT LATTE', price: 70 }
};

function ensureUploadsDir() {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
}

export function generateOrderId(): string {
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `HMC-${dateStr}-${randomSuffix}`;
}

function mapPgRowToOrder(row: any): Order {
    let rawBasket: any[] = [];
    if (typeof row.basket === 'string') {
        try {
            rawBasket = JSON.parse(row.basket || '[]');
        } catch {
            rawBasket = [];
        }
    } else if (Array.isArray(row.basket)) {
        rawBasket = row.basket;
    }

    const basket: OrderItem[] = rawBasket
        .filter(item => Number(item?.quantity || 0) > 0)
        .map(item => {
            const fallback = MENU_FALLBACK_MAP[item.id] || {
                thaiName: item.thaiName || item.name || item.id || 'เมนูมัทฉะ',
                englishName: item.englishName || item.id || 'MATCHA',
                price: Number(item.price) || 0
            };
            const itemPrice = Number(item.price) > 0 ? Number(item.price) : fallback.price;
            let addonName = item.addonName || '';
            let addonPrice = item.addonPrice !== undefined && item.addonPrice !== null ? Number(item.addonPrice) : undefined;
            const basePrice = item.basePrice !== undefined && item.basePrice !== null ? Number(item.basePrice) : fallback.price;

            // 💡 Fallback inference: หากเป็นออเดอร์เก่าที่ไม่ได้บันทึก addonName ไว้
            // แต่ราคาต่อแก้วสูงกว่าราคาฐาน (เช่น มัทฉะลาเต้ 65 บาท ขณะที่ราคาปกติ 55 บาท)
            if (!addonName && itemPrice > basePrice) {
                const diff = itemPrice - basePrice;
                addonName = 'เพิ่มช็อตมัทฉะ';
                addonPrice = diff;
            }

            return {
                id: item.id,
                thaiName: item.thaiName || item.name || fallback.thaiName,
                englishName: item.englishName || fallback.englishName,
                name: item.thaiName || item.name || fallback.thaiName,
                price: itemPrice,
                basePrice,
                addonName: addonName || undefined,
                addonPrice,
                addonId: item.addonId || undefined,
                quantity: Number(item.quantity) || 1,
                sweetness: item.sweetness ?? 50,
                note: item.note || ''
            };
        });

    const calculatedTotal = basket.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const dbTotal = row.total_price !== null && row.total_price !== undefined ? Number(row.total_price) : -1;
    const totalPrice = dbTotal >= 0 && (dbTotal > 0 || Number(row.redeemed_free_cups || 0) > 0) ? dbTotal : calculatedTotal;

    const rawStatus = String(row.status || 'paid');
    const isLegacyPendingReview = rawStatus === 'pending_review';
    const validStatuses: Order['status'][] = ['pending', 'paid', 'brewing', 'ready_to_ship', 'delivering', 'completed', 'cancelled'];
    const normalizedStatus: Order['status'] = isLegacyPendingReview
        ? 'pending'
        : (validStatuses.includes(rawStatus as Order['status']) ? (rawStatus as Order['status']) : 'paid');

    const displayId = row.order_code || `HMC-${String(row.order_id).padStart(4, '0')}`;

    let slipImage = row.slip_image || '';
    if (slipImage && !slipImage.startsWith('/') && !slipImage.startsWith('http')) {
        slipImage = `/uploads/slips/${slipImage}`;
    }

    const createdAtIso = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
    const updatedAtIso = row.updated_at ? new Date(row.updated_at).toISOString() : createdAtIso;

    return {
        id: String(row.order_id),
        order_id: displayId,
        name: row.name || '',
        phone: row.phone || '',
        address: row.address || '',
        message: row.message || '',
        basket,
        totalPrice,
        slipImage,
        slipRef: row.slip_ref || '',
        slipAmount: row.slip_amount !== null && row.slip_amount !== undefined ? Number(row.slip_amount) : undefined,
        slipTimeText: row.slip_time_text || undefined,
        qrGeneratedAt: row.qr_generated_at || undefined,
        needsManualReview: Boolean(row.needs_manual_review) || isLegacyPendingReview,
        reviewReason: row.review_reason || (isLegacyPendingReview ? 'รอเจ้าหน้าที่ตรวจสอบยอดเงินจากสลิป' : ''),
        deliveryDate: row.delivery_date || undefined,
        deliveryRound: row.delivery_round || undefined,
        deliveryRoundId: row.delivery_round_id || undefined,
        pointsAwarded: Boolean(row.points_awarded),
        redeemedFreeCups: Number(row.redeemed_free_cups || 0),
        discountAmount: Number(row.discount_amount || 0),
        status: normalizedStatus,
        createdAt: createdAtIso,
        updatedAt: updatedAtIso
    };
}

export async function getAllOrders(): Promise<Order[]> {
    await ensurePgSchema();
    const res = await pool.query(`
        SELECT *
        FROM public."order"
        ORDER BY order_id DESC
    `);
    return res.rows.map(mapPgRowToOrder);
}

export async function getOrdersByPhone(phone: string): Promise<Order[]> {
    await ensurePgSchema();
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (!cleaned) return [];

    const res = await pool.query(
        `
        SELECT *
        FROM public."order"
        WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE $1
        ORDER BY order_id DESC
        `,
        [`%${cleaned}%`]
    );
    return res.rows.map(mapPgRowToOrder);
}

export async function getOrderById(id: string): Promise<Order | undefined> {
    await ensurePgSchema();
    const res = await pool.query(
        `
        SELECT *
        FROM public."order"
        WHERE order_id::text = $1 OR order_code = $1
        LIMIT 1
        `,
        [String(id)]
    );
    if (res.rows.length === 0) return undefined;
    return mapPgRowToOrder(res.rows[0]);
}

export async function isSlipRefUsed(ref: string): Promise<boolean> {
    if (!ref) return false;
    await ensurePgSchema();
    const res = await pool.query(
        `
        SELECT order_id
        FROM public."order"
        WHERE slip_ref = $1 AND COALESCE(status, '') <> 'cancelled'
        LIMIT 1
        `,
        [ref]
    );
    return res.rows.length > 0;
}

export async function createOrder(data: {
    name: string;
    phone: string;
    address: string;
    message?: string;
    basket: OrderItem[];
    totalPrice: number;
    slipImage?: string;
    slipRef?: string;
    slipAmount?: number;
    slipTimeText?: string;
    qrGeneratedAt?: string;
    needsManualReview?: boolean;
    reviewReason?: string;
    deliveryDate?: string;
    deliveryRound?: string;
    deliveryRoundId?: string;
    redeemedFreeCups?: number;
    discountAmount?: number;
    status?: Order['status'];
}): Promise<Order> {
    await ensurePgSchema();
    const orderCode = generateOrderId();
    const status: Order['status'] =
        data.status || (data.needsManualReview ? 'pending' : (data.slipImage || (data.redeemedFreeCups && data.totalPrice === 0) ? 'paid' : 'pending'));

    const res = await pool.query(
        `
        INSERT INTO public."order" (
            order_code,
            name,
            phone,
            address,
            message,
            slip_image,
            basket,
            slip_ref,
            status,
            total_price,
            slip_amount,
            slip_time_text,
            qr_generated_at,
            needs_manual_review,
            review_reason,
            delivery_date,
            delivery_round,
            delivery_round_id,
            redeemed_free_cups,
            discount_amount,
            points_awarded,
            created_at,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, FALSE,
            NOW(), NOW()
        )
        RETURNING *
        `,
        [
            orderCode,
            data.name,
            data.phone,
            data.address,
            data.message || '',
            data.slipImage || '',
            JSON.stringify(data.basket || []),
            data.slipRef || null,
            status,
            data.totalPrice || 0,
            data.slipAmount ?? null,
            data.slipTimeText || null,
            data.qrGeneratedAt || null,
            Boolean(data.needsManualReview),
            data.reviewReason || null,
            data.deliveryDate || null,
            data.deliveryRound || null,
            data.deliveryRoundId || null,
            Number(data.redeemedFreeCups || 0),
            Number(data.discountAmount || 0)
        ]
    );

    const mapped = mapPgRowToOrder(res.rows[0]);
    const finalOrder = await processCompletedOrderLoyalty(mapped, false);

    // แจ้งเตือนลูกค้าและแอดมินเมื่อมีออเดอร์ใหม่
    const itemsSummary = Array.isArray(finalOrder.basket)
        ? finalOrder.basket.map(i => `${i.thaiName || i.name || 'เครื่องดื่ม'} x${i.quantity}`).join(', ')
        : undefined;

    sendCustomerNotification({
        phone: finalOrder.phone,
        orderId: finalOrder.id,
        orderCode: finalOrder.order_id,
        title: '🍵 ได้รับคำสั่งซื้อของคุณแล้ว',
        body: `ทางร้านได้รับออเดอร์ ${finalOrder.order_id} เรียบร้อยแล้วค่ะ กำลังเตรียมการสำหรับรอบจัดส่ง ${finalOrder.deliveryRound || ''}`,
        url: `/success?phone=${encodeURIComponent(finalOrder.phone)}`,
        eventType: 'order_created',
        itemsSummary,
        totalPrice: finalOrder.totalPrice
    }).catch(e => console.warn('Customer order_created notif error:', e));

    notifyAdminLine({
        eventType: 'new_order',
        orderCode: finalOrder.order_id,
        customerName: finalOrder.name,
        phone: finalOrder.phone,
        totalPrice: finalOrder.totalPrice,
        itemsSummary,
        deliveryDate: finalOrder.deliveryDate,
        deliveryRound: finalOrder.deliveryRound
    }).catch(e => console.warn('Admin new_order notif error:', e));

    return finalOrder;
}

async function processCompletedOrderLoyalty(order: Order, wasAlreadyAwarded: boolean): Promise<Order> {
    if (order.status !== 'completed' || wasAlreadyAwarded) {
        return order;
    }

    const totalCups = (order.basket || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const earnedCups = Math.max(0, totalCups - Number(order.redeemedFreeCups || 0));

    if (earnedCups > 0 && order.phone) {
        const member = await awardStampsForCompletedOrder(order.phone, earnedCups);
        if (member) {
            await pool.query(
                `
                UPDATE public."order"
                SET points_awarded = TRUE
                WHERE order_id::text = $1 OR order_code = $1
                `,
                [String(order.id)]
            );
            order.pointsAwarded = true;
        }
    }
    return order;
}

function triggerOrderNotification(order: Order, prevStatus: string) {
    if (!order.phone) return;

    const itemsSummary = Array.isArray(order.basket)
        ? order.basket.map(i => `${i.thaiName || i.name || 'เครื่องดื่ม'} x${i.quantity}`).join(', ')
        : undefined;

    // 1. อนุมัติสลิป / รับยอด
    if (order.status === 'paid' && (prevStatus === 'pending' || order.needsManualReview)) {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '🍵 ยืนยันรับยอดออเดอร์แล้ว',
            body: `แอดมินตรวจสอบสลิปและรับยอดออเดอร์ ${order.order_id} เรียบร้อยแล้วค่ะ กำลังเตรียมคิวชงให้นะคะ`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'slip_approved',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }

    // 2. กำลังชง
    if (order.status === 'brewing' && prevStatus !== 'brewing') {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '🍵 กำลังชงเครื่องดื่มของคุณ',
            body: `บาริสต้ากำลังพิถีพิถันชงเครื่องดื่มสำหรับออเดอร์ ${order.order_id} ให้อย่างตั้งใจค่ะ`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'brewing',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }

    // 3. ชงเสร็จแล้ว รอจัดส่ง
    if (order.status === 'ready_to_ship' && prevStatus !== 'ready_to_ship') {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '📦 เครื่องดื่มชงเสร็จแล้ว',
            body: `ออเดอร์ ${order.order_id} ชงเสร็จเรียบร้อยและแพ็กพร้อมส่งตามรอบเวลา ${order.deliveryRound || ''} ค่ะ`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'ready_to_ship',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }

    // 4. กำลังนำส่ง
    if (order.status === 'delivering' && prevStatus !== 'delivering') {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '🛵 เครื่องดื่มของคุณกำลังนำส่ง',
            body: `ออเดอร์ ${order.order_id} กำลังนำส่งไปที่ ${order.address} แล้วค่ะ เตรียมรับความสดชื่นได้เลย!`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'delivering',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }

    // 5. จัดส่งสำเร็จแล้ว
    if (order.status === 'completed' && prevStatus !== 'completed') {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '✅ จัดส่งสำเร็จเรียบร้อยแล้ว',
            body: `ออเดอร์ ${order.order_id} จัดส่งถึง ${order.address} เรียบร้อยแล้วค่ะ ขอบคุณที่อุดหนุน Home Matcha Cafe นะคะ 🍵`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'completed',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }

    // 6. ยกเลิกออเดอร์
    if (order.status === 'cancelled' && prevStatus !== 'cancelled') {
        sendCustomerNotification({
            phone: order.phone,
            orderId: order.id,
            orderCode: order.order_id,
            title: '❌ ออเดอร์ถูกยกเลิก',
            body: `ออเดอร์ ${order.order_id} ถูกยกเลิก หากมีข้อสงสัยหรือต้องการความช่วยเหลือ สามารถสอบถามทางร้านได้เลยนะคะ`,
            url: `/success?phone=${encodeURIComponent(order.phone)}`,
            eventType: 'cancelled',
            itemsSummary,
            totalPrice: order.totalPrice
        }).catch((e) => console.warn('Notification error:', e));
    }
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order | null> {
    await ensurePgSchema();
    const prevRes = await pool.query(
        'SELECT status, points_awarded FROM public."order" WHERE order_id::text = $1 OR order_code = $1 LIMIT 1',
        [String(id)]
    );
    if (prevRes.rows.length === 0) return null;
    const prevStatus = String(prevRes.rows[0].status || '');
    const wasAlreadyAwarded = Boolean(prevRes.rows[0].points_awarded);

    // ป้องกันการเปลี่ยนออเดอร์ที่ถูกยกเลิกไปแล้วให้เป็นจัดส่งสำเร็จ
    if (prevStatus === 'cancelled' && status === 'completed') {
        return null;
    }

    const res = await pool.query(
        `
        UPDATE public."order"
        SET status = $2,
            updated_at = NOW()
        WHERE order_id::text = $1 OR order_code = $1
        RETURNING *
        `,
        [String(id), status]
    );

    if (res.rows.length === 0) return null;
    const mapped = mapPgRowToOrder(res.rows[0]);
    const finalOrder = await processCompletedOrderLoyalty(mapped, wasAlreadyAwarded);
    triggerOrderNotification(finalOrder, prevStatus);
    return finalOrder;
}

export async function updateBulkOrderStatus(ids: string[], status: Order['status']): Promise<Order[]> {
    if (!ids || ids.length === 0) return [];
    await ensurePgSchema();
    const stringIds = ids.map(String);

    const prevRes = await pool.query(
        `
        SELECT order_id, status, points_awarded
        FROM public."order"
        WHERE (order_id::text = ANY($1::text[]) OR order_code = ANY($1::text[]))
          AND COALESCE(status, '') <> 'cancelled'
        `,
        [stringIds]
    );
    const awardedMap = new Map<string, boolean>();
    const prevStatusMap = new Map<string, string>();
    for (const r of prevRes.rows) {
        awardedMap.set(String(r.order_id), Boolean(r.points_awarded));
        prevStatusMap.set(String(r.order_id), String(r.status || ''));
    }

    const res = await pool.query(
        `
        UPDATE public."order"
        SET status = $2,
            updated_at = NOW()
        WHERE (order_id::text = ANY($1::text[]) OR order_code = ANY($1::text[]))
          AND COALESCE(status, '') <> 'cancelled'
        RETURNING *
        `,
        [stringIds, status]
    );

    const results: Order[] = [];
    for (const row of res.rows) {
        const mapped = mapPgRowToOrder(row);
        const wasAwarded = awardedMap.get(String(row.order_id)) || false;
        const prevStatus = prevStatusMap.get(String(row.order_id)) || '';
        const processed = await processCompletedOrderLoyalty(mapped, wasAwarded);
        triggerOrderNotification(processed, prevStatus);
        results.push(processed);
    }

    return results;
}

export async function saveSlipFile(file: File, prefix = 'slip'): Promise<string> {
    ensureUploadsDir();
    const ext = path.extname(file.name) || '.jpg';
    const filename = `${prefix}-${Date.now()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/slips/${filename}`;
}
