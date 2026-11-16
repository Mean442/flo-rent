'use strict';

const crypto = require('crypto');

const KEY_LENGTH = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), parts[1], KEY_LENGTH);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function newId(prefix) {
  return prefix + '-' + crypto.randomBytes(5).toString('hex');
}

module.exports = { hashPassword, verifyPassword, newToken, newId };
