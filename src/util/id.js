/** Deterministic and random identifier helpers. @module util/id */
import { createHash, randomUUID } from 'node:crypto';

/** @param {string} input @param {number} len */
export function hashId(input, len = 10) {
  return createHash('sha256').update(String(input)).digest('hex').slice(0, len);
}

export function uuid() { return randomUUID(); }

/** Human-sortable run id, e.g. 20260905-143012-ab12cd */
export function runId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `${stamp}-${randomUUID().slice(0, 6)}`;
}

/** Slugify for filenames. @param {string} s */
export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'brand';
}

/**
 * Deterministic 0..1 value from a seed string. The offline simulation engine
 * uses this so demo and test runs are byte-for-byte reproducible.
 * @param {string} seed
 */
export function seededUnit(seed) {
  const h = createHash('sha256').update(String(seed)).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

/**
 * Deterministic integer in [0, max).
 * @param {string} seed @param {number} max
 */
export function seededInt(seed, max) {
  return Math.floor(seededUnit(seed) * max) % Math.max(1, max);
}
