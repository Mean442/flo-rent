'use strict';

/*
 * จุดเข้า serverless ของ Vercel — ทุกคำขอ /api/* ถูก rewrite มาที่ไฟล์นี้ (ดู vercel.json)
 * ทำ 3 อย่างที่ server.js แบบ listen() ทำเองไม่ได้บน Vercel:
 *  1) โหลดข้อมูลจาก Redis ทุกคำขอ (ฟังก์ชันแต่ละตัวไม่แชร์หน่วยความจำ)
 *  2) เรียงคิวคำขอภายในอินสแตนซ์เดียวกัน กันเขียนทับกันเอง
 *  3) รอให้บันทึกเสร็จก่อนปิดการตอบ
 */

const db = require('../server/db');
const app = require('../server/server');

let queue = Promise.resolve();

module.exports = function handler(req, res) {
  const run = queue.then(async function () {
    try {
      await db.load(app.seed.build);
    } catch (err) {
      console.error('[db] โหลดข้อมูลไม่สำเร็จ:', err.message);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ KV_REST_API_URL / KV_REST_API_TOKEN ใน Vercel' }));
      return;
    }

    const realEnd = res.end.bind(res);
    res.end = function () {
      const args = arguments;
      db.settle().then(function () { realEnd.apply(null, args); });
      return res;
    };

    await app.respond(req, res);
    await db.settle();
  });
  queue = run.catch(function () { /* ไม่ให้คิวพังต่อ */ });
  return run;
};
