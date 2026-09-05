/**
 * Buyer-intent prompt generation.
 *
 * The prompt set is the measurement instrument: if it does not mirror how real
 * buyers actually ask, the resulting visibility score is noise. Prompts are
 * generated across seven intent classes and weighted by commercial value, so a
 * brand that wins "best X for Y" scores higher than one that only wins its own
 * branded lookup.
 * @module prompts/generator
 */
import { hashId } from '../util/id.js';
import { TEMPLATES, LANGUAGES, fill } from './templates.js';

/**
 * Relative commercial value of each intent class. Commercial-investigation
 * prompts are where purchase decisions are actually made, so they dominate.
 * @type {Record<import('../types.js').PromptIntent, number>}
 */
export const INTENT_WEIGHTS = {
  commercial_investigation: 1.0,
  comparison: 0.9,
  alternative: 0.85,
  local: 0.85,
  pricing: 0.7,
  problem: 0.6,
  branded: 0.35,
};

export const INTENT_LABELS = {
  commercial_investigation: 'Commercial investigation',
  comparison: 'Head-to-head comparison',
  alternative: 'Alternatives',
  local: 'Local intent',
  pricing: 'Pricing',
  problem: 'Problem / job-to-be-done',
  branded: 'Branded lookup',
};

/**
 * @param {import('../types.js').BrandProfile} brand
 * @param {{limit?:number}} [opts]
 * @returns {import('../types.js').PromptSpec[]}
 */
export function generatePrompts(brand, opts = {}) {
  const limit = opts.limit ?? 24;
  const name = brand.name;
  const loc = brand.location;
  /**
   * Resolve a field that may be a plain string or a per-language map, falling
   * back through the operator's own language list before English.
   * @param {any} value @param {string} lang
   */
  const forLang = (value, lang) => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return value[lang] || value.en || Object.values(value).find(Boolean);
  };
  const comps = (brand.competitors || []).map((c) => c.name);

  // Languages to audit. Swiss buyers prompt in their own language and the
  // assistant returns a different shortlist per language, so a single-language
  // audit measures a single-language market.
  const langs = (Array.isArray(brand.languages) && brand.languages.length ? brand.languages : ['en'])
    .filter((l) => TEMPLATES[l]);
  if (!langs.length) langs.push('en');

  /** @type {Array<[import('../types.js').PromptIntent, string, string]>} */
  const raw = [];
  const add = (intent, text, lang) => { if (text) raw.push([intent, text, lang]); };

  for (const lang of langs) {
    const bank = TEMPLATES[lang];
    const base = {
      cat: forLang(brand.category, lang),
      aud: forLang(brand.audience, lang),
      loc,
      brand: name,
    };

    for (const [intent, templates] of Object.entries(bank)) {
      for (const tpl of templates) {
        if (tpl.includes('{comp}')) {
          // One prompt per named rival, capped so a long competitor list does
          // not crowd out every other intent.
          for (const comp of comps.slice(0, 3)) {
            add(intent, fill(tpl, { ...base, comp }), lang);
          }
        } else {
          add(intent, fill(tpl, base), lang);
        }
      }
    }
  }

  const seen = new Set();
  /** @type {import('../types.js').PromptSpec[]} */
  const specs = [];
  const toSpec = ([intent, text, lang], pinned = false) => {
    const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: hashId(`${intent}|${key}`, 8),
      text,
      intent,
      lang: lang || 'en',
      weight: INTENT_WEIGHTS[intent] ?? 0.5,
      ...(pinned ? { note: 'operator-supplied' } : {}),
    };
  };

  // Operator-supplied prompts are pinned: someone asked for these specific
  // questions by name, so they always run and are never trimmed to fit a limit.
  /** @type {import('../types.js').PromptSpec[]} */
  const pinned = [];
  for (const text of brand.extraPrompts || []) {
    const spec = toSpec(['commercial_investigation', text, langs[0]], true);
    if (spec) pinned.push(spec);
  }

  for (const entry of raw) {
    const spec = toSpec(entry);
    if (spec) specs.push(spec);
  }

  const room = Math.max(0, limit - pinned.length);
  return [...pinned, ...balance(specs, room)];
}

/**
 * Trim to the limit while preserving intent coverage: take a round-robin pass
 * across intents before allowing any single class to fill the remainder.
 * @param {import('../types.js').PromptSpec[]} specs
 * @param {number} limit
 */
export function balance(specs, limit) {
  if (specs.length <= limit) return specs;
  // Bucket by language and intent together: with several languages configured,
  // bucketing on intent alone lets the first language fill every slot.
  /** @type {Map<string, import('../types.js').PromptSpec[]>} */
  const byIntent = new Map();
  for (const s of specs) {
    const key = `${s.lang || 'en'}|${s.intent}`;
    if (!byIntent.has(key)) byIntent.set(key, []);
    byIntent.get(key).push(s);
  }
  // Visit intent classes in descending commercial value.
  const order = [...byIntent.keys()].sort((a, b) => {
    const ia = a.split('|')[1];
    const ib = b.split('|')[1];
    return (INTENT_WEIGHTS[ib] ?? 0) - (INTENT_WEIGHTS[ia] ?? 0);
  });
  /** @type {import('../types.js').PromptSpec[]} */
  const out = [];
  let round = 0;
  while (out.length < limit) {
    let progressed = false;
    for (const key of order) {
      const bucket = byIntent.get(key);
      if (bucket && bucket[round]) {
        out.push(bucket[round]);
        progressed = true;
        if (out.length >= limit) break;
      }
    }
    if (!progressed) break;
    round++;
  }
  return out;
}
