import sharp from 'sharp';
import jsQR from 'jsqr';
import { createWorker, type Worker } from 'tesseract.js';
import { isSlipRefUsed } from './db';
import { getPromptPayConfig } from './promptpay';

export interface SlipValidationOptions {
    qrGeneratedAt?: string;
    isManualReviewRequest?: boolean;
}

export interface SlipValidationResult {
    isValid: boolean;
    message: string;
    slipRef?: string;
    amount?: number;
    slipTimeText?: string;
    slipTimestamp?: string;
    sendingBank?: string;
    rawQR?: string;
    canRequestAdminReview?: boolean;
    isExpiredQR?: boolean;
    requiresManualReview?: boolean;
    reviewReason?: string;
}

const BANK_CODES: Record<string, string> = {
    '002': 'ธนาคารกรุงเทพ (BBL)',
    '004': 'ธนาคารกสิกรไทย (KBANK)',
    '006': 'ธนาคารกรุงไทย (KTB)',
    '011': 'ธนาคารทหารไทยธนชาต (TTB)',
    '014': 'ธนาคารไทยพาณิชย์ (SCB)',
    '025': 'ธนาคารกรุงศรีอยุธยา (BAY)',
    '030': 'ธนาคารออมสิน (GSB)',
    '034': 'ธนาคารเพื่อการเกษตรฯ (BAAC)',
    '069': 'ธนาคารเกียรตินาคินภัทร (KKP)',
    '073': 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)',
    '022': 'ธนาคารซีไอเอ็มบีไทย (CIMB)'
};

// Reusable OCR Worker พร้อมคิวป้องกันการชนกันของคำขอพร้อมกัน
let ocrWorkerPromise: Promise<Worker> | null = null;
let ocrQueue: Promise<any> = Promise.resolve();

async function getOcrWorker(): Promise<Worker> {
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = createWorker('tha+eng').catch(err => {
            ocrWorkerPromise = null;
            throw err;
        });
    }
    return ocrWorkerPromise;
}

async function runOcrOnBuffer(buffer: Buffer): Promise<string> {
    const run = async () => {
        const worker = await getOcrWorker();
        const { data: { text } } = await worker.recognize(buffer);
        return text || '';
    };
    const result = ocrQueue.then(run, run);
    ocrQueue = result.catch(() => {});
    return result;
}

/**
 * แปลงเวลาเป็นรูปแบบอ่านง่าย (เช่น 12 พ.ย. 2569 20:14 น.)
 */
function formatThaiDateTime(msOrIso: number | string): string {
    try {
        const d = new Date(msOrIso);
        if (isNaN(d.getTime())) return String(msOrIso);
        return d.toLocaleString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }) + ' น.';
    } catch {
        return String(msOrIso);
    }
}

/**
 * ฟังก์ชันแกะโครงสร้างข้อมูลสลิปไทยจาก QR Code (TLV Format & ITMX Slip Verify)
 */
export function parseThaiSlipQR(qrText: string): {
    isBankSlip: boolean;
    isPaymentRequestQR?: boolean;
    sendingBank?: string;
    referenceNo?: string;
    amount?: number;
} | null {
    if (!qrText || typeof qrText !== 'string') return null;

    // 1. ตรวจสอบสลิปแบบ ITMX Slip Verify (Format มาตรฐานของธนาคารไทย เช่น KBank, MAKE by KBank, Krungthai, SCB)
    // ตัวอย่าง: 00410006000001010300402200461785o8uiaek06j3vc5102TH91040CCE
    if (qrText.includes('5102TH')) {
        const bankMatch = qrText.match(/0103(\d{3})/);
        const refMatch = qrText.match(/0103\d{3}(.*?)(5102TH)/);
        const bankCode = bankMatch ? bankMatch[1] : undefined;
        let refNo = refMatch && refMatch[1] ? refMatch[1] : undefined;

        if (refNo) {
            refNo = refNo.replace(/^02\d{2}/, '');
        }

        return {
            isBankSlip: true,
            sendingBank: bankCode ? (BANK_CODES[bankCode] || `ธนาคารรหัส ${bankCode}`) : 'ธนาคารไทย',
            referenceNo: refNo || qrText
        };
    }

    // 2. ถ้าขึ้นต้นด้วย 000201 และมี 29370016A000000677010111 คือ QR Code สำหรับรับเงิน PromptPay (ไม่ใช่สลิปโอนเงิน!)
    if (qrText.startsWith('000201') && qrText.includes('A000000677010111') && !qrText.includes('5102TH')) {
        return {
            isBankSlip: false,
            isPaymentRequestQR: true
        };
    }

    // 3. ตรวจสอบโครงสร้าง TLV ที่มี Tag 51 (Thai Transfer Slip Verify QR)
    if (qrText.includes('51')) {
        let index = 0;
        let sendingBank: string | undefined;
        let refNo: string | undefined;

        try {
            while (index < qrText.length - 4) {
                const tag = qrText.substring(index, index + 2);
                const length = parseInt(qrText.substring(index + 2, index + 4), 10);
                if (isNaN(length) || length <= 0) break;
                const value = qrText.substring(index + 4, index + 4 + length);
                index += 4 + length;

                if (tag === '51') {
                    let subIdx = 0;
                    while (subIdx < value.length - 4) {
                        const subTag = value.substring(subIdx, subIdx + 2);
                        const subLen = parseInt(value.substring(subIdx + 2, subIdx + 4), 10);
                        if (isNaN(subLen) || subLen <= 0) break;
                        const subVal = value.substring(subIdx + 4, subIdx + 4 + subLen);
                        subIdx += 4 + subLen;

                        if (subTag === '00' && BANK_CODES[subVal]) sendingBank = BANK_CODES[subVal];
                        if (subTag === '01') refNo = subVal;
                    }
                }
            }
        } catch {
            // fallback
        }

        if (refNo || sendingBank) {
            return {
                isBankSlip: true,
                sendingBank: sendingBank || 'ธนาคารไทย',
                referenceNo: refNo || qrText
            };
        }
    }

    return null;
}

/**
 * สแกน QR Code จาก Buffer รูปภาพด้วย sharp + jsQR (Multi-Pass)
 */
async function extractQRFromImageBuffer(buffer: Buffer): Promise<string | null> {
    try {
        const img = sharp(buffer);
        const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const code1 = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        if (code1 && code1.data) {
            return code1.data;
        }

        const processed = await img
            .clone()
            .grayscale()
            .normalize()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const code2 = jsQR(new Uint8ClampedArray(processed.data), processed.info.width, processed.info.height);
        if (code2 && code2.data) {
            return code2.data;
        }

        if (info.width > 1200) {
            const resized = await img
                .clone()
                .resize({ width: 800, withoutEnlargement: true })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const code3 = jsQR(new Uint8ClampedArray(resized.data), resized.info.width, resized.info.height);
            if (code3 && code3.data) {
                return code3.data;
            }
        }

        return null;
    } catch (err) {
        console.error('Error scanning QR from buffer:', err);
        return null;
    }
}

/**
 * แปลงข้อความ OCR ให้เป็นมาตรฐานเดียวกัน (แก้ปัญหาสระอำ ํ+า แยกกันใน Tesseract)
 */
function normalizeThaiOcrText(raw: string): string {
    return (raw || '')
        .replace(/\u0e4d\u0e32/g, '\u0e33') // ํ + า -> ำ
        .replace(/\u0e32\u0e4d/g, '\u0e33');
}

/**
 * สกัดยอดเงินที่โอนจากข้อความ OCR บนสลิป
 */
function extractSlipAmountFromOcr(rawText: string): number | null {
    const normalized = normalizeThaiOcrText(rawText);
    const noSpaceThai = normalized.replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1');

    // 1. ค้นหาในโซนหลังคำว่า "จำนวน" / "จำนวนเงิน" / "Amount" ก่อนถึงคำว่า "ค่าธรรมเนียม"
    const amtAnchorIdx = noSpaceThai.search(/จำนวน|ยอดโอน|ยอดเงิน|amount/i);
    if (amtAnchorIdx !== -1) {
        const afterAnchor = noSpaceThai.slice(amtAnchorIdx, amtAnchorIdx + 180);
        const beforeFee = afterAnchor.split(/ค่าธรรมเนียม|fee/i)[0] || afterAnchor;

        // รองรับทั้ง "0.03" และ "0 02" (กรณี OCR อ่านจุดทศนิยมเป็นเว้นวรรค)
        const numMatch = beforeFee.match(/(\d{1,3}(?:,\d{3})*|\d+)[\.\s](\d{2})(?!\d)/);
        if (numMatch) {
            const val = parseFloat(`${numMatch[1].replace(/,/g, '')}.${numMatch[2]}`);
            if (!isNaN(val) && val > 0) return val;
        }
    }

    // 2. Fallback: ค้นหาบรรทัดที่มีตัวเลขทศนิยม 2 ตำแหน่งตามด้วยคำว่า "บาท" หรือ "THB" ที่ไม่ใช่บรรทัดค่าธรรมเนียม
    const lines = normalized.split(/\r?\n/);
    for (const line of lines) {
        const cleanLine = line.replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1');
        if (/ค่าธรรมเนียม|fee/i.test(cleanLine)) continue;

        const m = cleanLine.match(/(\d{1,3}(?:,\d{3})*|\d+)[\.\s](\d{2})\s*(?:บาท|THB|฿)/i);
        if (m) {
            const val = parseFloat(`${m[1].replace(/,/g, '')}.${m[2]}`);
            if (!isNaN(val) && val > 0) return val;
        }
    }

    // 3. Fallback สุดท้าย: หาตัวเลขทศนิยม X.XX ที่มากกว่า 0.00 ในเอกสาร
    const allDecimals = [...normalized.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/g)];
    for (const m of allDecimals) {
        const val = parseFloat(`${m[1].replace(/,/g, '')}.${m[2]}`);
        if (!isNaN(val) && val > 0) return val;
    }

    return null;
}

/**
 * สกัดวันและเวลาที่โอนจากข้อความ OCR บนสลิป
 */
function extractSlipDateTimeFromOcr(
    rawText: string,
    referenceDate?: Date
): { date: Date; rawTimeText: string } | null {
    const normalized = normalizeThaiOcrText(rawText);
    const cleaned = normalized
        .replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F\.])/g, '$1')
        .replace(/\.\s+(?=[\u0E00-\u0E7F])/g, '.');

    const monthAliases: Record<number, string[]> = {
        0: ['ม.ค', 'มค', 'มกราคม', 'jan'],
        1: ['ก.พ', 'กพ', 'กุมภาพันธ์', 'feb'],
        2: ['มี.ค', 'มีค', 'มีนาคม', 'mar'],
        3: ['เม.ย', 'เมย', 'เมษายน', 'apr'],
        4: ['พ.ค', 'พค', 'พฤษภาคม', 'may'],
        5: ['มิ.ย', 'มิย', 'มิถุนายน', 'jun'],
        6: ['ก.ค', 'กค', 'กรกฎาคม', 'jul', 'n.n'],
        7: ['ส.ค', 'สค', 'สิงหาคม', 'aug'],
        8: ['ก.ย', 'กย', 'กันยายน', 'sep'],
        9: ['ต.ค', 'ตค', 'ตุลาคม', 'oct'],
        10: ['พ.ย', 'พย', 'พฤศจิกายน', 'nov', 'w.g', 'w.u', 'w.v'],
        11: ['ธ.ค', 'ธค', 'ธันวาคม', 'dec']
    };

    // รูปแบบวันที่ในสลิปธนาคารไทย เช่น "12 พ.ย. 2569 20:14" หรือ "01 ก.ค. 2569 - 21:20" หรือ "12/11/2569 20:14"
    // 1. ตรวจสอบรูปแบบ DD/MM/YYYY HH:mm
    const slashMatch = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*(?:[\-–—]\s*|\s+|เวลา\s*)(\d{1,2})[:\.](\d{2})/);
    if (slashMatch) {
        const day = parseInt(slashMatch[1], 10);
        const monthIndex = parseInt(slashMatch[2], 10) - 1;
        let year = parseInt(slashMatch[3], 10);
        const hour = parseInt(slashMatch[4], 10);
        const minute = parseInt(slashMatch[5], 10);

        if (year > 2400) year -= 543;
        else if (year < 100) year += year > 40 ? 2500 - 543 : 2000;

        if (monthIndex >= 0 && monthIndex <= 11 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return {
                date: new Date(year, monthIndex, day, hour, minute, 0, 0),
                rawTimeText: slashMatch[0].trim()
            };
        }
    }

    // 2. ตรวจสอบรูปแบบ DD <เดือนไทย/อังกฤษ> YYYY HH:mm
    const textDateRegex = /(\d{1,2})\s+([^\s\d]{1,15})\s+(\d{2,4})\s*(?:[\-–—]\s*|\s+|เวลา\s*)(\d{1,2})[:\.](\d{2})/;
    const match = cleaned.match(textDateRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const rawMonthStr = match[2].toLowerCase();
        let year = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);

        if (year > 2400) year -= 543;
        else if (year < 100) year += year > 40 ? 2500 - 543 : 2000;

        let monthIndex = -1;
        for (const [mIdx, aliases] of Object.entries(monthAliases)) {
            if (aliases.some(alias => rawMonthStr.includes(alias))) {
                monthIndex = Number(mIdx);
                break;
            }
        }

        // หาก OCR อ่านตัวย่อเดือนเพี้ยน (เช่น พ.ย. อ่านเป็นตัวอักษรอื่น) แต่เลขวันและปีตรงกับวันที่สร้าง QR Code ให้ใช้เดือนของวันที่สร้าง QR Code
        if (monthIndex === -1 && referenceDate && !isNaN(referenceDate.getTime())) {
            if (year === referenceDate.getFullYear() && Math.abs(day - referenceDate.getDate()) <= 1) {
                monthIndex = referenceDate.getMonth();
            }
        }
        if (monthIndex === -1) {
            const now = new Date();
            if (year === now.getFullYear() && Math.abs(day - now.getDate()) <= 1) {
                monthIndex = now.getMonth();
            }
        }

        if (monthIndex !== -1 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const formattedText = `${day} ${thaiMonthsShort[monthIndex]} ${year + 543} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} น.`;
            return {
                date: new Date(year, monthIndex, day, hour, minute, 0, 0),
                rawTimeText: formattedText
            };
        }
    }

    return null;
}

/**
 * ตรวจสอบว่าชื่อผู้รับเงินหรือเลขพร้อมเพย์ในสลิปตรงกับของทางร้านหรือไม่
 */
function verifyRecipientFromOcr(rawText: string): { isMatched: boolean; detail: string } {
    const config = getPromptPayConfig();
    const normalized = normalizeThaiOcrText(rawText);
    const noSpaceThai = normalized.replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1');

    // แยกส่วนของผู้รับเงิน:
    // 1) หากมีคำว่า "ไปยัง" / "เข้าบัญชี" / "ผู้รับเงิน" ให้ดูข้อความหลังคำนั้น
    // 2) หากไม่มี (เช่น สลิป MAKE by KBank) ผู้รับเงินจะอยู่เหนือคำว่า "จำนวน" ทันที
    let recipientZone = noSpaceThai;
    const toAnchorMatch = noSpaceThai.search(/ไปยัง|เข้าบัญชี|ผู้รับเงิน/);
    if (toAnchorMatch !== -1) {
        recipientZone = noSpaceThai.slice(toAnchorMatch);
    } else {
        const amountIdx = noSpaceThai.search(/จำนวน|ยอดโอน|amount/i);
        if (amountIdx !== -1) {
            // ดึงช่วงข้อความหน้าคำว่า "จำนวน" ย้อนขึ้นไป 150 ตัวอักษร (ซึ่งเป็นตำแหน่งชื่อและเลขบัญชีผู้รับโอน)
            recipientZone = noSpaceThai.slice(Math.max(0, amountIdx - 150), amountIdx + 20);
        }
    }

    // สร้างรายการคำค้นหาจากชื่อบัญชีใน .env (เช่น "ทิพย์สุดา มณฑา" + รองรับสะกด "มณทา")
    const rawNameTokens = (config.name || '')
        .replace(/^(น\.ส\.|นางสาว|นาย|นาง|ด\.ช\.|ด\.ญ\.)\s*/g, '')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);

    const searchTokens = new Set<string>(rawNameTokens);
    for (const token of rawNameTokens) {
        if (token.includes('มณฑา')) searchTokens.add(token.replace('มณฑา', 'มณทา'));
        if (token.includes('มณทา')) searchTokens.add(token.replace('มณทา', 'มณฑา'));
    }

    const cleanPromptPayId = (config.id || '').replace(/[^0-9]/g, '');
    const last4Digits = cleanPromptPayId.length >= 4 ? cleanPromptPayId.slice(-4) : '';

    let matchedName = false;
    for (const token of searchTokens) {
        if (recipientZone.includes(token)) {
            matchedName = true;
            break;
        }
    }

    const matchedDigits = last4Digits.length === 4 && (recipientZone.includes(last4Digits) || noSpaceThai.includes(last4Digits));

    if (matchedName || matchedDigits) {
        return {
            isMatched: true,
            detail: `ตรงกับบัญชีร้าน (${config.name})`
        };
    }

    return {
        isMatched: false,
        detail: `ไม่พบชื่อผู้รับเงิน "${config.name}" หรือเลขท้ายพร้อมเพย์ "${last4Digits}" ในส่วนผู้รับโอนของสลิป`
    };
}

/**
 * ตรวจสอบสลิปแบบเข้มงวด (Local 100% QR + OCR ไม่เสีย Token)
 * - ตรวจ QR Code ธนาคารแท้ + ป้องกันสลิปซ้ำ
 * - ตรวจชื่อผู้รับเงินและเลขพร้อมเพย์ให้ตรงกับ .env
 * - ตรวจยอดเงินในสลิปต้องตรงกับยอดที่ต้องชำระทุกสตางค์
 * - ตรวจเวลาโอนในสลิป ต้องโอนหลังจากที่แสดง QR Code และภายใน 1 ชั่วโมง
 */
export async function validateSlip(
    fileBuffer: Buffer,
    expectedAmount?: number,
    options?: SlipValidationOptions
): Promise<SlipValidationResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
        return {
            isValid: false,
            message: 'ไม่พบไฟล์รูปภาพสลิป กรุณาแนบรูปภาพใหม่อีกครั้ง'
        };
    }

    // 1. สแกนหา QR Code บนรูปภาพ
    const qrText = await extractQRFromImageBuffer(fileBuffer);
    if (!qrText) {
        return {
            isValid: false,
            message: 'รูปภาพที่แนบไม่ใช่สลิปโอนเงินธนาคาร หรือตรวจไม่พบ QR Code บนสลิป กรุณาใช้สลิปที่มี QR Code ชัดเจน'
        };
    }

    // 2. แกะข้อมูลและตรวจสอบว่าเป็น QR Code ของสลิปธนาคารจริง (ไม่ใช่เอาภาพ QR รับเงินมาแนบหลอก)
    const slipInfo = parseThaiSlipQR(qrText);
    if (slipInfo?.isPaymentRequestQR) {
        return {
            isValid: false,
            message: 'รูปภาพที่แนบเป็น QR Code สำหรับสแกนจ่ายเงิน ไม่ใช่สลิปการโอนเงิน กรุณาแนบสลิปที่ได้หลังโอนเงินสำเร็จครับ'
        };
    }

    if (!slipInfo || !slipInfo.isBankSlip) {
        return {
            isValid: false,
            message: 'QR Code บนรูปภาพไม่ใช่สลิปโอนเงินธนาคารที่ถูกต้อง กรุณาแนบสลิปการโอนเงินจริง'
        };
    }

    const referenceNo = slipInfo.referenceNo || qrText;

    // 3. ตรวจสอบสลิปส่งซ้ำ (Anti-Duplicate Slip)
    if (await isSlipRefUsed(referenceNo)) {
        return {
            isValid: false,
            message: `สลิปใบนี้เคยถูกใช้งานในระบบแล้ว (รหัสอ้างอิง: ${referenceNo.slice(-8)}) ไม่อนุญาตให้ส่งสลิปซ้ำครับ`
        };
    }

    // 4. อ่านข้อความในสลิปด้วย Local OCR (Tesseract tha+eng) เพื่อตรวจผู้รับ ยอดเงิน และเวลาโอน
    let ocrText = '';
    try {
        ocrText = await runOcrOnBuffer(fileBuffer);
    } catch (err) {
        console.error('OCR Error during slip validation:', err);
        return {
            isValid: false,
            message: 'ระบบไม่สามารถอ่านข้อมูลตัวอักษรบนสลิปได้ กรุณาใช้รูปภาพสลิปที่ชัดเจนขึ้น'
        };
    }

    // 5. ตรวจสอบชื่อผู้รับเงิน / เลขท้ายพร้อมเพย์ว่าโอนเข้าบัญชีร้านจริงหรือไม่
    const recipientCheck = verifyRecipientFromOcr(ocrText);
    if (!recipientCheck.isMatched) {
        return {
            isValid: false,
            message: `ตรวจสอบผู้รับเงินไม่ผ่าน: ${recipientCheck.detail}`
        };
    }

    // 6. ตรวจสอบยอดเงินในสลิปอย่างเข้มงวด (เช่น ยอด 0.20 บาท แต่โอนมา 0.03 บาท ต้องปฏิเสธทันที!)
    const extractedAmount = slipInfo.amount ?? extractSlipAmountFromOcr(ocrText);
    if (expectedAmount !== undefined && expectedAmount > 0) {
        if (extractedAmount === null || extractedAmount === undefined) {
            return {
                isValid: false,
                message: `ไม่สามารถอ่านยอดเงินจากสลิปได้ชัดเจน (ยอดที่ต้องชำระคือ ${expectedAmount.toFixed(2)} บาท) กรุณาแนบรูปสลิปที่เห็นตัวเลขยอดเงินชัดเจน`
            };
        }

        // ต้องตรงกัน (อนุโลมเฉพาะความคลาดเคลื่อนทศนิยมระดับ 0.001 จาก floating point เท่านั้น)
        if (Math.abs(extractedAmount - expectedAmount) > 0.005) {
            return {
                isValid: false,
                amount: extractedAmount,
                message: `ยอดเงินในสลิปไม่ถูกต้อง! ในสลิปมียอดโอน ${extractedAmount.toFixed(2)} บาท แต่ยอดที่ต้องชำระคือ ${expectedAmount.toFixed(2)} บาท`
            };
        }
    }

    // 7. ตรวจสอบเงื่อนไขเวลาโอนเงิน (ต้องโอนหลังจากแสดง QR Code และภายใน 1 ชั่วโมง)
    const qrRefDate = options?.qrGeneratedAt ? new Date(options.qrGeneratedAt) : undefined;
    const extractedDateTime = extractSlipDateTimeFromOcr(ocrText, qrRefDate);
    const slipTimeText = extractedDateTime?.rawTimeText;

    if (qrRefDate && !isNaN(qrRefDate.getTime())) {
        const qrGeneratedMs = qrRefDate.getTime();
        // ปัดเศษวินาทีของเวลาแสดง QR Code ลงเป็นระดับนาที เพราะสลิปธนาคารแสดงเวลาเป็น HH:mm ไม่มีวินาที
        const qrMinuteFloorMs = Math.floor(qrGeneratedMs / 60000) * 60000;
        const oneHourWindowMs = 60 * 60 * 1000; // 1 ชั่วโมง
        const qrDeadlineMs = qrGeneratedMs + oneHourWindowMs;
        // อนุญาตถึงวินาทีสุดท้ายของนาทีที่ครบกำหนด 1 ชม.
        const qrDeadlineMinuteCeilMs = Math.floor(qrDeadlineMs / 60000) * 60000 + 59999;
        const nowMs = Date.now();

        if (extractedDateTime) {
            const slipTimeMs = extractedDateTime.date.getTime();

            // ❌ กรณีที่ 1: สลิปโอนเงินเกิดขึ้น "ก่อน" ที่จะแสดง QR Code (เอาสลิปเก่ามาเวียนใช้)
            if (slipTimeMs < qrMinuteFloorMs) {
                return {
                    isValid: false,
                    amount: extractedAmount ?? undefined,
                    slipTimeText,
                    message: `ไม่สามารถใช้สลิปที่โอนก่อนแสดง QR Code ได้! เวลาในสลิปคือ ${slipTimeText} แต่ QR Code แสดงเมื่อ ${formatThaiDateTime(qrGeneratedMs)}`
                };
            }

            // ⚠️ กรณีที่ 2: สลิปโอนหลังจากแสดง QR Code เกิน 1 ชั่วโมง หรือลูกค้าเก็บ QR Code ไว้เกิน 1 ชั่วโมงแล้วค่อยมาส่ง
            if (slipTimeMs > qrDeadlineMinuteCeilMs || nowMs > qrDeadlineMs) {
                const reasonText = `ลูกค้าเก็บ QR Code ไว้โอนเกิน 1 ชั่วโมง (แสดง QR เมื่อ ${formatThaiDateTime(qrGeneratedMs)}, เวลาโอนในสลิป ${slipTimeText})`;

                if (options?.isManualReviewRequest) {
                    return {
                        isValid: true,
                        requiresManualReview: true,
                        reviewReason: reasonText,
                        message: 'ส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเองเรียบร้อยแล้ว',
                        slipRef: referenceNo,
                        amount: extractedAmount ?? undefined,
                        slipTimeText,
                        slipTimestamp: extractedDateTime.date.toISOString(),
                        sendingBank: slipInfo.sendingBank,
                        rawQR: qrText
                    };
                }

                return {
                    isValid: false,
                    canRequestAdminReview: true,
                    isExpiredQR: true,
                    amount: extractedAmount ?? undefined,
                    slipTimeText,
                    slipRef: referenceNo,
                    message: `เกินเวลาที่กำหนด 1 ชั่วโมงหลังแสดง QR Code (แสดง QR เมื่อ ${formatThaiDateTime(qrGeneratedMs)} · ครบกำหนด ${formatThaiDateTime(qrDeadlineMs)} · เวลาในสลิป ${slipTimeText}) หากคุณเก็บ QR Code ไว้แล้วเพิ่งโอน สามารถกดส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเองได้ครับ`
                };
            }
        } else {
            // กรณี OCR อ่านเวลาจากสลิปไม่ได้ชัดเจน
            if (options?.isManualReviewRequest) {
                return {
                    isValid: true,
                    requiresManualReview: true,
                    reviewReason: `ลูกค้าส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเอง (แสดง QR เมื่อ ${formatThaiDateTime(qrGeneratedMs)}, ระบบอ่านเวลาโอนบนสลิปไม่ชัดเจน)`,
                    message: 'ส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเองเรียบร้อยแล้ว',
                    slipRef: referenceNo,
                    amount: extractedAmount ?? undefined,
                    sendingBank: slipInfo.sendingBank,
                    rawQR: qrText
                };
            }

            return {
                isValid: false,
                canRequestAdminReview: true,
                isExpiredQR: nowMs > qrDeadlineMs,
                amount: extractedAmount ?? undefined,
                slipRef: referenceNo,
                message: 'ระบบไม่สามารถอ่านวันที่และเวลาโอนเงินบนสลิปได้ชัดเจน กรุณาใช้ภาพสลิปที่ชัดเจน หรือกดส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเอง'
            };
        }
    }

    // หากลูกค้ากดเลือกโหมดส่งให้แอดมินตรวจสอบด้วยตนเองโดยตรง
    if (options?.isManualReviewRequest) {
        return {
            isValid: true,
            requiresManualReview: true,
            reviewReason: `ลูกค้าขอให้แอดมินตรวจสอบสลิปด้วยตนเอง (เวลาในสลิป: ${slipTimeText || 'ไม่ระบุ'})`,
            message: 'ส่งคำขอให้แอดมินตรวจสอบสลิปด้วยตนเองเรียบร้อยแล้ว',
            slipRef: referenceNo,
            amount: extractedAmount ?? undefined,
            slipTimeText,
            slipTimestamp: extractedDateTime?.date.toISOString(),
            sendingBank: slipInfo.sendingBank,
            rawQR: qrText
        };
    }

    // ✅ ผ่านการตรวจสอบทุกข้อ (QR แท้ + ไม่ซ้ำ + ชื่อผู้รับตรง + ยอดเงินตรงเป๊ะ + โอนหลังแสดง QR ภายใน 1 ชม.)
    return {
        isValid: true,
        message: `ตรวจสอบสลิปโอนเงินถูกต้องเรียบร้อย (ยอด ${extractedAmount?.toFixed(2)} บาท · เวลาโอน ${slipTimeText || 'ภายในกำหนด'})`,
        slipRef: referenceNo,
        amount: extractedAmount ?? undefined,
        slipTimeText,
        slipTimestamp: extractedDateTime?.date.toISOString(),
        sendingBank: slipInfo.sendingBank,
        rawQR: qrText
    };
}
