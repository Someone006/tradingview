/**
 * The AEO readiness check suite.
 *
 * Every check answers one question an answer engine implicitly asks of a site:
 * can I fetch it, can I parse it, is it quotable, and should I trust it. Each
 * returns a normalised 0..1 score plus a weight, so the aggregate is a
 * defensible number rather than a vibe. Checks are pure functions of a
 * SiteSnapshot: no network, fully testable.
 * @module crawler/checks
 */
import * as H from '../util/html.js';
import { auditAiAccess } from './robots.js';
import { wordCount, isAnswerCapsule, normalise } from '../util/text.js';
import { categoryText } from '../config.js';

/** @typedef {import('../types.js').SiteSnapshot} SiteSnapshot */
/** @typedef {import('../types.js').CheckResult} CheckResult */

/** @param {number} score @returns {'pass'|'warn'|'fail'} */
function statusFor(score) {
  if (score >= 0.8) return 'pass';
  if (score >= 0.45) return 'warn';
  return 'fail';
}

/**
 * @param {Partial<CheckResult> & {id:string,title:string,pillar:CheckResult['pillar'],score:number,weight:number,detail:string}} c
 * @returns {CheckResult}
 */
function mk(c) {
  return {
    evidence: [],
    status: statusFor(c.score),
    ...c,
    score: Math.max(0, Math.min(1, c.score)),
  };
}

/* ------------------------------------------------------------------ *
 * Technical pillar - can an answer engine fetch and read the site?
 * ------------------------------------------------------------------ */

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkAiCrawlerAccess(s) {
  const access = auditAiAccess(s.robotsTxt);
  const critical = access.filter((a) => a.critical);
  const blockedCritical = critical.filter((a) => !a.allowed);
  const blockedAny = access.filter((a) => !a.allowed);
  const score = critical.length
    ? (critical.length - blockedCritical.length) / critical.length
    : 1;
  const evidence = blockedAny.length
    ? blockedAny.map((a) => `${a.label} is BLOCKED (powers ${a.powers})`)
    : ['All major AI crawlers are permitted at the site root'];
  return mk({
    id: 'ai-crawler-access',
    title: 'AI crawler access',
    pillar: 'technical',
    weight: 10,
    score,
    detail: blockedCritical.length
      ? `${blockedCritical.length} of ${critical.length} critical AI crawlers are blocked in robots.txt. These engines cannot read the site at all, so no amount of content work will surface it.`
      : blockedAny.length
        ? `All critical AI crawlers are allowed, but ${blockedAny.length} secondary crawler(s) are blocked.`
        : 'Every major AI crawler is allowed to fetch the site root.',
    evidence,
    fixId: blockedAny.length ? 'unblock-ai-crawlers' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkRobotsTxt(s) {
  const present = !!s.robotsTxt;
  const hasSitemap = /(^|\n)\s*sitemap:/i.test(s.robotsTxt || '');
  const score = present ? (hasSitemap ? 1 : 0.65) : 0.2;
  return mk({
    id: 'robots-txt',
    title: 'robots.txt present and declares a sitemap',
    pillar: 'technical',
    weight: 3,
    score,
    detail: !present
      ? 'No robots.txt was found. Crawlers default to allow, but you lose the ability to declare a sitemap or grant explicit AI access.'
      : hasSitemap
        ? 'robots.txt is present and points to a sitemap.'
        : 'robots.txt is present but does not declare a Sitemap: line.',
    evidence: present ? [`${String(s.robotsTxt).split(/\r?\n/).length} lines`] : [],
    fixId: score < 1 ? 'ship-robots-txt' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkLlmsTxt(s) {
  const txt = s.llmsTxt || '';
  const present = !!txt;
  const hasLinks = (txt.match(/\]\(/g) || []).length >= 3;
  const hasHeading = /^#\s+\S/m.test(txt);
  const score = !present ? 0 : hasLinks && hasHeading ? 1 : 0.6;
  return mk({
    id: 'llms-txt',
    title: 'llms.txt route map',
    pillar: 'technical',
    weight: 4,
    score,
    detail: !present
      ? 'No /llms.txt found. This file gives assistants a curated, unambiguous map of your most quotable pages.'
      : score === 1
        ? 'A well-formed llms.txt is published with a title and linked routes.'
        : 'llms.txt exists but is thin - it needs an H1 title and a linked list of your key pages.',
    evidence: present ? [`${txt.split(/\r?\n/).length} lines`, `${(txt.match(/\]\(/g) || []).length} links`] : [],
    fixId: score < 1 ? 'publish-llms-txt' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkSitemap(s) {
  const n = s.sitemapUrls.length;
  const score = n === 0 ? 0.1 : n < 5 ? 0.5 : n < 15 ? 0.8 : 1;
  return mk({
    id: 'sitemap',
    title: 'XML sitemap coverage',
    pillar: 'technical',
    weight: 3,
    score,
    detail: n === 0
      ? 'No XML sitemap was found. Answer engines rely on sitemaps to discover pages they have never been linked to.'
      : `Sitemap lists ${n} URL(s).`,
    evidence: n ? [`${n} URLs discovered`] : [],
    fixId: score < 0.8 ? 'ship-sitemap' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkHttps(s) {
  const secure = s.origin.startsWith('https://');
  return mk({
    id: 'https',
    title: 'HTTPS',
    pillar: 'technical',
    weight: 3,
    score: secure ? 1 : 0,
    detail: secure
      ? 'The site is served over HTTPS.'
      : 'The site is not served over HTTPS. Several AI crawlers skip insecure origins outright.',
    evidence: [s.origin],
    fixId: secure ? undefined : 'enable-https',
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkServerRendering(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) {
    return mk({
      id: 'server-rendering', title: 'Server-rendered content', pillar: 'technical',
      weight: 8, score: 0, detail: 'No pages could be fetched for analysis.',
    });
  }
  const thin = pages.filter((p) => H.looksClientRendered(p.html) || wordCount(p.text) < 120);
  const score = 1 - thin.length / pages.length;
  return mk({
    id: 'server-rendering',
    title: 'Content is server-rendered',
    pillar: 'technical',
    weight: 8,
    score,
    detail: thin.length
      ? `${thin.length} of ${pages.length} sampled pages return little or no text without JavaScript. Most AI crawlers do not execute JavaScript, so they see an empty page.`
      : 'All sampled pages return their main content in the initial HTML response.',
    evidence: thin.slice(0, 5).map((p) => `${p.url} - ${wordCount(p.text)} words in raw HTML`),
    fixId: score < 0.9 ? 'server-render-content' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkResponseSpeed(s) {
  const pages = s.pages.filter((p) => p.status === 200 && p.latencyMs > 0);
  if (!pages.length) {
    return mk({
      id: 'response-speed', title: 'Server response time', pillar: 'technical',
      weight: 2, score: 0.5, detail: 'Not enough successful responses to measure.',
    });
  }
  const avg = pages.reduce((a, p) => a + p.latencyMs, 0) / pages.length;
  const score = avg < 600 ? 1 : avg < 1500 ? 0.8 : avg < 3000 ? 0.5 : 0.2;
  return mk({
    id: 'response-speed',
    title: 'Server response time',
    pillar: 'technical',
    weight: 2,
    score,
    detail: `Average response time across sampled pages is ${Math.round(avg)}ms.`
      + (score < 0.8 ? ' Slow origins get dropped from live retrieval, which runs on a tight budget.' : ''),
    evidence: [`${Math.round(avg)}ms average over ${pages.length} pages`],
    fixId: score < 0.8 ? 'speed-up-origin' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkCanonical(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'canonical', title: 'Canonical URLs', pillar: 'technical', weight: 2, score: 0.5, detail: 'No pages to analyse.' });
  const withCanonical = pages.filter((p) => /<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(p.html));
  const score = withCanonical.length / pages.length;
  return mk({
    id: 'canonical',
    title: 'Canonical URLs',
    pillar: 'technical',
    weight: 2,
    score,
    detail: `${withCanonical.length} of ${pages.length} sampled pages declare a canonical URL.`
      + (score < 1 ? ' Without one, engines can split citation credit across duplicate URLs.' : ''),
    fixId: score < 0.8 ? 'add-canonical' : undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Structure pillar - can an answer engine parse meaning out of it?
 * ------------------------------------------------------------------ */

/** @param {SiteSnapshot} s */
function allTypes(s) {
  const set = new Set();
  for (const p of s.pages) for (const t of H.schemaTypes(p.jsonld)) set.add(t);
  return set;
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkStructuredData(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  const withLd = pages.filter((p) => p.jsonld.length > 0);
  const score = pages.length ? withLd.length / pages.length : 0;
  return mk({
    id: 'jsonld-present',
    title: 'JSON-LD structured data',
    pillar: 'structure',
    weight: 7,
    score,
    detail: `${withLd.length} of ${pages.length} sampled pages carry JSON-LD.`
      + (score < 1 ? ' Assistants parse JSON far more reliably than they parse HTML layout.' : ''),
    evidence: [...allTypes(s)].slice(0, 12).map((t) => `@type: ${t}`),
    fixId: score < 0.8 ? 'add-jsonld' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkEntitySchema(s) {
  const types = allTypes(s);
  const entityTypes = ['Organization', 'LocalBusiness', 'Corporation', 'ProfessionalService', 'Store', 'Restaurant', 'MedicalBusiness', 'HomeAndConstructionBusiness', 'Plumber', 'Dentist', 'LegalService', 'SoftwareApplication'];
  const has = entityTypes.some((t) => types.has(t));
  const nodes = s.pages.flatMap((p) => p.jsonld);
  const sameAs = nodes.some((n) => n && (Array.isArray(n.sameAs) ? n.sameAs.length : !!n.sameAs));
  const score = has ? (sameAs ? 1 : 0.65) : 0.1;
  return mk({
    id: 'entity-schema',
    title: 'Entity schema (Organization or LocalBusiness)',
    pillar: 'structure',
    weight: 6,
    score,
    detail: !has
      ? 'No Organization or LocalBusiness schema was found. This is how you tell an engine who you are, so it can resolve you as an entity rather than a string.'
      : sameAs
        ? 'Entity schema is present and includes sameAs links to external profiles.'
        : 'Entity schema is present but has no sameAs links, so it is not connected to your third-party profiles.',
    evidence: [...types].filter((t) => entityTypes.includes(t)).map((t) => `@type: ${t}`),
    fixId: score < 1 ? 'add-entity-schema' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkFaqSchema(s) {
  const types = allTypes(s);
  const has = types.has('FAQPage') || types.has('QAPage');
  const hasQuestions = s.pages.flatMap((p) => p.jsonld)
    .some((n) => n && Array.isArray(n.mainEntity) && n.mainEntity.length >= 3);
  const score = has ? (hasQuestions ? 1 : 0.7) : 0;
  return mk({
    id: 'faq-schema',
    title: 'FAQPage schema',
    pillar: 'structure',
    weight: 5,
    score,
    detail: has
      ? 'FAQPage schema is published, giving engines pre-chunked question/answer pairs.'
      : 'No FAQPage schema found. Q&A pairs are the single easiest unit for an engine to lift verbatim into an answer.',
    fixId: score < 1 ? 'add-faq-schema' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkOfferSchema(s) {
  const types = allTypes(s);
  const has = ['Product', 'Service', 'Offer', 'AggregateOffer', 'SoftwareApplication'].some((t) => types.has(t));
  const priced = s.pages.flatMap((p) => p.jsonld)
    .some((n) => n && (n.offers || n.price || (n.aggregateRating)));
  const score = has ? (priced ? 1 : 0.6) : 0.15;
  return mk({
    id: 'offer-schema',
    title: 'Product / Service / Offer schema',
    pillar: 'structure',
    weight: 4,
    score,
    detail: has
      ? (priced
        ? 'Offer schema with pricing or rating data is published.'
        : 'Product or Service schema exists but carries no price or rating, which are the fields engines quote most.')
      : 'No Product, Service or Offer schema found. Pricing questions are among the highest-intent prompts and engines answer them from structured data.',
    fixId: score < 1 ? 'add-offer-schema' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkHeadingHierarchy(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'heading-hierarchy', title: 'Heading hierarchy', pillar: 'structure', weight: 4, score: 0.5, detail: 'No pages to analyse.' });
  let good = 0;
  const problems = [];
  for (const p of pages) {
    const h1 = p.headings.filter((h) => h.level === 1).length;
    const h2 = p.headings.filter((h) => h.level === 2).length;
    if (h1 === 1 && h2 >= 2) good++;
    else if (h1 !== 1) problems.push(`${p.url} has ${h1} H1 tags`);
    else problems.push(`${p.url} has only ${h2} H2 sections`);
  }
  const score = good / pages.length;
  return mk({
    id: 'heading-hierarchy',
    title: 'Heading hierarchy',
    pillar: 'structure',
    weight: 4,
    score,
    detail: `${good} of ${pages.length} sampled pages use exactly one H1 with at least two H2 sections.`
      + (score < 0.8 ? ' Engines chunk pages on heading boundaries; flat pages get chunked badly or skipped.' : ''),
    evidence: problems.slice(0, 5),
    fixId: score < 0.8 ? 'fix-headings' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkQuestionHeadings(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  const qRe = /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will)\b|\?$/i;
  const total = pages.reduce((a, p) => a + p.headings.filter((h) => h.level >= 2).length, 0);
  const questions = pages.reduce(
    (a, p) => a + p.headings.filter((h) => h.level >= 2 && qRe.test(h.text.trim())).length, 0);
  const ratio = total ? questions / total : 0;
  const score = ratio >= 0.25 ? 1 : ratio >= 0.12 ? 0.7 : ratio > 0 ? 0.4 : 0.1;
  return mk({
    id: 'question-headings',
    title: 'Question-shaped headings',
    pillar: 'structure',
    weight: 5,
    score,
    detail: `${questions} of ${total} subheadings are phrased as questions (${Math.round(ratio * 100)}%).`
      + (score < 1 ? ' Headings that mirror the prompt a user types are the strongest retrieval hook available.' : ''),
    fixId: score < 0.8 ? 'question-headings' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkSemanticHtml(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'semantic-html', title: 'Semantic HTML landmarks', pillar: 'structure', weight: 2, score: 0.5, detail: 'No pages to analyse.' });
  const good = pages.filter((p) => /<(main|article)\b/i.test(p.html)).length;
  const score = good / pages.length;
  return mk({
    id: 'semantic-html',
    title: 'Semantic HTML landmarks',
    pillar: 'structure',
    weight: 2,
    score,
    detail: `${good} of ${pages.length} pages wrap their body copy in <main> or <article>, which tells a parser where the content ends and the chrome begins.`,
    fixId: score < 0.8 ? 'semantic-landmarks' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkMetaDescription(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'meta-description', title: 'Meta descriptions', pillar: 'structure', weight: 2, score: 0.5, detail: 'No pages to analyse.' });
  const good = pages.filter((p) => p.description && p.description.length >= 60).length;
  const score = good / pages.length;
  return mk({
    id: 'meta-description',
    title: 'Meta descriptions',
    pillar: 'structure',
    weight: 2,
    score,
    detail: `${good} of ${pages.length} sampled pages have a meta description of at least 60 characters.`,
    fixId: score < 0.8 ? 'write-meta-descriptions' : undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Content pillar - is the copy actually quotable?
 * ------------------------------------------------------------------ */

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkAnswerCapsule(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'answer-capsule', title: 'Answer capsules', pillar: 'content', weight: 7, score: 0.5, detail: 'No pages to analyse.' });
  const good = [];
  const bad = [];
  for (const p of pages) {
    const lead = H.leadCopy(p.html, 60);
    (isAnswerCapsule(lead) ? good : bad).push(p.url);
  }
  const score = good.length / pages.length;
  return mk({
    id: 'answer-capsule',
    title: 'Answer capsule in the first 60 words',
    pillar: 'content',
    weight: 7,
    score,
    detail: `${good.length} of ${pages.length} sampled pages open with a direct, declarative answer.`
      + (score < 0.8 ? ' Pages that open with brand throat-clearing ("Welcome to...", "Founded in 1998...") give an engine nothing liftable in the window it actually reads.' : ''),
    evidence: bad.slice(0, 5).map((u) => `${u} - no answer capsule up top`),
    fixId: score < 0.8 ? 'write-answer-capsules' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkComparisonContent(s) {
  const patterns = [/\bvs\b|\bversus\b/i, /\balternatives?\b/i, /\bcompare|comparison\b/i, /\bbest\b.{0,40}\b(for|in|of)\b/i];
  const urls = [...new Set([...s.pages.map((p) => p.url), ...s.sitemapUrls])];
  const matchingUrls = urls.filter((u) => {
    const path = (() => { try { return new URL(u).pathname; } catch { return u; } })();
    return patterns.some((re) => re.test(path));
  });
  const matchingTitles = s.pages.filter((p) => patterns.some((re) => re.test(p.title || '')));
  const hits = new Set([...matchingUrls, ...matchingTitles.map((p) => p.url)]).size;
  const score = hits >= 3 ? 1 : hits === 2 ? 0.75 : hits === 1 ? 0.45 : 0.05;
  return mk({
    id: 'comparison-content',
    title: 'Comparison and "best X" content',
    pillar: 'content',
    weight: 8,
    score,
    detail: hits
      ? `${hits} comparison-style page(s) found.`
      : 'No comparison, alternatives or "best X for Y" pages found. List-shaped pages are the single most-cited content type in AI answers, and commercial prompts almost always resolve to one.',
    evidence: [...new Set(matchingUrls)].slice(0, 6),
    fixId: score < 0.75 ? 'build-comparison-pages' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkFaqContent(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  const qHeadings = pages.reduce(
    (a, p) => a + p.headings.filter((h) => /\?$/.test(h.text.trim())).length, 0);
  const hasFaqPage = pages.some((p) => /faq|frequently-asked|questions/i.test(p.url));
  const score = qHeadings >= 6 ? 1 : qHeadings >= 3 ? 0.75 : hasFaqPage ? 0.5 : qHeadings > 0 ? 0.35 : 0.05;
  return mk({
    id: 'faq-content',
    title: 'On-page Q&A content',
    pillar: 'content',
    weight: 6,
    score,
    detail: qHeadings
      ? `${qHeadings} question-form headings found across sampled pages.`
      : 'No question-and-answer content was found. Q&A blocks are pre-chunked for retrieval and map directly onto how people prompt.',
    fixId: score < 0.75 ? 'add-faq-content' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkContentDepth(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'content-depth', title: 'Content depth', pillar: 'content', weight: 4, score: 0.5, detail: 'No pages to analyse.' });
  const counts = pages.map((p) => wordCount(p.text));
  const median = counts.slice().sort((a, b) => a - b)[Math.floor(counts.length / 2)];
  const thin = counts.filter((n) => n < 300).length;
  const score = median >= 800 ? 1 : median >= 500 ? 0.8 : median >= 300 ? 0.55 : 0.25;
  return mk({
    id: 'content-depth',
    title: 'Content depth',
    pillar: 'content',
    weight: 4,
    score,
    detail: `Median page length is ${median} words; ${thin} of ${pages.length} sampled pages are under 300 words.`
      + (score < 0.8 ? ' Thin pages rarely survive retrieval ranking against a competitor covering the same question in depth.' : ''),
    evidence: [`median ${median} words`, `${thin} thin pages`],
    fixId: score < 0.8 ? 'deepen-content' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkQuotableStats(s) {
  const pages = s.pages.filter((p) => p.status === 200);
  if (!pages.length) return mk({ id: 'quotable-stats', title: 'Quotable statistics', pillar: 'content', weight: 5, score: 0.5, detail: 'No pages to analyse.' });
  const statRe = /\b\d{1,3}(?:\.\d+)?%|\b(?:\d{1,3},)+\d{3}\b|\$\s?\d[\d,.]*(?:\s?(?:k|m|bn|billion|million))?\b|\b\d+x\b/gi;
  let total = 0;
  const withStats = pages.filter((p) => {
    const n = (p.text.match(statRe) || []).length;
    total += n;
    return n >= 3;
  }).length;
  const score = withStats / pages.length;
  return mk({
    id: 'quotable-stats',
    title: 'Quotable statistics and specifics',
    pillar: 'content',
    weight: 5,
    score,
    detail: `${withStats} of ${pages.length} sampled pages contain three or more concrete figures (${total} found in total).`
      + (score < 0.7 ? ' Generative-engine research consistently finds that adding statistics and named specifics lifts citation rate: a number is quotable, an adjective is not.' : ''),
    fixId: score < 0.7 ? 'add-quotable-stats' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkFreshness(s) {
  const nodes = s.pages.flatMap((p) => p.jsonld);
  const dates = [];
  for (const n of nodes) {
    for (const key of ['dateModified', 'datePublished', 'uploadDate']) {
      const v = n && n[key];
      if (typeof v === 'string') {
        const d = Date.parse(v);
        if (!Number.isNaN(d)) dates.push(d);
      }
    }
  }
  for (const p of s.pages) {
    const m = p.html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i);
    if (m) { const d = Date.parse(m[1]); if (!Number.isNaN(d)) dates.push(d); }
  }
  if (!dates.length) {
    return mk({
      id: 'freshness',
      title: 'Content freshness signals',
      pillar: 'content',
      weight: 4,
      score: 0.15,
      detail: 'No machine-readable dates found. Engines strongly prefer content they can verify as current, and undated pages lose to dated ones on time-sensitive prompts.',
      fixId: 'add-freshness-signals',
    });
  }
  const newest = Math.max(...dates);
  const days = Math.floor((Date.now() - newest) / 86400000);
  const score = days <= 60 ? 1 : days <= 180 ? 0.75 : days <= 365 ? 0.45 : 0.2;
  return mk({
    id: 'freshness',
    title: 'Content freshness signals',
    pillar: 'content',
    weight: 4,
    score,
    detail: `Most recent machine-readable date is ${days} day(s) old.`
      + (score < 0.75 ? ' Refresh and re-stamp your key pages; staleness is a ranking penalty in live retrieval.' : ''),
    evidence: [`newest: ${new Date(newest).toISOString().slice(0, 10)}`, `${dates.length} dated items`],
    fixId: score < 0.75 ? 'add-freshness-signals' : undefined,
  });
}

/**
 * @param {SiteSnapshot} s
 * @param {import('../types.js').BrandProfile} brand
 * @returns {CheckResult}
 */
export function checkEntityClarity(s, brand) {
  const home = s.pages[0];
  if (!home || home.status !== 200) {
    return mk({ id: 'entity-clarity', title: 'Entity clarity', pillar: 'content', weight: 5, score: 0.3, detail: 'Homepage could not be analysed.' });
  }
  const lead = normalise(`${home.title} ${home.description} ${H.leadCopy(home.html, 120)}`);
  const nameHit = normalise(brand.name).split(/\s+/).every((w) => w.length < 3 || lead.includes(w));
  const catWords = normalise(categoryText(brand)).split(/\s+/).filter((w) => w.length > 3);
  const catHits = catWords.filter((w) => lead.includes(w)).length;
  const catRatio = catWords.length ? catHits / catWords.length : 1;
  const locHit = !brand.location || normalise(brand.location).split(/[\s,]+/)
    .some((w) => w.length > 2 && lead.includes(w));
  const score = (nameHit ? 0.4 : 0) + catRatio * 0.4 + (locHit ? 0.2 : 0);
  const missing = [];
  if (!nameHit) missing.push('brand name');
  if (catRatio < 0.6) missing.push('category wording');
  if (!locHit) missing.push('location');
  return mk({
    id: 'entity-clarity',
    title: 'Entity clarity (who, what, where)',
    pillar: 'content',
    weight: 5,
    score,
    detail: missing.length
      ? `The homepage opening does not clearly state: ${missing.join(', ')}. An engine has to infer what you are, and inference loses to a competitor who says it plainly.`
      : 'The homepage states the brand, what it does and where it operates within its opening copy.',
    evidence: [`lead copy sampled: "${H.leadCopy(home.html, 25)}"`],
    fixId: score < 0.8 ? 'clarify-entity' : undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Authority pillar - does anything outside the site vouch for it?
 * ------------------------------------------------------------------ */

/** Platforms whose pages engines disproportionately retrieve and cite. */
const AUTHORITY_HOSTS = [
  'g2.com', 'capterra.com', 'trustpilot.com', 'reddit.com', 'wikipedia.org',
  'crunchbase.com', 'linkedin.com', 'github.com', 'producthunt.com',
  'yelp.com', 'bbb.org', 'glassdoor.com', 'youtube.com', 'x.com', 'twitter.com',
  'facebook.com', 'instagram.com', 'trustradius.com', 'clutch.co', 'angi.com',
  'houzz.com', 'tripadvisor.com', 'news.ycombinator.com', 'stackoverflow.com',
];

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkThirdPartySignals(s) {
  /** Map a hostname onto the authority platform it belongs to, if any. */
  const platformOf = (host) =>
    AUTHORITY_HOSTS.find((x) => host === x || host.endsWith(`.${x}`)) || null;

  const outbound = new Set();
  for (const p of s.pages) {
    for (const l of p.links) {
      try {
        const h = new URL(l).host.toLowerCase().replace(/^www\./, '');
        if (h === s.domain) continue;
        const platform = platformOf(h);
        if (platform) outbound.add(platform);
      } catch { /* skip malformed hrefs */ }
    }
  }

  const sameAs = new Set();
  for (const n of s.pages.flatMap((p) => p.jsonld)) {
    const v = n && n.sameAs;
    for (const u of Array.isArray(v) ? v : v ? [v] : []) {
      try { sameAs.add(new URL(u).host.replace(/^www\./, '')); } catch { /* skip */ }
    }
  }
  const total = new Set([...outbound, ...sameAs]).size;
  const score = total >= 5 ? 1 : total >= 3 ? 0.75 : total >= 1 ? 0.45 : 0.05;
  return mk({
    id: 'third-party-signals',
    title: 'Third-party profile signals',
    pillar: 'authority',
    weight: 6,
    score,
    detail: total
      ? `${total} link(s) to high-retrieval third-party platforms found.`
      : 'The site links to no review, community or profile platforms. Independent mentions carry weight of their own: engines corroborate a claim before repeating it, and self-published pages alone are weak evidence.',
    evidence: [...new Set([...outbound, ...sameAs])].slice(0, 10),
    fixId: score < 0.75 ? 'build-third-party-presence' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkContactSignals(s) {
  const text = s.pages.map((p) => p.text).join('\n');
  const nodes = s.pages.flatMap((p) => p.jsonld);
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text) || nodes.some((n) => n && n.telephone);
  const hasAddress = nodes.some((n) => n && n.address)
    || /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|suite|ste)\b/i.test(text);
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const hits = [hasPhone, hasAddress, hasEmail].filter(Boolean).length;
  const score = hits / 3;
  const missing = [!hasPhone && 'phone', !hasAddress && 'postal address', !hasEmail && 'email'].filter(Boolean);
  return mk({
    id: 'contact-signals',
    title: 'Verifiable contact details (NAP)',
    pillar: 'authority',
    weight: 4,
    score,
    detail: missing.length
      ? `Missing from the crawled pages: ${missing.join(', ')}. Consistent name/address/phone is how an engine confirms you are a real, resolvable business.`
      : 'Phone, address and email are all published and machine-readable.',
    fixId: score < 1 ? 'publish-nap' : undefined,
  });
}

/** @param {SiteSnapshot} s @returns {CheckResult} */
export function checkAuthorship(s) {
  const nodes = s.pages.flatMap((p) => p.jsonld);
  const hasAuthor = nodes.some((n) => n && n.author);
  const hasAuthorMeta = s.pages.some((p) => H.meta(p.html, 'author'));
  const hasBylineText = s.pages.some((p) => /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(p.text.slice(0, 4000)));
  const score = hasAuthor ? 1 : hasAuthorMeta ? 0.7 : hasBylineText ? 0.45 : 0.1;
  return mk({
    id: 'authorship',
    title: 'Named authorship and expertise',
    pillar: 'authority',
    weight: 3,
    score,
    detail: score >= 0.7
      ? 'Content carries attributable authorship.'
      : 'Content is anonymous. Named, credentialed authors are an experience-and-expertise signal that engines weigh when choosing between two otherwise equal sources.',
    fixId: score < 0.7 ? 'add-authorship' : undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Suite runner
 * ------------------------------------------------------------------ */

/** Weight each pillar contributes to the overall readiness score. */
export const PILLAR_WEIGHTS = {
  technical: 0.3,
  structure: 0.25,
  content: 0.3,
  authority: 0.15,
};

export const PILLAR_LABELS = {
  technical: 'Crawlability',
  structure: 'Machine readability',
  content: 'Quotability',
  authority: 'Trust signals',
};

/**
 * Run every check against a crawled site.
 * @param {SiteSnapshot} s
 * @param {import('../types.js').BrandProfile} brand
 * @returns {CheckResult[]}
 */
export function runChecks(s, brand) {
  /** @type {Array<(snap:SiteSnapshot)=>CheckResult>} */
  const suite = [
    checkAiCrawlerAccess, checkRobotsTxt, checkLlmsTxt, checkSitemap, checkHttps,
    checkServerRendering, checkResponseSpeed, checkCanonical,
    checkStructuredData, checkEntitySchema, checkFaqSchema, checkOfferSchema,
    checkHeadingHierarchy, checkQuestionHeadings, checkSemanticHtml, checkMetaDescription,
    checkAnswerCapsule, checkComparisonContent, checkFaqContent, checkContentDepth,
    checkQuotableStats, checkFreshness,
    checkThirdPartySignals, checkContactSignals, checkAuthorship,
  ];
  const results = suite.map((fn) => {
    try { return fn(s); }
    catch (err) {
      return mk({
        id: fn.name, title: fn.name, pillar: 'technical', weight: 1, score: 0.5,
        detail: `Check failed to run: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
  try { results.push(checkEntityClarity(s, brand)); } catch { /* non-fatal */ }
  return results;
}

/**
 * Aggregate check results into pillar scores and one overall readiness score.
 * @param {CheckResult[]} checks
 */
export function scoreReadiness(checks) {
  /** @type {Record<string, {score:number, weight:number, checks:number}>} */
  const pillars = {};
  for (const key of Object.keys(PILLAR_WEIGHTS)) {
    pillars[key] = { score: 0, weight: 0, checks: 0 };
  }
  for (const c of checks) {
    const p = pillars[c.pillar];
    if (!p) continue;
    p.score += c.score * c.weight;
    p.weight += c.weight;
    p.checks++;
  }
  /** @type {Record<string, number>} */
  const pillarScores = {};
  let overall = 0;
  let usedWeight = 0;
  for (const [key, agg] of Object.entries(pillars)) {
    const value = agg.weight ? agg.score / agg.weight : 0;
    pillarScores[key] = round(value);
    if (agg.checks) {
      overall += value * PILLAR_WEIGHTS[key];
      usedWeight += PILLAR_WEIGHTS[key];
    }
  }
  return {
    overall: round(usedWeight ? overall / usedWeight : 0),
    pillars: pillarScores,
    counts: {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      total: checks.length,
    },
  };
}

/** @param {number} n */
function round(n) { return Math.round(n * 1000) / 1000; }
