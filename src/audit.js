/**
 * Audit orchestrator: crawl, query, score, recommend.
 * @module audit
 */
import { assessReadiness } from './crawler/readiness.js';
import { generatePrompts } from './prompts/generator.js';
import { resolveEngines } from './engines/index.js';
import { runVisibility } from './analysis/run.js';
import { recommend, roadmap } from './recommend/engine.js';
import { DEFAULTS } from './config.js';
import { runId } from './util/id.js';
import { log, c } from './util/log.js';

/**
 * Run a complete audit for one brand.
 *
 * The two halves are independent by design: the readiness crawl needs no
 * credentials, so a run still produces a full, sellable deliverable when no
 * AI provider keys are configured.
 *
 * @param {import('./types.js').BrandProfile} brand
 * @param {{engines?:string[], promptCount?:number, samples?:number, maxPages?:number, skipVisibility?:boolean, skipReadiness?:boolean, previous?:any, onProgress?:(done:number,total:number)=>void}} [opts]
 * @returns {Promise<import('./types.js').AuditReport>}
 */
export async function runAudit(brand, opts = {}) {
  const started = Date.now();
  const id = runId();
  log.blank();
  log.info(c.bold(`CiteBeam audit - ${brand.name} (${brand.domain})`));
  log.info(c.dim(`run ${id}`));
  log.blank();

  const { engines, simulated, notes } = resolveEngines(opts.engines);
  for (const n of notes) log.warn(n);

  const prompts = opts.skipVisibility
    ? []
    : generatePrompts(brand, { limit: opts.promptCount ?? DEFAULTS.promptCount });

  // Crawl and query concurrently: they touch different hosts and the crawl is
  // usually the slower of the two.
  const [readiness, visibilityRun] = await Promise.all([
    opts.skipReadiness
      ? Promise.resolve(emptyReadiness(brand))
      : assessReadiness(brand, {
        maxPages: opts.maxPages ?? DEFAULTS.maxPages,
        concurrency: DEFAULTS.crawlConcurrency,
        timeout: DEFAULTS.requestTimeout,
      }),
    opts.skipVisibility
      ? Promise.resolve({ outcomes: [], summary: emptyVisibility() })
      : runVisibility(brand, prompts, engines, {
        concurrency: DEFAULTS.engineConcurrency,
        samples: opts.samples ?? DEFAULTS.samples,
        onProgress: opts.onProgress,
      }),
  ]);

  const { outcomes, summary: visibility } = visibilityRun;

  const recommendations = recommend({ brand, readiness, visibility });
  const plan = roadmap(recommendations);

  // The headline number. Readiness is weighted slightly higher than measured
  // visibility because it is what the operator can actually change this month;
  // visibility is the lagging indicator that follows.
  //
  // A blocked crawl yields no readiness score at all rather than a zero: a site
  // we could not fetch is unmeasured, not failing, and reporting it as failing
  // would be a false finding in a client-facing document.
  const haveReadiness = !opts.skipReadiness && !readiness.blocked && readiness.overall !== null;
  const haveVisibility = !opts.skipVisibility;
  const composite = haveReadiness && haveVisibility
    ? round(readiness.overall * 0.55 + visibility.score * 0.45)
    : haveReadiness ? readiness.overall
      : haveVisibility ? visibility.score
        : null;

  /** @type {import('./types.js').AuditReport} */
  const report = {
    id,
    createdAt: new Date().toISOString(),
    brand,
    enginesUsed: engines.map((e) => e.id),
    simulated,
    visibility,
    readiness,
    recommendations,
    outcomes,
    checks: readiness.checks || [],
    meta: {
      compositeScore: composite,
      grade: composite === null ? 'N/A' : gradeFor(composite),
      partial: !haveReadiness || !haveVisibility,
      crawlBlocked: !!readiness.blocked,
      durationMs: Date.now() - started,
      promptCount: prompts.length,
      engineLabels: engines.map((e) => e.label),
      notes,
      plan: {
        now: plan.now.map((r) => r.id),
        next: plan.next.map((r) => r.id),
        later: plan.later.map((r) => r.id),
      },
      version: '1.0.0',
    },
  };

  if (opts.previous) report.delta = computeDelta(report, opts.previous);

  log.blank();
  if (readiness.blocked) {
    log.warn(`Site could not be crawled (${readiness.blockedReason}). `
      + 'On-site readiness is reported as not measured, not as failing.');
  }
  log.ok('Composite AI visibility score: ' + (composite === null
    ? c.bold('not measured')
    : c.bold(`${Math.round(composite * 100)}% (${report.meta.grade})`)));
  log.ok(`${recommendations.length} prioritised recommendation(s); `
    + `${plan.now.length} to start now`);
  log.info(c.dim(`completed in ${((Date.now() - started) / 1000).toFixed(1)}s`));
  return report;
}

/**
 * Compare a report against a previous run.
 * @param {import('./types.js').AuditReport} current
 * @param {import('./types.js').AuditReport} previous
 */
export function computeDelta(current, previous) {
  const d = (a, b) => round((Number(a) || 0) - (Number(b) || 0));
  const prevRecs = new Set((previous.recommendations || []).map((r) => r.id));
  const currRecs = new Set((current.recommendations || []).map((r) => r.id));
  return {
    previousId: previous.id,
    previousAt: previous.createdAt,
    composite: d(current.meta.compositeScore, previous.meta?.compositeScore),
    readiness: d(current.readiness.overall, previous.readiness?.overall),
    visibility: d(current.visibility.score, previous.visibility?.score),
    mentionRate: d(current.visibility.mentionRate, previous.visibility?.mentionRate),
    citationRate: d(current.visibility.citationRate, previous.visibility?.citationRate),
    shareOfVoice: d(
      (current.visibility.shareOfVoice || []).find((s) => s.isBrand)?.share,
      (previous.visibility?.shareOfVoice || []).find((s) => s.isBrand)?.share,
    ),
    resolved: [...prevRecs].filter((id) => !currRecs.has(id)),
    introduced: [...currRecs].filter((id) => !prevRecs.has(id)),
  };
}

/** @param {number} score */
export function gradeFor(score) {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.55) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

/** @param {import('./types.js').BrandProfile} brand */
function emptyReadiness(brand) {
  return {
    site: {
      domain: brand.domain, origin: `https://${brand.domain}`, reachable: false,
      error: undefined, pagesCrawled: 0, sitemapUrls: 0,
      hasRobotsTxt: false, hasLlmsTxt: false, pages: [],
    },
    crawlers: [], checks: [],
    blocked: false, blockedReason: '',
    overall: null,
    pillars: { technical: null, structure: null, content: null, authority: null },
    counts: { pass: 0, warn: 0, fail: 0, total: 0 },
    skipped: true,
  };
}

function emptyVisibility() {
  return {
    score: 0, mentionRate: 0, citationRate: 0, avgRank: 0, avgSentiment: 0,
    promptsRun: 0, promptsAnswered: 0, promptsFailed: 0,
    shareOfVoice: [], byIntent: [], byEngine: [], citationDomains: [],
    gaps: [], wins: [], skipped: true,
  };
}

/** @param {number} n */
function round(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
