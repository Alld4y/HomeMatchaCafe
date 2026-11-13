import sharp from 'sharp';
import jsQR from 'jsqr';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';
import stringSimilarity from 'string-similarity'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💡 ฟังก์ชันเสริม: แกะโครงสร้างข้อมูลสลิปไทยจาก QR Code (TLV Format) คงเดิมเป๊ะ
function parseThaiSlipQR(qrText) {
  if (!qrText || !qrText.startsWith('00')) return null;
  
  let index = 0;
  let slipData = { sendingBank: null, referenceNo: null, transDate: null, transTime: null, isShortFormat: false };

  if (qrText.includes('5102TH')) {
    slipData.isShortFormat = true;
    const match = qrText.match(/00\d{2}.*?0103\d{3}(.*?)(5102TH)/);
    if (match && match[1]) {
      slipData.referenceNo = match[1]; 
    }
    return slipData;
  }

  while (index < qrText.length) {
    const tag = qrText.substring(index, index + 2);
    const length = parseInt(qrText.substring(index + 2, index + 4), 10);
    const value = qrText.substring(index + 4, index + 4 + length);
    index += 4 + length;

    if (tag === '51') {
      let subIndex = 0;
      while (subIndex < value.length) {
        const subTag = value.substring(subIndex, subIndex + 2);
        const subLength = parseInt(value.substring(subIndex + 2, subIndex + 4), 10);
        const subValue = value.substring(subIndex + 4, subIndex + 4 + subLength);
        subIndex += 4 + subLength;

        if (subTag === '00') slipData.sendingBank = subValue;
        if (subTag === '01') slipData.referenceNo = subValue;
        if (subTag === '02') {
          slipData.transDate = `${subValue.substring(0,4)}-${subValue.substring(4,6)}-${subValue.substring(6,8)}`;
          slipData.transTime = `${subValue.substring(8,10)}:${subValue.substring(10,12)}:${subValue.substring(12,14)}`;
        }
      }
    }
  }
  return slipData;
}

/**
 * ฟังก์ชันอ่านข้อมูลสลิปแบบ Double Scan เวอร์ชันต้านทานสลิปสลับฝั่งโอน
 */
async function readFullSlip(imagePath, mockOptions = null) {
  const result = {
    qrText: null,
    qrDataParsed: null, 
    ocrText: null,
    isRecipientCorrect: false, 
    error: null
  };

  try {
    if (mockOptions && mockOptions.isMock) {
      console.log("⚠️ โหมดทดสอบ: กำลังประมวลผลด้วยข้อมูลสมมติ...");
      result.qrText = mockOptions.qrText;
      result.ocrText = mockOptions.ocrText;
      result.qrDataParsed = parseThaiSlipQR(result.qrText);
    } else {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`ไม่พบไฟล์ภาพในระบบตามตำแหน่ง: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const image = sharp(imageBuffer);
      
      try {
        const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        if (qrCode) {
          result.qrText = qrCode.data;
          result.qrDataParsed = parseThaiSlipQR(qrCode.data); 
        } else {
          result.qrText = "ไม่พบ QR Code ในสลิปนี้";
        }
      } catch (qrErr) {
        result.qrText = `สแกน QR ล้มเหลว: ${qrErr.message}`;
      }

      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath));

        const ocrResponse = await fetch('http://127.0.0.1:8000/scan-slip', {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders()
        });

        if (!ocrResponse.ok) {
          throw new Error(`เซิร์ฟเวอร์ Python ตอบกลับผิดพลาด สเตตัส: ${ocrResponse.status}`);
        }

        const ocrResult = await ocrResponse.json();
        result.ocrText = ocrResult.ocrText;

      } catch (ocrErr) {
        result.ocrText = `EasyOCR Local ล้มเหลว: ${ocrErr.message}`;
      }
    }

    // --- ส่วนที่ 3: ระบบตรวจสอบความถูกต้องของชื่อปลายทางเฉพาะโซนผู้รับเงิน ---
    if (result.ocrText) {
      const myName = "ทิพย์สุดา มณฑา";
      const cleanOcrText = result.ocrText.replace(/\s+/g, ''); 

      // 💡 1. ตัดข้อความท่อนแรก (ฝั่งผู้โอน) ออกไป โดยสแกนหาจุดเริ่มของคำสำคัญฝั่งผู้รับ
      const recipientKeywords = ["ไปยัง", "เข้า", "โอนให้", "to"];
      let recipientZone = cleanOcrText;

      for (const keyword of recipientKeywords) {
        if (cleanOcrText.includes(keyword)) {
          // ดึงเฉพาะข้อความตั้งแต่คำสำคัญนั้นยาวไปจนจบประโยค
          recipientZone = cleanOcrText.substring(cleanOcrText.indexOf(keyword));
          break; 
        }
      }

      console.log("🎯 ข้อความเฉพาะโซนผู้รับเงินที่นำไปตรวจ:", recipientZone);

      // 2. เช็กความคล้ายเฉพาะในโซนผู้รับเงิน
      const matchResult = stringSimilarity.findBestMatch(myName, [recipientZone]);
      const rating = matchResult.bestMatch.rating;

      // 3. เช็กรากศัพท์ย่อยระบุพิกัดเฉพาะในโซนผู้รับเงินเท่านั้น (ห้ามเช็กจากข้อความเต็มสลิป)
      const hasFirstPart = recipientZone.includes("ทิพ") && recipientZone.includes("สุดา");
      const hasShortName = recipientZone.includes("ทิพยสุดา") || recipientZone.includes("ทิพย์สุดา");
      const hasLastName = recipientZone.includes("มณฑ");

      // 4. ตัดสินใจ (ถอดผ่านอัตโนมัติด้วย QR Ref ออก เพื่อความปลอดภัยเรื่องปลายทาง)
      if (
        rating >= 0.40 || 
        hasShortName || 
        hasFirstPart || 
        hasLastName
      ) {
        result.isRecipientCorrect = true;
      }
      
      console.log(`📊 ดัชนีความน่าจะเป็น (โซนผู้รับ): ${(rating * 100).toFixed(2)}% | ตรวจรากศัพท์: ${hasShortName || hasFirstPart} | ผลลัพธ์: ${result.isRecipientCorrect}`);
    }

    return result;

  } catch (globalErr) {
    result.error = globalErr.message;
    return result;
  }
}

// ==========================================
//        🎯 ท่อนทดสอบรันด้วยข้อมูลจริงของคุณ
// ==========================================

// const mockData1 = {
//   isMock: true,
//   qrText: "0038000600000101030060217A9df97db2c35842e45102TH9104C72F",
//   ocrText: "krungthai กรุงไทย โอนเงินสำเร็จ รหัสอ้างอิง a9df97db2c35842e4 จาก * * x น.ส.ทิพย์สุดาม กรุงไทย xxx x-xx519-0 ไปยัง นาย นราวิชญ์อนุวงศ์ กสิกรไทย xxx-x-xx219-3 จำนวนเงิน 3.00 บาท ค่าธรรมเนียม o.0d บาท วันที่ทำรายการ 01 ก.ค. 2569 10:12"
// };

// console.log("📍 [TEST CASE] ตรวจสอบสลิปโอนออกจาก ทิพย์สุดา ไปยัง นราวิชญ์:");
// readFullSlip(null, mockData1).then(res => {
//   console.log("🚀 ผลลัพธ์ระบบปรับปรุงใหม่ (ต้องได้ false):", JSON.stringify(res, null, 2));
// });

export { readFullSlip };