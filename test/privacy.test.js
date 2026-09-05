import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/store.js';
import { purgeExpired, exportSubject, eraseSubject, processingRegister } from '../src/store/privacy.js';
import { runAudit } from '../src/audit.js';
import { brand } from './fixtures/site.js';

const opts = { skipReadiness: true, promptCount: 4 };

/** Build a store holding one run, optionally backdated. */
async function seed(dir, ageDays = 0) {
  const store = new Store(dir);
  const report = await runAudit(brand, opts);
  if (ageDays) {
    report.createdAt = new Date(Date.now() - ageDays * 86400000).toISOString();
  }
  store.save(report);
  return { store, report };
}

test('purge is a dry run until confirmed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-priv-'));
  try {
    const { store } = await seed(dir, 900);
    const dry = purgeExpired(store, { days: 730, dryRun: true });
    assert.equal(dry.removed.length, 1);
    assert.equal(store.history(brand.domain).length, 1, 'a dry run deletes nothing');

    const real = purgeExpired(store, { days: 730, dryRun: false });
    assert.equal(real.removed.length, 1);
    assert.equal(store.history(brand.domain).length, 0, 'confirmed purge removes the run');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('purge keeps runs inside the retention window', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-priv-'));
  try {
    const { store } = await seed(dir, 10);
    const res = purgeExpired(store, { days: 730, dryRun: false });
    assert.equal(res.removed.length, 0);
    assert.equal(res.kept, 1);
    assert.equal(store.history(brand.domain).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('right-of-access export contains the full runs', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-priv-'));
  try {
    const { store, report } = await seed(dir);
    const out = path.join(dir, 'export.json');
    const res = exportSubject(store, store.brandKey(brand.domain), out);
    assert.equal(res.runCount, 1);
    assert.ok(existsSync(out));
    const payload = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(payload.runs.length, 1);
    assert.equal(payload.runs[0].id, report.id);
    assert.ok(payload.retentionDays > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('erasure removes every trace of a subject', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-priv-'));
  try {
    const { store } = await seed(dir);
    const res = eraseSubject(store, store.brandKey(brand.domain));
    assert.equal(res.runsDeleted, 1);
    assert.equal(store.history(brand.domain).length, 0);
    assert.equal(store.brands().length, 0, 'no empty shell is left behind');
    assert.equal(store.latest(brand.domain), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('processing register reflects the live configuration', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-priv-'));
  try {
    const { store } = await seed(dir);
    const reg = processingRegister(store);
    assert.equal(reg.storage.brandsHeld, 1);
    assert.equal(reg.storage.runsHeld, 1);
    assert.ok(reg.purposes.length >= 3);
    assert.ok(reg.subjectRights.access.includes('export'));
    assert.ok(reg.subjectRights.erasure.includes('erase'));
    assert.ok(/not legal advice/i.test(reg.note),
      'the register must not present itself as legal advice');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
