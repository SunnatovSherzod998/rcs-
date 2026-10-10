'use strict';
/**
 * Kriptografik yordamchilar (Node.js ichki modullar, tashqi paket yo'q)
 */
const crypto = require('node:crypto');

const KEYLEN = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, KEYLEN, COST).toString('hex');
  return { hash, salt: s };
}

function verifyPassword(password, hash, salt) {
  try {
    const candidate = crypto.scryptSync(String(password), salt, KEYLEN, COST);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { hashPassword, verifyPassword, randomToken };
