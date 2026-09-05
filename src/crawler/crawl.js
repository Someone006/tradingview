/**
 * Site crawler for AEO auditing. Fetches robots.txt, llms.txt, the sitemap and
 * a bounded set of high-value pages, returning a snapshot the check suite
 * scores. Deliberately small and polite: this audits a site, it does not mirror it.
 * @module crawler/crawl
 */
import { fetchText, normaliseSite, pool, hostOf, sameHost } from '../util/http.js';
import * as H from '../util/html.js';
import { parseRobots, isAllowed } from './robots.js';
import { USER_AGENT } from '../util/http.js';
import { log } from '../util/log.js';

/** The token site owners would use to address this crawler in robots.txt. */
export const OWN_UA_TOKEN = 'CiteBeam';

/** Page paths that carry disproportionate AEO weight, tried in order. */
const PRIORITY_PATTERNS = [
  /\/(pricing|plans|cost)\b/i,
  /\/(vs|versus|compare|comparison|alternatives?)\b/i,
  /\/(faq|faqs|help|support|questions)\b/i,
  /\/(about|company|who-we-are)\b/i,
  /\/(services|solutions|products?|features?)\b/i,
  /\/(blog|guides?|resources?|learn|docs?)\b/i,
  /\/(reviews?|testimonials|case-stud)/i,
  /\/(contact|locations?)\b/i,
];

/**
 * Fetch one page and build a snapshot.
 * @param {string} url
 * @param {number} timeout
 * @returns {Promise<import('../types.js').PageSnapshot>}
 */
export async function fetchPage(url, timeout = 15000) {
  /** @type {import('../types.js').PageSnapshot} */
  const base = {
    url, status: 0, html: '', text: '', title: '', description: '',
    headings: [], jsonld: [], links: [], bytes: 0, latencyMs: 0,
  };
  try {
    const res = await fetchText(url, { timeout, retries: 1 });
    const html = res.text || '';
    return {
      ...base,
      url: res.url,
      status: res.status,
      html,
      text: H.toText(html),
      title: H.title(html),
      description: H.meta(html, 'description') || H.meta(html, 'og:description'),
      headings: H.extractHeadings(html),
      jsonld: H.extractJsonLd(html),
      links: H.extractLinks(html, res.url),
      bytes: html.length,
      latencyMs: res.latencyMs,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fetch a plain-text resource, returning null when absent.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export async function fetchPlain(url) {
  try {
    const res = await fetchText(url, { timeout: 10000, retries: 1 });
    if (!res.ok) return null;
    // Some hosts serve an HTML 404 page with a 200 status.
    if (/<html[\s>]/i.test(res.text.slice(0, 400))) return null;
    return res.text;
  } catch { return null; }
}

/**
 * Read sitemap URLs, following one level of sitemap-index nesting.
 * @param {string} origin
 * @param {string|null} robotsTxt
 * @returns {Promise<string[]>}
 */
export async function fetchSitemapUrls(origin, robotsTxt) {
  const candidates = new Set([`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]);
  for (const line of String(robotsTxt || '').split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) candidates.add(m[1].trim());
  }
  /** @type {string[]} */
  const urls = [];
  /** @type {string[]} */
  const indexes = [];
  for (const sm of [...candidates].slice(0, 4)) {
    const body = await fetchText(sm, { timeout: 10000, retries: 0 })
      .then((r) => (r.ok ? r.text : null)).catch(() => null);
    if (!body) continue;
    const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    if (/<sitemapindex/i.test(body)) indexes.push(...locs.slice(0, 3));
    else urls.push(...locs);
  }
  for (const child of indexes.slice(0, 3)) {
    const body = await fetchText(child, { timeout: 10000, retries: 0 })
      .then((r) => (r.ok ? r.text : null)).catch(() => null);
    if (!body) continue;
    urls.push(...[...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]));
  }
  return [...new Set(urls)];
}

/**
 * Choose which internal URLs to audit: homepage first, then one page per
 * high-value pattern, then shallowest-first fill.
 * @param {string} origin
 * @param {string} host
 * @param {string[]} discovered
 * @param {string[]} pinned Explicit keyPages from the brand profile.
 * @param {number} max
 * @returns {string[]}
 */
export function selectPages(origin, host, discovered, pinned, max) {
  const seen = new Set();
  /** @type {string[]} */
  const picked = [];
  const push = (u) => {
    if (picked.length >= max) return;
    let clean;
    try {
      const parsed = new URL(u, origin);
      parsed.hash = '';
      parsed.search = '';
      clean = parsed.href.replace(/\/$/, '') || parsed.href;
    } catch { return; }
    if (!sameHost(hostOf(clean), host)) return;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|xml|ico|woff2?)$/i.test(clean)) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    picked.push(clean);
  };

  push(origin);
  for (const p of pinned || []) push(p);

  const internal = (discovered || []).filter((u) => sameHost(hostOf(u), host));
  for (const pattern of PRIORITY_PATTERNS) {
    const hit = internal.find((u) => {
      try { return pattern.test(new URL(u, origin).pathname); } catch { return false; }
    });
    if (hit) push(hit);
  }
  // Shallow pages first - they are the ones AI engines tend to surface.
  const byDepth = [...internal].sort(
    (a, b) => pathDepth(a) - pathDepth(b) || a.length - b.length,
  );
  for (const u of byDepth) push(u);
  return picked.slice(0, max);
}

/** @param {string} u */
function pathDepth(u) {
  try { return new URL(u).pathname.split('/').filter(Boolean).length; }
  catch { return 99; }
}

/**
 * Crawl a site and return a snapshot for the check suite.
 * @param {string} domain
 * @param {{maxPages?:number, concurrency?:number, keyPages?:string[], timeout?:number, respectRobots?:boolean}} [opts]
 * @returns {Promise<import('../types.js').SiteSnapshot>}
 */
export async function crawlSite(domain, opts = {}) {
  const {
    maxPages = 12, concurrency = 4, keyPages = [], timeout = 15000,
    respectRobots = true,
  } = opts;
  const { origin, host } = normaliseSite(domain);

  /** @type {import('../types.js').SiteSnapshot} */
  const snap = {
    domain: host, origin, pages: [], robotsTxt: null, llmsTxt: null,
    sitemapUrls: [], reachable: false,
  };

  log.step(`Crawling ${host}`);
  let home = await fetchPage(origin, timeout);
  if (home.error || home.status === 0) {
    // Retry over http:// - a number of small-business sites fail TLS or only
    // answer on the apex without a redirect.
    const alt = await fetchPage(origin.replace(/^https:/, 'http:'), timeout);
    if (!alt.error && alt.status > 0) home = alt;
  }
  snap.reachable = home.status > 0 && home.status < 400;
  if (!snap.reachable) {
    snap.error = home.error || `Homepage returned HTTP ${home.status}`;
    snap.pages = [home];
    log.warn(`${host} was not reachable: ${snap.error}`);
    return snap;
  }

  const [robotsTxt, llmsTxt] = await Promise.all([
    fetchPlain(`${origin}/robots.txt`),
    fetchPlain(`${origin}/llms.txt`),
  ]);
  snap.robotsTxt = robotsTxt;
  snap.llmsTxt = llmsTxt;
  snap.sitemapUrls = await fetchSitemapUrls(origin, robotsTxt).catch(() => []);

  // Honour the site's own robots.txt for our fetches. A tool whose headline
  // finding is "you are blocking crawlers" has no business ignoring the same
  // file, and respecting it is the documented way to show a crawler acted
  // reasonably. Owners can address us as `CiteBeam`; we also obey `*`.
  const groups = parseRobots(robotsTxt);
  const pathOf = (u) => { try { return new URL(u).pathname || '/'; } catch { return '/'; } };
  const mayFetch = (u) => respectRobots === false
    || isAllowed(groups, OWN_UA_TOKEN, pathOf(u));

  snap.robotsRespected = respectRobots !== false;
  if (respectRobots !== false && !isAllowed(groups, OWN_UA_TOKEN, '/')) {
    // The owner has asked crawlers not to read the site. That is their call.
    snap.reachable = false;
    snap.error = 'robots.txt disallows automated crawling of this site. '
      + 'CiteBeam honours that. Re-run with --ignore-robots only where you are '
      + 'the site owner or have written permission.';
    snap.robotsBlocked = true;
    snap.pages = [home];
    log.warn(snap.error);
    return snap;
  }

  const discovered = [...new Set([...home.links, ...snap.sitemapUrls])];
  const allTargets = selectPages(origin, host, discovered, keyPages, maxPages)
    .filter((u) => u.replace(/\/$/, '') !== origin.replace(/\/$/, ''));
  const targets = allTargets.filter(mayFetch);
  const skipped = allTargets.length - targets.length;
  if (skipped > 0) {
    snap.robotsSkipped = skipped;
    log.info(`   ${skipped} page(s) skipped: disallowed by robots.txt`);
  }

  const rest = await pool(targets, concurrency, (u) => fetchPage(u, timeout));
  snap.pages = [home, ...rest.filter((p) => p && p.status > 0 && p.status < 400)];
  log.ok(`Fetched ${snap.pages.length} page(s) from ${host}`);
  return snap;
}
