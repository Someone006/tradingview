/**
 * Dashboard single-page app, served inline. No build step, no CDN, no
 * dependencies - it has to work on an air-gapped self-hosted box.
 * @module server/dashboard
 */
import { PALETTE } from '../report/theme.js';

export function dashboardPage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CiteBeam</title>
<style>${css()}</style>
</head>
<body>
<header class="bar">
  <span class="mark">CiteBeam</span>
  <span class="tagline">AI search visibility</span>
  <button id="theme" class="ghost" type="button" aria-label="Toggle colour theme">Theme</button>
</header>

<main>
  <section class="panel">
    <div class="panel-head">
      <h1>Run an audit</h1>
      <p>Crawl a site against the answer-engine citation checklist and measure how often AI
      assistants name the brand. The crawl needs no API keys.</p>
    </div>
    <form id="form" class="grid">
      <label>Brand name<input name="name" required placeholder="Acme Plumbing"></label>
      <label>Domain<input name="domain" required placeholder="acme.com"></label>
      <label class="wide">Category <span class="hint">what they sell, in buyers' words</span>
        <input name="category" required placeholder="emergency plumbing services"></label>
      <label>Location <span class="hint">optional</span><input name="location" placeholder="Austin, TX"></label>
      <label>Competitors <span class="hint">comma separated</span>
        <input name="competitors" placeholder="RiverCity Plumbers, Lone Star Drain"></label>
      <label>Prompts<input name="promptCount" type="number" min="4" max="60" value="24"></label>
      <label>Pages to crawl<input name="maxPages" type="number" min="1" max="40" value="12"></label>
      <div class="wide actions">
        <label class="check"><input type="checkbox" name="skipVisibility"> Crawl only (skip AI queries)</label>
        <button type="submit" id="go">Run audit</button>
      </div>
    </form>
    <div id="status" class="status" hidden></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h1>Tracked brands</h1><p id="engines" class="hint"></p></div>
    <div id="brands" class="brands"><p class="empty">Loading&hellip;</p></div>
  </section>
</main>

<script type="module">${js()}</script>
</body></html>`;
}

function css() {
  return `
:root {
  color-scheme: light;
  --bg: #fcfcfb; --panel: #ffffff; --ink: #0b0b0b; --ink-2: #52514e; --muted: #77766f;
  --rule: #e4e3df; --accent: ${PALETTE.brand}; --good: ${PALETTE.status.good};
  --warn: ${PALETTE.status.warning}; --crit: ${PALETTE.status.critical};
  --field: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #131312; --panel: #1a1a19; --ink: #f5f5f2; --ink-2: #c3c2b7; --muted: #96958c;
    --rule: #302f2d; --accent: #3987e5; --good: #0ca30c; --warn: #fab219; --crit: #d03b3b;
    --field: #232322;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #131312; --panel: #1a1a19; --ink: #f5f5f2; --ink-2: #c3c2b7; --muted: #96958c;
  --rule: #302f2d; --accent: #3987e5; --good: #0ca30c; --warn: #fab219; --crit: #d03b3b;
  --field: #232322;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
}
.bar {
  display: flex; align-items: baseline; gap: 12px; padding: 16px 28px;
  border-bottom: 1px solid var(--rule); background: var(--panel);
}
.mark { font-weight: 700; letter-spacing: -.01em; font-size: 17px; }
.tagline { color: var(--muted); font-size: 13px; }
.ghost {
  margin-left: auto; background: none; border: 1px solid var(--rule); color: var(--ink-2);
  border-radius: 7px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 13px;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
main { max-width: 1060px; margin: 0 auto; padding: 28px; display: grid; gap: 22px; }
.panel { background: var(--panel); border: 1px solid var(--rule); border-radius: 12px; padding: 22px 24px; }
.panel-head h1 { font-size: 17px; margin: 0 0 4px; letter-spacing: -.01em; }
.panel-head p { margin: 0 0 18px; color: var(--ink-2); font-size: 14px; max-width: 70ch; }
.hint { color: var(--muted); font-weight: 400; font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
.wide { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
input[type=text], input[type=number], input:not([type]) {
  font: inherit; padding: 9px 11px; border: 1px solid var(--rule); border-radius: 8px;
  background: var(--field); color: var(--ink); width: 100%;
}
input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.check { flex-direction: row; align-items: center; gap: 7px; font-weight: 500; }
.check input { width: auto; }
button[type=submit] {
  margin-left: auto; background: var(--accent); color: #fff; border: 0; border-radius: 8px;
  padding: 10px 22px; font: inherit; font-weight: 600; cursor: pointer;
}
button[type=submit]:disabled { opacity: .55; cursor: progress; }
.status {
  margin-top: 16px; padding: 12px 14px; border-radius: 8px; font-size: 14px;
  border: 1px solid var(--rule); background: var(--bg);
}
.status.err { border-color: var(--crit); color: var(--crit); }
.status.ok { border-color: var(--good); }
.brands { display: grid; gap: 10px; }
.empty { color: var(--muted); font-size: 14px; margin: 0; }
.brow {
  display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px; align-items: center;
  padding: 13px 15px; border: 1px solid var(--rule); border-radius: 10px; background: var(--bg);
}
.brow h2 { font-size: 15px; margin: 0; letter-spacing: -.01em; }
.brow .dom { color: var(--muted); font-size: 12.5px; }
.score { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.spark { display: block; }
.blinks { display: flex; gap: 10px; font-size: 13px; }
.blinks a { color: var(--accent); text-decoration: none; }
.blinks a:hover { text-decoration: underline; }
.flag {
  font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--warn);
  color: var(--warn); margin-left: 7px; vertical-align: 1px;
}
@media (max-width: 640px) {
  .brow { grid-template-columns: 1fr; gap: 8px; }
  main { padding: 16px; }
}`;
}

function js() {
  return `
const $ = (s) => document.querySelector(s);
const pct = (v) => (v === null || v === undefined ? '-' : Math.round(v * 100) + '%');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Theme toggle: persisted per viewer, falls back to the OS setting. */
const themeBtn = $('#theme');
try {
  const saved = localStorage.getItem('citebeam-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch {}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('citebeam-theme', next); } catch {}
});

function scoreColor(v) {
  if (v === null || v === undefined) return 'var(--muted)';
  if (v >= 0.7) return 'var(--good)';
  if (v >= 0.45) return 'var(--warn)';
  return 'var(--crit)';
}

/* A sparkline is context for the score beside it, so it carries no axes.
   The number is the value; the line is the direction. */
function sparkline(points) {
  const vals = points.map((p) => p.composite).filter((v) => typeof v === 'number');
  if (vals.length < 2) return '<span class="hint">one run</span>';
  const w = 90, h = 26, pad = 2;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
  const last = vals[vals.length - 1], first = vals[0];
  const stroke = last >= first ? 'var(--good)' : 'var(--crit)';
  return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
    '" role="img" aria-label="Composite trend across ' + vals.length + ' runs, ' +
    pct(first) + ' to ' + pct(last) + '"><path d="' + d +
    '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

async function loadEngines() {
  try {
    const r = await fetch('/api/engines').then((x) => x.json());
    const live = r.credentials.filter((c) => c.ready).map((c) => c.id);
    $('#engines').textContent = live.length
      ? 'Live engines: ' + live.join(', ')
      : 'No API keys set - audits use the offline simulation engine and are labelled as simulated.';
  } catch {}
}

async function loadBrands() {
  const host = $('#brands');
  try {
    const { brands } = await fetch('/api/brands').then((r) => r.json());
    if (!brands.length) { host.innerHTML = '<p class="empty">No audits yet. Run one above.</p>'; return; }
    const rows = await Promise.all(brands.map(async (b) => {
      let trend = [];
      try { trend = (await fetch('/api/brands/' + encodeURIComponent(b.key)).then((r) => r.json())).trend || []; } catch {}
      const l = b.latest || {};
      return '<div class="brow">' +
        '<div><h2>' + esc(b.name) +
          (l.simulated ? '<span class="flag">simulated</span>' : '') +
          (l.blocked ? '<span class="flag">crawl blocked</span>' : '') +
        '</h2><div class="dom">' + esc(b.domain) + ' &middot; ' + b.runs + ' run(s)</div></div>' +
        '<div>' + sparkline(trend) + '</div>' +
        '<div class="score" style="color:' + scoreColor(l.composite) + '">' + pct(l.composite) + '</div>' +
        '<div class="blinks">' +
          '<a href="/report/' + encodeURIComponent(b.key) + '" target="_blank" rel="noopener">Report</a>' +
          '<a href="/report/' + encodeURIComponent(b.key) + '?format=md" target="_blank" rel="noopener">MD</a>' +
          '<a href="/report/' + encodeURIComponent(b.key) + '?format=outcomes.csv">CSV</a>' +
        '</div></div>';
    }));
    host.innerHTML = rows.join('');
  } catch (err) {
    host.innerHTML = '<p class="empty">Could not load brands: ' + esc(err.message) + '</p>';
  }
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const status = $('#status');
  const btn = $('#go');
  const brand = {
    name: fd.get('name'),
    domain: fd.get('domain'),
    category: fd.get('category'),
    location: fd.get('location') || undefined,
    competitors: String(fd.get('competitors') || '').split(',').map((s) => s.trim())
      .filter(Boolean).map((n) => ({ name: n })),
  };
  const body = {
    brand,
    promptCount: Number(fd.get('promptCount')) || undefined,
    maxPages: Number(fd.get('maxPages')) || undefined,
    skipVisibility: fd.get('skipVisibility') === 'on',
  };
  btn.disabled = true;
  status.hidden = false;
  status.className = 'status';
  status.textContent = 'Crawling and querying engines. This usually takes 10-60 seconds...';
  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || ('HTTP ' + res.status));
    status.className = 'status ok';
    status.innerHTML = 'Done - composite ' + pct(out.composite) + ' (grade ' + esc(out.grade) + '). ' +
      '<a href="' + out.reportUrl + '" target="_blank" rel="noopener">Open the report</a>' +
      (out.simulated ? ' <em>(simulated data - no API keys configured)</em>' : '') +
      (out.blocked ? ' <em>(site could not be crawled)</em>' : '');
    loadBrands();
  } catch (err) {
    status.className = 'status err';
    status.textContent = 'Failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

loadEngines();
loadBrands();
`;
}
