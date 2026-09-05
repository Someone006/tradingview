/**
 * Minimal, dependency-free HTTP client built on the global fetch in Node 20+.
 * Adds timeouts, bounded retries with backoff, size caps and a polite UA.
 * @module util/http
 */

export const USER_AGENT =
  'CiteBeam/1.0 (+https://citebeam.dev/bot; AEO readiness auditor)';

const DEFAULT_TIMEOUT = 15000;
const MAX_BYTES = 2_500_000;

/** @typedef {{timeout?:number, retries?:number, headers?:Record<string,string>, method?:string, body?:any, maxBytes?:number}} FetchOpts */

/**
 * Fetch a URL as text with timeout + retry. Never throws for HTTP errors;
 * throws only on network/timeout exhaustion.
 * @param {string} url
 * @param {FetchOpts} [opts]
 * @returns {Promise<{status:number, ok:boolean, text:string, headers:Record<string,string>, url:string, latencyMs:number, truncated:boolean}>}
 */
export async function fetchText(url, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = 2,
    headers = {},
    method = 'GET',
    body,
    maxBytes = MAX_BYTES,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        body,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...headers,
        },
      });
      const raw = await res.text();
      const truncated = raw.length > maxBytes;
      clearTimeout(timer);
      return {
        status: res.status,
        ok: res.ok,
        text: truncated ? raw.slice(0, maxBytes) : raw,
        headers: Object.fromEntries(res.headers.entries()),
        url: res.url || url,
        latencyMs: Date.now() - started,
        truncated,
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // Abort due to our own timeout is retryable; so are transient network errors.
      if (attempt < retries) await sleep(400 * Math.pow(2, attempt));
    }
  }
  throw new Error(`fetch failed for ${url}: ${lastErr && lastErr.message ? lastErr.message : lastErr}`);
}

/**
 * POST JSON and parse a JSON response. Used by the LLM engine adapters.
 * @param {string} url
 * @param {any} payload
 * @param {FetchOpts} [opts]
 */
export async function postJson(url, payload, opts = {}) {
  const res = await fetchText(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    timeout: opts.timeout ?? 60000,
    retries: opts.retries ?? 1,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  let json = null;
  try { json = JSON.parse(res.text); } catch { /* leave null, caller inspects status */ }
  return { ...res, json };
}

/** @param {number} ms */
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Run tasks with bounded concurrency, preserving input order in the result.
 * @template T,R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item:T, index:number)=>Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length || 1));
  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Normalise a user-supplied domain or URL into { origin, host }.
 * @param {string} input
 */
export function normaliseSite(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('A domain is required');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const u = new URL(raw);
  return { origin: u.origin, host: u.host.replace(/^www\./i, ''), href: u.href };
}

/**
 * Compare two hostnames ignoring www and case.
 * @param {string} a @param {string} b
 */
export function sameHost(a, b) {
  const clean = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
  return clean(a) === clean(b);
}

/**
 * Extract the registrable-ish host from a URL string; returns '' when unparseable.
 * @param {string} url
 */
export function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
