/**
 * Dashboard + REST API on the Node HTTP module. No framework, no dependencies.
 *
 * Binds to loopback by default: this ships without authentication, so exposing
 * it publicly is an explicit choice the operator has to make (and should put
 * behind their own auth proxy).
 * @module server/server
 */
import http from 'node:http';
import { Store } from '../store/store.js';
import { runAudit } from '../audit.js';
import { validateBrand, DEFAULTS, engineAvailability } from '../config.js';
import { renderReport } from '../report/html.js';
import { toMarkdown, outcomesCsv, checksCsv, recommendationsCsv } from '../report/exports.js';
import { ALL_ENGINES } from '../engines/index.js';
import { dashboardPage } from './dashboard.js';
import { log, c } from '../util/log.js';

const MAX_BODY = 256 * 1024;

/**
 * @param {{port?:number, host?:string, dataDir?:string}} [opts]
 */
export async function startServer(opts = {}) {
  const port = opts.port ?? DEFAULTS.port;
  const host = opts.host ?? '127.0.0.1';
  const store = new Store(opts.dataDir ?? DEFAULTS.dataDir);

  /** Guards against two audits of the same brand racing each other. */
  const running = new Map();

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      await route(req, res, store, running);
    } catch (err) {
      log.error(`${req.method} ${req.url} - ${err instanceof Error ? err.message : err}`);
      if (!res.headersSent) send(res, 500, { error: 'Internal error' });
    } finally {
      if (process.env.CITEBEAM_ACCESS_LOG) {
        log.info(c.dim(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`));
      }
    }
  });

  await new Promise((resolve) => server.listen(Number(port), String(host), () => resolve(undefined)));
  log.blank();
  log.ok(`CiteBeam dashboard running at ${c.bold(`http://${host}:${port}`)}`);
  log.info(c.dim(`   data directory: ${store.dir}`));
  const ready = engineAvailability().filter((e) => e.ready);
  log.info(c.dim(ready.length
    ? `   live engines: ${ready.map((e) => e.id).join(', ')}`
    : '   no API keys set - audits will use the offline simulation engine'));
  log.blank();
  return server;
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Store} store
 * @param {Map<string,Promise<any>>} running
 */
async function route(req, res, store, running) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  if (method === 'GET' && p === '/') {
    return sendHtml(res, dashboardPage());
  }
  if (method === 'GET' && p === '/api/health') {
    return send(res, 200, { ok: true, version: '1.0.0', uptime: process.uptime() });
  }
  if (method === 'GET' && p === '/api/engines') {
    return send(res, 200, {
      engines: ALL_ENGINES.map((e) => ({ id: e.id, label: e.label, live: e.live, ready: e.ready })),
      credentials: engineAvailability(),
    });
  }
  if (method === 'GET' && p === '/api/brands') {
    return send(res, 200, { brands: store.brands() });
  }

  let m = p.match(/^\/api\/brands\/([^/]+)$/);
  if (m && method === 'GET') {
    const key = decodeURIComponent(m[1]);
    const history = store.history(key);
    if (!history.length) return send(res, 404, { error: 'No runs for that brand' });
    return send(res, 200, { key, history, trend: store.trend(key) });
  }
  if (m && method === 'DELETE') {
    store.remove(decodeURIComponent(m[1]));
    return send(res, 200, { ok: true });
  }

  m = p.match(/^\/api\/brands\/([^/]+)\/runs\/([^/]+)$/);
  if (m && method === 'GET') {
    const report = store.load(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (!report) return send(res, 404, { error: 'Run not found' });
    return send(res, 200, report);
  }

  // Rendered artefacts. ?format= selects html (default), md, csv variants.
  m = p.match(/^\/report\/([^/]+)(?:\/([^/]+))?$/);
  if (m && method === 'GET') {
    const key = decodeURIComponent(m[1]);
    const report = m[2] ? store.load(key, decodeURIComponent(m[2])) : store.latest(key);
    if (!report) return sendHtml(res, notFoundPage(key), 404);
    const format = url.searchParams.get('format') || 'html';
    if (format === 'md') return sendText(res, toMarkdown(report), 'text/markdown');
    if (format === 'json') return send(res, 200, report);
    if (format === 'outcomes.csv') return sendCsv(res, outcomesCsv(report), 'outcomes');
    if (format === 'checks.csv') return sendCsv(res, checksCsv(report), 'checks');
    if (format === 'actions.csv') return sendCsv(res, recommendationsCsv(report), 'actions');
    return sendHtml(res, renderReport(report));
  }

  if (method === 'POST' && p === '/api/audit') {
    let body;
    try { body = await readJson(req); }
    catch (err) { return send(res, 400, { error: String(err.message || err) }); }

    let brand;
    try { brand = validateBrand(body.brand || body); }
    catch (err) { return send(res, 422, { error: String(err.message || err) }); }

    const key = store.brandKey(brand.domain);
    if (running.has(key)) {
      return send(res, 409, { error: 'An audit for this brand is already running', key });
    }

    const job = (async () => {
      const report = await runAudit(brand, {
        engines: Array.isArray(body.engines) ? body.engines : undefined,
        promptCount: Number(body.promptCount) || undefined,
        maxPages: Number(body.maxPages) || undefined,
        skipVisibility: !!body.skipVisibility,
        skipReadiness: !!body.skipReadiness,
        previous: store.previous(brand.domain),
      });
      store.save(report);
      return report;
    })();
    running.set(key, job);
    try {
      const report = await job;
      return send(res, 200, {
        id: report.id,
        key,
        composite: report.meta.compositeScore,
        grade: report.meta.grade,
        simulated: report.simulated,
        blocked: !!report.readiness?.blocked,
        reportUrl: `/report/${encodeURIComponent(key)}/${encodeURIComponent(report.id)}`,
        summary: {
          visibility: report.visibility?.score ?? null,
          readiness: report.readiness?.overall ?? null,
          mentionRate: report.visibility?.mentionRate ?? null,
          recommendations: (report.recommendations || []).length,
        },
      });
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      running.delete(key);
    }
  }

  return send(res, 404, { error: 'Not found' });
}

/* ---------------- helpers ---------------- */

/** @param {http.IncomingMessage} req */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function send(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    ...SECURITY_HEADERS,
  });
  res.end(html);
}

function sendText(res, text, type = 'text/plain') {
  res.writeHead(200, {
    'content-type': `${type}; charset=utf-8`,
    'content-length': Buffer.byteLength(text),
    ...SECURITY_HEADERS,
  });
  res.end(text);
}

function sendCsv(res, text, name) {
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="citebeam-${name}.csv"`,
    'content-length': Buffer.byteLength(text),
    ...SECURITY_HEADERS,
  });
  res.end(text);
}

function notFoundPage(key) {
  const safe = String(key).replace(/[&<>"']/g, '');
  return `<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font:16px system-ui;padding:48px;max-width:640px;margin:0 auto">
<h1>No report for ${safe}</h1>
<p>Run an audit first, then reload this page.</p>
<p><a href="/">Back to the dashboard</a></p></body>`;
}
