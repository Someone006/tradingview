/**
 * Dependency-free HTML inspection tuned for AEO auditing.
 *
 * This is deliberately not a full DOM parser: every extraction below is a
 * bounded regex/scan pass over the source. That keeps the tool installable
 * with zero dependencies and fast enough to audit dozens of pages per run,
 * which matters far more here than perfect spec compliance.
 * @module util/html
 */

const BLOCK_TAGS = 'address|article|aside|blockquote|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul';

/**
 * Strip scripts/styles and collapse markup into readable text.
 * @param {string} html
 * @returns {string}
 */
export function toText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(new RegExp(`</(${BLOCK_TAGS})\\s*>`, 'gi'), '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return s.trim();
}

/** Decode the entity subset that actually shows up in page copy. @param {string} s */
export function decodeEntities(s) {
  return String(s)
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      const map = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—',
        ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
        ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
      };
      const key = code.toLowerCase();
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m;
    });
}

/**
 * Extract the contents of every <script type="application/ld+json"> block.
 * Tolerates arrays, @graph wrappers and trailing-comma junk.
 * @param {string} html
 * @returns {any[]} Flattened list of JSON-LD nodes.
 */
export function extractJsonLd(html) {
  /** @type {any[]} */
  const out = [];
  if (!html) return out;
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim().replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
    let parsed;
    try { parsed = JSON.parse(body); }
    catch {
      try { parsed = JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); }
      catch { continue; }
    }
    for (const node of flattenGraph(parsed)) out.push(node);
  }
  return out;
}

/** @param {any} node @returns {any[]} */
function flattenGraph(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flattenGraph);
  if (typeof node !== 'object') return [];
  if (Array.isArray(node['@graph'])) {
    const rest = { ...node };
    delete rest['@graph'];
    const head = Object.keys(rest).length > 1 ? [rest] : [];
    return [...head, ...node['@graph'].flatMap(flattenGraph)];
  }
  return [node];
}

/**
 * Collect the set of schema.org `@type` values present on a page.
 * @param {any[]} nodes
 * @returns {string[]}
 */
export function schemaTypes(nodes) {
  const set = new Set();
  for (const n of nodes || []) {
    const t = n && n['@type'];
    if (!t) continue;
    for (const one of Array.isArray(t) ? t : [t]) {
      if (typeof one === 'string') set.add(one.replace(/^https?:\/\/schema\.org\//i, ''));
    }
  }
  return [...set];
}

/**
 * Extract headings in document order.
 * @param {string} html
 * @returns {Array<{level:number,text:string}>}
 */
export function extractHeadings(html) {
  const out = [];
  if (!html) return out;
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = toText(m[2]).replace(/\s+/g, ' ').trim();
    if (text) out.push({ level: Number(m[1]), text });
  }
  return out;
}

/**
 * Read a meta tag by name or property.
 * @param {string} html @param {string} key
 * @returns {string}
 */
export function meta(html, key) {
  if (!html) return '';
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta\\b[^>]*(?:name|property|http-equiv)\\s*=\\s*["']${esc}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return '';
  const content = tag[0].match(/content\s*=\s*["']([\s\S]*?)["']/i);
  return content ? decodeEntities(content[1]).trim() : '';
}

/** @param {string} html */
export function title(html) {
  const m = html && html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(toText(m[1])).replace(/\s+/g, ' ').trim() : '';
}

/**
 * All href values on the page, resolved against a base URL.
 * @param {string} html @param {string} baseUrl
 * @returns {string[]}
 */
export function extractLinks(html, baseUrl) {
  const out = new Set();
  if (!html) return [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = decodeEntities(m[1]).trim();
    if (!href || /^(javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    try { out.add(new URL(href, baseUrl).href); } catch { /* skip malformed */ }
  }
  return [...out];
}

/**
 * Count elements matching a tag name.
 * @param {string} html @param {string} tag
 */
export function countTag(html, tag) {
  if (!html) return 0;
  const re = new RegExp(`<${tag}\\b`, 'gi');
  return (html.match(re) || []).length;
}

/**
 * Whether the page appears to require JavaScript to render its main content.
 * A hard signal for AEO: most AI crawlers do not execute JS.
 * @param {string} html
 */
export function looksClientRendered(html) {
  if (!html) return false;
  const text = toText(html);
  const hasAppRoot = /<div\b[^>]*id\s*=\s*["'](root|app|__next|__nuxt)["']/i.test(html);
  const scriptHeavy = countTag(html, 'script') >= 3;
  return hasAppRoot && scriptHeavy && text.length < 800;
}

/**
 * Extract the first N words of the page's main body copy, skipping nav chrome.
 * Used to test for an "answer capsule" — a direct answer up front.
 * @param {string} html @param {number} words
 */
export function leadCopy(html, words = 80) {
  const body = String(html || '')
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  const source = main ? main[2] : body;
  const paragraphs = [...String(source).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => toText(m[1]).trim())
    .filter((t) => t.split(/\s+/).length >= 8);
  const text = paragraphs.length ? paragraphs.join(' ') : toText(source);
  return text.split(/\s+/).slice(0, words).join(' ');
}
