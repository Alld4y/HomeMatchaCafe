import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createOrder, getAllOrders, getOrdersByPhone, saveSlipFile, type OrderItem } from '$lib/server/db';
import { validateSlip } from '$lib/server/slipValidator';
import { getPromptPayConfig } from '$lib/server/promptpay';
import { redeemFreeCupPoints } from '$lib/server/members';
import { validateDeliverySlot } from '$lib/server/settings';

export const GET: RequestHandler = async ({ url }) => {
    const phone = url.searchParams.get('phone');
    if (phone) {
        const userOrders = await getOrdersByPhone(phone);
        return json(userOrders);
    }
    const allOrders = await getAllOrders();
    return json(allOrders);
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const contentType = request.headers.get('content-type') || '';
        let recipientName = '';
        let memberName = '';
        let phone = '';
        let address = '';
        let sellerMessage = '';
        let basket: OrderItem[] = [];
        let totalPrice = 0;
        let slipImageUrl = '';
        let detectedSlipRef = '';
        let detectedSlipAmount: number | undefined;
        let detectedSlipTimeText: string | undefined;
        let qrGeneratedAt = '';
        let deliveryDate = '';
        let deliveryRound = '';
        let deliveryRoundId = '';
        let requiresManualReview = false;
        let reviewReason = '';
        let useFreeCupReward = false;
        let discountAmount = 0;
        let customStatus: any = undefined;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            recipientName = (formData.get('recipientName') as string) || '';
            memberName = (formData.get('memberName') as string) || '';
            phone = (formData.get('phone') as string) || '';
            address = (formData.get('address') as string) || '';
            sellerMessage = (formData.get('sellerMessage') as string) || '';
            qrGeneratedAt = (formData.get('qrGeneratedAt') as string) || '';
            deliveryDate = (formData.get('deliveryDate') as string) || '';
            deliveryRound = (formData.get('deliveryRound') as string) || '';
            deliveryRoundId = (formData.get('deliveryRoundId') as string) || '';
            const isManualReviewRequest = formData.get('requestAdminReview') === 'true';
            useFreeCupReward = formData.get('useFreeCupReward') === 'true';
            discountAmount = Number(formData.get('discountAmount') || 0);

            const rawBasket = formData.get('basket');
            if (rawBasket && typeof rawBasket === 'string') {
                try {
                    basket = JSON.parse(rawBasket);
                } catch (e) {
                    console.error('Failed to parse basket JSON:', e);
                }
            }

            const rawTotal = formData.get('totalPrice');
            if (rawTotal !== null && rawTotal !== undefined && rawTotal !== '') {
                totalPrice = Number(rawTotal);
            } else if (Array.isArray(basket)) {
                totalPrice = Math.max(0, basket.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0) - discountAmount);
            }

            const promptpayConfig = getPromptPayConfig();
            const expectedAmount =
                totalPrice === 0 && useFreeCupReward
                    ? 0
                    : (promptpayConfig.forceTestPrice > 0 ? promptpayConfig.forceTestPrice : totalPrice);
            totalPrice = expectedAmount;

            const slipFile = formData.get('slipImage');

            if (expectedAmount > 0) {
                if (!slipFile || !(slipFile instanceof File) || slipFile.size === 0) {
                    return json({ success: false, message: 'กรุณาแนบรูปภาพสลิปการโอนเงินเพื่อยืนยันออเดอร์' }, { status: 400 });
                }

                const fileBuffer = Buffer.from(await slipFile.arrayBuffer());
                const slipValidation = await validateSlip(fileBuffer, expectedAmount, {
                    qrGeneratedAt,
                    isManualReviewRequest
                });

                // หากไม่ได้กดปุ่มส่งให้แอดมินตรวจเอง ให้บล็อกเมื่อสลิปไม่ผ่าน
                // แต่ถ้ากดปุ่ม "โอนเงินไปแล้ว แต่ยืนยันไม่ผ่าน" (isManualReviewRequest = true) ให้อนุญาตส่งให้แอดมินตรวจสอบได้ (ยกเว้นกรณีสลิปซ้ำ)
                const isDuplicateError = slipValidation.message?.includes('เคยถูกใช้งานในระบบแล้ว');

                if (!slipValidation.isValid && (!isManualReviewRequest || isDuplicateError)) {
                    return json({
                        success: false,
                        message: slipValidation.message,
                        canRequestAdminReview: true,
                        isExpiredQR: slipValidation.isExpiredQR || false,
                        slipAmount: slipValidation.amount,
                        slipTimeText: slipValidation.slipTimeText
                    }, { status: 400 });
                }

                detectedSlipRef = slipValidation.slipRef || '';
                detectedSlipAmount = slipValidation.amount;
                detectedSlipTimeText = slipValidation.slipTimeText;
                requiresManualReview = isManualReviewRequest || Boolean(slipValidation.requiresManualReview);
                reviewReason =
                    slipValidation.reviewReason ||
                    (isManualReviewRequest
                        ? `ลูกค้าแจ้งโอนเงินแล้วแต่ยืนยันสลิปไม่ผ่าน (${slipValidation.message || 'รอแอดมินตรวจสอบสลิป'})`
                        : '');
                slipImageUrl = await saveSlipFile(slipFile, phone.slice(-4) || 'order');
            }
        } else {
            const body = await request.json();
            recipientName = body.name || body.recipientName || '';
            memberName = body.memberName || '';
            phone = body.phone || '';
            address = body.address || '';
            sellerMessage = body.message || body.sellerMessage || '';
            deliveryDate = body.deliveryDate || '';
            deliveryRound = body.deliveryRound || '';
            deliveryRoundId = body.deliveryRoundId || '';
            basket = body.basket || [];
            totalPrice = Number(body.totalPrice) || 0;
            slipImageUrl = body.slipImage || '';
            useFreeCupReward = Boolean(body.useFreeCupReward);
            discountAmount = Number(body.discountAmount || 0);
            if (body.status) {
                customStatus = body.status;
            }
        }

        if (!recipientName || !phone || !address) {
            return json({ success: false, message: 'กรุณากรอกชื่อ เบอร์โทร และสถานที่จัดส่งให้ครบถ้วน' }, { status: 400 });
        }

        const validBasket = (basket || [])
            .filter(item => (item.quantity || 0) > 0)
            .map(item => ({
                id: item.id,
                thaiName: item.thaiName || item.name || item.id,
                englishName: item.englishName || item.id,
                name: item.thaiName || item.name || item.id,
                price: Number(item.price) || 0,
                basePrice: item.basePrice !== undefined ? Number(item.basePrice) : undefined,
                addonName: item.addonName || undefined,
                addonPrice: item.addonPrice !== undefined ? Number(item.addonPrice) : undefined,
                addonId: item.addonId || undefined,
                quantity: Number(item.quantity) || 1,
                sweetness: item.sweetness ?? 50,
                note: item.note || ''
            }));

        if (totalPrice === 0 && !useFreeCupReward && validBasket.length > 0) {
            totalPrice = validBasket.reduce((sum, it) => sum + (it.price * it.quantity), 0);
        }

        // ตรวจสอบความถูกต้องของวันและรอบจัดส่ง รวมถึงเวลาเตรียมชงล่วงหน้าสำหรับรอบรวม
        if (deliveryDate && deliveryRoundId) {
            const hasFermented = validBasket.some(item => 
                (item.name || '').includes('บ่ม') || (item.thaiName || '').includes('บ่ม') || item.id === 'cold-fermented-matcha-oat-latte'
            );
            const slotValidation = await validateDeliverySlot(deliveryDate, deliveryRoundId, hasFermented, deliveryRound);
            if (!slotValidation.isValid) {
                return json({ success: false, message: slotValidation.message || 'รอบเวลาจัดส่งที่เลือกไม่พร้อมให้บริการ' }, { status: 400 });
            }
        }

        // หากลูกค้าเลือกใช้สิทธิ์แลกฟรี 1 แก้ว ให้หักแต้มทันทีที่สั่งซื้อสำเร็จ
        let redeemedFreeCups = 0;
        if (useFreeCupReward && phone) {
            const redeemRes = await redeemFreeCupPoints(phone);
            if (!redeemRes.success) {
                return json({ success: false, message: redeemRes.message || 'ไม่สามารถใช้สิทธิ์แลกแก้วฟรีได้' }, { status: 400 });
            }
            redeemedFreeCups = 1;
        }

        const newOrder = await createOrder({
            name: recipientName,
            memberName: memberName || undefined,
            phone: phone,
            address: address,
            message: sellerMessage,
            basket: validBasket,
            totalPrice: totalPrice,
            slipImage: slipImageUrl,
            slipRef: detectedSlipRef,
            slipAmount: detectedSlipAmount,
            slipTimeText: detectedSlipTimeText,
            qrGeneratedAt: qrGeneratedAt || undefined,
            needsManualReview: requiresManualReview,
            reviewReason: reviewReason || undefined,
            deliveryDate: deliveryDate || undefined,
            deliveryRound: deliveryRound || undefined,
            deliveryRoundId: deliveryRoundId || undefined,
            redeemedFreeCups,
            discountAmount,
            status: customStatus || (
                (totalPrice === 0 && redeemedFreeCups > 0)
                    ? 'paid'
                    : (requiresManualReview ? 'pending' : 'paid')
            )
        });

        return json({
            success: true,
            requiresManualReview,
            message: requiresManualReview
                ? 'ส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเองเรียบร้อยแล้ว'
                : 'บันทึกคำสั่งซื้อสำเร็จและสลิปผ่านการตรวจสอบแล้ว',
            order: newOrder,
            order_id: newOrder.order_id,
            slipRef: detectedSlipRef
        });
    } catch (err: any) {
        console.error('Error creating order:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาดในการบันทึกคำสั่งซื้อ' }, { status: 500 });
    }
};
