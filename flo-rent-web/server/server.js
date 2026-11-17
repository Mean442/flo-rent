'use strict';

/*
 * FLO-RENT backend — Node.js มาตรฐาน ไม่ต้องติดตั้ง dependency
 * รัน:  node server/server.js   (หรือ npm start)  →  http://127.0.0.1:4173
 * ข้อมูลเก็บที่ server/data/db.json (กำหนดโฟลเดอร์เองได้ด้วย FLO_DATA_DIR)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const auth = require('./auth');
const db = require('./db');
const seed = require('./seed');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(__dirname, '..', 'public');
const MAX_BODY = 64 * 1024;
const SESSION_TTL = 14 * 24 * 60 * 60 * 1000;
const DAY = 86400000;

const CATEGORIES = seed.CATEGORIES;
const CATEGORY_KEYS = CATEGORIES.map(function (cat) { return cat.key; });

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/* ---------- helpers ---------- */

function store() { return db.data(); }

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, SECURITY_HEADERS));
  res.end(body);
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function asString(value, label, options) {
  const opts = Object.assign({ min: 0, max: 400, required: true }, options || {});
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text && opts.required) fail(400, label + ' จำเป็นต้องกรอก');
  if (text && text.length < opts.min) fail(400, label + ' ต้องยาวอย่างน้อย ' + opts.min + ' ตัวอักษร');
  if (text.length > opts.max) fail(400, label + ' ยาวเกิน ' + opts.max + ' ตัวอักษร');
  return text;
}

function asInt(value, label, options) {
  const opts = Object.assign({ min: 0, max: 10000000, required: true }, options || {});
  if (value === undefined || value === null || value === '') {
    if (opts.required) fail(400, label + ' จำเป็นต้องกรอก');
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || Math.round(num) !== num) fail(400, label + ' ต้องเป็นจำนวนเต็ม');
  if (num < opts.min || num > opts.max) {
    fail(400, label + ' ต้องอยู่ระหว่าง ' + opts.min + ' ถึง ' + opts.max);
  }
  return num;
}

function asEnum(value, label, allowed) {
  if (allowed.indexOf(value) === -1) fail(400, label + ' ไม่ถูกต้อง');
  return value;
}

function catOf(key) {
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    if (CATEGORIES[i].key === key) return CATEGORIES[i];
  }
  return { key: 'general', name: 'อุปกรณ์ทั่วไป', emoji: '📦' };
}

function publicUser(user) {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    age: user.age, location: user.location, avatar: user.avatar, bio: user.bio,
    role: user.role, status: user.status, rating: user.rating, reviews: user.reviews,
    joinedAt: user.joinedAt
  };
}

function publicItem(item) {
  return {
    id: item.id, cat: item.cat, title: item.title, emoji: item.emoji,
    price: item.price, deposit: item.deposit, owner: item.owner, ownerId: item.ownerId,
    rating: item.rating, reviews: item.reviews, location: item.location,
    tags: item.tags || [], desc: item.desc, terms: item.terms,
    status: item.status, createdAt: item.createdAt
  };
}

function findUserByEmail(email) {
  const target = String(email || '').toLowerCase();
  return store().users.find(function (user) { return user.email === target; }) || null;
}

function cleanupSessions() {
  const now = Date.now();
  const sessions = store().sessions;
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    if (!sessions[i] || sessions[i].expiresAt <= now) sessions.splice(i, 1);
  }
}

function currentUser(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer ([a-f0-9]{16,64})$/i.exec(header.trim());
  if (!match) return null;
  cleanupSessions();
  const token = match[1];
  const session = store().sessions.find(function (item) { return item.token === token; });
  if (!session) return null;
  const user = store().users.find(function (item) { return item.id === session.userId; });
  if (!user || user.status !== 'active') return null;
  return user;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) fail(401, 'กรุณาเข้าสู่ระบบก่อน');
  return user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') fail(403, 'เฉพาะผู้ดูแลระบบเท่านั้น');
  return user;
}

function createSession(user) {
  const sessions = store().sessions;
  const mine = sessions.filter(function (item) { return item.userId === user.id; });
  if (mine.length >= 5) {
    const oldest = mine.sort(function (a, b) { return a.createdAt - b.createdAt; })[0];
    store().sessions = sessions.filter(function (item) { return item.token !== oldest.token; });
  }
  const token = auth.newToken();
  store().sessions.push({
    token: token,
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL
  });
  db.persist();
  return token;
}

function readBody(req) {
  // บน Vercel ตัว runtime อ่านและ parse body ให้แล้ว (req.body) สตรีมจึงถูกใช้หมด — ถ้ารอ 'data'/'end' คำขอ POST จะค้างจน timeout
  if (req.body !== undefined && req.body !== null) {
    const given = req.body;
    if (Buffer.isBuffer(given) || typeof given === 'string') {
      const text = Buffer.isBuffer(given) ? given.toString('utf8') : given;
      if (Buffer.byteLength(text) > MAX_BODY) { const big = new Error('ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป'); big.status = 413; return Promise.reject(big); }
      if (!text) return Promise.resolve({});
      try { return Promise.resolve(JSON.parse(text)); } catch (err) { const bad = new Error('รูปแบบ JSON ไม่ถูกต้อง'); bad.status = 400; return Promise.reject(bad); }
    }
    return Promise.resolve(given);
  }
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) {
        const err = new Error('ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        const bad = new Error('รูปแบบ JSON ไม่ถูกต้อง');
        bad.status = 400;
        reject(bad);
      }
    });
    req.on('error', reject);
  });
}

const rateBuckets = new Map();

function allowAttempt(req, bucket) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = bucket + ':' + (forwarded || req.socket.remoteAddress || 'local');
  const now = Date.now();
  const record = rateBuckets.get(key);
  if (!record || record.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  record.count += 1;
  return record.count <= 20;
}

function parseTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list
    .map(function (tag) { return String(tag).trim(); })
    .filter(Boolean)
    .slice(0, 8)
    .map(function (tag) { return tag.slice(0, 24); });
}

function haystack(item) {
  return [item.title, item.owner, item.location, item.desc, item.terms, catOf(item.cat).name]
    .concat(item.tags || [])
    .join(' ')
    .toLowerCase();
}

function sortItems(list, sort) {
  if (sort === 'price-asc') return list.sort(function (a, b) { return a.price - b.price; });
  if (sort === 'price-desc') return list.sort(function (a, b) { return b.price - a.price; });
  if (sort === 'rating') return list.sort(function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; });
  if (sort === 'newest') return list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return list.sort(function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; });
}

function parseDay(value, label) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(400, label + ' ต้องอยู่ในรูปแบบ YYYY-MM-DD');
  const date = new Date(text + 'T00:00:00Z');
  if (isNaN(date.getTime())) fail(400, label + ' ไม่ใช่วันที่ที่ถูกต้อง');
  return date;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function newBookingCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = 'FLR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const exists = store().bookings.some(function (booking) { return booking.code === code; });
    if (!exists) return code;
  }
  fail(500, 'สร้างรหัสการจองไม่สำเร็จ กรุณาลองใหม่');
}

/* ---------- static files ---------- */

function notFound(res) {
  const body = '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ไม่พบหน้านี้ · FLO-RENT</title>' +
    '<link rel="stylesheet" href="/css/style.css"></head><body><div class="page"><main class="container">' +
    '<div class="empty"><h1 class="display display-sm">ไม่พบหน้านี้ (404)</h1>' +
    '<p class="muted">ลิงก์อาจไม่ถูกต้องหรือไฟล์ถูกย้ายแล้ว</p>' +
    '<a class="btn btn-cream" href="/index.html">กลับหน้าแรก</a></div></main></div></body></html>';
  res.writeHead(404, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }, SECURITY_HEADERS));
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (err) { return notFound(res); }
  if (decoded === '/' || decoded === '') decoded = '/index.html';

  const resolved = path.resolve(ROOT, '.' + decoded);
  const relative = path.relative(ROOT, resolved);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return notFound(res);
  const parts = relative.split(path.sep);
  if (parts[0] === 'server' || parts[0] === 'node_modules' || parts.some(function (part) { return part.startsWith('.'); })) {
    return notFound(res);
  }
  if (parts[0] === 'package.json') return notFound(res);

  fs.stat(resolved, function (err, stat) {
    if (err || !stat.isFile()) return notFound(res);
    const headers = Object.assign({
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    }, SECURITY_HEADERS);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(resolved);
    stream.on('error', function () { res.end(); });
    stream.pipe(res);
  });
}

/* ---------- API ---------- */

async function handleApi(req, res, url) {
  const method = req.method.toUpperCase();
  const pathname = url.pathname.replace(/\/+$/, '');
  const key = method + ' ' + pathname;

  if (key === 'GET /api/health') {
    return sendJson(res, 200, { ok: true, name: 'FLO-RENT API', time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
  }

  if (key === 'GET /api/categories') {
    return sendJson(res, 200, { categories: CATEGORIES });
  }

  /* ---- auth ---- */

  if (key === 'POST /api/auth/register') {
    if (!allowAttempt(req, 'register')) fail(429, 'พยายามสมัครหลายครั้งเกินไป กรุณารอสักครู่');
    const payload = await readBody(req);
    const name = asString(payload.name, 'ชื่อที่ใช้แสดง', { min: 2, max: 60 });
    const email = asString(payload.email, 'อีเมล', { max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(400, 'รูปแบบอีเมลไม่ถูกต้อง');
    const password = String(payload.password || '');
    if (password.length < 6) fail(400, 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
    if (password.length > 200) fail(400, 'รหัสผ่านยาวเกินไป');
    const age = asInt(payload.age, 'อายุ', { min: 15, max: 99 });
    if (findUserByEmail(email)) fail(409, 'อีเมลนี้มีบัญชีอยู่แล้ว');

    const user = {
      id: auth.newId('u'),
      name: name,
      email: email,
      passHash: auth.hashPassword(password),
      role: 'user',
      status: 'active',
      phone: asString(payload.phone, 'เบอร์โทร', { max: 30, required: false }) || '—',
      age: age,
      location: asString(payload.location, 'พื้นที่', { max: 80, required: false }) || 'กรุงเทพฯ',
      avatar: asString(payload.avatar, 'รูปโปรไฟล์', { max: 8, required: false }) || '🙂',
      bio: '',
      rating: 5,
      reviews: 0,
      joinedAt: new Date().toISOString()
    };
    store().users.push(user);
    db.persist();
    const token = createSession(user);
    return sendJson(res, 201, { token: token, user: publicUser(user) });
  }

  if (key === 'POST /api/auth/login') {
    if (!allowAttempt(req, 'login')) fail(429, 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่');
    const payload = await readBody(req);
    const email = asString(payload.email, 'อีเมล', { max: 120 }).toLowerCase();
    const password = String(payload.password || '');
    const user = findUserByEmail(email);
    if (!user || !auth.verifyPassword(password, user.passHash)) fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    if (user.status !== 'active') fail(403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อทีมงาน');
    const token = createSession(user);
    return sendJson(res, 200, { token: token, user: publicUser(user) });
  }

  if (key === 'POST /api/auth/logout') {
    const header = req.headers.authorization || '';
    const match = /^Bearer ([a-f0-9]{16,64})$/i.exec(header.trim());
    if (match) {
      store().sessions = store().sessions.filter(function (session) { return session.token !== match[1]; });
      db.persist();
    }
    return sendJson(res, 200, { ok: true });
  }

  if (key === 'GET /api/me') {
    const user = requireUser(req);
    const bookings = store().bookings.filter(function (booking) { return booking.userId === user.id; });
    const listings = store().items.filter(function (item) { return item.ownerId === user.id; });
    return sendJson(res, 200, {
      user: publicUser(user),
      stats: {
        bookings: bookings.length,
        active: bookings.filter(function (b) { return b.status === 'pending' || b.status === 'active'; }).length,
        spent: bookings.filter(function (b) { return b.status !== 'cancelled'; })
          .reduce(function (sum, b) { return sum + Number(b.total || 0); }, 0),
        listings: listings.length
      }
    });
  }

  if (key === 'PATCH /api/me') {
    const user = requireUser(req);
    const payload = await readBody(req);
    if (payload.name !== undefined) user.name = asString(payload.name, 'ชื่อที่ใช้แสดง', { min: 2, max: 60 });
    if (payload.phone !== undefined) user.phone = asString(payload.phone, 'เบอร์โทร', { max: 30, required: false }) || '—';
    if (payload.age !== undefined) user.age = asInt(payload.age, 'อายุ', { min: 15, max: 99 });
    if (payload.location !== undefined) user.location = asString(payload.location, 'พื้นที่', { max: 80, required: false }) || '—';
    if (payload.bio !== undefined) user.bio = asString(payload.bio, 'แนะนำตัว', { max: 300, required: false });
    if (payload.avatar !== undefined) user.avatar = asString(payload.avatar, 'รูปโปรไฟล์', { max: 8, required: false }) || '🙂';

    store().items.forEach(function (item) {
      if (item.ownerId === user.id) item.owner = user.name;
    });

    db.persist();
    return sendJson(res, 200, { user: publicUser(user) });
  }

  /* ---- items ---- */

  if (key === 'GET /api/items') {
    const user = currentUser(req);
    const mine = url.searchParams.get('mine') === '1';
    if (mine && !user) fail(401, 'กรุณาเข้าสู่ระบบก่อน');

    let items = store().items.slice();
    if (mine) {
      items = items.filter(function (item) { return item.ownerId === user.id; });
    } else {
      items = items.filter(function (item) { return item.status === 'published'; });
    }

    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const cat = String(url.searchParams.get('cat') || 'all');
    const min = Number(url.searchParams.get('min') || 0);
    const max = Number(url.searchParams.get('max') || 0);

    if (cat !== 'all') items = items.filter(function (item) { return item.cat === cat; });
    if (min > 0) items = items.filter(function (item) { return item.price >= min; });
    if (max > 0) items = items.filter(function (item) { return item.price <= max; });
    if (q) items = items.filter(function (item) { return haystack(item).indexOf(q) !== -1; });

    sortItems(items, String(url.searchParams.get('sort') || 'recommended'));
    return sendJson(res, 200, { items: items.map(publicItem), count: items.length });
  }

  if (key === 'POST /api/items') {
    const user = requireUser(req);
    const payload = await readBody(req);
    const cat = asEnum(String(payload.cat || ''), 'หมวดหมู่', CATEGORY_KEYS);
    const item = {
      id: auth.newId('usr'),
      ownerId: user.id,
      owner: user.name,
      cat: cat,
      title: asString(payload.title, 'ชื่อสินค้า', { min: 2, max: 120 }),
      emoji: catOf(cat).emoji,
      price: asInt(payload.price, 'ราคาเช่าต่อวัน', { min: 0, max: 1000000 }),
      deposit: asInt(payload.deposit === undefined ? 0 : payload.deposit, 'เงินมัดจำ', { min: 0, max: 5000000, required: false }) || 0,
      rating: 5,
      reviews: 0,
      location: asString(payload.location, 'พื้นที่', { max: 80, required: false }) || 'ไม่ระบุพื้นที่',
      tags: parseTags(payload.tags),
      desc: asString(payload.desc, 'รายละเอียด', { max: 1200, required: false }) || 'ยังไม่มีรายละเอียด',
      terms: asString(payload.terms, 'เงื่อนไข', { max: 600, required: false }) || 'ตกลงเงื่อนไขกับผู้เช่าโดยตรง · คืนของในสภาพเรียบร้อย',
      status: 'published',
      createdAt: new Date().toISOString()
    };
    store().items.unshift(item);
    db.persist();
    return sendJson(res, 201, { item: publicItem(item) });
  }

  const itemMatch = /^\/api\/items\/([\w-]+)$/.exec(pathname);
  if (itemMatch) {
    const id = itemMatch[1];
    const item = store().items.find(function (entry) { return entry.id === id; });
    if (!item) fail(404, 'ไม่พบสินค้าชิ้นนี้');
    const viewer = currentUser(req);
    const isOwner = viewer && viewer.id === item.ownerId;
    const isAdmin = viewer && viewer.role === 'admin';

    if (key === 'GET /api/items/' + id) {
      if (item.status !== 'published' && !isOwner && !isAdmin) fail(404, 'ไม่พบสินค้าชิ้นนี้');
      return sendJson(res, 200, { item: publicItem(item) });
    }

    if (method === 'PATCH') {
      if (!isOwner && !isAdmin) fail(403, 'แก้ไขได้เฉพาะประกาศของตัวเอง');
      const payload = await readBody(req);
      if (payload.title !== undefined) item.title = asString(payload.title, 'ชื่อสินค้า', { min: 2, max: 120 });
      if (payload.cat !== undefined) {
        item.cat = asEnum(String(payload.cat), 'หมวดหมู่', CATEGORY_KEYS);
        item.emoji = catOf(item.cat).emoji;
      }
      if (payload.price !== undefined) item.price = asInt(payload.price, 'ราคาเช่าต่อวัน', { min: 0, max: 1000000 });
      if (payload.deposit !== undefined) item.deposit = asInt(payload.deposit, 'เงินมัดจำ', { min: 0, max: 5000000, required: false }) || 0;
      if (payload.location !== undefined) item.location = asString(payload.location, 'พื้นที่', { max: 80, required: false }) || 'ไม่ระบุพื้นที่';
      if (payload.tags !== undefined) item.tags = parseTags(payload.tags);
      if (payload.desc !== undefined) item.desc = asString(payload.desc, 'รายละเอียด', { max: 1200, required: false });
      if (payload.terms !== undefined) item.terms = asString(payload.terms, 'เงื่อนไข', { max: 600, required: false });
      if (payload.status !== undefined) item.status = asEnum(String(payload.status), 'สถานะประกาศ', ['published', 'hidden']);
      db.persist();
      return sendJson(res, 200, { item: publicItem(item) });
    }

    if (method === 'DELETE') {
      if (!isOwner && !isAdmin) fail(403, 'ลบได้เฉพาะประกาศของตัวเอง');
      store().items = store().items.filter(function (entry) { return entry.id !== id; });
      db.persist();
      return sendJson(res, 200, { ok: true });
    }
  }

  /* ---- bookings ---- */

  if (key === 'GET /api/bookings') {
    const user = requireUser(req);
    const list = store().bookings
      .filter(function (booking) { return booking.userId === user.id; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return sendJson(res, 200, { bookings: list });
  }

  if (key === 'POST /api/bookings') {
    const user = requireUser(req);
    const payload = await readBody(req);
    const item = store().items.find(function (entry) { return entry.id === String(payload.itemId || ''); });
    if (!item) fail(404, 'ไม่พบสินค้าชิ้นนี้');
    if (item.status !== 'published' && item.ownerId !== user.id) fail(409, 'สินค้านี้ปิดรับการจองอยู่');
    if (item.ownerId === user.id) fail(400, 'ไม่สามารถจองประกาศของตัวเองได้');

    const start = parseDay(payload.start, 'วันที่เริ่มเช่า');
    const end = parseDay(payload.end, 'วันที่คืน');
    if (start < startOfTodayUtc()) fail(400, 'วันที่เริ่มเช่าต้องไม่เป็นวันในอดีต');
    const days = Math.round((end - start) / DAY);
    if (days < 1) fail(400, 'วันที่คืนต้องอยู่หลังวันที่เริ่มเช่า');
    if (days > 90) fail(400, 'จองได้ครั้งละไม่เกิน 90 วัน');

    const total = item.price * days + item.deposit;
    const booking = {
      code: newBookingCode(),
      itemId: item.id,
      itemTitle: item.title,
      itemCat: item.cat,
      itemEmoji: item.emoji,
      owner: item.owner,
      ownerId: item.ownerId,
      userId: user.id,
      userName: user.name,
      status: 'pending',
      start: String(payload.start),
      end: String(payload.end),
      days: days,
      dayPrice: item.price,
      deposit: item.deposit,
      total: total,
      createdAt: new Date().toISOString()
    };
    store().bookings.unshift(booking);
    db.persist();
    return sendJson(res, 201, { booking: booking });
  }

  const bookingMatch = /^\/api\/bookings\/([\w-]+)$/.exec(pathname);
  if (bookingMatch && method === 'PATCH') {
    const user = requireUser(req);
    const code = bookingMatch[1];
    const booking = store().bookings.find(function (entry) { return entry.code === code; });
    if (!booking) fail(404, 'ไม่พบการจองนี้');
    if (booking.userId !== user.id && user.role !== 'admin') fail(403, 'จัดการได้เฉพาะการจองของตัวเอง');

    const payload = await readBody(req);
    const action = asEnum(String(payload.action || ''), 'การกระทำ', ['cancel', 'return']);

    if (action === 'cancel') {
      if (booking.status !== 'pending' && user.role !== 'admin') fail(409, 'ยกเลิกได้เฉพาะการจองที่ยังไม่เริ่มใช้งาน');
      booking.status = 'cancelled';
      booking.cancelledAt = new Date().toISOString();
    } else {
      if (booking.status !== 'active' && booking.status !== 'pending' && user.role !== 'admin') {
        fail(409, 'คืนสินค้าได้เฉพาะการจองที่กำลังใช้งาน');
      }
      booking.status = 'returned';
      booking.returnedAt = new Date().toISOString();
    }

    db.persist();
    return sendJson(res, 200, { booking: booking });
  }

  /* ---- look for requests ---- */

  if (key === 'GET /api/requests') {
    const list = store().requests.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return sendJson(res, 200, { requests: list });
  }

  if (key === 'POST /api/requests') {
    const user = requireUser(req);
    const payload = await readBody(req);
    const request = {
      id: auth.newId('rq'),
      want: asString(payload.want, 'สิ่งที่ต้องการเช่า', { min: 2, max: 160 }),
      cat: asEnum(String(payload.cat || 'all'), 'หมวดหมู่', ['all'].concat(CATEGORY_KEYS)),
      budget: asInt(payload.budget === undefined ? 0 : payload.budget, 'งบต่อวัน', { min: 0, max: 1000000, required: false }) || 0,
      when: asString(payload.when, 'ช่วงวันที่', { max: 60, required: false }) || 'ไม่ระบุ',
      name: asString(payload.name, 'ชื่อผู้ประกาศ', { max: 60, required: false }) || user.name,
      userId: user.id,
      createdAt: new Date().toISOString()
    };
    store().requests.unshift(request);
    db.persist();
    return sendJson(res, 201, { request: request });
  }

  /* ---- admin ---- */

  if (key === 'GET /api/admin/stats') {
    requireAdmin(req);
    const users = store().users;
    const items = store().items;
    const bookings = store().bookings;
    const statuses = ['pending', 'active', 'returned', 'cancelled'];
    const byStatus = {};
    statuses.forEach(function (status) {
      byStatus[status] = bookings.filter(function (booking) { return booking.status === status; }).length;
    });

    return sendJson(res, 200, {
      users: users.length,
      suspended: users.filter(function (user) { return user.status === 'suspended'; }).length,
      items: items.length,
      published: items.filter(function (item) { return item.status === 'published'; }).length,
      hidden: items.filter(function (item) { return item.status === 'hidden'; }).length,
      bookings: bookings.length,
      byStatus: byStatus,
      revenue: bookings.filter(function (booking) { return booking.status !== 'cancelled'; })
        .reduce(function (sum, booking) { return sum + Number(booking.total || 0); }, 0),
      requests: store().requests.length,
      recentBookings: bookings.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      }).slice(0, 6)
    });
  }

  if (key === 'GET /api/admin/users') {
    requireAdmin(req);
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const bookings = store().bookings;
    let users = store().users.map(function (user) {
      const mine = bookings.filter(function (booking) { return booking.userId === user.id; });
      return Object.assign(publicUser(user), {
        bookingCount: mine.length,
        spent: mine.filter(function (b) { return b.status !== 'cancelled'; })
          .reduce(function (sum, b) { return sum + Number(b.total || 0); }, 0),
        listingCount: store().items.filter(function (item) { return item.ownerId === user.id; }).length
      });
    });
    if (q) users = users.filter(function (user) { return (user.name + ' ' + user.email).toLowerCase().indexOf(q) !== -1; });
    users.sort(function (a, b) { return String(b.joinedAt).localeCompare(String(a.joinedAt)); });
    return sendJson(res, 200, { users: users, count: users.length });
  }

  const adminUserMatch = /^\/api\/admin\/users\/([\w-]+)$/.exec(pathname);
  if (adminUserMatch && method === 'PATCH') {
    const admin = requireAdmin(req);
    const target = store().users.find(function (user) { return user.id === adminUserMatch[1]; });
    if (!target) fail(404, 'ไม่พบผู้ใช้นี้');
    if (target.id === admin.id) fail(400, 'ไม่สามารถเปลี่ยนสิทธิ์บัญชีที่กำลังใช้งานอยู่');
    const payload = await readBody(req);
    if (payload.role !== undefined) target.role = asEnum(String(payload.role), 'บทบาท', ['user', 'admin']);
    if (payload.status !== undefined) {
      target.status = asEnum(String(payload.status), 'สถานะบัญชี', ['active', 'suspended']);
      if (target.status === 'suspended') {
        store().sessions = store().sessions.filter(function (session) { return session.userId !== target.id; });
      }
    }
    db.persist();
    return sendJson(res, 200, { user: publicUser(target) });
  }

  if (key === 'GET /api/admin/items') {
    requireAdmin(req);
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    let items = store().items.slice();
    if (q) {
      items = items.filter(function (item) {
        return (item.title + ' ' + item.owner + ' ' + item.id).toLowerCase().indexOf(q) !== -1;
      });
    }
    items.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return sendJson(res, 200, { items: items.map(publicItem), count: items.length });
  }

  const adminItemMatch = /^\/api\/admin\/items\/([\w-]+)$/.exec(pathname);
  if (adminItemMatch) {
    requireAdmin(req);
    const item = store().items.find(function (entry) { return entry.id === adminItemMatch[1]; });
    if (!item) fail(404, 'ไม่พบสินค้านี้');

    if (method === 'PATCH') {
      const payload = await readBody(req);
      item.status = asEnum(String(payload.status || ''), 'สถานะประกาศ', ['published', 'hidden']);
      db.persist();
      return sendJson(res, 200, { item: publicItem(item) });
    }
    if (method === 'DELETE') {
      store().items = store().items.filter(function (entry) { return entry.id !== item.id; });
      db.persist();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (key === 'GET /api/admin/bookings') {
    requireAdmin(req);
    const status = String(url.searchParams.get('status') || 'all');
    let bookings = store().bookings.slice();
    if (status !== 'all') bookings = bookings.filter(function (booking) { return booking.status === status; });
    bookings.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return sendJson(res, 200, { bookings: bookings, count: bookings.length });
  }

  const adminBookingMatch = /^\/api\/admin\/bookings\/([\w-]+)$/.exec(pathname);
  if (adminBookingMatch && method === 'PATCH') {
    requireAdmin(req);
    const booking = store().bookings.find(function (entry) { return entry.code === adminBookingMatch[1]; });
    if (!booking) fail(404, 'ไม่พบการจองนี้');
    const payload = await readBody(req);
    const next = asEnum(String(payload.status || ''), 'สถานะการจอง', ['pending', 'active', 'returned', 'cancelled']);
    booking.status = next;
    if (next === 'returned') booking.returnedAt = new Date().toISOString();
    if (next === 'cancelled') booking.cancelledAt = new Date().toISOString();
    db.persist();
    return sendJson(res, 200, { booking: booking });
  }

  if (key === 'GET /api/admin/requests') {
    requireAdmin(req);
    const list = store().requests.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return sendJson(res, 200, { requests: list, count: list.length });
  }

  const adminRequestMatch = /^\/api\/admin\/requests\/([\w-]+)$/.exec(pathname);
  if (adminRequestMatch && method === 'DELETE') {
    requireAdmin(req);
    store().requests = store().requests.filter(function (request) { return request.id !== adminRequestMatch[1]; });
    db.persist();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'ไม่พบ API นี้' });
}

/* ---------- server ---------- */

async function handle(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/api' || url.pathname.indexOf('/api/') === 0) {
    return handleApi(req, res, url);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'ไม่รองรับ method นี้' });
  }

  return serveStatic(req, res, url.pathname);
}

function respond(req, res) {
  return handle(req, res).catch(function (err) {
    const status = err && err.status ? err.status : 500;
    if (status >= 500) console.error('[api]', err);
    if (res.headersSent) return res.end();
    sendJson(res, status, { error: status >= 500 ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' : err.message });
  });
}

module.exports = { respond, seed };

/* รันตรง ๆ (npm start) = เซิร์ฟเวอร์ปกติ / บน Vercel ไฟล์ api/index.js จะ require ไฟล์นี้ไปใช้แทน */
if (require.main === module) {
  db.init(seed.build);

  const server = http.createServer(respond);

  server.listen(PORT, HOST, function () {
    console.log('FLO-RENT พร้อมใช้งานที่ http://' + HOST + ':' + PORT);
    console.log('ไฟล์ข้อมูล: ' + db.DB_FILE);
    console.log('บัญชีแอดมิน: admin@flo-rent.co / admin1234');
  });

  const shutdown = function (signal) {
    console.log('\nได้รับสัญญาณ ' + signal + ' กำลังบันทึกข้อมูลและปิดเซิร์ฟเวอร์...');
    db.flushSync();
    server.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(0); }, 3000).unref();
  };

  process.on('SIGINT', function () { shutdown('SIGINT'); });
  process.on('SIGTERM', function () { shutdown('SIGTERM'); });
  process.on('uncaughtException', function (err) {
    console.error('[fatal]', err);
    db.flushSync();
    process.exit(1);
  });
}
