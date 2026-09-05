/**
 * Deterministic offline engine.
 *
 * Runs without credentials so the product is demonstrable, testable and
 * reviewable end to end. It models how an assistant composes a recommendation
 * - a short framing, a ranked list of named providers, and source links -
 * seeded on the brand and prompt so a given input always yields the same output.
 *
 * Output is ALWAYS flagged simulated:true and every report renders a banner
 * saying so. It is a fixture, not a measurement, and must never be sold or
 * presented to a client as real AI visibility data.
 * @module engines/simulated
 */
import { okAnswer } from './base.js';
import { seededUnit } from '../util/id.js';

/** Generic third-party sources an assistant tends to lean on. */
const GENERIC_SOURCES = [
  'https://www.reddit.com/r/smallbusiness/comments/example',
  'https://www.g2.com/categories/example',
  'https://www.trustpilot.com/review/example.com',
  'https://www.capterra.com/example',
  'https://www.yelp.com/search?find_desc=example',
];

/** @type {import('./base.js').Engine} */
export const engine = {
  id: 'simulated',
  label: 'Offline simulation (no API keys)',
  live: false,
  ready: true,
  async ask(prompt, ctx) {
    const started = Date.now();
    const { brand } = ctx;
    // The sample index enters the seed so repeat asks differ the way real
    // assistant answers do, while a given (brand, prompt, sample) stays
    // reproducible.
    const sample = Number(ctx.sample) || 0;
    const seed = (k) => seededUnit(`${brand.domain}|${prompt.id}|${sample}|${k}`);

    // How likely the brand is to surface, by intent. A brand nearly always wins
    // its own branded lookup and rarely wins an open "best X" prompt.
    const baseByIntent = {
      branded: 0.95,
      comparison: 0.82,
      local: 0.45,
      alternative: 0.3,
      pricing: 0.34,
      problem: 0.28,
      commercial_investigation: 0.26,
    };
    const base = baseByIntent[prompt.intent] ?? 0.3;
    const brandAppears = seed('appear') < base;

    const competitors = (brand.competitors || []).map((c) => c.name);
    // Competitors surface independently, and more often than a challenger brand.
    const shown = competitors.filter((_, i) => seed(`comp${i}`) < 0.72);
    const filler = ['Meridian Group', 'Harbor & Co', 'Cardinal Services', 'Vertex Partners']
      .filter((_, i) => seed(`fill${i}`) < 0.4);

    /** @type {string[]} */
    let ranked = [...shown, ...filler];
    if (brandAppears) {
      // Position matters: a brand named first reads very differently to one
      // buried at the bottom of a list.
      const slot = Math.floor(seed('slot') * (ranked.length + 1));
      ranked.splice(slot, 0, brand.name);
    }
    if (!ranked.length) ranked = ['Meridian Group', 'Harbor & Co'];

    const text = compose(prompt, brand, ranked, seed);
    const citations = buildCitations(brand, ranked, brandAppears, seed);
    return {
      ...okAnswer('simulated', prompt.id, text, citations, Date.now() - started),
    };
  },
};

/**
 * @param {import('../types.js').PromptSpec} prompt
 * @param {import('../types.js').BrandProfile} brand
 * @param {string[]} ranked
 * @param {(k:string)=>number} seed
 */
function compose(prompt, brand, ranked, seed) {
  const cat = brand.category;
  const loc = brand.location ? ` in ${brand.location}` : '';
  const openers = [
    `Here are the options I would look at for ${cat}${loc}, based on what people consistently report:`,
    `For ${cat}${loc}, these are the providers that come up most often:`,
    `A few solid choices for ${cat}${loc}, roughly in the order I would shortlist them:`,
  ];
  const opener = openers[Math.floor(seed('opener') * openers.length)];

  const blurbs = [
    'Consistently praised for responsiveness and clear, upfront pricing.',
    'Strong reputation for quality, though lead times can be longer at peak.',
    'A good value option, especially for smaller jobs.',
    'Well established with broad coverage and solid third-party reviews.',
    'Often recommended for complex or urgent work.',
    'Frequently mentioned in community threads, with mixed but mostly positive feedback.',
  ];

  const lines = ranked.map((n, i) => {
    const b = blurbs[Math.floor(seed(`blurb${i}`) * blurbs.length)];
    return `${i + 1}. **${n}** - ${b}`;
  });

  const closers = [
    `Whichever you pick, confirm pricing and availability directly before committing.`,
    `I would get quotes from at least two of these before deciding.`,
    `Check recent reviews as well, since service quality can vary by location.`,
  ];
  const closer = closers[Math.floor(seed('closer') * closers.length)];

  return `${opener}\n\n${lines.join('\n')}\n\n${closer}`;
}

/**
 * @param {import('../types.js').BrandProfile} brand
 * @param {string[]} ranked
 * @param {boolean} brandAppears
 * @param {(k:string)=>number} seed
 */
function buildCitations(brand, ranked, brandAppears, seed) {
  /** @type {string[]} */
  const out = [];
  // A brand named in the answer is only sometimes cited by URL - the gap
  // between "mentioned" and "cited" is itself a finding worth surfacing.
  if (brandAppears && seed('cite-own') < 0.55) out.push(`https://${brand.domain}/`);
  for (const c of brand.competitors || []) {
    if (c.domain && ranked.includes(c.name) && seed(`cite-${c.name}`) < 0.5) {
      out.push(`https://${c.domain}/`);
    }
  }
  const n = 1 + Math.floor(seed('nsrc') * 3);
  for (let i = 0; i < n; i++) {
    out.push(GENERIC_SOURCES[Math.floor(seed(`src${i}`) * GENERIC_SOURCES.length)]);
  }
  return [...new Set(out)];
}
