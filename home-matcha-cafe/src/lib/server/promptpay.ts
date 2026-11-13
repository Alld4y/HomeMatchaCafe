import QRCode from 'qrcode';
import generatePayload from 'promptpay-qr';
import fs from 'fs';
import path from 'path';

export interface PromptPayOptions {
    target?: string;
    amount?: number;
}

/**
 * อ่านค่าจากไฟล์ .env โดยตรง เพื่อให้การเปลี่ยนแปลงมีผลทันทีไม่ต้องรีสตาร์ทเซิร์ฟเวอร์
 */
function loadEnvVariables(): Record<string, string> {
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

export function getPromptPayConfig() {
    const envVars = loadEnvVariables();
    const testPriceRaw = process.env.FORCE_TEST_PRICE || envVars.FORCE_TEST_PRICE || '';
    const forceTestPrice = testPriceRaw && !isNaN(Number(testPriceRaw)) && Number(testPriceRaw) > 0 
        ? Number(testPriceRaw) 
        : 0;

    return {
        id: process.env.PROMPTPAY_ID || envVars.PROMPTPAY_ID || envVars.PUBLIC_PROMPTPAY_ID || '0966514809',
        name: process.env.PROMPTPAY_NAME || envVars.PROMPTPAY_NAME || envVars.PUBLIC_PROMPTPAY_NAME || 'ทิพย์สุดา มณฑา',
        forceTestPrice
    };
}

/**
 * สร้าง EMVCo Payload String สำหรับ PromptPay โดยใช้มาตรฐาน promptpay-qr
 */
export function generatePromptPayPayload(options: PromptPayOptions): string {
    const config = getPromptPayConfig();
    const target = options.target || config.id;
    const amount = options.amount !== undefined && options.amount > 0 ? options.amount : undefined;

    return generatePayload(target, amount !== undefined ? { amount } : {});
}

/**
 * สร้าง QR Code รูปภาพแบบ Data URL (PNG Base64) หรือ SVG
 */
export async function generatePromptPayQR(options: PromptPayOptions): Promise<{
    payload: string;
    qrDataUrl: string;
    qrSvg: string;
    target: string;
    accountName: string;
}> {
    const config = getPromptPayConfig();
    const target = options.target || config.id;
    const payload = generatePromptPayPayload({ ...options, target });

    const qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 400,
        color: {
            dark: '#1e2b17',
            light: '#ffffff'
        }
    });

    const qrSvg = await QRCode.toString(payload, {
        type: 'svg',
        margin: 2,
        color: {
            dark: '#1e2b17',
            light: '#ffffff'
        }
    });

    return {
        payload,
        qrDataUrl,
        qrSvg,
        target,
        accountName: config.name
    };
}
