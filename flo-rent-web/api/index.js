'use strict';

/*
 * จุดเข้า serverless ของ Vercel — ทุกคำขอ /api/* ถูก rewrite มาที่ไฟล์นี้ (ดู vercel.json)
 *
 * ฟังก์ชัน serverless หลายตัวทำงานพร้อมกันได้และไม่แชร์หน่วยความจำ ดังนั้นแต่ละคำขอทำแบบ optimistic concurrency:
 *   โหลดข้อมูล+เวอร์ชัน → ประมวลผลคำขอ (เก็บคำตอบไว้ใน buffer ยังไม่ส่ง) → commit แบบ compare-and-set
 *   ถ้ามีคนอื่นเขียนแทรกก่อน (commit ล้มเหลว) → ทิ้งผลนี้ โหลดใหม่ แล้วทำคำขอเดิมซ้ำ
 * จึงไม่มี "สมัคร/ล็อกอินสำเร็จแต่ session หาย" อีก ส่วนคำขอแบบอ่านอย่างเดียวไม่ต้อง commit
 */

const db = require('../server/db');
const app = require('../server/server');

const MAX_ATTEMPTS = 8;

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

/* ตัวแทน res ที่เก็บคำตอบไว้ก่อน ส่งจริงเมื่อ commit สำเร็จ */
function bufferedResponse() {
  const headers = {};
  const chunks = [];
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: function (name, value) { headers[String(name).toLowerCase()] = value; },
    getHeader: function (name) { return headers[String(name).toLowerCase()]; },
    writeHead: function (code, given) {
      res.statusCode = code;
      Object.keys(given || {}).forEach(function (key) { headers[key.toLowerCase()] = given[key]; });
      res.headersSent = true;
      return res;
    },
    write: function (chunk) { if (chunk) chunks.push(Buffer.from(chunk)); return true; },
    end: function (chunk) { if (chunk) chunks.push(Buffer.from(chunk)); res.headersSent = true; return res; }
  };
  res.flushTo = function (real) {
    real.statusCode = res.statusCode;
    Object.keys(headers).forEach(function (key) { real.setHeader(key, headers[key]); });
    real.end(Buffer.concat(chunks));
  };
  return res;
}

function sendBusy(res, message, status) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: message }));
}

async function serve(req, res) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.load(app.seed.build);
    } catch (err) {
      console.error('[db] โหลดข้อมูลไม่สำเร็จ:', err.message);
      return sendBusy(res, 'เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ KV_REST_API_URL / KV_REST_API_TOKEN ใน Vercel', 503);
    }

    const out = bufferedResponse();
    await app.respond(req, out);

    let committed;
    try {
      committed = await db.commit();
    } catch (err) {
      console.error('[db] บันทึกข้อมูลไม่สำเร็จ:', err.message);
      return sendBusy(res, 'บันทึกข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง', 503);
    }

    if (committed) {
      await db.settle();
      return out.flushTo(res);
    }
    await sleep(15 + Math.random() * 60 * attempt); // มีคนเขียนแทรก → รอสุ่มสั้น ๆ แล้วทำซ้ำ
  }
  return sendBusy(res, 'ระบบกำลังมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่อีกครั้ง', 503);
}

/* ภายในอินสแตนซ์เดียวกันทำทีละคำขอ (state อยู่ในหน่วยความจำร่วมกัน) */
let queue = Promise.resolve();

module.exports = function handler(req, res) {
  const run = queue.then(function () { return serve(req, res); });
  queue = run.catch(function () { /* ไม่ให้คิวพังต่อ */ });
  return run;
};
