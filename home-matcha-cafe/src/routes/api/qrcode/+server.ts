import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePromptPayQR, getPromptPayConfig } from '$lib/server/promptpay';
import { getStoreSettings, parseAdminPhones } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const config = getPromptPayConfig();
        const settings = await getStoreSettings();
        const inputPrice = Number(body.totalPrice) || 0;
        const cleanPhone = String(body.phone || '').replace(/[^0-9]/g, '');
        const adminPhones = parseAdminPhones(settings.adminPhone || settings.lineOa?.adminPhone);
        const isAdminUser = body.isAdmin === true || (cleanPhone && adminPhones.includes(cleanPhone));

        // ตรวจสอบราคาทดสอบ (ทั้งจาก .env และจากการตั้งค่า Admin Test Price ในระบบ)
        let effectiveAmount = inputPrice;
        let isTestMode = false;

        if (config.forceTestPrice > 0) {
            effectiveAmount = config.forceTestPrice;
            isTestMode = true;
        } else if (isAdminUser && (settings.adminTestPriceEnabled || body.useAdminTestPrice)) {
            effectiveAmount = typeof settings.adminTestPrice === 'number' && settings.adminTestPrice > 0
                ? settings.adminTestPrice
                : 1;
            isTestMode = true;
        }

        const targetPromptPay = body.promptpayId || config.id;

        const { payload, qrDataUrl, qrSvg, accountName } = await generatePromptPayQR({
            target: targetPromptPay,
            amount: effectiveAmount
        });

        const now = Date.now();
        const qrGeneratedAt = new Date(now).toISOString();
        const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

        return json({
            success: true,
            promptpayId: targetPromptPay,
            accountName: accountName,
            amount: effectiveAmount,
            isTestMode,
            forceTestPrice: isTestMode ? effectiveAmount : 0,
            qrImage: qrDataUrl,
            qrDataUrl: qrDataUrl,
            qrSvg: qrSvg,
            payload: payload,
            qrGeneratedAt,
            expiresAt
        });
    } catch (err: any) {
        console.error('Error generating QR code:', err);
        return json({ success: false, error: err.message || 'Failed to generate QR code' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ url }) => {
    try {
        const config = getPromptPayConfig();
        const settings = await getStoreSettings();
        const inputAmount = Number(url.searchParams.get('amount')) || 0;
        const phone = String(url.searchParams.get('phone') || '').replace(/[^0-9]/g, '');
        const adminPhones = parseAdminPhones(settings.adminPhone || settings.lineOa?.adminPhone);
        const isAdminUser = url.searchParams.get('isAdmin') === 'true' || (phone && adminPhones.includes(phone));

        let effectiveAmount = inputAmount;
        let isTestMode = false;

        if (config.forceTestPrice > 0) {
            effectiveAmount = config.forceTestPrice;
            isTestMode = true;
        } else if (isAdminUser && (settings.adminTestPriceEnabled || url.searchParams.get('useAdminTestPrice') === 'true')) {
            effectiveAmount = typeof settings.adminTestPrice === 'number' && settings.adminTestPrice > 0
                ? settings.adminTestPrice
                : 1;
            isTestMode = true;
        }

        const target = url.searchParams.get('target') || config.id;

        const { payload, qrDataUrl, qrSvg, accountName } = await generatePromptPayQR({
            target: target,
            amount: effectiveAmount
        });

        const now = Date.now();
        const qrGeneratedAt = new Date(now).toISOString();
        const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

        return json({
            success: true,
            promptpayId: target,
            accountName: accountName,
            amount: effectiveAmount,
            isTestMode,
            forceTestPrice: isTestMode ? effectiveAmount : 0,
            qrImage: qrDataUrl,
            qrDataUrl: qrDataUrl,
            qrSvg: qrSvg,
            payload: payload,
            qrGeneratedAt,
            expiresAt
        });
    } catch (err: any) {
        console.error('Error generating QR code in GET:', err);
        return json({ success: false, error: err.message || 'Failed to generate QR code' }, { status: 500 });
    }
};
