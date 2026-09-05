/**
 * Citation surface analysis.
 *
 * The standing criticism of this tool category is that it audits owned pages
 * and stops there, while the citations that decide an answer overwhelmingly
 * land on surfaces the brand does not control - community threads above all.
 * Published analyses of Perplexity put Reddit alone near half of all citations.
 *
 * This module classifies every cited domain by the kind of surface it is, and
 * reports how much of the answer space in a category is off-site. That figure
 * reframes the work: a brand can hold a perfect website and still lose, because
 * the argument is being had somewhere else.
 * @module analysis/surfaces
 */
import { hostOf, sameHost } from '../util/http.js';

/**
 * Surface taxonomy. `playbook` is what actually moves the needle on that kind
 * of surface - they are not interchangeable, and treating a forum thread like
 * a directory listing is how outreach budgets get wasted.
 */
export const SURFACES = {
  owned: {
    label: 'Your own site',
    playbook: 'Already yours. Keep it crawlable, quotable and current.',
  },
  competitor: {
    label: 'Competitor-owned',
    playbook: 'You cannot post here. Counter it by publishing a fair comparison '
      + 'page of your own that engines can cite instead.',
  },
  community: {
    label: 'Community and forums',
    playbook: 'The highest-yield and slowest surface. Answer real questions from a '
      + 'real, established account, disclose your affiliation, and be useful. '
      + 'Astroturfing is detectable, gets removed, and the removal is itself indexed.',
  },
  review: {
    label: 'Review and directory platforms',
    playbook: 'Claim the profile, complete every field, and build a steady flow of '
      + 'genuine reviews. Never incentivise them - the major platforms changed '
      + 'their policies on that and removals are aggressive.',
  },
  editorial: {
    label: 'Editorial and media',
    playbook: 'Pitch to be included in existing round-ups and "best X" lists. '
      + 'One inclusion in a well-cited listicle outperforms months of blogging.',
  },
  reference: {
    label: 'Reference and institutional',
    playbook: 'High trust, hard to influence directly. Earn it through coverage '
      + 'and verifiable public facts rather than outreach.',
  },
  social: {
    label: 'Social and video',
    playbook: 'Keep profiles complete and consistent with your site, and link them '
      + 'in sameAs so the engine resolves them to your entity.',
  },
  marketplace: {
    label: 'Marketplaces and app stores',
    playbook: 'Optimise the listing copy and keep ratings healthy - listings are '
      + 'structured and get parsed cleanly.',
  },
  other: {
    label: 'Other sources',
    playbook: 'Review individually; some will be worth pursuing directly.',
  },
};

/**
 * Host patterns per surface, checked in order, most specific first.
 * @type {Array<[keyof typeof SURFACES, RegExp[]]>}
 */
const PATTERNS = [
  ['community', [/(^|\.)reddit\.com$/, /(^|\.)ycombinator\.com$/, /(^|\.)stackoverflow\.com$/,
    /(^|\.)stackexchange\.com$/, /(^|\.)quora\.com$/, /(^|\.)discourse\./, /forum/, /(^|\.)substack\.com$/]],
  ['review', [/(^|\.)g2\.com$/, /(^|\.)capterra\.com$/, /(^|\.)trustpilot\.com$/,
    /(^|\.)trustradius\.com$/, /(^|\.)yelp\.[a-z.]+$/, /(^|\.)bbb\.org$/, /(^|\.)clutch\.co$/,
    /(^|\.)angi\.com$/, /(^|\.)houzz\.com$/, /(^|\.)tripadvisor\.[a-z.]+$/,
    /(^|\.)glassdoor\.[a-z.]+$/, /(^|\.)getapp\.com$/, /(^|\.)softwareadvice\.com$/]],
  ['reference', [/(^|\.)wikipedia\.org$/, /(^|\.)wikidata\.org$/, /\.gov$/, /\.gov\./,
    /\.edu$/, /\.edu\./, /(^|\.)britannica\.com$/, /(^|\.)crunchbase\.com$/]],
  ['social', [/(^|\.)linkedin\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/,
    /(^|\.)facebook\.com$/, /(^|\.)instagram\.com$/, /(^|\.)youtube\.com$/,
    /(^|\.)tiktok\.com$/, /(^|\.)threads\.net$/]],
  ['marketplace', [/(^|\.)amazon\.[a-z.]+$/, /(^|\.)etsy\.com$/, /(^|\.)producthunt\.com$/,
    /(^|\.)apps\.apple\.com$/, /(^|\.)play\.google\.com$/, /(^|\.)github\.com$/]],
  ['editorial', [/(^|\.)medium\.com$/, /news/, /(^|\.)forbes\.com$/, /(^|\.)techcrunch\.com$/,
    /(^|\.)theverge\.com$/, /(^|\.)wired\.com$/, /(^|\.)nytimes\.com$/, /(^|\.)bbc\.[a-z.]+$/,
    /(^|\.)guardian\./, /magazine/, /(^|\.)zdnet\.com$/, /(^|\.)cnet\.com$/]],
];

/**
 * Classify one host into a surface type.
 * @param {string} host
 * @param {string} ownDomain
 * @param {string[]} competitorDomains
 * @returns {keyof typeof SURFACES}
 */
export function classifyHost(host, ownDomain, competitorDomains = []) {
  if (!host) return 'other';
  if (sameHost(host, ownDomain)) return 'owned';
  if (competitorDomains.some((d) => d && sameHost(host, d))) return 'competitor';
  for (const [surface, patterns] of PATTERNS) {
    if (patterns.some((re) => re.test(host))) return /** @type {any} */ (surface);
  }
  return 'other';
}

/**
 * Analyse where the answers in this category are sourced from.
 *
 * @param {import('../types.js').PromptOutcome[]} outcomes
 * @param {import('../types.js').BrandProfile} brand
 */
export function analyseSurfaces(outcomes, brand) {
  const answered = (outcomes || []).filter((o) => o.status === 'answered');
  const competitorDomains = (brand.competitors || []).map((c) => c.domain).filter(Boolean);

  /** @type {Map<string, {domain:string, surface:string, count:number}>} */
  const domains = new Map();
  /** @type {Record<string, number>} */
  const surfaceCounts = {};
  let totalCitations = 0;

  for (const o of answered) {
    // One credit per domain per answer: an answer citing five pages of one
    // site is one source, not five, and counting pages would let a single
    // chatty domain dominate the picture.
    const hosts = new Set((o.citations || []).map(hostOf).filter(Boolean));
    for (const host of hosts) {
      const surface = classifyHost(host, brand.domain, competitorDomains);
      const existing = domains.get(host);
      if (existing) existing.count++;
      else domains.set(host, { domain: host, surface, count: 1 });
      surfaceCounts[surface] = (surfaceCounts[surface] || 0) + 1;
      totalCitations++;
    }
  }

  const breakdown = Object.entries(surfaceCounts)
    .map(([surface, count]) => ({
      surface,
      label: SURFACES[surface]?.label ?? surface,
      count,
      share: totalCitations ? round(count / totalCitations) : 0,
      playbook: SURFACES[surface]?.playbook ?? '',
    }))
    .sort((a, b) => b.count - a.count);

  const owned = surfaceCounts.owned || 0;
  const offSite = totalCitations - owned;

  const ranked = [...domains.values()].sort((a, b) => b.count - a.count);

  return {
    totalCitations,
    uniqueDomains: domains.size,
    ownedShare: totalCitations ? round(owned / totalCitations) : 0,
    offSiteShare: totalCitations ? round(offSite / totalCitations) : 0,
    breakdown,
    // Where to actually go and earn a mention: influenceable surfaces you do
    // not already own, most-cited first. Competitor sites are excluded because
    // you cannot publish on them.
    targets: ranked
      .filter((d) => !['owned', 'competitor'].includes(d.surface))
      .slice(0, 12)
      .map((d) => ({
        ...d,
        label: SURFACES[d.surface]?.label ?? d.surface,
        playbook: SURFACES[d.surface]?.playbook ?? '',
      })),
    domains: ranked.slice(0, 25),
  };
}

/** @param {number} n */
function round(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
