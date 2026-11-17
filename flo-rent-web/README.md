# FLO-RENT

เว็บไซต์เช่า / ยืมสินค้า (rental marketplace) จากเด็ค **FLO-RENT — HMMM! & CO.**
ประกอบด้วย frontend แบบ static + backend Node.js ที่ไม่ต้องติดตั้ง dependency ใด ๆ และหน้าแอดมินสำหรับดูแลระบบ

## สิ่งที่ต้องมี

- Node.js **18 ขึ้นไป** (ทดสอบบน v22)
- ไม่ต้อง `npm install` — เซิร์ฟเวอร์ใช้โมดูลมาตรฐานของ Node ทั้งหมด

## วิธีรัน

```bash
cd flo-rent-web
npm start
```

แล้วเปิด **http://127.0.0.1:4173**

> เปิดไฟล์ `index.html` ด้วยการดับเบิลคลิกไม่ได้ เพราะหน้าเว็บต้องเรียก API — ถ้าเปิดแบบ `file://` จะมีข้อความบอกวิธีรันเซิร์ฟเวอร์ขึ้นมาแทน

เปลี่ยนพอร์ต/โฮสต์ได้ด้วย environment variable:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

## บัญชีทดลอง

| บทบาท | อีเมล | รหัสผ่าน |
| --- | --- | --- |
| ผู้ใช้ | `demo@flo-rent.co` | `demo1234` |
| ผู้ให้เช่า | `owner@flo-rent.co` | `owner1234` |
| ผู้ดูแลระบบ | `admin@flo-rent.co` | `admin1234` |

หน้าแอดมินอยู่ที่ `/admin.html` (เข้าด้วยบัญชี admin เท่านั้น) — หน้า login มีปุ่ม “ใช้บัญชีทดลอง” ให้กรอกให้อัตโนมัติ

## ฟีเจอร์

**ผู้ใช้ทั่วไป**
- หน้าแรก: ค้นหา, 6 หมวดหมู่, สินค้ายอดนิยม, HOW TO USE, Brand value
- ค้นหา/กรองตามคำสำคัญ หมวดหมู่ ช่วงราคา/วัน และเรียงตามราคา/คะแนน (อัปเดต URL)
- หน้ารายละเอียด: เงื่อนไขการเช่า, คำนวณค่าเช่า × วัน + มัดจำ, จองได้เมื่อเข้าสู่ระบบ
- สมัครสมาชิก/เข้าสู่ระบบ (บังคับอายุ 15 ปีขึ้นไป), โปรไฟล์, แก้ไขข้อมูล, เลือกอวตาร
- ประวัติการจอง: กรองตามสถานะ, ยกเลิกการจองที่รอยืนยัน, ยืนยันคืนสินค้า
- ลงประกาศให้เช่า (ผูกกับบัญชี), ประกาศของฉัน, ประกาศตามหา (LOOK FOR)

**แอดมิน**
- ภาพรวม: จำนวนผู้ใช้/ประกาศ/การจอง, ยอดรวม, สถานะการจองล่าสุด
- ผู้ใช้: ค้นหา, ตั้ง/ลดสิทธิ์แอดมิน, ระงับ/เปิดใช้บัญชี (ระงับแล้ว token ถูกตัดทันที)
- ประกาศ: ค้นหา, ซ่อน/เผยแพร่, ลบ
- การจอง: กรองตามสถานะ, เปลี่ยนสถานะได้ทุกค่า
- คำขอตามหา: ดูและลบ

## โครงสร้างไฟล์

```
flo-rent-web/
├── public/            # หน้าเว็บทั้งหมด (Vercel เสิร์ฟโฟลเดอร์นี้เป็นไฟล์ static)
│   ├── index.html browse.html item.html post.html look-for.html
│   ├── login.html profile.html bookings.html admin.html
│   ├── css/style.css
│   └── js/
├── server/
│   ├── server.js    # HTTP server + REST API + static files
│   ├── db.js        # ที่เก็บ JSON แบบ atomic write
│   ├── auth.js      # scrypt hash + token
│   └── seed.js      # ข้อมูลตั้งต้น
├── api/index.js     # จุดเข้า serverless ของ Vercel
├── vercel.json
└── package.json     # npm start
```

ข้อมูลถูกเก็บที่ `server/data/db.json` (สร้างอัตโนมัติครั้งแรก)

## API

ทุก endpoint อยู่ใต้ `/api` — ส่ง token ด้วย `Authorization: Bearer <token>`

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/health` | ตรวจสถานะเซิร์ฟเวอร์ |
| GET | `/api/categories` | หมวดหมู่ |
| GET | `/api/items?q&cat&min&max&sort` | ค้นหาสินค้าที่เผยแพร่ |
| GET | `/api/items?mine=1` | ประกาศของฉัน (ต้องล็อกอิน) |
| GET | `/api/items/:id` | รายละเอียดสินค้า |
| POST | `/api/items` | ลงประกาศ |
| PATCH | `/api/items/:id` | แก้ไข/ซ่อนประกาศ (เจ้าของหรือแอดมิน) |
| DELETE | `/api/items/:id` | ลบประกาศ (เจ้าของหรือแอดมิน) |
| POST | `/api/auth/register` | สมัครสมาชิก (อายุ ≥ 15) |
| POST | `/api/auth/login` | เข้าสู่ระบบ → token |
| POST | `/api/auth/logout` | ออกจากระบบ |
| GET | `/api/me` | ข้อมูลบัญชี + สถิติ |
| PATCH | `/api/me` | แก้ไขโปรไฟล์ |
| GET | `/api/bookings` | การจองของฉัน |
| POST | `/api/bookings` | จองสินค้า (`itemId`, `start`, `end`) |
| PATCH | `/api/bookings/:code` | `{action:"cancel"}` หรือ `{action:"return"}` |
| GET | `/api/requests` | คำขอตามหา |
| POST | `/api/requests` | ประกาศตามหา |
| GET | `/api/admin/stats` | สถิติภาพรวม (แอดมิน) |
| GET | `/api/admin/users?q` | รายชื่อผู้ใช้ (แอดมิน) |
| PATCH | `/api/admin/users/:id` | เปลี่ยน `role` / `status` (แอดมิน) |
| GET | `/api/admin/items?q` | ประกาศทั้งหมด (แอดมิน) |
| PATCH | `/api/admin/items/:id` | ซ่อน/เผยแพร่ (แอดมิน) |
| DELETE | `/api/admin/items/:id` | ลบประกาศ (แอดมิน) |
| GET | `/api/admin/bookings?status` | การจองทั้งหมด (แอดมิน) |
| PATCH | `/api/admin/bookings/:code` | เปลี่ยนสถานะการจอง (แอดมิน) |
| GET | `/api/admin/requests` | คำขอทั้งหมด (แอดมิน) |
| DELETE | `/api/admin/requests/:id` | ลบคำขอ (แอดมิน) |

## รีเซ็ตข้อมูล

หยุดเซิร์ฟเวอร์แล้วลบไฟล์ข้อมูล:

```bash
rm -rf server/data
npm start
```

ระบบจะสร้างข้อมูลตั้งต้นใหม่ (บัญชีทดลอง + สินค้า 16 ชิ้น + การจองตัวอย่าง)

## ความปลอดภัย (ระดับเดโม)

- รหัสผ่านเก็บเป็น **scrypt** พร้อม salt ต่อบัญชี ไม่เก็บข้อความตรง ๆ
- session token สุ่ม 24 ไบต์ (hex) อายุ 14 วัน เก็บฝั่งเซิร์ฟเวอร์และเพิกถอนได้
- จำกัดจำนวนครั้งการ login/register (20 ครั้ง/นาที ต่อ IP)
- ตรวจ input ทุกจุด, จำกัดขนาด body 64KB, ป้องกัน path traversal ตอนเสิร์ฟไฟล์
- ตั้ง header `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- ประกาศ/การจองแก้ได้เฉพาะเจ้าของ (หรือแอดมิน)

ข้อจำกัดที่ควรรู้ก่อนใช้จริง: ข้อมูลเก็บเป็นไฟล์ JSON เครื่องเดียว (ไม่รองรับหลายอินสแตนซ์), ไม่มี HTTPS/อีเมลยืนยันตัวตน/ระบบชำระเงินจริง, และควรเปลี่ยนรหัสผ่านบัญชีทดลองก่อนใช้งานสาธารณะ

## Deploy บน Vercel

Vercel รันเซิร์ฟเวอร์ที่ `listen()` ค้างไว้ไม่ได้ และดิสก์เขียนถาวรไม่ได้ จึงแยกเป็น: ไฟล์ใน `public/` เสิร์ฟเป็น static, ส่วน `/api/*` รันเป็น serverless function (`api/index.js`) และเก็บข้อมูลใน Redis

1. Vercel → Project → Settings → General → **Root Directory = `flo-rent-web`**
2. Project → **Storage → Marketplace → Upstash for Redis** (ฟรี) → Connect to Project
   ระบบจะเพิ่ม env `KV_REST_API_URL` และ `KV_REST_API_TOKEN` ให้เอง
3. **Redeploy** — ครั้งแรกที่มีคนเรียก API ระบบจะสร้างข้อมูลตั้งต้น (บัญชีทดลอง + สินค้า 16 ชิ้น) ลง Redis ให้เอง
4. ก่อนใช้จริง เปลี่ยนรหัสผ่านบัญชีทดลองทั้ง 3 บัญชี

ถ้าไม่ตั้ง Redis ระบบยังรันได้ แต่ใช้ `/tmp` ของแต่ละอินสแตนซ์ ข้อมูลจะหายและไม่ตรงกันระหว่างอินสแตนซ์
