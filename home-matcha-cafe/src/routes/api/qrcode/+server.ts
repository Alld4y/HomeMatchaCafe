import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePromptPayQR, getPromptPayConfig } from '$lib/server/promptpay';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const config = getPromptPayConfig();
        const inputPrice = Number(body.totalPrice) || 0;
        
        // ถ้าเปิด FORCE_TEST_PRICE ใน .env ให้ล็อกยอดเงินตามค่าทดสอบ
        const effectiveAmount = config.forceTestPrice > 0 ? config.forceTestPrice : inputPrice;
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
            isTestMode: config.forceTestPrice > 0,
            forceTestPrice: config.forceTestPrice,
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
        const inputAmount = Number(url.searchParams.get('amount')) || 0;
        const effectiveAmount = config.forceTestPrice > 0 ? config.forceTestPrice : inputAmount;
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
            isTestMode: config.forceTestPrice > 0,
            forceTestPrice: config.forceTestPrice,
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
