import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/server.js';

let server; let base; let dir;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'citebeam-srv-'));
  server = await startServer({ port: 0, host: '127.0.0.1', dataDir: dir });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

test('serves the dashboard', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('CiteBeam'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('health and engine endpoints respond', async () => {
  assert.equal((await fetch(base + '/api/health').then((r) => r.json())).ok, true);
  const engines = await fetch(base + '/api/engines').then((r) => r.json());
  assert.ok(Array.isArray(engines.engines) && engines.engines.length >= 5);
  assert.ok(Array.isArray(engines.credentials));
});

test('rejects an invalid brand with 422 and an explanatory message', async () => {
  const res = await fetch(base + '/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brand: { name: 'Only a name' } }),
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.error, /domain/);
  assert.match(body.error, /category/);
});

test('rejects a malformed body with 400', async () => {
  const res = await fetch(base + '/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});

test('runs an audit and exposes the stored report', async () => {
  const res = await fetch(base + '/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      brand: {
        name: 'Northwind Plumbing', domain: 'northwindplumbing.test',
        category: 'emergency plumbing services',
        competitors: [{ name: 'RiverCity Plumbers' }],
      },
      promptCount: 6,
      skipReadiness: true,
    }),
  });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.ok(out.id);
  assert.equal(out.simulated, true);
  assert.ok(out.reportUrl.startsWith('/report/'));

  const brands = await fetch(base + '/api/brands').then((r) => r.json());
  assert.equal(brands.brands.length, 1);

  const html = await fetch(base + out.reportUrl).then((r) => r.text());
  assert.ok(html.includes('Northwind Plumbing'));

  const md = await fetch(base + out.reportUrl + '?format=md').then((r) => r.text());
  assert.ok(md.startsWith('# AI Visibility Report'));

  const csvRes = await fetch(base + out.reportUrl + '?format=outcomes.csv');
  assert.match(csvRes.headers.get('content-disposition'), /attachment/);
});

test('unknown routes and reports 404 cleanly', async () => {
  assert.equal((await fetch(base + '/api/nope')).status, 404);
  assert.equal((await fetch(base + '/report/not-a-brand')).status, 404);
});

test('path traversal in a run id does not escape the store', async () => {
  const res = await fetch(base + '/api/brands/x/runs/' + encodeURIComponent('../../etc/passwd'));
  assert.equal(res.status, 404);
});
