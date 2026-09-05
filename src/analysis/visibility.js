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
 * Per-answer visibility value in 0..1.
 *
 * Presence is most of the score, but position and sentiment matter: being named
 * first with praise is a materially different commercial outcome to being
 * listed fourth with a caveat. A citation of the brand's own domain is the
 * strongest signal available, because it means the engine sent traffic.
 * @param {import('../types.js').PromptOutcome} o
 */
export function outcomeScore(o) {
  if (o.status !== 'answered') return 0;
  if (!o.brand.mentioned) return 0;
  const positionScore = o.brand.rank > 0 ? 1 / (1 + 0.35 * (o.brand.rank - 1)) : 0.5;
  const sentimentBonus = clamp(o.brand.sentiment, -0.5, 0.5) * 0.2;
  const citationBonus = o.ownDomainCited ? 0.15 : 0;
  return clamp(0.55 * 1 + 0.30 * positionScore + sentimentBonus + citationBonus, 0, 1);
}

/**
 * Aggregate outcomes into the visibility report section.
 * @param {import('../types.js').PromptOutcome[]} outcomes
 * @param {import('../types.js').BrandProfile} brand
 */
export function summarise(outcomes, brand) {
  const answered = outcomes.filter((o) => o.status === 'answered');
  const totalWeight = answered.reduce((a, o) => a + o.weight, 0);

  const weighted = totalWeight
    ? answered.reduce((a, o) => a + outcomeScore(o) * o.weight, 0) / totalWeight
    : 0;

  const mentionCount = answered.filter((o) => o.brand.mentioned).length;
  const mentionRate = answered.length ? mentionCount / answered.length : 0;
  const citedCount = answered.filter((o) => o.ownDomainCited).length;
  const citationRate = answered.length ? citedCount / answered.length : 0;

  const ranks = answered.filter((o) => o.brand.rank > 0).map((o) => o.brand.rank);
  const avgRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

  const sentiments = answered.filter((o) => o.brand.mentioned).map((o) => o.brand.sentiment);
  const avgSentiment = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 0;

  return {
    score: round(weighted),
    mentionRate: round(mentionRate),
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

/** Prompts where competitors are named and the brand is not: the money list. */
function findGaps(answered) {
  return answered
    .filter((o) => !o.brand.mentioned
      && Object.values(o.competitors).some((m) => m.mentioned))
    .map((o) => ({
      promptId: o.promptId,
      prompt: o.promptText,
      intent: o.intent,
      engine: o.engine,
      weight: o.weight,
      winners: Object.entries(o.competitors)
        .filter(([, m]) => m.mentioned)
        .sort((a, b) => a[1].rank - b[1].rank)
        .map(([n]) => n),
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Prompts the brand already wins outright. */
function findWins(answered) {
  return answered
    .filter((o) => o.brand.mentioned && o.brand.rank === 1)
    .map((o) => ({
      promptId: o.promptId,
      prompt: o.promptText,
      intent: o.intent,
      engine: o.engine,
      sentiment: o.brand.sentiment,
      cited: o.ownDomainCited,
    }))
    .sort((a, b) => b.sentiment - a.sentiment);
}

/** @param {number} n @param {number} [places] */
function round(n, places = 3) {
  const f = Math.pow(10, places);
  return Math.round((Number(n) || 0) * f) / f;
}
