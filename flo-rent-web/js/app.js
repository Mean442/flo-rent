/* FLO-RENT — ตรรกะหน้าเว็บ (ทำงานร่วมกับ API ที่ server/server.js) */
(function () {
  'use strict';

  var API = window.FLO_API;
  var CATS = window.FLO_CATEGORIES || [];
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var AVATARS = ['🐥', '🙂', '🐱', '🦊', '🐼', '🌻', '🎧', '📷', '👗', '🪩'];
  var sessionUser = null;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch]; });
  }

  function baht(number) {
    return '฿' + Number(number || 0).toLocaleString('th-TH');
  }

  function catOf(key) {
    for (var i = 0; i < CATS.length; i += 1) {
      if (CATS[i].key === key) return CATS[i];
    }
    return { key: 'general', name: 'อุปกรณ์ทั่วไป', emoji: '📦', num: '06', sub: '' };
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function thDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  function isoDay(offset) {
    return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  }

  function currentPage() {
    return window.location.pathname.split('/').pop() + window.location.search;
  }

  function requireLogin() {
    window.location.href = 'login.html?next=' + encodeURIComponent(currentPage());
  }

  function goNext(fallback) {
    var next = param('next');
    if (next && /^[a-z0-9._-]+\.html(\?.*)?$/i.test(next)) {
      window.location.href = next;
      return;
    }
    window.location.href = fallback;
  }

  function handleAuth(err) {
    if (err && err.status === 401) {
      API.setToken('');
      sessionUser = null;
      return true;
    }
    return false;
  }

  /* ---------- UI ชิ้นเล็ก ---------- */

  function toast(message, kind) {
    var stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    var node = document.createElement('div');
    node.className = 'toast' + (kind === 'ok' ? ' toast-ok' : '');
    node.textContent = message;
    stack.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 4200);
  }

  function showError(err) {
    if (handleAuth(err)) return;
    toast(err && err.message ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
  }

  function loginPrompt(title, message) {
    return '' +
      '<div class="empty">' +
        '<h1 class="display display-sm">' + esc(title) + '</h1>' +
        '<p class="muted">' + esc(message || 'เข้าสู่ระบบเพื่อดูข้อมูลบัญชี ประวัติการจอง และประกาศของคุณ') + '</p>' +
        '<a class="btn btn-cream" href="login.html?next=' + encodeURIComponent(currentPage()) + '">เข้าสู่ระบบ / สมัครสมาชิก</a>' +
      '</div>';
  }

  function itemCard(item) {
    var cat = catOf(item.cat);
    return '' +
      '<a class="item-card" href="item.html?id=' + encodeURIComponent(item.id) + '">' +
        '<div class="thumb thumb-' + esc(item.cat) + '">' +
          '<span class="thumb-emoji" aria-hidden="true">' + esc(item.emoji) + '</span>' +
          '<span class="chip chip-light">' + esc(cat.name) + '</span>' +
          (item.status === 'hidden' ? '<span class="chip">ซ่อนอยู่</span>' : '') +
        '</div>' +
        '<div class="item-body">' +
          '<h3 class="item-title">' + esc(item.title) + '</h3>' +
          '<p class="item-meta">' + esc(item.owner) + ' · <span class="stars">★ ' +
            Number(item.rating || 0).toFixed(1) + '</span> <span class="muted">(' + Number(item.reviews || 0) + ')</span></p>' +
          '<p class="item-price"><strong>' + baht(item.price) + '</strong><span>/วัน</span></p>' +
          '<p class="item-fine">มัดจำ ' + baht(item.deposit) + ' · ' + esc(item.location) + '</p>' +
        '</div>' +
      '</a>';
  }

  function renderCards(target, items) {
    if (!target) return;
    target.innerHTML = items.map(itemCard).join('');
  }

  function bootHelp() {
    var overlay = document.createElement('div');
    overlay.className = 'boot-overlay';
    overlay.innerHTML = '' +
      '<div class="boot-card">' +
        '<p class="eyebrow">ต้องเปิดผ่านเซิร์ฟเวอร์</p>' +
        '<h1>FLO-RENT ใช้ backend</h1>' +
        '<p>หน้านี้ถูกเปิดจากไฟล์โดยตรง (file://) จึงติดต่อ API ไม่ได้ เปิด terminal ในโฟลเดอร์โปรเจกต์แล้วรัน:</p>' +
        '<code>npm start</code>' +
        '<p>จากนั้นเปิด <strong>http://127.0.0.1:4173</strong> — ต้องมี Node.js 18 ขึ้นไป (ไม่ต้องติดตั้ง dependency เพิ่ม)</p>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  /* ---------- ส่วนหัวเว็บ ---------- */

  async function initHeader() {
    var header = document.querySelector('.header-inner');
    if (!header) return;

    var box = document.createElement('div');
    box.className = 'account-nav';
    box.innerHTML = '<span class="account-skeleton" aria-hidden="true"></span>';
    header.appendChild(box);

    try {
      var data = await API.get('/me');
      sessionUser = data.user;
    } catch (err) {
      sessionUser = null;
    }

    if (sessionUser) {
      box.innerHTML = '' +
        '<a class="account-link" href="bookings.html">การจองของฉัน</a>' +
        '<a class="account-chip" href="profile.html"><span class="avatar avatar-sm" aria-hidden="true">' +
          esc(sessionUser.avatar || '🙂') + '</span>' + esc(String(sessionUser.name || '').split(' ')[0]) + '</a>';

      var nav = header.querySelector('.nav');
      if (nav) {
        var bookingsLink = document.createElement('a');
        bookingsLink.href = 'bookings.html';
        bookingsLink.textContent = 'การจองของฉัน';
        nav.appendChild(bookingsLink);

        if (sessionUser.role === 'admin') {
          var adminLink = document.createElement('a');
          adminLink.href = 'admin.html';
          adminLink.textContent = 'แอดมิน';
          nav.appendChild(adminLink);
        }
      }
    } else {
      box.innerHTML = '<a class="btn btn-outline btn-sm" href="login.html">เข้าสู่ระบบ</a>';
    }
  }

  /* ---------- หน้าแรก ---------- */

  async function initHome() {
    var featured = $('featured-grid');
    if (!featured) return;

    var cats = $('category-grid');
    if (cats) {
      cats.innerHTML = CATS.map(function (cat) {
        return '' +
          '<a class="cat-card" href="browse.html?cat=' + cat.key + '">' +
            '<span class="cat-num">' + cat.num + '</span>' +
            '<span class="cat-emoji" aria-hidden="true">' + cat.emoji + '</span>' +
            '<span class="cat-name">' + esc(cat.name) + '</span>' +
            '<span class="cat-sub">' + esc(cat.sub) + '</span>' +
          '</a>';
      }).join('');
    }

    featured.innerHTML = '<p class="muted">กำลังโหลดสินค้า...</p>';
    try {
      var data = await API.get('/items?sort=recommended');
      renderCards(featured, data.items.slice(0, 8));
    } catch (err) {
      featured.innerHTML = '<p class="muted">โหลดสินค้าไม่สำเร็จ</p>';
      showError(err);
    }
  }

  /* ---------- หน้าค้นหา / กรอง ---------- */

  async function initBrowse() {
    var grid = $('browse-grid');
    if (!grid) return;

    var input = $('filter-q');
    var countEl = $('result-count');
    var emptyEl = $('empty-state');
    var minEl = $('filter-min');
    var maxEl = $('filter-max');
    var sortEl = $('filter-sort');
    var chipsEl = $('filter-cats');
    var form = $('filter-form');
    var seq = 0;

    var state = {
      q: param('q'),
      cat: param('cat') || 'all',
      min: 0,
      max: 0,
      sort: 'recommended'
    };

    if (input) input.value = state.q;

    if (chipsEl) {
      chipsEl.innerHTML = '<button type="button" class="chip chip-filter" data-cat="all">ทั้งหมด</button>' +
        CATS.map(function (cat) {
          return '<button type="button" class="chip chip-filter" data-cat="' + cat.key + '">' +
            cat.emoji + ' ' + esc(cat.name) + '</button>';
        }).join('');
    }

    function paintChips() {
      if (!chipsEl) return;
      Array.prototype.forEach.call(chipsEl.querySelectorAll('[data-cat]'), function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-cat') === state.cat);
      });
    }

    function syncUrl() {
      var url = new URL(window.location.href);
      if (state.q) url.searchParams.set('q', state.q); else url.searchParams.delete('q');
      if (state.cat !== 'all') url.searchParams.set('cat', state.cat); else url.searchParams.delete('cat');
      window.history.replaceState(null, '', url.toString());
    }

    async function render() {
      var ticket = ++seq;
      var query = new URLSearchParams();
      if (state.q) query.set('q', state.q);
      if (state.cat !== 'all') query.set('cat', state.cat);
      if (state.min > 0) query.set('min', String(state.min));
      if (state.max > 0) query.set('max', String(state.max));
      query.set('sort', state.sort);

      paintChips();
      if (countEl) countEl.textContent = 'กำลังโหลด...';
      grid.innerHTML = '<p class="muted">กำลังโหลด...</p>';

      try {
        var data = await API.get('/items?' + query.toString());
        if (ticket !== seq) return;
        renderCards(grid, data.items);
        grid.hidden = data.items.length === 0;
        if (emptyEl) emptyEl.hidden = data.items.length !== 0;
        if (countEl) countEl.textContent = 'พบ ' + data.count + ' รายการ';
      } catch (err) {
        if (ticket !== seq) return;
        grid.innerHTML = '<p class="muted">โหลดสินค้าไม่สำเร็จ</p>';
        if (countEl) countEl.textContent = 'โหลดไม่สำเร็จ';
        showError(err);
      }

      syncUrl();
    }

    if (chipsEl) {
      chipsEl.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-cat]');
        if (!btn) return;
        state.cat = btn.getAttribute('data-cat');
        render();
      });
    }

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        state.q = input ? input.value : '';
        state.min = Number(minEl && minEl.value) || 0;
        state.max = Number(maxEl && maxEl.value) || 0;
        render();
      });
    }

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        state.sort = sortEl.value;
        render();
      });
    }

    render();
  }

  /* ---------- รายละเอียดสินค้า + จอง ---------- */

  function notFoundBlock(title) {
    return '' +
      '<div class="empty">' +
        '<h1 class="display display-sm">' + esc(title || 'ไม่พบสินค้าชิ้นนี้') + '</h1>' +
        '<p class="muted">ประกาศนี้อาจถูกลบหรือปิดการขายไปแล้ว</p>' +
        '<a class="btn btn-cream" href="browse.html">ดูสินค้าทั้งหมด</a>' +
      '</div>';
  }

  async function initDetail() {
    var root = $('detail-root');
    if (!root) return;

    var id = param('id');
    if (!id) {
      root.innerHTML = notFoundBlock();
      return;
    }

    root.innerHTML = '<p class="muted" style="padding:40px 0">กำลังโหลดรายละเอียด...</p>';

    var item;
    try {
      var data = await API.get('/items/' + encodeURIComponent(id));
      item = data.item;
    } catch (err) {
      root.innerHTML = notFoundBlock(err.status === 404 ? 'ไม่พบสินค้าชิ้นนี้' : 'โหลดสินค้าไม่สำเร็จ');
      if (err.status !== 404) showError(err);
      return;
    }

    document.title = item.title + ' · FLO-RENT';
    var cat = catOf(item.cat);
    var isMine = sessionUser && item.ownerId === sessionUser.id;

    var bookingPanel;
    if (isMine) {
      bookingPanel = '' +
        '<p class="eyebrow">ประกาศของคุณ</p>' +
        '<h2 class="display display-sm" style="font-size:26px">' + baht(item.price) + ' / วัน</h2>' +
        '<p class="fine-print" style="margin-top:10px">มัดจำ ' + baht(item.deposit) + ' · สถานะ: ' +
          (item.status === 'published' ? 'เผยแพร่' : 'ซ่อนอยู่') + '</p>' +
        '<div class="booking-form"><a class="btn btn-maroon btn-block" href="profile.html">จัดการในบัญชีของฉัน</a>' +
        '<a class="btn btn-ghost btn-block" href="bookings.html">ดูการจองของฉัน</a></div>';
    } else {
      bookingPanel = '' +
        '<p class="eyebrow">เริ่มต้น</p>' +
        '<p class="booking-price"><strong>' + baht(item.price) + '</strong><span>/วัน</span></p>' +
        '<p class="item-fine">มัดจำ ' + baht(item.deposit) + ' (คืนเมื่อคืนของครบ)</p>' +
        '<form id="booking-form" class="booking-form">' +
          '<label class="field"><span>วันที่เริ่มเช่า</span><input type="date" id="start-date" required></label>' +
          '<label class="field"><span>วันที่คืน</span><input type="date" id="end-date" required></label>' +
          '<div class="booking-summary" id="booking-summary"></div>' +
          '<button class="btn btn-maroon btn-block" type="submit">' + (sessionUser ? 'ยืนยันการจอง' : 'เข้าสู่ระบบเพื่อจอง') + '</button>' +
          '<p class="fine-print">' + (sessionUser
            ? 'การจองจะถูกบันทึกในประวัติและผู้ให้เช่าจะติดต่อกลับ'
            : 'ต้องเข้าสู่ระบบก่อนยืนยันการจอง เพื่อเก็บประวัติไว้ในบัญชีของคุณ') + '</p>' +
        '</form>';
    }

    root.innerHTML = '' +
      '<nav class="crumbs"><a href="index.html">หน้าแรก</a> / ' +
        '<a href="browse.html?cat=' + esc(item.cat) + '">' + esc(cat.name) + '</a> / ' +
        '<span>' + esc(item.title) + '</span></nav>' +
      '<div class="detail">' +
        '<div class="detail-main">' +
          '<div class="thumb thumb-lg thumb-' + esc(item.cat) + '">' +
            '<span class="thumb-emoji" aria-hidden="true">' + esc(item.emoji) + '</span>' +
          '</div>' +
          '<h1 class="detail-title">' + esc(item.title) + '</h1>' +
          '<p class="item-meta">' + esc(item.owner) + ' · <span class="stars">★ ' +
            Number(item.rating || 0).toFixed(1) + '</span> <span class="muted">(' + Number(item.reviews || 0) +
            ' รีวิว)</span> · ' + esc(item.location) + '</p>' +
          '<h2 class="detail-h2">รายละเอียด</h2>' +
          '<p>' + esc(item.desc) + '</p>' +
          '<h2 class="detail-h2">เงื่อนไขการเช่า</h2>' +
          '<p>' + esc(item.terms) + '</p>' +
          '<ul class="checklist">' +
            '<li>ผู้เช่าต้องมีอายุ 15 ปีขึ้นไป</li>' +
            '<li>ชำระค่าอุปกรณ์ + ค่ามัดจำก่อนรับสินค้า</li>' +
            '<li>ได้รับเงินมัดจำคืนเมื่อคืนสินค้าในสภาพเรียบร้อย</li>' +
          '</ul>' +
        '</div>' +
        '<aside class="booking-card" id="booking-card">' + bookingPanel + '</aside>' +
      '</div>';

    if (isMine) return;

    var startEl = $('start-date');
    var endEl = $('end-date');
    var summaryEl = $('booking-summary');
    var formEl = $('booking-form');
    if (!startEl || !endEl || !formEl || !summaryEl) return;

    startEl.min = isoDay(0);
    endEl.min = isoDay(1);
    startEl.value = isoDay(0);
    endEl.value = isoDay(1);

    function daysBetween() {
      var start = new Date(startEl.value + 'T00:00:00');
      var end = new Date(endEl.value + 'T00:00:00');
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      return Math.round((end - start) / 86400000);
    }

    function refreshSummary() {
      var days = daysBetween();
      if (days < 1) {
        summaryEl.innerHTML = '<p class="warn">วันที่คืนต้องอยู่หลังวันที่เริ่มเช่า</p>';
        return;
      }
      summaryEl.innerHTML = '' +
        '<div class="summary-row"><span>ค่าเช่า ' + baht(item.price) + ' × ' + days + ' วัน</span><span>' +
          baht(item.price * days) + '</span></div>' +
        '<div class="summary-row"><span>เงินมัดจำ</span><span>' + baht(item.deposit) + '</span></div>' +
        '<div class="summary-row summary-total"><span>รวมทั้งสิ้น</span><span>' +
          baht(item.price * days + item.deposit) + '</span></div>';
    }

    startEl.addEventListener('change', function () {
      if (daysBetween() < 1) {
        var next = new Date(new Date(startEl.value + 'T00:00:00').getTime() + 86400000);
        endEl.min = next.toISOString().slice(0, 10);
        endEl.value = endEl.min;
      }
      refreshSummary();
    });
    endEl.addEventListener('change', refreshSummary);
    refreshSummary();

    formEl.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!sessionUser) {
        requireLogin();
        return;
      }
      var days = daysBetween();
      if (days < 1) {
        refreshSummary();
        return;
      }

      var button = formEl.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'กำลังจอง...';

      try {
        var result = await API.post('/bookings', {
          itemId: item.id,
          start: startEl.value,
          end: endEl.value
        });
        var booking = result.booking;
        $('booking-card').innerHTML = '' +
          '<div class="success">' +
            '<p class="eyebrow">จองสำเร็จ</p>' +
            '<h2 class="display display-sm">' + esc(booking.code) + '</h2>' +
            '<p><strong>' + esc(booking.itemTitle) + '</strong><br>' + thDate(booking.start) + ' → ' + thDate(booking.end) + '</p>' +
            '<p class="booking-price"><strong>' + baht(booking.total) + '</strong></p>' +
            '<p class="fine-print">บันทึกในประวัติการจองของบัญชีคุณแล้ว สถานะเริ่มต้นคือ “รอยืนยัน”</p>' +
            '<div class="success-actions">' +
              '<a class="btn btn-maroon" href="bookings.html">ดูประวัติการจอง</a>' +
              '<a class="btn btn-ghost" href="browse.html">เลือกชิ้นอื่นต่อ</a>' +
            '</div>' +
          '</div>';
      } catch (err) {
        button.disabled = false;
        button.textContent = 'ยืนยันการจอง';
        if (err.status === 401) { requireLogin(); return; }
        showError(err);
      }
    });
  }

  /* ---------- ลงประกาศให้เช่า ---------- */

  async function initPost() {
    var form = $('post-form');
    if (!form) return;

    var wrap = $('post-form-wrap');
    var catSelect = $('post-cat');
    catSelect.innerHTML = CATS.map(function (cat) {
      return '<option value="' + cat.key + '">' + cat.emoji + ' ' + esc(cat.name) + '</option>';
    }).join('');

    if (!sessionUser) {
      if (wrap) {
        wrap.innerHTML = '' +
          '<div class="success success-wide">' +
            '<p class="eyebrow">ต้องเข้าสู่ระบบก่อน</p>' +
            '<h2 class="display display-sm">ลงประกาศให้เช่า</h2>' +
            '<p>ประกาศจะผูกกับบัญชีของคุณ เพื่อแก้ไข ซ่อน หรือดูยอดในหน้าโปรไฟล์ได้</p>' +
            '<div class="success-actions">' +
              '<a class="btn btn-maroon" href="login.html?next=post.html">เข้าสู่ระบบ / สมัครสมาชิก</a>' +
              '<a class="btn btn-ghost" href="browse.html">ดูสินค้าทั้งหมด</a>' +
            '</div>' +
          '</div>';
      }
      return;
    }

    var owner = $('post-owner');
    if (owner) {
      owner.value = sessionUser.name;
      owner.readOnly = true;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      var msg = $('post-msg');
      if (msg) { msg.textContent = ''; msg.className = 'form-msg'; }
      button.disabled = true;
      button.textContent = 'กำลังเผยแพร่...';

      try {
        var result = await API.post('/items', {
          title: $('post-title').value,
          cat: catSelect.value,
          price: $('post-price').value,
          deposit: $('post-deposit').value,
          location: $('post-location').value,
          tags: $('post-tags').value,
          desc: $('post-desc').value
        });
        var item = result.item;
        wrap.innerHTML = '' +
          '<div class="success success-wide">' +
            '<p class="eyebrow">ประกาศขึ้นแล้ว</p>' +
            '<h2 class="display display-sm">' + esc(item.title) + '</h2>' +
            '<p>ราคา <strong>' + baht(item.price) + '/วัน</strong> · มัดจำ ' + baht(item.deposit) + '</p>' +
            '<p class="fine-print">ประกาศแสดงในหน้าค้นหาแล้ว และอยู่ใน “ประกาศของฉัน”</p>' +
            '<div class="success-actions">' +
              '<a class="btn btn-maroon" href="item.html?id=' + encodeURIComponent(item.id) + '">ดูประกาศของฉัน</a>' +
              '<a class="btn btn-ghost" href="profile.html">ไปหน้าบัญชี</a>' +
            '</div>' +
          '</div>';
      } catch (err) {
        button.disabled = false;
        button.textContent = 'เผยแพร่ประกาศ';
        if (err.status === 401) { requireLogin(); return; }
        showError(err);
      }
    });
  }

  /* ---------- LOOK FOR ---------- */

  async function initLookFor() {
    var form = $('request-form');
    if (!form) return;

    var catSelect = $('request-cat');
    var listEl = $('request-list');
    var okEl = $('request-ok');

    catSelect.innerHTML = '<option value="all">ทุกหมวด</option>' + CATS.map(function (cat) {
      return '<option value="' + cat.key + '">' + cat.emoji + ' ' + esc(cat.name) + '</option>';
    }).join('');

    if (sessionUser && $('request-name')) $('request-name').value = sessionUser.name;

    async function load() {
      if (!listEl) return;
      listEl.innerHTML = '<p class="muted">กำลังโหลด...</p>';
      try {
        var data = await API.get('/requests');
        if (!data.requests.length) {
          listEl.innerHTML = '<p class="muted">ยังไม่มีคำขอ — ประกาศของคุณจะเป็นรายการแรก</p>';
          return;
        }
        listEl.innerHTML = data.requests.map(function (req) {
          var cat = req.cat === 'all' ? { emoji: '🔍', name: 'ทุกหมวด' } : catOf(req.cat);
          return '' +
            '<article class="request-card">' +
              '<span class="cat-emoji" aria-hidden="true">' + cat.emoji + '</span>' +
              '<div>' +
                '<h3>' + esc(req.want) + '</h3>' +
                '<p class="item-meta">โดย ' + esc(req.name) + ' · ต้องการใช้ ' + esc(req.when) +
                  ' · งบ ' + baht(req.budget) + '/วัน</p>' +
              '</div>' +
              '<span class="chip chip-light">' + esc(cat.name) + '</span>' +
            '</article>';
        }).join('');
      } catch (err) {
        listEl.innerHTML = '<p class="muted">โหลดรายการไม่สำเร็จ</p>';
        showError(err);
      }
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!sessionUser) {
        requireLogin();
        return;
      }
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await API.post('/requests', {
          want: $('request-want').value,
          cat: catSelect.value,
          budget: $('request-budget').value,
          when: $('request-when').value,
          name: $('request-name').value
        });
        form.reset();
        if (sessionUser && $('request-name')) $('request-name').value = sessionUser.name;
        if (okEl) okEl.hidden = false;
        await load();
      } catch (err) {
        if (err.status === 401) { requireLogin(); return; }
        showError(err);
      } finally {
        button.disabled = false;
      }
    });

    load();
  }

  /* ---------- เข้าสู่ระบบ / สมัครสมาชิก ---------- */

  async function initLogin() {
    var tabs = $('auth-tabs');
    if (!tabs) return;

    var loginForm = $('login-form');
    var registerForm = $('register-form');

    if (sessionUser) {
      var card = tabs.parentElement;
      if (card) {
        card.innerHTML = '' +
          '<p class="eyebrow">เข้าสู่ระบบอยู่แล้ว</p>' +
          '<h2 class="display display-sm" style="font-size:28px">' + esc(String(sessionUser.name || '').split(' ')[0]) + '</h2>' +
          '<p class="item-fine">' + esc(sessionUser.email) + ' · ' +
            (sessionUser.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป') + '</p>' +
          '<div class="success-actions">' +
            '<a class="btn btn-maroon" href="profile.html">บัญชีของฉัน</a>' +
            '<a class="btn btn-ghost" href="bookings.html">ประวัติการจอง</a>' +
            (sessionUser.role === 'admin' ? '<a class="btn btn-ghost" href="admin.html">หน้าแอดมิน</a>' : '') +
          '</div>';
      }
      return;
    }

    function setMode(mode) {
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-mode]'), function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
      });
      if (loginForm) loginForm.hidden = mode !== 'login';
      if (registerForm) registerForm.hidden = mode !== 'register';
      setMsg($('login-msg'), '');
      setMsg($('reg-msg'), '');
    }

    function setMsg(el, text, ok) {
      if (!el) return;
      el.textContent = text || '';
      el.className = 'form-msg' + (text ? (ok ? ' is-ok' : ' is-error') : '');
    }

    tabs.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-mode]');
      if (btn) setMode(btn.getAttribute('data-mode'));
    });

    var demoBtn = $('demo-fill');
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        if ($('login-email')) $('login-email').value = 'demo@flo-rent.co';
        if ($('login-pass')) $('login-pass').value = 'demo1234';
        setMode('login');
        setMsg($('login-msg'), 'กรอกข้อมูลบัญชีทดลองให้แล้ว กด “เข้าสู่ระบบ” ได้เลย', true);
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var msg = $('login-msg');
        var button = loginForm.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'กำลังเข้าสู่ระบบ...';
        try {
          var data = await API.post('/auth/login', {
            email: $('login-email').value.trim(),
            password: $('login-pass').value
          });
          API.setToken(data.token);
          setMsg(msg, 'เข้าสู่ระบบสำเร็จ กำลังเปิดหน้าบัญชี...', true);
          goNext('profile.html');
        } catch (err) {
          setMsg(msg, err.message);
          button.disabled = false;
          button.textContent = 'เข้าสู่ระบบ';
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var msg = $('reg-msg');
        var name = $('reg-name').value.trim();
        var email = $('reg-email').value.trim();
        var password = $('reg-pass').value;
        var confirmPass = $('reg-pass2').value;
        var age = Number($('reg-age').value);

        if (name.length < 2) { setMsg(msg, 'กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setMsg(msg, 'รูปแบบอีเมลไม่ถูกต้อง'); return; }
        if (password.length < 6) { setMsg(msg, 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร'); return; }
        if (password !== confirmPass) { setMsg(msg, 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
        if (!(age >= 15)) { setMsg(msg, 'FLO-RENT เปิดให้ผู้ใช้อายุ 15 ปีขึ้นไป'); return; }

        var button = registerForm.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'กำลังสมัคร...';
        try {
          var data = await API.post('/auth/register', {
            name: name,
            email: email,
            password: password,
            age: age,
            phone: $('reg-phone').value.trim()
          });
          API.setToken(data.token);
          setMsg(msg, 'สมัครสมาชิกสำเร็จ กำลังเปิดหน้าบัญชี...', true);
          goNext('profile.html');
        } catch (err) {
          setMsg(msg, err.message);
          button.disabled = false;
          button.textContent = 'สมัครสมาชิก';
        }
      });
    }

    setMode('login');
  }

  /* ---------- โปรไฟล์ ---------- */

  async function initProfile() {
    var root = $('profile-root');
    if (!root) return;

    if (!sessionUser) {
      root.innerHTML = loginPrompt('บัญชีของฉัน');
      return;
    }

    var flash = '';

    async function render() {
      root.innerHTML = '<p class="muted" style="padding:40px 0">กำลังโหลดบัญชี...</p>';
      var me;
      var mine;
      try {
        var results = await Promise.all([API.get('/me'), API.get('/items?mine=1')]);
        me = results[0];
        mine = results[1].items;
      } catch (err) {
        root.innerHTML = loginPrompt('โหลดบัญชีไม่สำเร็จ', err.message);
        return;
      }

      var user = me.user;
      var stats = me.stats;
      var avatar = user.avatar || '🙂';

      root.innerHTML = '' +
        '<div class="page-head"><h1>บัญชีของฉัน</h1><p>ข้อมูลบัญชี คะแนนผู้เช่า และประกาศของคุณ</p></div>' +
        '<div class="profile-grid">' +
          '<aside class="profile-card">' +
            '<span class="avatar avatar-lg" aria-hidden="true">' + esc(avatar) + '</span>' +
            '<h2>' + esc(user.name) + '</h2>' +
            '<p class="item-meta">' + esc(user.email) + '</p>' +
            '<p class="item-meta"><span class="stars">★ ' + Number(user.rating || 5).toFixed(1) + '</span> (' +
              Number(user.reviews || 0) + ' รีวิว) · สมาชิกตั้งแต่ ' + thDate(user.joinedAt) + '</p>' +
            '<p class="item-meta">' + (user.age >= 15
              ? '✓ ยืนยันอายุแล้ว (' + esc(user.age) + ' ปี)'
              : 'ยังไม่ยืนยันอายุ') + ' · ' + esc(user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป') + '</p>' +
            '<div class="stat-grid">' +
              '<div class="stat"><b>' + stats.bookings + '</b><span>การจองทั้งหมด</span></div>' +
              '<div class="stat"><b>' + stats.active + '</b><span>กำลังดำเนินการ</span></div>' +
              '<div class="stat"><b>' + baht(stats.spent) + '</b><span>ยอดใช้จ่ายรวม</span></div>' +
              '<div class="stat"><b>' + stats.listings + '</b><span>ประกาศของฉัน</span></div>' +
            '</div>' +
            '<a class="btn btn-maroon btn-block" href="bookings.html" style="margin-top:16px">ดูประวัติการจอง</a>' +
            (user.role === 'admin' ? '<a class="btn btn-cream btn-block" href="admin.html" style="margin-top:10px">หน้าแอดมิน</a>' : '') +
            '<button class="btn btn-ghost btn-block" type="button" id="logout-btn" style="margin-top:10px">ออกจากระบบ</button>' +
          '</aside>' +
          '<div>' +
            '<form class="form-card" id="profile-form">' +
              '<div class="form-grid">' +
                '<label class="field span-2"><span>ชื่อที่ใช้แสดง</span><input type="text" id="pf-name" required value="' + esc(user.name) + '"></label>' +
                '<label class="field"><span>เบอร์โทร</span><input type="text" id="pf-phone" value="' + esc(user.phone) + '"></label>' +
                '<label class="field"><span>อายุ</span><input type="number" id="pf-age" min="15" max="99" value="' + esc(user.age) + '"></label>' +
                '<label class="field span-2"><span>พื้นที่</span><input type="text" id="pf-location" value="' + esc(user.location) + '"></label>' +
                '<label class="field span-2"><span>แนะนำตัวสั้น ๆ</span><textarea id="pf-bio" style="min-height:80px" placeholder="ความสนใจหรือรูปแบบการใช้งานของคุณ">' + esc(user.bio) + '</textarea></label>' +
                '<div class="field span-2"><span>รูปโปรไฟล์</span>' +
                  '<div class="avatar-pick" id="pf-avatar-pick">' +
                    AVATARS.map(function (emoji) {
                      return '<button type="button" class="' + (emoji === avatar ? 'is-active' : '') +
                        '" data-avatar="' + emoji + '">' + emoji + '</button>';
                    }).join('') +
                  '</div>' +
                  '<input type="hidden" id="pf-avatar" value="' + esc(avatar) + '">' +
                '</div>' +
              '</div>' +
              '<p class="form-msg' + (flash ? ' is-ok' : '') + '" id="pf-msg">' + esc(flash) + '</p>' +
              '<div class="form-actions">' +
                '<button class="btn btn-maroon" type="submit">บันทึกข้อมูล</button>' +
                '<a class="btn btn-outline" href="bookings.html">ประวัติการจอง</a>' +
              '</div>' +
            '</form>' +
            '<section style="margin-top:26px">' +
              '<div class="section-head" style="margin-bottom:16px;padding-bottom:12px">' +
                '<h2 style="font-size:22px">ประกาศของฉัน</h2>' +
                '<a class="link-arrow" href="post.html">ลงประกาศใหม่ →</a>' +
              '</div>' +
              (mine.length
                ? '<div class="grid-3">' + mine.map(itemCard).join('') + '</div>'
                : '<p class="muted">ยังไม่มีประกาศ — ของที่ไม่ได้ใช้อยู่บ้านสามารถสร้างรายได้ให้คุณได้</p>') +
            '</section>' +
          '</div>' +
        '</div>';

      bind(user);
    }

    function bind(user) {
      var pick = $('pf-avatar-pick');
      if (pick) {
        pick.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-avatar]');
          if (!btn) return;
          Array.prototype.forEach.call(pick.querySelectorAll('[data-avatar]'), function (node) {
            node.classList.toggle('is-active', node === btn);
          });
          $('pf-avatar').value = btn.getAttribute('data-avatar');
        });
      }

      var logout = $('logout-btn');
      if (logout) {
        logout.addEventListener('click', async function () {
          try { await API.post('/auth/logout'); } catch (err) { /* ออกได้แม้เซิร์ฟเวอร์ไม่ตอบ */ }
          API.setToken('');
          sessionUser = null;
          window.location.href = 'index.html';
        });
      }

      var form = $('profile-form');
      if (!form) return;

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var msg = $('pf-msg');
        var name = $('pf-name').value.trim();
        var age = Number($('pf-age').value);
        if (name.length < 2) { setMsgOn(msg, 'กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร'); return; }
        if (!(age >= 15)) { setMsgOn(msg, 'FLO-RENT เปิดให้ผู้ใช้อายุ 15 ปีขึ้นไป'); return; }

        var button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'กำลังบันทึก...';
        try {
          var result = await API.patch('/me', {
            name: name,
            phone: $('pf-phone').value.trim(),
            age: age,
            location: $('pf-location').value.trim(),
            bio: $('pf-bio').value.trim(),
            avatar: $('pf-avatar').value
          });
          sessionUser = result.user;
          flash = 'บันทึกข้อมูลแล้ว';

          var chip = document.querySelector('.account-chip');
          if (chip) {
            chip.innerHTML = '<span class="avatar avatar-sm" aria-hidden="true">' + esc(sessionUser.avatar) +
              '</span>' + esc(String(sessionUser.name).split(' ')[0]);
          }
          toast('บันทึกข้อมูลบัญชีแล้ว', 'ok');
          await render();
        } catch (err) {
          button.disabled = false;
          button.textContent = 'บันทึกข้อมูล';
          if (err.status === 401) { requireLogin(); return; }
          setMsgOn(msg, err.message);
        }
      });

      void user;
    }

    function setMsgOn(el, text) {
      if (!el) return;
      el.textContent = text || '';
      el.className = 'form-msg' + (text ? ' is-error' : '');
    }

    await render();
  }

  /* ---------- ประวัติการจอง ---------- */

  var BOOKING_STATUS = {
    pending: { label: 'รอยืนยัน', cls: 'badge-pending' },
    active: { label: 'กำลังเช่า', cls: 'badge-active' },
    returned: { label: 'คืนแล้ว', cls: 'badge-returned' },
    cancelled: { label: 'ยกเลิก', cls: 'badge-cancelled' }
  };

  async function initBookings() {
    var root = $('bookings-root');
    if (!root) return;

    if (!sessionUser) {
      root.innerHTML = loginPrompt('ประวัติการจอง');
      return;
    }

    var filter = 'all';
    var bookings = [];
    var TABS = [['all', 'ทั้งหมด'], ['pending', 'รอยืนยัน'], ['active', 'กำลังเช่า'], ['returned', 'คืนแล้ว'], ['cancelled', 'ยกเลิก']];

    function row(booking) {
      var status = BOOKING_STATUS[booking.status] || BOOKING_STATUS.pending;
      var actions = '';

      if (booking.status === 'pending') {
        actions = '<div class="booking-actions">' +
          '<button class="btn-ghost" type="button" data-act="cancel" data-code="' + esc(booking.code) + '">ยกเลิกการจอง</button>' +
        '</div>';
      } else if (booking.status === 'active') {
        actions = '<div class="booking-actions">' +
          '<button class="btn-mini" type="button" data-act="return" data-code="' + esc(booking.code) + '">คืนสินค้าแล้ว</button>' +
        '</div>';
      } else if (booking.status === 'returned') {
        actions = '<p class="fine-print" style="margin-top:8px">คืนของครบแล้ว · ได้รับมัดจำ ' +
          baht(booking.deposit) + ' คืน</p>';
      } else {
        actions = '<p class="fine-print" style="margin-top:8px">ยกเลิกแล้ว ไม่มีการเรียกเก็บเงิน</p>';
      }

      return '' +
        '<article class="booking-item">' +
          '<div class="booking-thumb thumb thumb-' + esc(booking.itemCat || 'general') + '">' +
            '<span aria-hidden="true">' + esc(booking.itemEmoji || '📦') + '</span>' +
          '</div>' +
          '<div>' +
            '<span class="booking-code">' + esc(booking.code) + ' · ' + thDate(booking.createdAt) + '</span>' +
            '<h2><a href="item.html?id=' + encodeURIComponent(booking.itemId) + '">' + esc(booking.itemTitle) + '</a></h2>' +
            '<p class="item-meta">' + esc(booking.owner || 'ผู้ให้เช่า') + ' · ' + thDate(booking.start) + ' → ' +
              thDate(booking.end) + ' · ' + booking.days + ' วัน</p>' +
            actions +
          '</div>' +
          '<div class="booking-side">' +
            '<span class="badge ' + status.cls + '">' + status.label + '</span>' +
            '<strong>' + baht(booking.total) + '</strong>' +
            '<span class="booking-code">มัดจำ ' + baht(booking.deposit) + '</span>' +
          '</div>' +
        '</article>';
    }

    function paint() {
      var shown = bookings.filter(function (booking) { return filter === 'all' || booking.status === filter; });
      var active = bookings.filter(function (b) { return b.status === 'active' || b.status === 'pending'; }).length;
      var spent = bookings.reduce(function (sum, b) {
        return b.status === 'cancelled' ? sum : sum + Number(b.total || 0);
      }, 0);

      root.innerHTML = '' +
        '<div class="page-head">' +
          '<h1>ประวัติการจอง</h1>' +
          '<p>ติดตามสถานะการเช่า จัดการคำขอ และดูยอดที่ใช้ไปทั้งหมดของคุณ</p>' +
        '</div>' +
        '<div class="stat-strip">' +
          '<div class="stat"><b>' + bookings.length + '</b><span>การจองทั้งหมด</span></div>' +
          '<div class="stat"><b>' + active + '</b><span>กำลังดำเนินการ</span></div>' +
          '<div class="stat"><b>' + baht(spent) + '</b><span>ยอดใช้จ่ายรวม</span></div>' +
        '</div>' +
        '<div class="tabs">' +
          TABS.map(function (tab) {
            return '<button class="tab' + (filter === tab[0] ? ' is-active' : '') + '" type="button" data-tab="' +
              tab[0] + '">' + tab[1] + '</button>';
          }).join('') +
        '</div>' +
        (shown.length
          ? '<div class="booking-list">' + shown.map(row).join('') + '</div>'
          : '<div class="empty">' +
              '<h2 class="display display-sm">ยังไม่มีการจองในหมวดนี้</h2>' +
              '<p class="muted">เลือกของที่อยากใช้แล้วกดจอง ระบบจะเก็บประวัติไว้ที่นี่</p>' +
              '<a class="btn btn-cream" href="browse.html">ไปหาของที่อยากเช่า</a>' +
            '</div>');
    }

    async function load() {
      root.innerHTML = '<p class="muted" style="padding:40px 0">กำลังโหลดประวัติ...</p>';
      try {
        var data = await API.get('/bookings');
        bookings = data.bookings;
        paint();
      } catch (err) {
        root.innerHTML = loginPrompt('โหลดประวัติไม่สำเร็จ', err.message);
      }
    }

    root.addEventListener('click', async function (event) {
      var tabBtn = event.target.closest('[data-tab]');
      if (tabBtn) {
        filter = tabBtn.getAttribute('data-tab');
        paint();
        return;
      }

      var actBtn = event.target.closest('[data-act]');
      if (!actBtn) return;
      var action = actBtn.getAttribute('data-act');
      var code = actBtn.getAttribute('data-code');
      if (action === 'cancel' && !window.confirm('ยกเลิกการจอง ' + code + ' ใช่หรือไม่?')) return;

      actBtn.disabled = true;
      try {
        await API.patch('/bookings/' + encodeURIComponent(code), { action: action });
        toast(action === 'return' ? 'คืนสินค้าแล้ว รอรับมัดจำคืน' : 'ยกเลิกการจองแล้ว', 'ok');
        await load();
      } catch (err) {
        actBtn.disabled = false;
        showError(err);
      }
    });

    load();
  }

  /* ---------- bootstrap ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    if (window.location.protocol === 'file:') {
      bootHelp();
      return;
    }

    initHeader().then(function () {
      initHome().catch(showError);
      initBrowse().catch(showError);
      initDetail().catch(showError);
      initPost().catch(showError);
      initLookFor().catch(showError);
      initLogin().catch(showError);
      initProfile().catch(showError);
      initBookings().catch(showError);
    });
  });
})();
