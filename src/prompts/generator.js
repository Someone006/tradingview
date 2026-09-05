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
  const cat = brand.category;
  const loc = brand.location;
  const aud = brand.audience;
  const name = brand.name;
  const comps = (brand.competitors || []).map((c) => c.name);

  /** @type {Array<[import('../types.js').PromptIntent, string]>} */
  const raw = [];
  const add = (intent, text) => { if (text) raw.push([intent, text]); };

  // --- Commercial investigation: the highest-value class. Research shows
  // "best X" list prompts resolve to listicles ~100% of the time.
  add('commercial_investigation', `What are the best options for ${cat} right now?`);
  add('commercial_investigation', `Who are the top providers of ${cat}?`);
  add('commercial_investigation', `I need ${cat}. What do you recommend and why?`);
  if (aud) add('commercial_investigation', `What is the best ${cat} for ${aud}?`);
  add('commercial_investigation', `Which companies are most trusted for ${cat}?`);
  add('commercial_investigation', `Shortlist three providers of ${cat} and explain the trade-offs.`);

  // --- Local intent
  if (loc) {
    add('local', `Who offers the best ${cat} in ${loc}?`);
    add('local', `I need ${cat} in ${loc} today. Who should I call?`);
    add('local', `Which providers of ${cat} near ${loc} have the best reviews?`);
    add('local', `Recommend a reliable company for ${cat} serving ${loc}.`);
  }

  // --- Comparison
  for (const comp of comps.slice(0, 3)) {
    add('comparison', `${name} vs ${comp}: which is better and for whom?`);
  }
  if (comps.length >= 2) {
    add('comparison', `Compare ${comps.slice(0, 3).join(', ')} and ${name} for ${cat}.`);
  }
  add('comparison', `How do the leading providers of ${cat} compare on quality and price?`);

  // --- Alternatives
  for (const comp of comps.slice(0, 2)) {
    add('alternative', `What are the best alternatives to ${comp}?`);
  }
  add('alternative', `What should I use instead of the biggest name in ${cat}?`);

  // --- Pricing
  add('pricing', `How much does ${cat} typically cost?`);
  add('pricing', `Which provider of ${cat} offers the best value for money?`);
  add('pricing', `What is a fair price to pay for ${cat}${loc ? ` in ${loc}` : ''}?`);

  // --- Problem / job-to-be-done
  add('problem', `I am having trouble choosing a provider for ${cat}. How should I decide?`);
  add('problem', `What should I look for when hiring for ${cat}?`);
  add('problem', `What are the most common mistakes people make when buying ${cat}?`);

  // --- Branded: the control group. Losing your own branded prompt is a red alert.
  add('branded', `What is ${name} and what do they do?`);
  add('branded', `Is ${name} any good? What do reviews say?`);
  add('branded', `Who are ${name}'s main competitors?`);

  const seen = new Set();
  /** @type {import('../types.js').PromptSpec[]} */
  const specs = [];
  const toSpec = ([intent, text], pinned = false) => {
    const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: hashId(`${intent}|${key}`, 8),
      text,
      intent,
      weight: INTENT_WEIGHTS[intent] ?? 0.5,
      ...(pinned ? { note: 'operator-supplied' } : {}),
    };
  };

  // Operator-supplied prompts are pinned: someone asked for these specific
  // questions by name, so they always run and are never trimmed to fit a limit.
  /** @type {import('../types.js').PromptSpec[]} */
  const pinned = [];
  for (const text of brand.extraPrompts || []) {
    const spec = toSpec(['commercial_investigation', text], true);
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
  /** @type {Map<string, import('../types.js').PromptSpec[]>} */
  const byIntent = new Map();
  for (const s of specs) {
    if (!byIntent.has(s.intent)) byIntent.set(s.intent, []);
    byIntent.get(s.intent).push(s);
  }
  // Visit intent classes in descending commercial value.
  const order = [...byIntent.keys()].sort(
    (a, b) => (INTENT_WEIGHTS[b] ?? 0) - (INTENT_WEIGHTS[a] ?? 0));
  /** @type {import('../types.js').PromptSpec[]} */
  const out = [];
  let round = 0;
  while (out.length < limit) {
    let progressed = false;
    for (const intent of order) {
      const bucket = byIntent.get(intent);
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
