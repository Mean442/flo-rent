/* FLO-RENT — หน้าแอดมิน (ใช้ API เดียวกับหน้าเว็บ) */
(function () {
  'use strict';

  var API = window.FLO_API;
  var root = document.getElementById('admin-root');
  if (!root) return;

  var TABS = [
    ['overview', 'ภาพรวม'],
    ['users', 'ผู้ใช้'],
    ['items', 'ประกาศ'],
    ['bookings', 'การจอง'],
    ['requests', 'คำขอตามหา']
  ];

  var STATUS = {
    pending: { label: 'รอยืนยัน', cls: 'badge-pending' },
    active: { label: 'กำลังเช่า', cls: 'badge-active' },
    returned: { label: 'คืนแล้ว', cls: 'badge-returned' },
    cancelled: { label: 'ยกเลิก', cls: 'badge-cancelled' }
  };

  var CATS = window.FLO_CATEGORIES || [];
  var tab = 'overview';
  var me = null;
  var stats = null;
  var users = [];
  var items = [];
  var bookings = [];
  var requests = [];
  var userQuery = '';
  var itemQuery = '';
  var bookingFilter = 'all';
  var busy = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function baht(number) {
    return '฿' + Number(number || 0).toLocaleString('th-TH');
  }

  function thDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  function catName(key) {
    for (var i = 0; i < CATS.length; i += 1) {
      if (CATS[i].key === key) return CATS[i].name;
    }
    return 'อื่น ๆ';
  }

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

  function gate(title, message, href) {
    return '' +
      '<div class="empty">' +
        '<h1 class="display display-sm">' + esc(title) + '</h1>' +
        '<p class="muted">' + esc(message) + '</p>' +
        '<div class="success-actions">' +
          '<a class="btn btn-cream" href="' + (href || 'login.html?next=admin.html') + '">' +
            (href ? 'กลับหน้าแรก' : 'เข้าสู่ระบบ') + '</a>' +
        '</div>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    if (window.location.protocol === 'file:') {
      root.innerHTML = gate('ต้องเปิดผ่านเซิร์ฟเวอร์', 'รัน npm start แล้วเปิด http://127.0.0.1:4173/admin.html', 'index.html');
      return;
    }

    root.innerHTML = '<p class="muted" style="padding:40px 0">กำลังตรวจสอบสิทธิ์...</p>';

    try {
      var data = await API.get('/me');
      me = data.user;
    } catch (err) {
      root.innerHTML = gate('ต้องเข้าสู่ระบบก่อน', 'หน้าแอดมินสำหรับผู้ดูแลระบบเท่านั้น');
      return;
    }

    if (me.role !== 'admin') {
      root.innerHTML = gate('ไม่มีสิทธิ์เข้าถึง', 'บัญชีนี้ไม่ใช่ผู้ดูแลระบบ — เข้าสู่ระบบด้วย admin@flo-rent.co', 'index.html');
      return;
    }

    await refresh();
  }

  function query(path) {
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  }

  async function refresh() {
    root.setAttribute('aria-busy', 'true');
    try {
      if (tab === 'overview') {
        stats = await API.get(query('/admin/stats'));
      } else if (tab === 'users') {
        users = (await API.get(query('/admin/users?q=' + encodeURIComponent(userQuery)))).users;
      } else if (tab === 'items') {
        items = (await API.get(query('/admin/items?q=' + encodeURIComponent(itemQuery)))).items;
      } else if (tab === 'bookings') {
        bookings = (await API.get(query('/admin/bookings?status=' + encodeURIComponent(bookingFilter)))).bookings;
      } else if (tab === 'requests') {
        requests = (await API.get(query('/admin/requests'))).requests;
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        root.innerHTML = gate('ไม่มีสิทธิ์เข้าถึง', err.message, 'index.html');
        return;
      }
      toast(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
    root.removeAttribute('aria-busy');
    paint();
  }

  function paint() {
    root.innerHTML = '' +
      '<div class="page-head">' +
        '<h1>หลังบ้าน</h1>' +
        '<p>ภาพรวมระบบ จัดการผู้ใช้ ประกาศ การจอง และคำขอตามหา · เข้าใช้ในนาม ' + esc(me.name) + '</p>' +
      '</div>' +
      '<div class="admin-tabs">' +
        TABS.map(function (entry) {
          return '<button class="tab' + (tab === entry[0] ? ' is-active' : '') + '" type="button" data-tab="' +
            entry[0] + '">' + entry[1] + '</button>';
        }).join('') +
      '</div>' +
      '<div id="admin-panel">' + panel() + '</div>';
  }

  function statCard(value, label) {
    return '<div class="admin-stat"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  function emptyRow(cols, message) {
    return '<tr><td colspan="' + cols + '"><div class="admin-empty">' + esc(message || 'ไม่มีข้อมูล') + '</div></td></tr>';
  }

  function panel() {
    if (tab === 'overview') return overviewPanel();
    if (tab === 'users') return usersPanel();
    if (tab === 'items') return itemsPanel();
    if (tab === 'bookings') return bookingsPanel();
    return requestsPanel();
  }

  /* ---- overview ---- */

  function overviewPanel() {
    if (!stats) return '<p class="muted">กำลังโหลด...</p>';
    var s = stats;

    var recent = s.recentBookings.length
      ? s.recentBookings.map(function (booking) {
        var status = STATUS[booking.status] || STATUS.pending;
        return '<tr>' +
          '<td class="row-title">' + esc(booking.code) + '</td>' +
          '<td>' + esc(booking.itemTitle) + '</td>' +
          '<td>' + esc(booking.userName || '—') + '</td>' +
          '<td>' + baht(booking.total) + '</td>' +
          '<td><span class="badge ' + status.cls + '">' + status.label + '</span></td>' +
          '<td>' + thDate(booking.createdAt) + '</td>' +
        '</tr>';
      }).join('')
      : emptyRow(6, 'ยังไม่มีการจอง');

    return '' +
      '<div class="admin-stat-grid">' +
        statCard(s.users, 'ผู้ใช้ทั้งหมด (' + s.suspended + ' ถูกระงับ)') +
        statCard(s.items, 'ประกาศ (' + s.published + ' เผยแพร่ · ' + s.hidden + ' ซ่อน)') +
        statCard(s.bookings, 'การจองทั้งหมด') +
        statCard(baht(s.revenue), 'ยอดรวมที่ไม่ถูกยกเลิก') +
        statCard(s.byStatus.pending + s.byStatus.active, 'รอดำเนินการ') +
        statCard(s.requests, 'คำขอตามหา') +
      '</div>' +
      '<div class="admin-panel">' +
        '<h2>การจองล่าสุด</h2>' +
        '<p class="item-meta">สถานะ: รอยืนยัน ' + s.byStatus.pending + ' · กำลังเช่า ' + s.byStatus.active +
          ' · คืนแล้ว ' + s.byStatus.returned + ' · ยกเลิก ' + s.byStatus.cancelled + '</p>' +
        '<div class="table-wrap"><table class="admin-table">' +
          '<thead><tr><th>รหัส</th><th>สินค้า</th><th>ผู้เช่า</th><th>ยอดรวม</th><th>สถานะ</th><th>วันที่จอง</th></tr></thead>' +
          '<tbody>' + recent + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  /* ---- users ---- */

  function usersPanel() {
    var rows = users.length ? users.map(userRow).join('') : emptyRow(8, 'ไม่พบผู้ใช้');

    return '' +
      '<div class="admin-panel">' +
        '<h2>ผู้ใช้ (' + users.length + ')</h2>' +
        '<form class="admin-toolbar" data-search="users">' +
          '<label class="field" style="flex:1;min-width:220px"><span>ค้นหา</span>' +
            '<input type="search" name="q" value="' + esc(userQuery) + '" placeholder="ชื่อหรืออีเมล"></label>' +
          '<button class="btn btn-maroon btn-sm" type="submit">ค้นหา</button>' +
        '</form>' +
        '<div class="table-wrap"><table class="admin-table">' +
          '<thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>สถานะ</th><th>การจอง</th><th>ใช้จ่าย</th><th>ประกาศ</th><th>สมัครเมื่อ</th><th>จัดการ</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  function userRow(user) {
    var isSelf = me && user.id === me.id;
    var actions = isSelf
      ? '<span class="item-meta">บัญชีที่ใช้อยู่</span>'
      : '<div class="admin-actions">' +
          '<button class="btn-ghost" type="button" data-act="user-role" data-id="' + esc(user.id) +
            '" data-value="' + (user.role === 'admin' ? 'user' : 'admin') + '">' +
            (user.role === 'admin' ? 'ลดสิทธิ์' : 'ตั้งเป็นแอดมิน') + '</button>' +
          '<button class="btn-ghost" type="button" data-act="user-status" data-id="' + esc(user.id) +
            '" data-value="' + (user.status === 'active' ? 'suspended' : 'active') + '">' +
            (user.status === 'active' ? 'ระงับ' : 'เปิดใช้') + '</button>' +
        '</div>';

    return '<tr>' +
      '<td><div class="row-title">' + esc(user.name) + '</div><div class="item-meta">' + esc(user.email) + '</div></td>' +
      '<td><span class="pill ' + (user.role === 'admin' ? 'pill-info' : '') + '">' +
        (user.role === 'admin' ? 'แอดมิน' : 'ผู้ใช้') + '</span></td>' +
      '<td><span class="pill ' + (user.status === 'active' ? 'pill-ok' : 'pill-bad') + '">' +
        (user.status === 'active' ? 'ใช้งาน' : 'ระงับ') + '</span></td>' +
      '<td>' + user.bookingCount + '</td>' +
      '<td>' + baht(user.spent) + '</td>' +
      '<td>' + user.listingCount + '</td>' +
      '<td>' + thDate(user.joinedAt) + '</td>' +
      '<td>' + actions + '</td>' +
    '</tr>';
  }

  /* ---- items ---- */

  function itemsPanel() {
    var rows = items.length ? items.map(itemRow).join('') : emptyRow(7, 'ไม่พบประกาศ');

    return '' +
      '<div class="admin-panel">' +
        '<h2>ประกาศ (' + items.length + ')</h2>' +
        '<form class="admin-toolbar" data-search="items">' +
          '<label class="field" style="flex:1;min-width:220px"><span>ค้นหา</span>' +
            '<input type="search" name="q" value="' + esc(itemQuery) + '" placeholder="ชื่อสินค้า ผู้ให้เช่า หรือรหัส"></label>' +
          '<button class="btn btn-maroon btn-sm" type="submit">ค้นหา</button>' +
        '</form>' +
        '<div class="table-wrap"><table class="admin-table">' +
          '<thead><tr><th>สินค้า</th><th>หมวด</th><th>ผู้ให้เช่า</th><th>ราคา/วัน</th><th>มัดจำ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  function itemRow(item) {
    return '<tr>' +
      '<td><div class="row-title">' + esc(item.emoji) + ' ' + esc(item.title) + '</div>' +
        '<div class="item-meta">' + esc(item.id) + ' · ' + thDate(item.createdAt) + '</div></td>' +
      '<td>' + esc(catName(item.cat)) + '</td>' +
      '<td>' + esc(item.owner) + '</td>' +
      '<td>' + baht(item.price) + '</td>' +
      '<td>' + baht(item.deposit) + '</td>' +
      '<td><span class="pill ' + (item.status === 'published' ? 'pill-ok' : 'pill-warn') + '">' +
        (item.status === 'published' ? 'เผยแพร่' : 'ซ่อน') + '</span></td>' +
      '<td><div class="admin-actions">' +
        '<button class="btn-ghost" type="button" data-act="item-toggle" data-id="' + esc(item.id) +
          '" data-value="' + (item.status === 'published' ? 'hidden' : 'published') + '">' +
          (item.status === 'published' ? 'ซ่อน' : 'เผยแพร่') + '</button>' +
        '<button class="btn-ghost" type="button" data-act="item-delete" data-id="' + esc(item.id) + '">ลบ</button>' +
      '</div></td>' +
    '</tr>';
  }

  /* ---- bookings ---- */

  function bookingsPanel() {
    var rows = bookings.length ? bookings.map(bookingRow).join('') : emptyRow(8, 'ไม่พบการจอง');

    return '' +
      '<div class="admin-panel">' +
        '<h2>การจอง (' + bookings.length + ')</h2>' +
        '<div class="admin-toolbar">' +
          '<label class="field" style="min-width:180px"><span>กรองตามสถานะ</span>' +
            '<select data-booking-filter>' +
              ['all', 'pending', 'active', 'returned', 'cancelled'].map(function (value) {
                var label = value === 'all' ? 'ทั้งหมด' : STATUS[value].label;
                return '<option value="' + value + '"' + (bookingFilter === value ? ' selected' : '') + '>' + label + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<span class="item-meta" style="padding-bottom:10px">เปลี่ยนสถานะได้จากช่องในตาราง</span>' +
        '</div>' +
        '<div class="table-wrap"><table class="admin-table">' +
          '<thead><tr><th>รหัส</th><th>สินค้า</th><th>ผู้เช่า</th><th>ช่วงวันที่</th><th>ยอดรวม</th><th>มัดจำ</th><th>สถานะ</th><th>เปลี่ยนสถานะ</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  function bookingRow(booking) {
    return '<tr>' +
      '<td class="row-title">' + esc(booking.code) + '<div class="item-meta">' + thDate(booking.createdAt) + '</div></td>' +
      '<td>' + esc(booking.itemEmoji || '📦') + ' ' + esc(booking.itemTitle) + '</td>' +
      '<td>' + esc(booking.userName || '—') + '</td>' +
      '<td>' + thDate(booking.start) + ' → ' + thDate(booking.end) + '<div class="item-meta">' + booking.days + ' วัน</div></td>' +
      '<td>' + baht(booking.total) + '</td>' +
      '<td>' + baht(booking.deposit) + '</td>' +
      '<td>' + (STATUS[booking.status] ? STATUS[booking.status].label : booking.status) + '</td>' +
      '<td><select class="status-select" data-booking-status="' + esc(booking.code) + '">' +
        ['pending', 'active', 'returned', 'cancelled'].map(function (value) {
          return '<option value="' + value + '"' + (booking.status === value ? ' selected' : '') + '>' +
            STATUS[value].label + '</option>';
        }).join('') +
      '</select></td>' +
    '</tr>';
  }

  /* ---- requests ---- */

  function requestsPanel() {
    var rows = requests.length ? requests.map(function (request) {
      return '<tr>' +
        '<td class="row-title">' + esc(request.want) + '</td>' +
        '<td>' + esc(request.name) + '</td>' +
        '<td>' + esc(catName(request.cat)) + '</td>' +
        '<td>' + baht(request.budget) + '</td>' +
        '<td>' + esc(request.when) + '</td>' +
        '<td>' + thDate(request.createdAt) + '</td>' +
        '<td><button class="btn-ghost" type="button" data-act="request-delete" data-id="' + esc(request.id) + '">ลบ</button></td>' +
      '</tr>';
    }).join('') : emptyRow(7, 'ไม่มีคำขอตามหา');

    return '' +
      '<div class="admin-panel">' +
        '<h2>คำขอตามหา (' + requests.length + ')</h2>' +
        '<div class="table-wrap"><table class="admin-table">' +
          '<thead><tr><th>ต้องการ</th><th>ผู้ประกาศ</th><th>หมวด</th><th>งบ/วัน</th><th>ช่วงวันที่</th><th>ประกาศเมื่อ</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  /* ---- interactions ---- */

  root.addEventListener('click', async function (event) {
    var tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.getAttribute('data-tab');
      await refresh();
      return;
    }

    var btn = event.target.closest('[data-act]');
    if (!btn || busy) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');
    var value = btn.getAttribute('data-value');

    if (act === 'user-status' && value === 'suspended' &&
        !window.confirm('ระงับบัญชีนี้? ผู้ใช้จะถูกออกจากระบบทันที')) return;
    if (act === 'item-delete' && !window.confirm('ลบประกาศนี้ถาวร?')) return;
    if (act === 'request-delete' && !window.confirm('ลบคำขอนี้?')) return;

    busy = true;
    btn.disabled = true;
    try {
      if (act === 'user-role') await API.patch('/admin/users/' + encodeURIComponent(id), { role: value });
      if (act === 'user-status') await API.patch('/admin/users/' + encodeURIComponent(id), { status: value });
      if (act === 'item-toggle') await API.patch('/admin/items/' + encodeURIComponent(id), { status: value });
      if (act === 'item-delete') await API.del('/admin/items/' + encodeURIComponent(id));
      if (act === 'request-delete') await API.del('/admin/requests/' + encodeURIComponent(id));
      toast('อัปเดตข้อมูลแล้ว', 'ok');
      await refresh();
    } catch (err) {
      toast(err.message || 'ทำรายการไม่สำเร็จ');
      btn.disabled = false;
    } finally {
      busy = false;
    }
  });

  root.addEventListener('change', async function (event) {
    var statusSelect = event.target.closest('[data-booking-status]');
    if (statusSelect) {
      statusSelect.disabled = true;
      try {
        await API.patch('/admin/bookings/' + encodeURIComponent(statusSelect.getAttribute('data-booking-status')), {
          status: statusSelect.value
        });
        toast('อัปเดตสถานะการจองแล้ว', 'ok');
      } catch (err) {
        toast(err.message || 'อัปเดตไม่สำเร็จ');
      }
      await refresh();
      return;
    }

    var filterSelect = event.target.closest('[data-booking-filter]');
    if (filterSelect) {
      bookingFilter = filterSelect.value;
      await refresh();
    }
  });

  root.addEventListener('submit', async function (event) {
    var search = event.target.closest('[data-search]');
    if (!search) return;
    event.preventDefault();
    var kind = search.getAttribute('data-search');
    var value = search.querySelector('input').value.trim();
    if (kind === 'users') userQuery = value;
    if (kind === 'items') itemQuery = value;
    await refresh();
  });
})();
