/**
 * Text analysis for brand-mention detection inside AI answers.
 * @module util/text
 */

/** @param {string} s */
export function normalise(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** @param {string} s */
export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the matcher variants for an entity: the name, its aliases, and its
 * bare domain label (so "acme.com" also matches a plain "Acme" mention).
 * @param {{name:string, domain?:string, aliases?:string[]}} entity
 * @returns {string[]}
 */
export function nameVariants(entity) {
  const set = new Set();
  const add = (v) => { const t = String(v || '').trim(); if (t.length >= 2) set.add(t); };
  add(entity.name);
  for (const a of entity.aliases || []) add(a);
  if (entity.domain) {
    add(entity.domain);
    const label = String(entity.domain).replace(/^www\./, '').split('.')[0];
    if (label && label.length >= 3) add(label);
  }
  // "Northwind Plumbing" should also match a bare "Northwind".
  const words = String(entity.name || '').trim().split(/\s+/);
  if (words.length > 1 && words[0].length >= 4 && !GENERIC_LEADS.has(normalise(words[0]))) {
    add(words[0]);
  }
  return [...set];
}

const GENERIC_LEADS = new Set([
  'the', 'best', 'top', 'pro', 'my', 'your', 'new', 'first', 'one', 'all', 'get', 'go',
]);

const POSITIVE = ['best', 'top', 'excellent', 'recommend', 'recommended', 'leading', 'trusted', 'great', 'strong', 'popular', 'reliable', 'favourite', 'favorite', 'standout', 'ideal', 'award', 'preferred', 'go-to', 'robust', 'powerful', 'affordable', 'highly'];
const NEGATIVE = ['worst', 'avoid', 'poor', 'limited', 'lacks', 'lacking', 'expensive', 'outdated', 'complaint', 'complaints', 'downside', 'drawback', 'weak', 'clunky', 'confusing', 'unreliable', 'buggy', 'dated', 'however', 'unfortunately'];

/**
 * Locate every mention of an entity in a body of text and score its prominence.
 * @param {string} text
 * @param {{name:string, domain?:string, aliases?:string[]}} entity
 * @returns {import('../types.js').MentionResult}
 */
export function findMentions(text, entity) {
  const body = String(text || '');
  const variants = nameVariants(entity)
    .sort((a, b) => b.length - a.length); // prefer the most specific match
  /** @type {number[]} */
  const positions = [];
  const snippets = [];
  let sentimentTotal = 0;
  let sentimentSamples = 0;
  const seen = new Set();

  for (const v of variants) {
    const re = new RegExp(`(?<![\\w.-])${escapeRe(v)}(?![\\w-])`, 'gi');
    let m;
    while ((m = re.exec(body)) !== null) {
      const idx = m.index;
      // Collapse overlapping hits from different variants of the same entity.
      if ([...seen].some((p) => Math.abs(p - idx) < Math.max(v.length, 4))) continue;
      seen.add(idx);
      positions.push(idx);
      const from = Math.max(0, idx - 120);
      const to = Math.min(body.length, idx + v.length + 160);
      const snippet = body.slice(from, to).replace(/\s+/g, ' ').trim();
      if (snippets.length < 4) snippets.push(snippet);
      // Sentiment is scored on the containing sentence only. A wider window
      // bleeds a competitor's praise onto the brand and vice versa.
      sentimentTotal += scoreSentiment(sentenceAt(body, idx));
      sentimentSamples++;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }

  positions.sort((a, b) => a - b);
  return {
    mentioned: positions.length > 0,
    firstIndex: positions.length ? positions[0] : -1,
    rank: 0, // assigned later by rankEntities()
    count: positions.length,
    sentiment: sentimentSamples ? clamp(sentimentTotal / sentimentSamples, -1, 1) : 0,
    snippets,
  };
}

/**
 * Return the sentence surrounding a character offset.
 * @param {string} body @param {number} idx
 */
export function sentenceAt(body, idx) {
  const text = String(body || '');
  let start = 0;
  for (let i = idx; i > 0; i--) {
    const ch = text[i - 1];
    if (ch === '\n') { start = i; break; }
    if ((ch === '.' || ch === '!' || ch === '?') && /\s/.test(text[i] || ' ')) { start = i; break; }
  }
  let end = text.length;
  for (let i = idx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { end = i; break; }
    if ((ch === '.' || ch === '!' || ch === '?') && /\s|$/.test(text[i + 1] || ' ')) { end = i + 1; break; }
  }
  return text.slice(start, end).trim();
}

/**
 * Heuristic sentiment of a snippet, in -1..1.
 * @param {string} snippet
 */
export function scoreSentiment(snippet) {
  const t = normalise(snippet);
  let score = 0;
  for (const w of POSITIVE) if (t.includes(w)) score += 1;
  for (const w of NEGATIVE) if (t.includes(w)) score -= 1;
  if (score === 0) return 0;
  return clamp(score / 3, -1, 1);
}

/**
 * Assign 1-based ranks by first appearance across a set of mention results.
 * Being named first in an AI answer is worth materially more than being
 * named last, so rank feeds directly into the visibility score.
 * @param {Record<string, import('../types.js').MentionResult>} results
 */
export function rankEntities(results) {
  const present = Object.entries(results)
    .filter(([, r]) => r.mentioned)
    .sort((a, b) => a[1].firstIndex - b[1].firstIndex);
  present.forEach(([key], i) => { results[key].rank = i + 1; });
  return results;
}

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Extract bare URLs and markdown links from an answer body. Engines that do
 * not return structured citations still tend to inline their sources.
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrls(text) {
  const out = new Set();
  const body = String(text || '');
  const md = /\]\((https?:\/\/[^\s)]+)\)/gi;
  let m;
  while ((m = md.exec(body)) !== null) out.add(cleanUrl(m[1]));
  const bare = /(?<![("])\bhttps?:\/\/[^\s<>"')\]]+/gi;
  while ((m = bare.exec(body)) !== null) out.add(cleanUrl(m[0]));
  return [...out].filter(Boolean);
}

/** @param {string} u */
function cleanUrl(u) {
  const trimmed = String(u).replace(/[.,;:!?]+$/, '').trim();
  try { return new URL(trimmed).href; } catch { return ''; }
}

/**
 * Count words, used for content-depth checks.
 * @param {string} s
 */
export function wordCount(s) {
  const t = String(s || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * True when the text reads as a direct answer rather than a preamble —
 * research shows AI engines lift the first 60 words when they are declarative.
 * @param {string} s
 */
export function isAnswerCapsule(s) {
  const t = String(s || '').trim();
  if (wordCount(t) < 15) return false;
  const opener = t.split(/[.!?]/)[0] || '';
  const hedges = /^(welcome|we are|we're|founded in|for over \d+|since \d{4}|our (team|mission|story)|at [A-Z])/i;
  if (hedges.test(t)) return false;
  // Declarative openers state a fact or a definition in the first sentence.
  return wordCount(opener) >= 6 && wordCount(opener) <= 45;
}
