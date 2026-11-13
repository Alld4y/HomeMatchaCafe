import { createCanvas, loadImage, registerFont } from 'canvas';
import QRCode from 'qrcode';
import fs from 'fs';
import generatePayload from 'promptpay-qr';




// 2. ระบุจำนวนเงิน (Optional)
// - ถ้าไม่ใส่: จะได้ QR ที่ผู้สแกนต้องกรอกยอดเงินเอง (เหมาะกับแปะหน้าร้านทั่วไป)
// - ถ้าใส่: จะล็อคยอดเงินไว้เลย ผู้สแกนแก้ไขยอดไม่ได้ (เหมาะกับระบบบิล หรือระบบขายของ)


// registerFont('./fonts/Prompt-Bold.ttf', { family: 'Prompt', weight: 'bold', style: 'normal' });


async function createStandardThaiQRPresentation(amount = 1) {
    const target = '0966514809'; 
    const qrData = generatePayload(target, { amount });

    // ==========================================
    // 1. ตั้งค่าสัดส่วนพื้นหลัง (กว้าง 7.4 : สูง 10.5)
    // ==========================================
    const scale = 100; // ตัวคูณเพื่อเพิ่มความละเอียดของภาพ (ถ้าอยากได้ภาพชัดๆ เพิ่มเป็น 200 ได้)
    const bgWidth = 7.4 * scale;   // 740 พิกเซล
    const bgHeight = 10.5 * scale; // 1050 พิกเซล

    const canvas = createCanvas(bgWidth, bgHeight);
    const ctx = canvas.getContext('2d');

    // พ่นพื้นหลังการ์ดทั้งหมดเป็นสีขาวก่อน
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, bgWidth, bgHeight);

    // ==========================================
    // 2. วาดแถบสีน้ำเงินด้านบน (Header Banner)
    // ==========================================
    // กว้างเท่าตัวการ์ด, สูงประมาณ 15-18% ของความสูงทั้งหมด
    const bannerHeight = bgHeight * 0.16; 
    ctx.fillStyle = '#0e3d67'; // สีน้ำเงินมาตรฐาน Thai QR Payment
    ctx.fillRect(0, 0, bgWidth, bannerHeight);

    // แปะโลโก้ Thai QR Payment ในแถบสีน้ำเงิน (โหลดไฟล์โลโก้ตัวสีขาวมาใช้)
    // สมมติชื่อไฟล์ 'thai_qr_banner_logo.png'
    try {
        const bannerLogo = await loadImage('./ThaiQR_logo/thai_qr_banner_logo.png');
        const bLogoHeight = bannerHeight * 0.8; // ให้โลโก้สูงครึ่งหนึ่งของแถบ
        const bLogoWidth = bLogoHeight * (bannerLogo.width / bannerLogo.height); // รักษาสัดส่วนภาพ (Aspect Ratio)
        const bLogoX = (bgWidth - bLogoWidth) / 2;
        const bLogoY = (bannerHeight - bLogoHeight) / 2;
        ctx.drawImage(bannerLogo, bLogoX, bLogoY, bLogoWidth, bLogoHeight);
    } catch (e) {
        console.log("ยังไม่มีไฟล์โลโก้สำหรับแบนเนอร์, ข้ามขั้นตอนการวาดโลโก้บนแถบ");
    }

    // ==========================================
    // 3. โหลดสัญลักษณ์ PromptPay (ที่อยู่เหนือ QR Code)
    // ==========================================
    // สมมติชื่อไฟล์ 'promptpay_logo.png'
    let promptPayLogoY = bannerHeight + (bgHeight * 0.05); // เว้นระยะห่างลงมาจากแบนเนอร์เล็กน้อย
    const ppLogoHeight = bgHeight * 0.07; // สูงประมาณ 6% ของการ์ด
    try {
        const ppLogo = await loadImage('./ThaiQR_logo/promptpay_logo.png');
        const ppLogoWidth = ppLogoHeight * (ppLogo.width / ppLogo.height);
        const ppLogoX = (bgWidth - ppLogoWidth) / 2;
        ctx.drawImage(ppLogo, ppLogoX, promptPayLogoY, ppLogoWidth, ppLogoHeight);
    } catch (e) {
        console.log("ยังไม่มีไฟล์โลโก้ PromptPay, ข้ามขั้นตอนการวาดโลโก้พร้อมเพย์");
    }

    // ==========================================
    // 4. เจนและวาดรูป QR Code ตัวหลัก
    // ==========================================
    const qrSize = bgWidth * 0.6; // ให้ขนาด QR Code กว้างประมาณ 75% ของความกว้างการ์ด
    
    const qrDataURL = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H', // ต้องเป็นระดับ H เสมอ เพราะเราจะแปะโลโก้ทับตรงกลาง
        margin: 1,
        width: qrSize
    });
    
    const qrImage = await loadImage(qrDataURL);
    const qrX = (bgWidth - qrSize) / 2;
    // วาด QR Code ให้อยู่ถัดลงมาจากโลโก้ PromptPay
    const qrY = promptPayLogoY + ppLogoHeight + (bgHeight * 0.04); 
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // ==========================================
    // 5. แปะสัญลักษณ์ดวงตราตรงกลาง QR Code (Center Overlay)
    // ==========================================
    // โหลดไฟล์สัญลักษณ์ตรา Thai QR อันเล็ก (มีขอบขาวล้อมรอบเพื่อสร้าง Clear Space)
    // สมมติชื่อไฟล์ 'thai_qr_center_icon.png'
    try {
        const centerIcon = await loadImage('./ThaiQR_logo/logo.png');
        const iconSize = qrSize * 0.18; // ขนาดประมาณ 18% ของตัว QR Code จะไม่บังพิกเซลสำคัญ
        const iconX = qrX + (qrSize - iconSize) / 2;
        const iconY = qrY + (qrSize - iconSize) / 2;
        ctx.drawImage(centerIcon, iconX, iconY, iconSize * 1.360153256, iconSize);
    } catch (e) {
        console.log("ยังไม่มีไฟล์ไอคอนตรงกลาง, ข้ามขั้นตอนการแปะไอคอนกลาง QR");
    }

    // ==========================================
    ctx.font = '40px Prompt';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('น.ส.ทิพย์สุดา มณฑา', bgWidth / 2, qrY + qrSize + (bgHeight *0.08));
    ctx.font = '24px Prompt';
    ctx.fillText(`096-XXX-4809      ยอดชำระ ${amount} บาท`, bgWidth / 2, qrY + qrSize + (bgHeight * 0.08) + (bgHeight * 0.05));


    // ==========================================
    // 6. บันทึกไฟล์ผลลัพธ์
    // ==========================================
    const buffer = canvas.toBuffer('image/png');
    const qr_name = `${amount}`;
    fs.writeFileSync(`../home-matcha-cafe/static/qr-code/${qr_name}.png`, buffer);
    console.log('สร้างภาพตามมาตรฐานขนาดสำเร็จแล้ว! -> ', qr_name + '.png');
    return `${qr_name}.png`; // ส่งกลับชื่อไฟล์ที่สร้างขึ้น (ไม่รวม path)
}


export { createStandardThaiQRPresentation };