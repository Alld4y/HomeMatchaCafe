import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFullSlip } from './validation.js'; // 💡 อย่าลืมอิมพอร์ตฟังก์ชันตัวใหม่เข้ามาด้านบนสุดของไฟล์ด้วยนะครับ

// 💡 นำเข้าฟังก์ชันและตารางฐานข้อมูลจากไฟล์ในโปรเจกต์ของคุณ (ต้องเติม .js ท้ายชื่อไฟล์เสมอ)
import pool from './db.js';
import { createStandardThaiQRPresentation } from './qrcode.js';
import { validByGemini } from './gemini.js';

// 💡 สร้าง __filename และ __dirname ขึ้นมาจำลองในระบบ ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const port = 9999;


app.use(cors());
app.use(express.json());

// 💡 1. แก้ไขการตั้งค่าที่เซฟรูปภาพตรงนี้ ให้ต่อท้ายนามสกุลไฟล์
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // อย่าลืมสร้างโฟลเดอร์ชื่อ uploads ไว้ด้วยนะ
  },
  filename: function (req, file, cb) {
    // สร้างชื่อไฟล์สุ่มจากเวลาปัจจุบัน + รหัสสุ่ม เพื่อป้องกันชื่อซ้ำ
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 🔍 path.extname(file.originalname) จะไปแกะนามสกุลไฟล์จริง (.png / .jpg) จากเครื่องลูกค้ามาต่อท้ายให้เอง
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage }); // 💡 2. เปลี่ยนมาใช้ storage ตัวที่เราตั้งค่าไว้ข้างบน

app.get('/', (req, res) => {
  res.send('Home Matcha Cafe');
});

app.post('/api/qrcode', async (req, res) => {
  // let totalPrice = 0;
  // try {
  //   const queryResult = await pool.query('SELECT order_id FROM public."order" ORDER BY order_id DESC LIMIT 1;');
    
  //   if (queryResult.rows.length === 0) {
  //     return res.status(404).json({ error: "No orders found" });
  //   }

  //   const orderId = queryResult.rows[0].order_id;
    
  //   // 1. สร้าง Base64 QR Code ขึ้นมาดื้อๆ เลย (สมมติว่ายอดเงิน 150 บาท)
  //   const qrImageBase64 = await createStandardThaiQRPresentation(totalPrice); // ส่งยอดเงินไปให้ฟังก์ชันสร้าง QR Code

  //   // 2. ส่งกลับไปทั้ง order_id และ ตัวรูปภาพ Base64
  //   res.json({ 
  //     order_id: orderId,
  //     qrCode: qrImageBase64 // ส่งรูปนี้กลับไปด้วย
  //   });

  // } catch (error) {
  //   console.error(error);
  //   res.status(500).json({ error: "Internal server error" });
  // }
  console.log(req.body)
  const totalPrice = req.body.totalPrice;
  const qrImage = await createStandardThaiQRPresentation(totalPrice); // ส่งยอดเงินไปให้ฟังก์ชันสร้าง QR Code
  res.status(200).json({ message: "Received data", qrImage: qrImage });
});


app.post('/api/orders', upload.single('slipImage'), async (req, res) => {
  try {
    // 1. ดึงข้อมูลและเซ็ตค่าตะกร้าสินค้า
    const data = {
      name: req.body.recipientName,
      phone: req.body.phone,
      address: req.body.address,
      sellerMessage: req.body.sellerMessage,
    };
    
    const basket = JSON.parse(req.body.basket || '[]'); 
    
    // คำนวณราคาสินค้าจริง
    const Price = [50, 55, 60, 65, 70];
    let totalPrice = 0; 
    basket.forEach((item, index) => {
      const itemPrice = Price[index] || 0; 
      totalPrice += itemPrice * item.quantity;
    });
    
    console.log("🛒 ตะกร้าสินค้าหลังบ้านคิดเงิน:", basket);
    console.log("💰 ยอดรวมทั้งหมดที่ต้องชำระจริง:", totalPrice);
    
    // หมายเหตุ: ท่อนทดสอบ totalPrice = 3 สามารถคอมเมนต์ออกหรือลบได้หากต้องการใช้ราคาสินค้าจริงจากตะกร้า
    totalPrice = 1;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบหลักฐานการโอนเงิน (สลิป)' });
    }

    console.log("🤖 กำลังรอผลลัพธ์การประมวลผล Local Double Scan (QR + EasyOCR)...");
    const slipResult = await readFullSlip(req.file.path);
    console.log("ผลลัพธ์จากการสแกนสลิป:", slipResult);

    // 💡 ดักกรณีชื่อผู้รับเงินไม่ตรงเงื่อนไขปลายทางเด็ดขาด (แก้อาการหลุดรอดเข้าฐานข้อมูล)
    const isNameCorrect = slipResult.isRecipientCorrect;
    if (isNameCorrect === false) {
      return res.status(400).json({ 
        success: false, 
        message: 'ชื่อผู้รับปลายทางในสลิปไม่ถูกต้อง กรุณาใช้สลิปที่โอนเข้าบัญชีคุณทิพย์สุดา มณฑา เท่านั้นค่ะ' 
      });
    }

    // 2. ดักยอดเงินจากข้อความข้อตกลง OCR ฝั่ง Python
    const moneyMatch = slipResult.ocrText ? slipResult.ocrText.match(/(\d+\.\d{2})/) : null;
    let slipAmount = moneyMatch ? parseFloat(moneyMatch[1]) : 0;
    console.log(`💵 จำนวนเงินบนสลิปที่ตรวจจับได้: ${slipAmount} บาท`);

    // 3. ตรวจเช็กและดักสลิปส่งซ้ำโดยอ้างอิงรหัสธุรกรรม (Reference No.) จาก QR Code
    let referenceNo = slipResult.qrDataParsed?.referenceNo || null;
    if (referenceNo) {
      const checkDup = await pool.query('SELECT order_id FROM public."order" WHERE slip_ref = $1 LIMIT 1;', [referenceNo]);
      if (checkDup.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'สลิปใบนี้ถูกใช้งานไปแล้วในระบบ ห้ามส่งสลิปซ้ำครับ!' });
      }
    }

    // 4. เช็กความถูกต้องของจำนวนเงิน (กรณีสแกนยอดเงินเจอแต่ดันโอนขาด/โอนเกิน)
    const isAmountCorrect = (slipAmount >= totalPrice);
    if (slipAmount > 0 && !isAmountCorrect) {
      return res.status(400).json({ 
        success: false, 
        message: `ยอดเงินในสลิป (${slipAmount} บาท) ไม่ตรงกับยอดสั่งซื้อจริง (${totalPrice} บาท)` 
      });
    }

    // 5. ลอจิกตัดสินสถานะออเดอร์
    let orderStatus = 'completed'; 
    let responseMessage = 'ได้รับสลิปและบันทึกออเดอร์ร้านมัทฉะเรียบร้อยแล้ว!';

    // 🔀 เข้าโหมดตรวจมือเฉพาะเมื่อ: ชื่อถูกต้องชัวร์ (ผ่านด่านบนแล้ว) แต่บอทแอบแสกนยอดเงินไม่ออก (ได้ 0)
    if (slipAmount === 0) {
      orderStatus = 'pending_review';
      responseMessage = 'ออเดอร์บันทึกสำเร็จ! ระบบกำลังส่งสลิปให้เจ้าหน้าที่ตรวจสอบความถูกต้องของยอดเงิน (ไม่เกิน 2 นาที)';
    }

    // 6. เพิ่มข้อมูลลงฐานข้อมูล Postgres
    const text = `
      INSERT INTO public."order"(name, phone, address, message, slip_image, basket, slip_ref, status) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *;
    `;
    const values = [
      data.name, 
      data.phone, 
      data.address, 
      data.sellerMessage, 
      req.file.filename, 
      JSON.stringify(basket),
      referenceNo,
      orderStatus
    ];
    
    const insertRes = await pool.query(text, values);
    console.log('เพิ่มข้อมูลลงฐานข้อมูลสำเร็จ สถานะ:', insertRes.rows[0].status);

    // 7. ส่งผลลัพธ์กลับไปให้หน้าบ้าน Svelte
    return res.json({
      success: true,
      status: orderStatus,
      message: responseMessage
    });

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการตรวจสอบสลิปหลังบ้าน:", error);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดที่ระบบตรวจสอบสลิปหลังบ้าน' });
  }
});

// app.post('/api/orders', upload.single('slipImage'), async (req, res) => {
//   try {
//     // ... (โค้ดดึงข้อมูลลูกค้า / คิดราคาสินค้า totalPrice ด้านบนเหมือนเดิม) ...
//     const data = {
//       "name": req.body.recipientName,
//       "phone": req.body.phone,
//       "address": req.body.address,
//       "sellerMessage": req.body.sellerMessage,
//     }
//     const basket = JSON.parse(req.body.basket); // สมมติว่าตะกร้าสินค้าเป็น JSON String
//     const Price = [50, 55, 60, 65, 70];
//     let totalPrice = 3;
//     console.log("ตะกร้าสินค้าที่ส่งมาจากหน้าบ้าน:", basket);
//     // basket.forEach((item, index) => {
//     //   const itemPrice = Price[index] || 0; // ถ้า index เกิน array Price จะได้ 0
//     //   totalPrice += itemPrice * item.quantity;
//     // });
//     console.log("ยอดรวมทั้งหมดจากตะกร้า:", totalPrice);

//     console.log(data);

//     console.log("🤖 กำลังรอผลลัพธ์จาก Gemini...");
//     const geminiResult = await validByGemini(req.file.filename);
//     console.log("ผลลัพธ์จาก Gemini:", geminiResult);

//     // 💡 1. ดักกรณีที่ Gemini อ่านสลิปไม่ได้ หรือหลับ
//     if (!geminiResult || !geminiResult.amount) {
//       return res.status(400).json({
//         success: false,
//         message: 'ระบบ AI ไม่สามารถอ่านยอดเงินจากสลิปนี้ได้ กรุณาตรวจสอบรูปภาพอีกครั้ง'
//       });
//     }

//     console.log(data)

//     const slipAmount = parseFloat(geminiResult.amount);

//     // 💡 2. ดักกรณีที่ยอดเงินไม่ตรงกับราคาตะกร้าสินค้า
//     if (slipAmount !== totalPrice) {
//       return res.status(400).json({ 
//         success: false, 
//         message: `ยอดเงินในสลิป (${slipAmount} บาท) ไม่ตรงกับยอดสั่งซื้อจริง (${totalPrice} บาท)` 
//       });
//     }

//     if (geminiResult.isSlip !== true) {
//       return res.status(400).json({
//         success: false,
//         message: 'รูปภาพที่ส่งมาไม่ใช่สลิปโอนเงิน กรุณาส่งรูปสลิปที่ถูกต้อง'
//       });
//     }

//     if (!geminiResult.recipientName.includes("ทิพย์สุดา ม")) {
//       return res.status(400).json({
//         success: false,
//         message: 'ชื่อผู้รับในสลิปไม่ตรงกับข้อมูลที่ส่งมา'
//       });
//     }

//     // 💡 3. ถ้าผ่านทุกเงื่อนไขดักด้านบนแล้ว (ยอดเงินตรงชัวร์) ถึงจะยอมลงมาทำท่อนนี้
//     const text = `INSERT INTO public."order"(name, phone, address, message, slip_image, basket) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`;
//     const values = [data.name, data.phone, data.address, data.sellerMessage, req.file.filename, JSON.stringify(basket)];
//     const insertRes = await pool.query(text, values);
//     console.log('เพิ่มข้อมูลสำเร็จ:', insertRes.rows[0]);

//     // 💡 4. ส่งคำตอบกลับหาหน้าบ้านแน่นอน ไม่ค้างชัวร์ 100%
//     return res.json({
//       success: true,
//       message: 'ได้รับสลิปและบันทึกออเดอร์ร้านมัทฉะเรียบร้อยแล้ว!'
//     });

//   } catch (error) {
//     console.error("เกิดข้อผิดพลาดในการตรวจสอบสลิปด้วย Gemini:", error);
//     // 💡 5. ดัก Error เผื่อ JSON.parse พัง ระบบจะได้ดีดออกทางนี้ ไม่ค้าง
//     return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดที่ระบบตรวจสอบสลิปหลังบ้าน' });
//   }
// });

app.post('/api/get-history', async (req, res) => {
  try {
    const phone = req.body.phone;
    console.log('Phone:', `"${phone}"`, 'Length:', phone.length); 
// เพื่อดูว่ามีความยาวเกิน 10 หลัก หรือมีช่องว่างแฝงไหม

// ลองเปลี่ยนมาค้นหาด้วย LIKE (ใช้ % ครอบหัวท้าย) ดูชั่วคราวว่าเจอไหม
const debugQuery = 'SELECT * FROM public."order" WHERE phone LIKE $1 ORDER BY order_id DESC;';
const result = await pool.query(debugQuery, [`%${phone.trim()}%`]);
    console.log(`📜 ดึงประวัติออเดอร์ของหมายเลขโทรศัพท์ ${phone} สำเร็จ จำนวนรายการ: ${result.rows.length}`);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching order history:", err);
    res.status(500).json({ success: false, message: 'Error fetching order history' });
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});