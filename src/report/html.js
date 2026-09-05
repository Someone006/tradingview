/**
 * White-label HTML report generator.
 *
 * Produces a single self-contained file with no external requests: it opens
 * offline, emails cleanly, and prints to PDF with sane page breaks. This is the
 * artefact an agency puts in front of a client, so every number on it is traced
 * back to how it was measured.
 * @module report/html
 */
import { PALETTE, STATUS_META, SEVERITY_META, resolveBranding, seqStep, scoreColor } from './theme.js';
import { PILLAR_LABELS } from '../crawler/checks.js';
import { roadmap } from '../recommend/engine.js';
import { styles } from './styles.js';

/** @param {any} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`);
const one = (v) => (Number(v) || 0).toFixed(1);

/**
 * @param {import('../types.js').AuditReport} report
 * @returns {string} Complete HTML document.
 */
export function renderReport(report) {
  const b = resolveBranding(report.brand.branding);
  const brand = report.brand;
  const vis = report.visibility || {};
  const rd = report.readiness || {};
  const composite = report.meta.compositeScore;
  const date = new Date(report.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Visibility Report - ${esc(brand.name)}</title>
<style>${styles(b.accent)}</style>
</head>
<body>
${topBar(b)}
<main class="doc">
  ${cover(report, brand, composite, date, b)}
  ${report.simulated ? simulatedBanner() : ''}
  ${rd.blocked ? blockedBanner(rd, brand) : ''}
  ${executiveSummary(report)}
  ${scorecard(report)}
  ${vis.skipped ? '' : shareOfVoice(vis, brand)}
  ${vis.skipped ? '' : intentSection(vis)}
  ${vis.skipped ? '' : gapSection(vis)}
  ${vis.skipped ? '' : stabilitySection(vis)}
  ${vis.skipped ? '' : citationSection(vis)}
  ${crawlerSection(rd)}
  ${rd.blocked || !rd.checks?.length ? '' : checksSection(rd)}
  ${actionPlan(report)}
  ${vis.skipped ? '' : promptAppendix(report)}
  ${methodology(report)}
</main>
${footer(b, report)}
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function topBar(b) {
  if (!b.agencyName && !b.logoUrl) return '';
  return `<div class="topbar">
  ${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.agencyName)}" class="logo">` : ''}
  <span class="topbar-name">${esc(b.agencyName)}</span>
  ${b.website ? `<span class="topbar-web">${esc(b.website)}</span>` : ''}
</div>`;
}

function cover(report, brand, composite, date, b) {
  const grade = report.meta.grade;
  const color = scoreColor(composite);
  return `<header class="cover">
  <p class="eyebrow">AI Search Visibility Audit</p>
  <h1>${esc(brand.name)}</h1>
  <p class="sub">${esc(brand.domain)}${brand.location ? ` &middot; ${esc(brand.location)}` : ''} &middot; ${esc(date)}</p>
  <div class="hero">
    ${gauge(composite, grade, color)}
    <div class="hero-copy">
      <h2>How often do AI assistants recommend you?</h2>
      <p>When a buyer asks ChatGPT, Claude, Perplexity or Gemini for
      ${esc(brand.category)}${brand.location ? ` in ${esc(brand.location)}` : ''}, this is how
      ${esc(brand.name)} performs &mdash; combining how well the site can actually be read by
      answer engines with how often the brand is named in their answers.</p>
      <dl class="hero-stats">
        <div><dt>Named in answers</dt><dd>${pct(report.visibility?.mentionRate)}</dd></div>
        <div><dt>Own site cited</dt><dd>${pct(report.visibility?.citationRate)}</dd></div>
        <div><dt>Site readiness</dt><dd>${pct(report.readiness?.overall)}</dd></div>
      </dl>
    </div>
  </div>
</header>`;
}

/** Hero number with a ring. The ring is decoration; the number carries the value. */
function gauge(value, grade, color) {
  const v = value === null || value === undefined ? 0 : value;
  const r = 62;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, v));
  return `<div class="gauge">
  <svg viewBox="0 0 160 160" role="img" aria-label="Composite score ${pct(value)}, grade ${esc(grade)}">
    <circle cx="80" cy="80" r="${r}" fill="none" stroke="${PALETTE.ink.rule}" stroke-width="12"></circle>
    <circle cx="80" cy="80" r="${r}" fill="none" stroke="${color}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}"
      transform="rotate(-90 80 80)"></circle>
  </svg>
  <div class="gauge-val"><strong>${pct(value)}</strong><span>Grade ${esc(grade)}</span></div>
</div>`;
}

function simulatedBanner() {
  return `<div class="banner banner-warn">
  <strong>Simulated data &mdash; not a real measurement.</strong>
  <p>No AI provider API keys were configured, so the visibility figures in this report were produced
  by CiteBeam's offline simulation engine. They are realistic fixtures for demonstrating the report
  format, and they are <em>not</em> observations of what any AI assistant actually said. Do not
  present this section to a client as real data. Add an API key and re-run for live measurements.
  The site readiness findings below are real: they come from an actual crawl.</p>
</div>`;
}

function blockedBanner(rd, brand) {
  return `<div class="banner banner-crit">
  <strong>The site could not be crawled.</strong>
  <p>${esc(brand.domain)} did not return a usable response (${esc(rd.blockedReason || 'unknown error')}),
  so on-site readiness could not be scored. Every on-page finding is <em>unmeasured</em> rather than
  passing or failing. This is itself a serious finding: whatever refused an ordinary automated
  request is a strong candidate for what is refusing the answer engines too.</p>
</div>`;
}

function executiveSummary(report) {
  const items = summaryPoints(report);
  return `<section class="sec">
  <h2>Executive summary</h2>
  <ul class="summary">
    ${items.map((i) => `<li><span class="dot" style="background:${i.color}"></span>
      <div><strong>${esc(i.headline)}</strong><p>${esc(i.detail)}</p></div></li>`).join('\n')}
  </ul>
</section>`;
}

/**
 * Plain-English findings. Written so a non-technical owner understands the
 * commercial consequence, not just the metric.
 */
export function summaryPoints(report) {
  const out = [];
  const vis = report.visibility || {};
  const rd = report.readiness || {};
  const brand = report.brand;
  const S = PALETTE.status;

  if (rd.blocked) {
    out.push({
      color: S.critical,
      headline: 'Your website blocked our crawler entirely.',
      detail: `${brand.domain} returned: ${rd.blockedReason}. Answer engines use automated clients too, `
        + 'so the same barrier very likely applies to them. Nothing else on the site can be assessed until this is resolved.',
    });
  }

  const blocked = (rd.crawlers || []).filter((c) => !c.allowed && c.critical);
  if (blocked.length) {
    out.push({
      color: S.critical,
      headline: `${blocked.length} major AI crawler(s) are blocked in your robots.txt.`,
      detail: `${blocked.map((c) => c.label).join(', ')} cannot read your site at all. `
        + 'Until that is changed, no content or technical work can make you visible in those assistants. It is a one-line fix.',
    });
  }

  if (!vis.skipped) {
    const sov = (vis.shareOfVoice || []).find((s) => s.isBrand);
    const leader = (vis.shareOfVoice || [])[0];
    if (sov && leader) {
      const behind = !sov.isBrand || leader.name !== brand.name;
      out.push({
        color: behind ? S.serious : S.good,
        headline: behind
          ? `${leader.name} is named more often than you.`
          : `${brand.name} leads its category on answer share.`,
        detail: `Across the buyer questions tested, ${brand.name} held ${pct(sov.share)} of all brand `
          + `mentions${behind ? `, against ${leader.name} at ${pct(leader.share)}` : ''}. `
          + 'Answer share is the closest available proxy for who an assistant sends the buyer to.',
      });
    }
    const gaps = vis.gaps || [];
    if (gaps.length) {
      out.push({
        color: S.serious,
        headline: `You are absent from ${gaps.length} question(s) your competitors win.`,
        detail: `On prompts such as "${gaps[0].prompt}", the assistant named `
          + `${gaps[0].winners.slice(0, 2).join(' and ')} and did not mention you. `
          + 'Each of these is a buyer conversation happening without you in it.',
      });
    }
    if ((vis.citationRate ?? 0) < 0.2) {
      out.push({
        color: S.warning,
        headline: 'Your own website is rarely the source.',
        detail: `Your domain was cited in only ${pct(vis.citationRate)} of answers. Assistants are `
          + 'answering questions about your category from other people\'s pages, which means you have no control over what is said.',
      });
    }
  }

  if (!rd.blocked && rd.pillars) {
    const worst = Object.entries(rd.pillars)
      .filter(([, v]) => v !== null)
      .sort((a, b) => a[1] - b[1])[0];
    if (worst) {
      out.push({
        color: worst[1] < 0.45 ? S.critical : worst[1] < 0.7 ? S.warning : S.good,
        headline: `Weakest area: ${PILLAR_LABELS[worst[0]] || worst[0]} (${pct(worst[1])}).`,
        detail: pillarConsequence(worst[0]),
      });
    }
  }

  const now = (report.recommendations || []).filter((r) => r.severity === 'critical').length;
  out.push({
    color: now ? S.warning : S.good,
    headline: now
      ? `${now} critical fix(es) identified, with exact code included.`
      : 'No critical blockers found.',
    detail: now
      ? 'The action plan later in this report lists them in priority order, each with the specific change to make.'
      : 'Focus on the medium-priority improvements in the action plan to extend your lead.',
  });

  return out.slice(0, 6);
}

function pillarConsequence(key) {
  return {
    technical: 'Answer engines are struggling to fetch or read the site at all. This is the foundation: nothing above it works until it is fixed.',
    structure: 'The site\'s meaning is not machine-readable. Assistants have to guess what you sell and who you are, and guessing favours whoever stated it plainly.',
    content: 'The copy is not quotable. Assistants lift direct, specific, factual passages; marketing language gives them nothing to repeat.',
    authority: 'Little independent evidence corroborates you. Assistants check a claim against third-party sources before repeating it.',
  }[key] || '';
}

function scorecard(report) {
  const rd = report.readiness || {};
  const vis = report.visibility || {};
  const rows = Object.entries(rd.pillars || {})
    .filter(([, v]) => v !== null && v !== undefined);
  return `<section class="sec">
  <h2>Scorecard</h2>
  <div class="cards">
    ${card('Composite score', pct(report.meta.compositeScore), report.meta.grade === 'N/A' ? '' : `Grade ${report.meta.grade}`, scoreColor(report.meta.compositeScore))}
    ${card('AI answer visibility', vis.skipped ? 'n/a' : pct(vis.score), vis.skipped ? 'not run' : `${vis.promptsAnswered} answers analysed`, scoreColor(vis.skipped ? null : vis.score))}
    ${card('Site AEO readiness', pct(rd.overall), rd.blocked ? 'not measured' : `${rd.counts?.pass ?? 0} of ${rd.counts?.total ?? 0} checks passing`, scoreColor(rd.overall))}
  </div>
  ${rows.length ? `<h3>Readiness by pillar</h3>
  <table class="bars">
    <caption class="sr-only">Readiness score by pillar</caption>
    <tbody>
    ${rows.map(([k, v]) => `<tr>
      <th scope="row">${esc(PILLAR_LABELS[k] || k)}</th>
      <td class="barcell"><span class="track"><span class="fill" data-zero="${v > 0 ? 1 : 0}" style="width:${(v * 100).toFixed(1)}%;background:${seqStep(v)}"></span></span></td>
      <td class="num">${pct(v)}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>` : ''}
</section>`;
}

function card(label, value, note, color) {
  return `<div class="card">
  <p class="card-label">${esc(label)}</p>
  <p class="card-value" style="color:${color}">${esc(value)}</p>
  <p class="card-note">${esc(note)}</p>
</div>`;
}

/**
 * Share of voice. Emphasis form: the audited brand carries the one hue, every
 * competitor takes the de-emphasis gray, and each bar is directly labelled, so
 * identity never rests on colour.
 */
function shareOfVoice(vis, brand) {
  const rows = vis.shareOfVoice || [];
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.share), 0.01);
  return `<section class="sec">
  <h2>Answer share</h2>
  <p class="lede">Of every time a brand was named in the answers we collected, this is who got named.
  Your bar is highlighted; competitors are shown in grey for context.</p>
  <table class="bars">
    <caption class="sr-only">Share of brand mentions across all answers</caption>
    <thead><tr><th scope="col">Brand</th><th scope="col">Share of mentions</th><th scope="col" class="num">Share</th><th scope="col" class="num">Answers</th></tr></thead>
    <tbody>
    ${rows.map((r) => `<tr${r.isBrand ? ' class="is-brand"' : ''}>
      <th scope="row">${esc(r.name)}${r.isBrand ? ' <span class="tag">you</span>' : ''}</th>
      <td class="barcell"><span class="track"><span class="fill" data-zero="${r.share > 0 ? 1 : 0}" style="width:${((r.share / max) * 100).toFixed(1)}%;background:${r.isBrand ? PALETTE.brand : PALETTE.context}"></span></span></td>
      <td class="num">${pct(r.share)}</td>
      <td class="num">${r.count}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function intentSection(vis) {
  const rows = vis.byIntent || [];
  if (!rows.length) return '';
  return `<section class="sec">
  <h2>Performance by buyer intent</h2>
  <p class="lede">Not all questions are worth the same. Being named when someone asks
  &ldquo;who is the best?&rdquo; is worth far more than being named when they already searched your name.</p>
  <table class="bars">
    <caption class="sr-only">Mention rate by prompt intent</caption>
    <thead><tr><th scope="col">Question type</th><th scope="col">Mention rate</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Prompts</th></tr></thead>
    <tbody>
    ${rows.map((r) => `<tr>
      <th scope="row">${esc(r.label)}</th>
      <td class="barcell"><span class="track"><span class="fill" data-zero="${r.rate > 0 ? 1 : 0}" style="width:${(r.rate * 100).toFixed(1)}%;background:${seqStep(r.rate)}"></span></span></td>
      <td class="num">${pct(r.rate)}</td>
      <td class="num">${r.total}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function gapSection(vis) {
  const gaps = (vis.gaps || []).slice(0, 15);
  if (!gaps.length) {
    return `<section class="sec"><h2>Where you are losing</h2>
    <p class="lede good-note">No gaps found: on every question tested where a competitor was named, you were named too.</p></section>`;
  }
  const sampled = (vis.samples || 1) > 1;
  return `<section class="sec page-break">
  <h2>Where you are losing</h2>
  <p class="lede">These are the exact buyer questions where an assistant recommended a competitor and
  did not mention you. This is the highest-value list in the report: each row is a purchase
  conversation you are absent from.${sampled
    ? ` Each question was asked ${vis.samples} times; the count shows how many of those asks you lost,
       so a consistent loss is distinguishable from an occasional one.`
    : ''}</p>
  <table class="data">
    <thead><tr><th scope="col">Buyer question</th><th scope="col">Recommended instead</th>
      ${sampled ? '<th scope="col" class="num">Lost</th>' : ''}<th scope="col">Engine</th></tr></thead>
    <tbody>
    ${gaps.map((g) => `<tr>
      <td class="q">${esc(g.prompt)}</td>
      <td>${esc(g.winners.join(', '))}</td>
      ${sampled ? `<td class="num">${g.lost} of ${g.asked}</td>` : ''}
      <td class="dim">${esc(g.engine)}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

/**
 * Only meaningful when each prompt was asked more than once - with a single
 * ask every prompt is trivially "locked" or "absent", which would read as a
 * finding while saying nothing.
 */
function stabilitySection(vis) {
  const rows = (vis.stability || []).filter((s) => s.stability === 'contested');
  if (!vis.samples || vis.samples < 2 || !rows.length) return '';
  return `<section class="sec">
  <h2>Contested questions</h2>
  <p class="lede">Each question was asked ${vis.samples} times. These are the ones where you
  appeared some of the time but not reliably &mdash; the assistant is undecided about you.
  They are usually the cheapest wins in this report: you are already close enough to surface,
  so a single strong page on the topic often settles it.</p>
  <table class="data">
    <caption class="sr-only">Prompts where the brand appeared inconsistently across repeat asks</caption>
    <thead><tr><th scope="col">Buyer question</th><th scope="col" class="num">Named</th><th scope="col" class="num">Rate</th><th scope="col">Engine</th></tr></thead>
    <tbody>
    ${rows.slice(0, 15).map((r) => `<tr>
      <td class="q">${esc(r.prompt)}</td>
      <td class="num">${r.named} of ${r.asked}</td>
      <td class="num">${pct(r.rate)}</td>
      <td class="dim">${esc(r.engine)}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function citationSection(vis) {
  const rows = (vis.citationDomains || []).slice(0, 15);
  if (!rows.length) return '';
  return `<section class="sec">
  <h2>Where the answers come from</h2>
  <p class="lede">The sources these assistants actually pulled from when answering questions in your
  category. This is your outreach target list, in priority order.</p>
  <table class="data">
    <thead><tr><th scope="col">Source</th><th scope="col" class="num">Times cited</th><th scope="col">Note</th></tr></thead>
    <tbody>
    ${rows.map((d) => `<tr>
      <td><code>${esc(d.domain)}</code></td>
      <td class="num">${d.count}</td>
      <td>${d.isOwn ? '<span class="pill pill-good">your site</span>'
    : d.isCompetitor ? '<span class="pill pill-crit">competitor</span>'
      : '<span class="pill">third-party</span>'}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function crawlerSection(rd) {
  const rows = rd.crawlers || [];
  if (!rows.length) return '';
  const blocked = rows.filter((r) => !r.allowed);
  return `<section class="sec">
  <h2>AI crawler access</h2>
  <p class="lede">Whether each answer engine is permitted to read your site, according to your
  robots.txt. A blocked crawler cannot see any of your content, no matter how good it is.</p>
  ${blocked.length ? `<p class="callout callout-crit">${blocked.length} crawler(s) blocked:
    ${esc(blocked.map((b) => b.label).join(', '))}</p>` : ''}
  <table class="data">
    <thead><tr><th scope="col">Crawler</th><th scope="col">Powers</th><th scope="col">Access</th></tr></thead>
    <tbody>
    ${rows.map((r) => `<tr>
      <td><code>${esc(r.ua)}</code></td>
      <td class="dim">${esc(r.powers)}</td>
      <td>${r.allowed
    ? '<span class="pill pill-good">Allowed</span>'
    : '<span class="pill pill-crit">Blocked</span>'}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function checksSection(rd) {
  const byPillar = {};
  for (const c of rd.checks) (byPillar[c.pillar] ||= []).push(c);
  return `<section class="sec page-break">
  <h2>Site readiness detail</h2>
  <p class="lede">${rd.counts.pass} passing, ${rd.counts.warn} needing work, ${rd.counts.fail} failing
  across ${rd.counts.total} checks.</p>
  ${Object.entries(byPillar).map(([pillar, checks]) => `
  <h3>${esc(PILLAR_LABELS[pillar] || pillar)}</h3>
  <table class="data checks">
    <thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col" class="num">Score</th><th scope="col">Finding</th></tr></thead>
    <tbody>
    ${checks.sort((a, b) => a.score - b.score).map((c) => {
    const m = STATUS_META[c.status] || STATUS_META.info;
    return `<tr>
      <th scope="row">${esc(c.title)}</th>
      <td><span class="pill" style="border-color:${m.color};color:${m.color}">${esc(m.mark)} ${esc(m.label)}</span></td>
      <td class="num">${pct(c.score)}</td>
      <td class="dim">${esc(c.detail)}${c.evidence?.length ? `<br><span class="ev">${esc(c.evidence.slice(0, 3).join(' &middot; '))}</span>` : ''}</td>
    </tr>`;
  }).join('\n')}
    </tbody>
  </table>`).join('\n')}
</section>`;
}

function actionPlan(report) {
  const recs = report.recommendations || [];
  if (!recs.length) {
    return `<section class="sec"><h2>Action plan</h2>
    <p class="lede good-note">No issues found that warrant a change right now.</p></section>`;
  }
  const plan = roadmap(recs);
  const phase = (title, note, items) => (items.length ? `
  <div class="phase">
    <h3>${esc(title)} <span class="phase-note">${esc(note)}</span></h3>
    ${items.map((r, i) => recCard(r, i + 1)).join('\n')}
  </div>` : '');

  return `<section class="sec page-break">
  <h2>Action plan</h2>
  <p class="lede">Ordered by impact against effort. Work top to bottom &mdash; the early items
  unblock the later ones, and several take minutes rather than days.</p>
  ${phase('Start now', 'days 1-30 &middot; highest impact, lowest effort', plan.now)}
  ${phase('Next', 'days 31-60 &middot; builds on the above', plan.next)}
  ${phase('Then', 'days 61-90 &middot; longer-running work', plan.later)}
</section>`;
}

function recCard(r, n) {
  const sev = SEVERITY_META[r.severity] || SEVERITY_META.low;
  return `<article class="rec">
  <div class="rec-head">
    <span class="rec-num">${n}</span>
    <h4>${esc(r.title)}</h4>
    <span class="pill" style="border-color:${sev.color};color:${sev.color}">${esc(sev.label)}</span>
  </div>
  <div class="rec-meta">
    <span>Impact <strong>${r.impact}/5</strong></span>
    <span>Effort <strong>${r.effort}/5</strong></span>
    <span>Area <strong>${esc(PILLAR_LABELS[r.pillar] || r.pillar)}</strong></span>
  </div>
  <p class="rec-why"><strong>Why it matters.</strong> ${esc(r.why)}</p>
  <p class="rec-how"><strong>What to do.</strong> ${esc(r.how)}</p>
  ${r.snippet ? `<pre class="snippet"><code>${esc(r.snippet)}</code></pre>` : ''}
</article>`;
}

function promptAppendix(report) {
  const rows = (report.outcomes || []).filter((o) => o.status === 'answered');
  if (!rows.length) return '';
  return `<section class="sec page-break">
  <h2>Appendix: every question tested</h2>
  <p class="lede">The complete prompt set, with whether you were named and in what position.</p>
  <table class="data">
    <thead><tr><th scope="col">Question</th><th scope="col">Engine</th><th scope="col">You named?</th><th scope="col" class="num">Position</th></tr></thead>
    <tbody>
    ${rows.map((o) => `<tr>
      <td class="q">${esc(o.promptText)}</td>
      <td class="dim">${esc(o.engine)}</td>
      <td>${o.brand.mentioned
    ? '<span class="pill pill-good">Yes</span>'
    : '<span class="pill pill-crit">No</span>'}</td>
      <td class="num">${o.brand.rank || '-'}</td>
    </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function methodology(report) {
  const vis = report.visibility || {};
  return `<section class="sec">
  <h2>How this was measured</h2>
  <div class="method">
    <p><strong>Answer visibility.</strong> ${report.meta.promptCount} buyer questions were generated
    across seven intent types (commercial research, comparisons, alternatives, local, pricing,
    problem-led and branded) and put to
    ${esc((report.meta.engineLabels || []).join(', ') || 'no engines')}.
    Each question was asked ${vis.samples > 1 ? `<strong>${vis.samples} times</strong> and the results pooled` : 'once'},
    and every answer was scanned for the brand and its competitors. The visibility score weights presence
    most heavily, then position in the answer, sentiment of the surrounding sentence, and whether the
    brand's own domain was cited.
    ${vis.promptsFailed ? `${vis.promptsFailed} call(s) failed and were excluded.` : ''}</p>
    <p><strong>Site readiness.</strong> Up to ${report.readiness?.site?.pagesCrawled ?? 0} pages were
    fetched with an ordinary HTTP client &mdash; no JavaScript execution, the same way most AI
    crawlers see a site &mdash; along with robots.txt, llms.txt and the XML sitemap. Those were scored
    against ${report.readiness?.counts?.total ?? 0} checks across four pillars: whether engines can
    crawl the site, whether they can parse its meaning, whether the copy is quotable, and whether
    anything independent corroborates it.</p>
    <p><strong>Limitations.</strong> Assistant answers are non-deterministic and personalised; a single
    run is a sample, not a census. Track the trend across repeated runs rather than reading any one
    number as absolute. Scores are comparative diagnostics, not a guarantee of ranking or revenue.</p>
  </div>
</section>`;
}

function footer(b, report) {
  return `<footer class="foot">
  <p>${b.footerNote ? esc(b.footerNote) : `Prepared${b.agencyName ? ` by ${esc(b.agencyName)}` : ''} for ${esc(report.brand.name)}.`}</p>
  <p class="dim">Run ${esc(report.id)} &middot; ${esc(new Date(report.createdAt).toISOString())}
  ${b.contactEmail ? ` &middot; ${esc(b.contactEmail)}` : ''}</p>
</footer>`;
}
