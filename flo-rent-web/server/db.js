'use strict';

/*
 * ที่เก็บข้อมูล FLO-RENT — 2 โหมด
 *  1) ไฟล์ JSON (รันในเครื่อง: npm start) — เขียนแบบ atomic (tmp + rename)
 *  2) Redis REST (Upstash / Vercel KV) — ใช้บน Vercel เพราะดิสก์ของ serverless เขียนถาวรไม่ได้
 *     เปิดอัตโนมัติเมื่อมี env: KV_REST_API_URL + KV_REST_API_TOKEN (หรือ UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOTE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REMOTE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REMOTE_KEY = process.env.FLO_DB_KEY || 'florent:db';
const IS_REMOTE = !!(REMOTE_URL && REMOTE_TOKEN);

const DEFAULT_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'flo-rent') : path.join(__dirname, 'data');
const DATA_DIR = process.env.FLO_DATA_DIR || DEFAULT_DIR;
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = null;
let seedFn = null;
let chain = Promise.resolve();

const EMPTY_SHAPE = {
  version: 1,
  users: [],
  sessions: [],
  items: [],
  bookings: [],
  requests: [],
  meta: {}
};

function normalize(input) {
  const db = input && typeof input === 'object' ? input : {};
  Object.keys(EMPTY_SHAPE).forEach(function (key) {
    if (Array.isArray(EMPTY_SHAPE[key])) {
      if (!Array.isArray(db[key])) db[key] = [];
    } else if (db[key] == null) {
      db[key] = EMPTY_SHAPE[key];
    }
  });
  if (!db.version) db.version = 1;
  return db;
}

/* ---------- โหมดไฟล์ ---------- */

function writeNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function init(seedFactory) {
  seedFn = seedFactory || seedFn;
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(DB_FILE)) {
    try {
      state = normalize(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
      return state;
    } catch (err) {
      const backup = DB_FILE + '.corrupt-' + Date.now();
      try { fs.renameSync(DB_FILE, backup); } catch (ignore) { /* ไม่เป็นไร */ }
      console.error('[db] ไฟล์ข้อมูลเสียหาย ย้ายไปที่ ' + path.basename(backup) + ' และสร้างชุดข้อมูลใหม่');
    }
  }

  state = normalize(seedFn());
  writeNow();
  return state;
}

/* ---------- โหมด Redis REST ---------- */

async function remote(command) {
  const response = await fetch(REMOTE_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REMOTE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  let payload = null;
  try { payload = await response.json(); } catch (err) { payload = null; }
  if (!response.ok || (payload && payload.error)) {
    throw new Error((payload && payload.error) || ('Redis HTTP ' + response.status));
  }
  return payload ? payload.result : null;
}

/*
 * โหลดข้อมูลล่าสุดเข้าหน่วยความจำ — บน Vercel เรียกทุกคำขอ (แต่ละอินสแตนซ์ไม่แชร์หน่วยความจำกัน)
 * โหมดไฟล์: โหลดครั้งเดียวแล้วใช้ต่อ
 */
async function load(seedFactory) {
  seedFn = seedFactory || seedFn;
  if (!IS_REMOTE) {
    if (!state) init(seedFn);
    return state;
  }

  let raw = await remote(['GET', REMOTE_KEY]);
  if (!raw) {
    // ครั้งแรก: สร้างข้อมูลตั้งต้น (NX กันหลายอินสแตนซ์ seed ชนกัน) แล้วอ่านค่าที่ชนะกลับมา
    await remote(['SET', REMOTE_KEY, JSON.stringify(normalize(seedFn())), 'NX']);
    raw = await remote(['GET', REMOTE_KEY]);
  }
  state = normalize(JSON.parse(raw));
  return state;
}

/* ---------- ใช้ร่วมกัน ---------- */

function data() {
  if (!state) throw new Error('database is not initialised');
  return state;
}

function persist() {
  if (IS_REMOTE) {
    const body = JSON.stringify(state); // จับภาพข้อมูล ณ ตอนที่สั่งบันทึก
    chain = chain.then(function () {
      return remote(['SET', REMOTE_KEY, body]);
    }).catch(function (err) {
      console.error('[db] บันทึกลง Redis ไม่สำเร็จ:', err.message);
    });
    return chain;
  }

  const snapshot = state;
  chain = chain.then(function () {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('[db] เขียนไฟล์ข้อมูลไม่สำเร็จ:', err.message);
    }
  });
  return chain;
}

/* รอให้การบันทึกที่ค้างอยู่เสร็จ (serverless ต้องรอก่อนตอบ ไม่งั้นฟังก์ชันอาจถูกแช่แข็งก่อนเขียนเสร็จ) */
function settle() { return chain; }

function flushSync() {
  if (!state || IS_REMOTE) return;
  try { writeNow(); } catch (err) { console.error('[db] flush ไม่สำเร็จ:', err.message); }
}

module.exports = { init, load, data, persist, settle, flushSync, DB_FILE, DATA_DIR, IS_REMOTE };
