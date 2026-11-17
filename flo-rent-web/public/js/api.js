/* FLO-RENT — ชั้นเชื่อมต่อ API (fetch + token) */
var FLO_API = (function () {
  'use strict';

  var TOKEN_KEY = 'florent_token_v1';

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (err) { return ''; }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* โหมดส่วนตัวอาจเขียนไม่ได้ */ }
  }

  function wait(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); }

  /* GET ที่ได้ 401 ทั้งที่มี token: ลองซ้ำอีกครั้งก่อนยอมแพ้ (กันกรณีเซิร์ฟเวอร์ตอบพลาดชั่วคราว แล้วถูกมองว่าหลุดจากระบบ) */
  async function request(method, path, body, retried) {
    var headers = { Accept: 'application/json' };
    var active = token();
    if (active) headers.Authorization = 'Bearer ' + active;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    var response;
    try {
      response = await fetch('/api' + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store'
      });
    } catch (err) {
      var offline = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่ารัน `npm start` อยู่');
      offline.status = 0;
      throw offline;
    }

    var payload = null;
    try { payload = await response.json(); } catch (err) { payload = null; }

    if (response.status === 401 && active && method === 'GET' && !retried) {
      await wait(500);
      return request(method, path, body, true);
    }

    if (!response.ok) {
      var failure = new Error((payload && payload.error) || 'เกิดข้อผิดพลาด (' + response.status + ')');
      failure.status = response.status;
      failure.data = payload;
      throw failure;
    }

    return payload;
  }

  return {
    token: token,
    setToken: setToken,
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body === undefined ? {} : body); },
    patch: function (path, body) { return request('PATCH', path, body === undefined ? {} : body); },
    del: function (path) { return request('DELETE', path); }
  };
})();
