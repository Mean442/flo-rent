'use strict';

/* ที่เก็บข้อมูลแบบไฟล์ JSON — เขียนแบบ atomic (tmp + rename) และต่อคิวไม่ให้เขียนทับกัน */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.FLO_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = null;
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

function writeNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function init(seedFactory) {
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

  state = normalize(seedFactory());
  writeNow();
  return state;
}

function data() {
  if (!state) throw new Error('database is not initialised');
  return state;
}

function persist() {
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

function flushSync() {
  if (!state) return;
  try { writeNow(); } catch (err) { console.error('[db] flush ไม่สำเร็จ:', err.message); }
}

module.exports = { init, data, persist, flushSync, DB_FILE, DATA_DIR };
