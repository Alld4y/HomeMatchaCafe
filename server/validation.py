from fastapi import FastAPI, UploadFile, File
import easyocr
import cv2
import shutil
import os

app = FastAPI()

# 💡 โหลดตัวสแกนข้อความภาษาไทย + อังกฤษ (EasyOCR) และตัวแกะ QR ของ WeChat
reader = easyocr.Reader(['th', 'en'])
wechat_qr = cv2.wechat_qrcode_WeChatQRCode()

@app.post("/scan-slip")
async def scan_slip(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    qr_text = None
    extracted_text = []

    try:
        # 🔍 1. แกะรหัส QR Code เหมือนเดิม
        img = cv2.imread(temp_path)
        res_qr, _ = wechat_qr.detectAndDecode(img)
        if res_qr and len(res_qr) > 0:
            qr_text = res_qr[0]

        # 🔍 2. สลับมาใช้ EasyOCR แกะข้อความภาษาไทย
        # detail=0 หมายถึงเอาเฉพาะข้อความสตริงออกมา ไม่เอาพิกัดกล่อง
        result = reader.readtext(temp_path, detail=0)
        extracted_text = result
                
    except Exception as e:
        print(f"Error during scanning: {e}")
        
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
    return {
        "qrText": qr_text,
        "ocrText": " ".join(extracted_text)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)