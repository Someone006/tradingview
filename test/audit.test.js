import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAudit, gradeFor, computeDelta } from '../src/audit.js';
import { renderReport } from '../src/report/html.js';
import { toMarkdown, outcomesCsv, checksCsv, recommendationsCsv } from '../src/report/exports.js';
import { Store } from '../src/store/store.js';
import { brand } from './fixtures/site.js';

/** Visibility-only audits use the offline engine and touch no network. */
const opts = { skipReadiness: true, promptCount: 8 };

test('a visibility-only audit produces a complete report', async () => {
  const r = await runAudit(brand, opts);
  assert.ok(r.id);
  assert.equal(r.simulated, true);
  assert.equal(r.outcomes.length, 8);
  assert.ok(r.meta.compositeScore >= 0 && r.meta.compositeScore <= 1);
  assert.ok(Array.isArray(r.recommendations));
  assert.ok(r.meta.notes.some((n) => /simulation/i.test(n)),
    'the report must disclose that the data is simulated');
});

test('the simulation engine is deterministic', async () => {
  const [a, b] = await Promise.all([runAudit(brand, opts), runAudit(brand, opts)]);
  assert.equal(a.visibility.score, b.visibility.score);
  assert.equal(a.visibility.mentionRate, b.visibility.mentionRate);
});

test('grades map to the documented bands', () => {
  assert.equal(gradeFor(0.9), 'A');
  assert.equal(gradeFor(0.75), 'B');
  assert.equal(gradeFor(0.6), 'C');
  assert.equal(gradeFor(0.45), 'D');
  assert.equal(gradeFor(0.1), 'F');
});

test('renders HTML with no placeholder leakage', async () => {
  const r = await runAudit(brand, opts);
  const html = renderReport(r);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(brand.name));
  assert.ok(!/undefined|NaN|\[object Object\]/.test(html), 'no leaked placeholders');
  assert.ok(html.includes('Simulated data'), 'simulated runs must carry the banner');
});

test('HTML escaping neutralises injected markup', async () => {
  const nasty = {
    ...brand,
    name: '<script>alert(1)</script>',
    competitors: [{ name: '"><img src=x onerror=alert(1)>', aliases: [] }],
  };
  const html = renderReport(await runAudit(nasty, opts));
  // The report is a static document with no scripts of its own, and this
  // profile sets no logo, so any <script or <img in the output would mean
  // injected markup survived escaping as a live tag.
  assert.ok(!/<script/i.test(html), 'no script tag reaches the document');
  assert.ok(!/<img/i.test(html), 'no img tag reaches the document');
  // The hostile text is still shown to the reader - escaped, not stripped.
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('exports produce parseable output', async () => {
  const r = await runAudit(brand, opts);
  assert.ok(toMarkdown(r).startsWith('# AI Visibility Report'));
  const csv = outcomesCsv(r);
  const header = csv.split('\n')[0].split(',');
  assert.ok(header.includes('prompt'));
  assert.equal(csv.split('\n').length, r.outcomes.length + 1);
  assert.ok(checksCsv(r).startsWith('run_id,'));
  assert.ok(recommendationsCsv(r).startsWith('run_id,'));
});

test('CSV cells containing commas and quotes are escaped', async () => {
  const r = await runAudit({
    ...brand,
    extraPrompts: ['A prompt with, a comma and "quotes" in it'],
  }, { ...opts, promptCount: 12 });
  const line = outcomesCsv(r).split('\n').find((l) => l.includes('a comma'));
  assert.ok(line, 'the prompt made it into the CSV');
  assert.ok(line.includes('""quotes""'), 'quotes are doubled');
});

test('operator-supplied prompts are never trimmed away', async () => {
  const custom = 'A very specific question the operator insisted on';
  const r = await runAudit({ ...brand, extraPrompts: [custom] }, { ...opts, promptCount: 3 });
  assert.equal(r.outcomes.length, 3);
  assert.ok(r.outcomes.some((o) => o.promptText === custom),
    'a pinned prompt survives even a limit smaller than the generated set');
});

test('the store round-trips runs and computes deltas', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'citebeam-'));
  try {
    const store = new Store(dir);
    const first = await runAudit(brand, opts);
    store.save(first);
    const second = await runAudit(brand, { ...opts, promptCount: 10 });
    store.save(second);

    assert.equal(store.history(brand.domain).length, 2);
    assert.equal(store.latest(brand.domain).id, second.id);
    assert.equal(store.previous(brand.domain, second.id).id, first.id);
    assert.equal(store.brands().length, 1);
    assert.equal(store.trend(brand.domain).length, 2);
    assert.deepEqual(store.load(brand.domain, first.id).id, first.id);

    const d = computeDelta(second, first);
    assert.equal(d.previousId, first.id);
    assert.equal(typeof d.composite, 'number');
    assert.ok(Array.isArray(d.resolved) && Array.isArray(d.introduced));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the store rejects path traversal in run ids', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'citebeam-'));
  try {
    const store = new Store(dir);
    assert.equal(store.load('x', '../../etc/passwd'), null);
    assert.equal(store.load('x', 'a/b'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
