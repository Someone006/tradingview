/**
 * Turn audit findings into a prioritised, sequenced action plan.
 *
 * Priority is impact-weighted and effort-discounted, then amplified by how
 * badly the underlying check actually failed. The result is an ordered list an
 * operator can work top-down, not a pile of undifferentiated "issues".
 * @module recommend/engine
 */
import { RULES, RULE_INDEX } from './rules.js';

/** @param {number} score */
function severityFor(score, impact) {
  if (score < 0.25 && impact >= 4) return 'critical';
  if (score < 0.5 && impact >= 3) return 'high';
  if (score < 0.75) return 'medium';
  return 'low';
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * @param {{brand:import('../types.js').BrandProfile, readiness:any, visibility:any}} ctx
 * @returns {import('../types.js').Recommendation[]}
 */
export function recommend(ctx) {
  const { readiness, visibility, brand } = ctx;
  const checks = readiness.checks || [];

  /** @type {Map<string, import('../types.js').CheckResult>} */
  const triggered = new Map();
  for (const check of checks) {
    if (!check.fixId) continue;
    // When several checks point at the same fix, keep the worst-scoring one:
    // it carries the strongest evidence.
    const existing = triggered.get(check.fixId);
    if (!existing || check.score < existing.score) triggered.set(check.fixId, check);
  }

  /** @type {import('../types.js').Recommendation[]} */
  const out = [];

  // A blocked crawl is itself the finding, and a serious one: whatever stopped
  // us is very likely stopping the answer engines too.
  if (readiness.blocked) {
    out.push({
      id: 'crawl-blocked',
      title: 'Your site could not be fetched by an automated client',
      why: `CiteBeam could not retrieve ${brand.domain}: ${readiness.blockedReason} `
        + 'Answer-engine crawlers are automated clients too. Whatever refused this request - bot '
        + 'protection, a WAF rule, geo-blocking, an aggressive rate limit or a TLS misconfiguration '
        + '- is a strong candidate for what is also refusing GPTBot, ClaudeBot and PerplexityBot. '
        + 'On-site readiness could not be scored at all, so treat every on-page finding in this '
        + 'report as unmeasured rather than passing.',
      how: 'Verify what a bot actually receives, then allowlist the answer-engine user agents at '
        + 'your CDN or WAF (Cloudflare, Akamai and Fastly all expose AI-crawler controls). Re-run '
        + 'this audit once a plain HTTP client can fetch the homepage.',
      snippet: `# Reproduce what a crawler sees
`
        + `curl -sSI -A "GPTBot" https://${brand.domain}/
`
        + `curl -sSI -A "ClaudeBot" https://${brand.domain}/
`
        + `curl -sSI -A "PerplexityBot" https://${brand.domain}/

`
        + `# Anything other than 200/301/302 means that engine cannot read the page.`,
      severity: 'critical',
      impact: 5,
      effort: 2,
      priority: 0,
      pillar: 'technical',
      evidence: readiness.blockedReason,
    });
  }

  for (const [fixId, check] of triggered) {
    const rule = RULE_INDEX.get(fixId);
    if (!rule) continue;
    out.push(buildRecommendation(rule, check, ctx));
  }

  // Visibility-driven recommendations fire on measured absence even when the
  // technical checks pass - a site can be perfectly crawlable and still lose
  // every commercial prompt because it has published nothing worth citing.
  const vis = visibility || {};
  const gapCount = (vis.gaps || []).length;
  const answered = vis.promptsAnswered || 0;

  if (answered > 0) {
    const gapRatio = gapCount / answered;
    if (gapRatio > 0.3 && !triggered.has('build-comparison-pages')) {
      const rule = RULE_INDEX.get('build-comparison-pages');
      if (rule) out.push(buildRecommendation(rule, syntheticCheck(
        'comparison-content', 'content',
        `Competitors are named without you in ${gapCount} of ${answered} answers.`,
        1 - gapRatio), ctx));
    }
    if ((vis.citationRate ?? 0) < 0.15 && !triggered.has('build-third-party-presence')) {
      const rule = RULE_INDEX.get('build-third-party-presence');
      if (rule) out.push(buildRecommendation(rule, syntheticCheck(
        'third-party-signals', 'authority',
        `Your domain was cited in only ${Math.round((vis.citationRate ?? 0) * 100)}% of answers.`,
        vis.citationRate ?? 0), ctx));
    }
    const branded = (vis.byIntent || []).find((i) => i.intent === 'branded');
    if (branded && branded.rate < 0.8) {
      out.push({
        id: 'branded-recall-alert',
        title: 'Fix branded recall before anything else',
        why: `The engines named you in only ${Math.round(branded.rate * 100)}% of answers to prompts `
          + `that ask about ${brand.name} by name. Losing your own branded prompt means the engines `
          + 'do not reliably know you exist as an entity - every other tactic is built on sand until '
          + 'that is fixed.',
        how: 'Prioritise entity fundamentals: Organization/LocalBusiness schema with sameAs links, a '
          + 'consistent name across every third-party profile, a Wikipedia-grade "about" page, and '
          + 'presence on the review platforms in your category. Re-audit in 30 days.',
        severity: 'critical',
        impact: 5,
        effort: 3,
        priority: 0,
        pillar: 'authority',
        evidence: `Branded prompt recall: ${Math.round(branded.rate * 100)}%`,
      });
    }
  }

  for (const r of out) r.priority = priorityScore(r);
  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || b.priority - a.priority);
  return out;
}

/**
 * @param {import('./rules.js').Rule} rule
 * @param {import('../types.js').CheckResult} check
 * @param {any} ctx
 * @returns {import('../types.js').Recommendation}
 */
function buildRecommendation(rule, check, ctx) {
  let body;
  try {
    body = rule.build({ ...ctx, check });
  } catch (err) {
    body = {
      why: check.detail,
      how: `See ${rule.title}. (Rule failed to render detail: ${err instanceof Error ? err.message : err})`,
    };
  }
  const severity = severityFor(check.score, rule.impact);
  return {
    id: rule.id,
    title: rule.title,
    why: body.why,
    how: body.how,
    snippet: body.snippet,
    severity,
    impact: rule.impact,
    effort: rule.effort,
    priority: 0,
    pillar: rule.pillar,
    evidence: check.detail,
  };
}

/**
 * @param {string} id @param {string} pillar @param {string} detail @param {number} score
 * @returns {import('../types.js').CheckResult}
 */
function syntheticCheck(id, pillar, detail, score) {
  return {
    id, title: id, pillar: /** @type {any} */ (pillar), score,
    weight: 5, status: score < 0.45 ? 'fail' : 'warn', detail, evidence: [],
  };
}

/**
 * Impact-weighted, effort-discounted ordering score.
 * @param {import('../types.js').Recommendation} r
 */
export function priorityScore(r) {
  const severityBoost = { critical: 3, high: 2, medium: 1, low: 0 }[r.severity] ?? 0;
  return Math.round(((r.impact * 2 + severityBoost * 1.5) / Math.sqrt(r.effort)) * 100) / 100;
}

/**
 * Split recommendations into a 30 / 60 / 90 day plan. Quick structural wins go
 * first because they compound: nothing downstream matters while a crawler is
 * blocked, and content work only pays once the site is readable.
 * @param {import('../types.js').Recommendation[]} recs
 */
export function roadmap(recs) {
  /** @type {{now:any[], next:any[], later:any[]}} */
  const plan = { now: [], next: [], later: [] };
  for (const r of recs) {
    if (r.severity === 'critical' || (r.effort <= 2 && r.impact >= 4)) plan.now.push(r);
    else if (r.effort <= 3) plan.next.push(r);
    else plan.later.push(r);
  }
  return plan;
}

export { RULES };
