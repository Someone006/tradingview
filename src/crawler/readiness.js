/**
 * Crawl a site and score its AEO readiness. This is the half of CiteBeam that
 * needs no LLM credentials at all.
 * @module crawler/readiness
 */
import { crawlSite } from './crawl.js';
import { runChecks, scoreReadiness, PILLAR_LABELS, PILLAR_WEIGHTS } from './checks.js';
import { auditAiAccess } from './robots.js';
import { log } from '../util/log.js';

export { PILLAR_LABELS, PILLAR_WEIGHTS };

/**
 * @param {import('../types.js').BrandProfile} brand
 * @param {{maxPages?:number, concurrency?:number, timeout?:number, respectRobots?:boolean}} [opts]
 */
export async function assessReadiness(brand, opts = {}) {
  const site = await crawlSite(brand.domain, {
    maxPages: opts.maxPages,
    concurrency: opts.concurrency,
    timeout: opts.timeout,
    keyPages: brand.keyPages,
    respectRobots: opts.respectRobots,
  });

  const crawlers = auditAiAccess(site.robotsTxt);

  // If we never actually retrieved the site, we must not score it. Reporting
  // "no structured data" when the truth is "we got a 403" would put a false
  // finding in front of a paying client. Return an explicit blocked result
  // instead, and let the caller surface it as the finding it really is.
  if (!site.reachable) {
    log.warn(`Skipping readiness scoring: ${site.domain} could not be crawled.`);
    return {
      site: {
        domain: site.domain, origin: site.origin, reachable: false,
        error: site.error, pagesCrawled: 0, sitemapUrls: 0,
        hasRobotsTxt: !!site.robotsTxt, hasLlmsTxt: !!site.llmsTxt, pages: [],
      },
      crawlers,
      checks: [],
      blocked: true,
      robotsBlocked: !!site.robotsBlocked,
      blockedReason: site.error || 'The site did not return a usable response.',
      overall: null,
      pillars: { technical: null, structure: null, content: null, authority: null },
      counts: { pass: 0, warn: 0, fail: 0, total: 0 },
      snapshot: site,
    };
  }

  const checks = runChecks(site, brand);
  const scores = scoreReadiness(checks);

  log.ok(`AEO readiness: ${Math.round(scores.overall * 100)}%`
    + ` (${scores.counts.pass} pass / ${scores.counts.warn} warn / ${scores.counts.fail} fail)`);

  return {
    blocked: false,
    blockedReason: '',
    site: {
      domain: site.domain,
      origin: site.origin,
      reachable: site.reachable,
      error: site.error,
      pagesCrawled: site.pages.filter((p) => p.status === 200).length,
      sitemapUrls: site.sitemapUrls.length,
      hasRobotsTxt: !!site.robotsTxt,
      hasLlmsTxt: !!site.llmsTxt,
      pages: site.pages.filter((p) => p.status === 200).map((p) => ({
        url: p.url, title: p.title, words: p.text.split(/\s+/).filter(Boolean).length,
        schemaTypes: [...new Set(p.jsonld.flatMap((n) => {
          const t = n && n['@type'];
          return t ? (Array.isArray(t) ? t : [t]) : [];
        }))],
      })),
    },
    crawlers,
    checks,
    ...scores,
    snapshot: site,
  };
}
