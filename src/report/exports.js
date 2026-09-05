/**
 * Non-HTML export formats: JSON for pipelines, CSV for spreadsheets,
 * Markdown for pasting into a doc or ticket.
 * @module report/exports
 */

/** @param {import('../types.js').AuditReport} r */
export function toJson(r) { return JSON.stringify(r, null, 2); }

/** @param {any} v */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {any[][]} rows */
function csv(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\n'); }

/**
 * One row per prompt/engine pair - the format an operator actually pivots on.
 * @param {import('../types.js').AuditReport} r
 */
export function outcomesCsv(r) {
  const competitors = (r.brand.competitors || []).map((c) => c.name);
  const head = ['run_id', 'created_at', 'brand', 'engine', 'intent', 'weight', 'prompt',
    'status', 'brand_mentioned', 'brand_rank', 'brand_sentiment', 'own_domain_cited',
    ...competitors.map((c) => `mentioned_${c.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`),
    'citations'];
  const rows = (r.outcomes || []).map((o) => [
    r.id, r.createdAt, r.brand.name, o.engine, o.intent, o.weight, o.promptText,
    o.status, o.brand.mentioned, o.brand.rank || '', o.brand.sentiment, o.ownDomainCited,
    ...competitors.map((c) => (o.competitors[c]?.mentioned ? 'true' : 'false')),
    (o.citations || []).join(' '),
  ]);
  return csv([head, ...rows]);
}

/** @param {import('../types.js').AuditReport} r */
export function checksCsv(r) {
  const head = ['run_id', 'brand', 'pillar', 'check_id', 'title', 'status', 'score', 'weight', 'detail'];
  const rows = (r.checks || []).map((c) => [
    r.id, r.brand.name, c.pillar, c.id, c.title, c.status, c.score, c.weight, c.detail,
  ]);
  return csv([head, ...rows]);
}

/** @param {import('../types.js').AuditReport} r */
export function recommendationsCsv(r) {
  const head = ['run_id', 'brand', 'priority', 'severity', 'pillar', 'title', 'impact', 'effort', 'why', 'how'];
  const rows = (r.recommendations || []).map((x) => [
    r.id, r.brand.name, x.priority, x.severity, x.pillar, x.title, x.impact, x.effort, x.why, x.how,
  ]);
  return csv([head, ...rows]);
}

const p = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`);

/**
 * Markdown summary - useful for pasting into Slack, Notion or a ticket.
 * @param {import('../types.js').AuditReport} r
 */
export function toMarkdown(r) {
  const vis = r.visibility || {};
  const rd = r.readiness || {};
  const lines = [];
  lines.push(`# AI Visibility Report - ${r.brand.name}`);
  lines.push('');
  lines.push(`**${r.brand.domain}** | ${new Date(r.createdAt).toDateString()} | run \`${r.id}\``);
  lines.push('');
  if (r.simulated) {
    lines.push('> **Simulated data.** No AI provider keys were configured, so visibility figures are');
    lines.push('> illustrative fixtures, not real measurements. Site readiness findings are real.');
    lines.push('');
  }
  if (rd.blocked) {
    lines.push(`> **Site could not be crawled:** ${rd.blockedReason} On-site findings are unmeasured.`);
    lines.push('');
  }
  lines.push('## Scores');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Composite | ${p(r.meta.compositeScore)} (${r.meta.grade}) |`);
  lines.push(`| AI answer visibility | ${vis.skipped ? 'not run' : p(vis.score)} |`);
  lines.push(`| Site AEO readiness | ${p(rd.overall)} |`);
  lines.push(`| Named in answers | ${p(vis.mentionRate)} |`);
  lines.push(`| Own domain cited | ${p(vis.citationRate)} |`);
  lines.push('');

  if ((vis.shareOfVoice || []).length) {
    lines.push('## Answer share');
    lines.push('');
    lines.push('| Brand | Share | Mentions |');
    lines.push('| --- | --- | --- |');
    for (const s of vis.shareOfVoice) {
      lines.push(`| ${s.name}${s.isBrand ? ' **(you)**' : ''} | ${p(s.share)} | ${s.count} |`);
    }
    lines.push('');
  }

  if ((vis.gaps || []).length) {
    lines.push('## Questions you are losing');
    lines.push('');
    for (const g of vis.gaps.slice(0, 10)) {
      lines.push(`- **${g.prompt}** - recommended instead: ${g.winners.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Action plan');
  lines.push('');
  for (const [i, rec] of (r.recommendations || []).entries()) {
    lines.push(`### ${i + 1}. ${rec.title}  \`${rec.severity}\``);
    lines.push('');
    lines.push(`*Impact ${rec.impact}/5 - Effort ${rec.effort}/5 - ${rec.pillar}*`);
    lines.push('');
    lines.push(`**Why.** ${rec.why}`);
    lines.push('');
    lines.push(`**How.** ${rec.how}`);
    lines.push('');
    if (rec.snippet) {
      lines.push('```');
      lines.push(rec.snippet);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}
