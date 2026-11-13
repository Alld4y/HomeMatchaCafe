// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import { GoogleGenAI } from "@google/genai";
// import dotenv from "dotenv";

// // โหลดค่าใน .env เข้ามาใน process.env
// dotenv.config();

// export const validByGemini = async (slipImage) => {
//     const __filename = fileURLToPath(import.meta.url);
//     const __dirname = path.dirname(__filename);

//     const ai = new GoogleGenAI({ apiKey: process.env.Gemini_API_Key });

//     // 1. ดึงไฟล์รูปภาพสลิปให้ถูกโฟลเดอร์
//     const filePath = path.join(__dirname, 'uploads', slipImage);
//     const imageBytes = fs.readFileSync(filePath);
//     const imageB64 = imageBytes.toString("base64");

//     // 2. เรียกส่งข้อมูลหา Gemini ด้วยโครงสร้างที่ถูกต้อง
//     const interaction = await ai.interactions.create({
//     model: "gemini-2.5-flash",
//     input: [
//         { 
//         type: "text", 
//         text: `จงตรวจสอบรูปภาพสลิปโอนเงินนี้แล้วตอบกลับในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:
//         {
//             "amount": "จำนวนเงินโอนที่อ่านได้จากตัวหนังสือบนสลิป (เช่น 300.00) ไม่ต้องใส่เครื่องหมาย "",
//             "qrText": "ข้อความหรือรหัสที่ถอดได้จากการสแกน QR Code บนสลิป (ถ้าเจอ)",
//             "referenceNo": "รหัสธุรกรรม/เลขที่รายการ",
//             "bank": "ชื่อธนาคารที่โอนเงิน (เช่น ธนาคารกรุงไทย, ธนาคารกสิกรไทย, ธนาคารไทยพาณิชย์, ฯลฯ)",
//             "date": "วันที่ทำรายการ (ถ้าอ่านได้จากสลิป)",
//             "time": "เวลาที่ทำรายการ (ถ้าอ่านได้จากสลิป)",
//             "senderName": "ชื่อผู้โอนเงิน (ถ้าอ่านได้จากสลิป)",
//             "recipientName": "ชื่อผู้รับเงิน (ถ้าอ่านได้จากสลิป)",
//             "message": "ข้อความหรือโน้ตที่แนบมากับการโอน (ถ้าอ่านได้จากสลิป)",
//             "isSlip": "true หรือ false ขึ้นอยู่กับว่ารูปภาพนี้เป็นสลิปจริงหรือไม่ (เช่น ถ้าเป็นสลิปจริงให้ตอบ true, ถ้าเป็นภาพอื่นหรือไม่ใช่สลิปให้ตอบ false)"
//         }
//         หมายเหตุ: หากไม่พบข้อมูลใด ให้ใส่ค่าเป็น null แทน และให้ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นแทรกเข้ามา
//         }
//         หมายเหตุ: หากเป็นสลิปกรุงไทยหรือ MAKE by KBank ให้พยายามดึงเลข referenceNo จากรหัสใน QR Code มาให้ถูกต้องที่สุด`
//         },
//         {
//         type: "image",
//         data: imageB64,
//         mime_type: "image/jpeg" // 💡 แก้ไขจาก mimeType เป็น mime_type ตรงนี้ครับ
//         }
//     ],
//     });

//     console.log("\n🚀 ผลลัพธ์ดิบจาก Gemini:", interaction.output_text);
    
//     // 💡 1. ดักจับและตัดอักษรแปลกๆ หัวท้ายออกให้หมด
//     let cleanJson = interaction.output_text.trim();
    
//     // ใช้ Regex คลีนเครื่องหมาย ```json หรือ ``` ที่หัวท้ายออกไป
//     cleanJson = cleanJson.replace(/^```json\s*/i, ''); // ตัด ```json ตัวบน
//     cleanJson = cleanJson.replace(/```$/, '');         // ตัด ``` ตัวล่าง
//     cleanJson = cleanJson.trim();                      // ตัดช่องว่างซ้ำอีกที

//     try {
//       // 💡 2. แปลงผลลัพธ์เป็น Object
//       return JSON.parse(cleanJson);
//     } catch (parseError) {
//       console.error("❌ บอทอ่านโครงสร้าง JSON พังเนื่องจาก:", parseError.message);
//       console.error("ข้อความที่พยายามจะ Parse:", cleanJson);
//       return null; // ส่ง null กลับไปเพื่อให้ app.js ดักเข้าเซสชันไม่แครช
//     }
// }

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// โหลดค่าใน .env เข้ามาใน process.env
dotenv.config();

export const validByGemini = async (slipImage) => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const ai = new GoogleGenAI({ apiKey: process.env.Gemini_API_Key });

        // 1. ดึงไฟล์รูปภาพสลิปให้ถูกโฟลเดอร์
        const filePath = path.join(__dirname, 'uploads', slipImage);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ ไม่พบไฟล์รูปภาพสลิปที่ตำแหน่ง: ${filePath}`);
            return null;
        }

        const imageBytes = fs.readFileSync(filePath);
        const imageB64 = imageBytes.toString("base64");

        // 💡 2. เปลี่ยนมาใช้ประตูหลัก ai.models.generateContent เพื่อดึงสิทธิ์ Pro เต็มสูบ
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // เน้นเร็วสุดๆ หรือสลับเป็น "gemini-2.5-pro" ถ้าต้องการความนิ่งขั้นสุด
            contents: [
                `จงตรวจสอบรูปภาพสลิปโอนเงินนี้แล้วตอบกลับในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:
                {
                    "amount": 3.00,
                    "qrText": "ข้อความหรือรหัสที่ถอดได้จากการสแกน QR Code บนสลิป (ถ้าเจอ)",
                    "referenceNo": "รหัสธุรกรรม/เลขที่รายการ",
                    "bank": "ชื่อธนาคารที่โอนเงิน (เช่น ธนาคารกรุงไทย, ธนาคารกสิกรไทย, ธนาคารไทยพาณิชย์, ฯลฯ)",
                    "date": "วันที่ทำรายการ (ถ้าอ่านได้จากสลิป)",
                    "time": "เวลาที่ทำรายการ (ถ้าอ่านได้จากสลิป)",
                    "senderName": "ชื่อผู้โอนเงิน (ถ้าอ่านได้จากสลิป)",
                    "recipientName": "ชื่อผู้รับเงิน (ถ้าอ่านได้จากสลิป)",
                    "message": "ข้อความหรือโน้ตที่แนบมากับการโอน (ถ้าอ่านได้จากสลิป)",
                    "isSlip": true
                }
                คำเตือนเด็ดขาด: ให้ตอบกลับเป็นข้อความ JSON ดิบดื้อ ๆ เท่านั้น ห้ามใส่เครื่องหมาย \`\`\`json ครอบ และห้ามมีข้อความอธิบายใด ๆ แทรกมาเด็ดขาด
                หมายเหตุ: 
                - ในส่วน amount ให้ตอบเป็นตัวเลข (Number) เท่านั้น ห้ามใส่เครื่องหมายคำพูดครอบ
                - ในส่วน isSlip ให้ตอบเป็นค่า Boolean (true หรือ false) เท่านั้น ห้ามครอบคำพูด
                - หากไม่พบข้อมูลใด ให้ใส่ค่าเป็น null แทน
                - หากเป็นสลิปกรุงไทยหรือ MAKE by KBank ให้ดึงเลข referenceNo จากรหัสใน QR Code มาให้ดีที่สุด`,
                
                // 💡 โครงสร้าง Object สำหรับส่งรูปภาพในฟังก์ชัน generateContent
                {
                    inlineData: {
                        data: imageB64,
                        mimeType: "image/jpeg" // ประตูหลักใช้เป็น camelCase (mimeType) นะครับ
                    }
                }
            ],
        });

        // 💡 เปลี่ยนมาดึงค่าจาก response.text
        console.log("\n🚀 ผลลัพธ์ดิบจาก Gemini:", response.text);
        
        let cleanJson = response.text.trim();
        
        // ใช้ Regex คลีนมาร์กดาวน์ (เผื่อไว้หากบอทยังเผลอพ่นหลุดมา)
        cleanJson = cleanJson.replace(/^```json\s*/i, '');
        cleanJson = cleanJson.replace(/```$/, '');
        cleanJson = cleanJson.trim();

        // 3. แปลงผลลัพธ์เป็น Object ส่งกลับไปให้ app.js
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error("❌ ระบบภายใต้ฟังก์ชัน validByGemini ขัดข้อง:", error.message);
        return null;
    }
}