# scinu-ecosystem

เว็บระบบ NU Smart Admin Ecosystem สำหรับผู้ใช้งาน 3 กลุ่มหลัก:

- Staff: เรียนบทเรียน ทำแบบทดสอบ และติดตามความคืบหน้า
- Admin: จัดการผู้ใช้งาน บทเรียน และแบบทดสอบ
- Management: ดูภาพรวมข้อมูลและผลการใช้งาน

## Files

- `index.html` - หน้าเข้าสู่ระบบ
- `staff.html` - หน้าผู้ใช้งานทั่วไป
- `admin.html` - หน้าจัดการผู้ใช้งาน
- `admin_content.html` - หน้าจัดการบทเรียนและแบบทดสอบ
- `management.html` - หน้าสรุปสำหรับผู้บริหาร
- `config.js` - ตั้งค่า URL ของ Google Apps Script สำหรับ GitHub Pages/local static hosting
- `api/config.js` - Vercel serverless function สำหรับอ่าน `GAS_WEB_APP_URL` จาก Environment Variable

## Setup

### Deploy on Vercel

1. สร้าง Environment Variable ชื่อ `GAS_WEB_APP_URL`
2. ใส่ URL ของ Google Apps Script Web App
3. Deploy โปรเจกต์ตามปกติ

ระบบจะโหลด config ผ่าน `/api/config` โดยไม่ต้องแก้ `config.js`

### Deploy on GitHub Pages

GitHub Pages ไม่มี serverless API route ดังนั้นให้เปิดไฟล์ `config.js` แล้วใส่ URL:

```js
window.SCINU_CONFIG = window.SCINU_CONFIG || {
    GAS_WEB_APP_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};
```

จากนั้นเปิดใช้งาน GitHub Pages จาก branch ที่ต้องการ

## Notes

- Google Apps Script Web App ควรตั้งค่า access ให้ frontend เรียกใช้งานได้
- ทุกหน้าใช้ `config.js` เป็น fallback เพื่อให้ใช้งานได้ทั้ง Vercel, GitHub Pages และ static hosting
