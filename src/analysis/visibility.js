/**
 * Turn raw engine answers into visibility metrics.
 *
 * The headline number is a weighted "answer share": across the prompts a buyer
 * would actually ask, how often does this brand get named, how early, and how
 * favourably - measured against the competitors named alongside it.
 * @module analysis/visibility
 */
import { findMentions, rankEntities, clamp } from '../util/text.js';
import { hostOf, sameHost } from '../util/http.js';
import { INTENT_LABELS } from '../prompts/generator.js';
import { analyseSurfaces } from './surfaces.js';

/**
 * Score a single answer into a PromptOutcome.
 * @param {import('../types.js').PromptSpec} prompt
 * @param {import('../types.js').EngineAnswer} answer
 * @param {import('../types.js').BrandProfile} brand
 * @returns {import('../types.js').PromptOutcome}
 */
export function scoreAnswer(prompt, answer, brand) {
  const text = answer.text || '';
  /** @type {Record<string, import('../types.js').MentionResult>} */
  const all = {};
  all.__brand = findMentions(text, brand);
  for (const c of brand.competitors || []) {
    all[c.name] = findMentions(text, c);
  }
  rankEntities(all);

  const brandMention = all.__brand;
  /** @type {Record<string, import('../types.js').MentionResult>} */
  const competitors = {};
  for (const c of brand.competitors || []) competitors[c.name] = all[c.name];

  const citations = answer.citations || [];
  const ownDomainCited = citations.some((u) => sameHost(hostOf(u), brand.domain));

  return {
    promptId: prompt.id,
    promptText: prompt.text,
    intent: prompt.intent,
    weight: prompt.weight,
    engine: answer.engine,
    status: answer.status,
    brand: brandMention,
    competitors,
    citations,
    ownDomainCited,
    error: answer.error,
    answerExcerpt: text.slice(0, 900),
  };
}

/**
 * What being named is worth, by the role the mention plays. Presence alone is
 * not the outcome: an assistant telling a buyer to avoid you is worse for the
 * business than not appearing at all, and must never score like an endorsement.
 */
export const ROLE_WEIGHTS = {
  recommended: 1.0,
  listed: 0.7,
  referenced: 0.45,
  dismissed: 0.0,
};

/**
 * Per-answer visibility value in 0..1.
 *
 * Presence opens the score, but the role the mention plays gates it, and
 * position and sentiment shade it: being recommended first is a materially
 * different commercial outcome to being listed fourth or named as the thing to
 * migrate away from. A citation of the brand's own domain is the strongest
 * single signal, because it means the engine actually sent traffic.
 * @param {import('../types.js').PromptOutcome} o
 */
export function outcomeScore(o) {
  if (o.status !== 'answered') return 0;
  if (!o.brand.mentioned) return 0;

  const role = o.brand.role || 'referenced';
  const roleWeight = ROLE_WEIGHTS[role] ?? 0.45;
  // Being told to avoid you is a loss, not a small win.
  if (roleWeight === 0) return 0;

  const positionScore = o.brand.rank > 0 ? 1 / (1 + 0.35 * (o.brand.rank - 1)) : 0.5;
  const sentimentBonus = clamp(o.brand.sentiment, -0.5, 0.5) * 0.2;
  const citationBonus = o.ownDomainCited ? 0.15 : 0;
  const base = 0.55 * roleWeight + 0.30 * positionScore + sentimentBonus + citationBonus;
  return clamp(base, 0, 1);
}

/**
 * Per-prompt stability across repeat samples.
 *
 * With samples > 1 the same question was asked several times. How often the
 * brand came back is more useful than whether it came back once: a prompt won
 * 1-in-4 is a real, fixable weakness, and a prompt won 4-in-4 is a position
 * worth defending. Prompts that flip are where the cheapest wins usually are.
 *
 * @param {import('../types.js').PromptOutcome[]} answered
 * @returns {Array<{promptId:string, prompt:string, intent:string, engine:string, asked:number, named:number, rate:number, stability:'locked'|'contested'|'absent'}>}
 */
export function promptStability(answered) {
  /** @type {Map<string, {promptId:string,prompt:string,intent:string,engine:string,asked:number,named:number}>} */
  const byKey = new Map();
  for (const o of answered) {
    const key = `${o.engine}|${o.promptId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        promptId: o.promptId, prompt: o.promptText, intent: o.intent,
        engine: o.engine, asked: 0, named: 0,
      });
    }
    const row = byKey.get(key);
    row.asked++;
    if (o.brand.mentioned) row.named++;
  }
  return [...byKey.values()]
    .map((r) => {
      const rate = r.asked ? r.named / r.asked : 0;
      const stability = /** @type {'locked'|'contested'|'absent'} */ (
        rate === 0 ? 'absent' : rate === 1 ? 'locked' : 'contested');
      return { ...r, rate: round(rate), stability };
    })
    .sort((a, b) => a.rate - b.rate);
}

/**
 * Aggregate outcomes into the visibility report section.
 * @param {import('../types.js').PromptOutcome[]} outcomes
 * @param {import('../types.js').BrandProfile} brand
 * @param {{samples?:number}} [opts]
 */
export function summarise(outcomes, brand, opts = {}) {
  const answered = outcomes.filter((o) => o.status === 'answered');
  const totalWeight = answered.reduce((a, o) => a + o.weight, 0);

  const weighted = totalWeight
    ? answered.reduce((a, o) => a + outcomeScore(o) * o.weight, 0) / totalWeight
    : 0;

  const mentionCount = answered.filter((o) => o.brand.mentioned).length;
  const mentionRate = answered.length ? mentionCount / answered.length : 0;

  // The distinction the category currently misses: presence versus influence.
  const recommendedCount = answered.filter((o) => o.brand.role === 'recommended').length;
  const dismissedCount = answered.filter((o) => o.brand.role === 'dismissed').length;
  const recommendationRate = answered.length ? recommendedCount / answered.length : 0;
  /** @type {Record<string, number>} */
  const roles = { recommended: 0, listed: 0, referenced: 0, dismissed: 0 };
  for (const o of answered) {
    if (o.brand.mentioned && roles[o.brand.role] !== undefined) roles[o.brand.role]++;
  }
  const citedCount = answered.filter((o) => o.ownDomainCited).length;
  const citationRate = answered.length ? citedCount / answered.length : 0;

  const ranks = answered.filter((o) => o.brand.rank > 0).map((o) => o.brand.rank);
  const avgRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

  const sentiments = answered.filter((o) => o.brand.mentioned).map((o) => o.brand.sentiment);
  const avgSentiment = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 0;

  const samples = Math.max(1, Math.floor(Number(opts.samples) || 1));
  const stability = samples > 1 ? promptStability(answered) : [];

  return {
    samples,
    score: round(weighted),
    // With repeats, the margin of error on the headline mention rate. Reported
    // so a 4-point month-over-month move is not mistaken for a real shift.
    marginOfError: answered.length
      ? round(1.96 * Math.sqrt(Math.max(mentionRate * (1 - mentionRate), 0) / answered.length))
      : 0,
    stability,
    contested: stability.filter((s) => s.stability === 'contested').length,
    mentionRate: round(mentionRate),
    recommendationRate: round(recommendationRate),
    dismissedCount,
    roles,
    // How much of your visibility is actual endorsement rather than a name in
    // a list. Low conversion means the work is persuasion, not exposure.
    influenceRatio: mentionCount ? round(recommendedCount / mentionCount) : 0,
    citationRate: round(citationRate),
    avgRank: round(avgRank, 2),
    avgSentiment: round(avgSentiment, 2),
    promptsRun: outcomes.length,
    promptsAnswered: answered.length,
    promptsFailed: outcomes.length - answered.length,
    shareOfVoice: shareOfVoice(answered, brand),
    byIntent: byIntent(answered),
    byEngine: byEngine(answered),
    citationDomains: citationDomains(answered, brand),
    surfaces: analyseSurfaces(answered, brand),
    gaps: findGaps(answered),
    wins: findWins(answered),
  };
}

/**
 * Answer share: of all the times any tracked brand is named, what proportion
 * is this brand? This is the number a client instantly understands.
 * @param {import('../types.js').PromptOutcome[]} answered
 * @param {import('../types.js').BrandProfile} brand
 */
export function shareOfVoice(answered, brand) {
  /** @type {Record<string, number>} */
  const counts = { [brand.name]: 0 };
  for (const c of brand.competitors || []) counts[c.name] = 0;
  for (const o of answered) {
    if (o.brand.mentioned) counts[brand.name]++;
    for (const [name, m] of Object.entries(o.competitors)) {
      if (m.mentioned) counts[name] = (counts[name] || 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      share: total ? round(count / total) : 0,
      isBrand: name === brand.name,
    }))
    .sort((a, b) => b.count - a.count);
}

/** @param {import('../types.js').PromptOutcome[]} answered */
function byIntent(answered) {
  /** @type {Record<string, {intent:string,label:string,total:number,mentions:number,score:number,rate:number}>} */
  const acc = {};
  for (const o of answered) {
    const k = o.intent;
    if (!acc[k]) acc[k] = { intent: k, label: INTENT_LABELS[k] || k, total: 0, mentions: 0, score: 0, rate: 0 };
    acc[k].total++;
    if (o.brand.mentioned) acc[k].mentions++;
    acc[k].score += outcomeScore(o);
  }
  return Object.values(acc).map((v) => ({
    ...v,
    score: round(v.total ? v.score / v.total : 0),
    rate: round(v.total ? v.mentions / v.total : 0),
  })).sort((a, b) => b.total - a.total);
}

/** @param {import('../types.js').PromptOutcome[]} answered */
function byEngine(answered) {
  /** @type {Record<string, {engine:string,total:number,mentions:number,cited:number,score:number,rate:number}>} */
  const acc = {};
  for (const o of answered) {
    if (!acc[o.engine]) acc[o.engine] = { engine: o.engine, total: 0, mentions: 0, cited: 0, score: 0, rate: 0 };
    const a = acc[o.engine];
    a.total++;
    if (o.brand.mentioned) a.mentions++;
    if (o.ownDomainCited) a.cited++;
    a.score += outcomeScore(o);
  }
  return Object.values(acc).map((v) => ({
    ...v,
    score: round(v.total ? v.score / v.total : 0),
    rate: round(v.total ? v.mentions / v.total : 0),
  })).sort((a, b) => b.score - a.score);
}

/**
 * Which domains the engines actually cite. This tells an operator exactly
 * where to go earn a mention - it is the most directly actionable output.
 * @param {import('../types.js').PromptOutcome[]} answered
 * @param {import('../types.js').BrandProfile} brand
 */
function citationDomains(answered, brand) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const o of answered) {
    for (const host of new Set(o.citations.map(hostOf).filter(Boolean))) {
      counts[host] = (counts[host] || 0) + 1;
    }
  }
  const competitorHosts = new Set((brand.competitors || []).map((c) => c.domain).filter(Boolean));
  return Object.entries(counts)
    .map(([domain, count]) => ({
      domain,
      count,
      isOwn: sameHost(domain, brand.domain),
      isCompetitor: [...competitorHosts].some((h) => sameHost(h, domain)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

/**
 * Prompts where competitors are named and the brand is not: the money list.
 *
 * Collapsed to one row per question and engine. Under repeat sampling the same
 * loss recurs once per sample, and a client-facing table that lists the same
 * question five times reads as a broken report rather than a finding. `lost`
 * and `asked` carry how consistent the loss actually was.
 */
function findGaps(answered) {
  /** @type {Map<string, {promptId:string,prompt:string,intent:string,engine:string,weight:number,asked:number,lost:number,winners:Set<string>}>} */
  const byKey = new Map();

  for (const o of answered) {
    const key = `${o.engine}|${o.promptId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        promptId: o.promptId, prompt: o.promptText, intent: o.intent,
        engine: o.engine, weight: o.weight, asked: 0, lost: 0, winners: new Set(),
      });
    }
    const row = byKey.get(key);
    row.asked++;
    const rivals = Object.entries(o.competitors)
      .filter(([, m]) => m.mentioned)
      .sort((a, b) => a[1].rank - b[1].rank);
    if (!o.brand.mentioned && rivals.length) {
      row.lost++;
      for (const [name] of rivals) row.winners.add(name);
    }
  }

  return [...byKey.values()]
    .filter((r) => r.lost > 0)
    .map((r) => ({
      promptId: r.promptId,
      prompt: r.prompt,
      intent: r.intent,
      engine: r.engine,
      weight: r.weight,
      asked: r.asked,
      lost: r.lost,
      lossRate: round(r.lost / r.asked),
      winners: [...r.winners],
    }))
    // Consistent losses on high-value questions first: those are the ones
    // costing real money on every single ask.
    .sort((a, b) => (b.weight * b.lossRate) - (a.weight * a.lossRate));
}

/** Prompts the brand already wins outright, one row per question and engine. */
function findWins(answered) {
  /** @type {Map<string, any>} */
  const byKey = new Map();
  for (const o of answered) {
    if (!o.brand.mentioned || o.brand.rank !== 1) continue;
    const key = `${o.engine}|${o.promptId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.won++;
      existing.sentiment = (existing.sentiment + o.brand.sentiment) / 2;
      existing.cited = existing.cited || o.ownDomainCited;
      continue;
    }
    byKey.set(key, {
      promptId: o.promptId, prompt: o.promptText, intent: o.intent,
      engine: o.engine, won: 1, sentiment: o.brand.sentiment, cited: o.ownDomainCited,
    });
  }
  return [...byKey.values()].sort((a, b) => b.won - a.won || b.sentiment - a.sentiment);
}

/** @param {number} n @param {number} [places] */
function round(n, places = 3) {
  const f = Math.pow(10, places);
  return Math.round((Number(n) || 0) * f) / f;
}
