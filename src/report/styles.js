/**
 * Report stylesheet. Print-first: this document's job is to be read on screen,
 * emailed, and printed to PDF as a client deliverable, so it commits to a single
 * light treatment with explicitly painted colours rather than following a
 * viewer theme.
 * @module report/styles
 */
import { PALETTE } from './theme.js';

/** @param {string} accent Agency accent colour (chrome only, never data). */
export function styles(accent) {
  const I = PALETTE.ink;
  return `
:root {
  --accent: ${accent};
  --ink: ${I.primary};
  --ink-2: ${I.secondary};
  --muted: ${I.muted};
  --rule: ${I.rule};
  --panel: ${I.panel};
  --surface: ${PALETTE.surface};
  --good: ${PALETTE.status.good};
  --warn: ${PALETTE.status.warning};
  --crit: ${PALETTE.status.critical};
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font: 16px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 40px; background: var(--accent); color: #fff;
}
.topbar .logo { height: 28px; width: auto; }
.topbar-name { font-weight: 650; letter-spacing: .01em; }
.topbar-web { margin-left: auto; opacity: .85; font-size: 14px; }

.doc { max-width: 940px; margin: 0 auto; padding: 48px 40px 24px; }

.cover { border-bottom: 3px solid var(--accent); padding-bottom: 32px; margin-bottom: 8px; }
.eyebrow {
  margin: 0 0 6px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent); font-weight: 700;
}
.cover h1 { margin: 0; font-size: 42px; line-height: 1.12; letter-spacing: -.02em; }
.cover .sub { margin: 8px 0 0; color: var(--ink-2); font-size: 15px; }

.hero { display: flex; gap: 36px; align-items: center; margin-top: 30px; flex-wrap: wrap; }
.gauge { position: relative; width: 160px; height: 160px; flex: none; }
.gauge svg { width: 160px; height: 160px; display: block; }
.gauge-val {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
}
.gauge-val strong { font-size: 34px; line-height: 1; letter-spacing: -.02em; }
.gauge-val span { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.hero-copy { flex: 1 1 380px; }
.hero-copy h2 { margin: 0 0 8px; font-size: 21px; letter-spacing: -.01em; }
.hero-copy p { margin: 0; color: var(--ink-2); font-size: 15px; }
.hero-stats { display: flex; gap: 28px; margin: 18px 0 0; flex-wrap: wrap; }
.hero-stats div { margin: 0; }
.hero-stats dt { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }
.hero-stats dd { margin: 2px 0 0; font-size: 22px; font-weight: 650; letter-spacing: -.01em; }

.sec { margin: 40px 0; }
.sec h2 {
  font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
  margin: 0 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); font-weight: 700;
}
.sec h3 { font-size: 17px; margin: 26px 0 10px; letter-spacing: -.01em; }
.lede { margin: 0 0 16px; color: var(--ink-2); max-width: 68ch; }
.good-note { color: var(--good); font-weight: 550; }

.banner { border-radius: 10px; padding: 16px 18px; margin: 24px 0; border: 1px solid; }
.banner strong { display: block; margin-bottom: 4px; }
.banner p { margin: 0; font-size: 14px; line-height: 1.55; }
.banner-warn { background: #fff8e6; border-color: var(--warn); }
.banner-crit { background: #fdecec; border-color: var(--crit); }

.summary { list-style: none; margin: 0; padding: 0; }
.summary li { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--rule); }
.summary li:last-child { border-bottom: 0; }
.summary .dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 7px; flex: none; }
.summary strong { display: block; font-size: 15.5px; }
.summary p { margin: 3px 0 0; color: var(--ink-2); font-size: 14.5px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 16px 18px; }
.card-label { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.card-value { margin: 6px 0 2px; font-size: 32px; font-weight: 700; letter-spacing: -.02em; }
.card-note { margin: 0; font-size: 13px; color: var(--ink-2); }

table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
caption { text-align: left; }
thead th {
  text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted); font-weight: 650; padding: 0 10px 8px 0; border-bottom: 1px solid var(--rule);
}
tbody th, tbody td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--rule); vertical-align: top; text-align: left; }
tbody th { font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
thead th.num { text-align: right; }
.dim { color: var(--ink-2); }
.ev { color: var(--muted); font-size: 12.5px; }
.q { max-width: 46ch; }
.is-brand th, .is-brand td { background: #f2f7fd; }

.bars .barcell { width: 52%; }
.track { display: block; height: 10px; background: var(--rule); border-radius: 5px; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 5px; }
.fill[data-zero="0"] { display: none; }

.tag {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; background: var(--accent);
  color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: 2px;
}
.pill {
  display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--rule); color: var(--ink-2); white-space: nowrap;
}
.pill-good { border-color: var(--good); color: var(--good); }
.pill-crit { border-color: var(--crit); color: var(--crit); }
.callout { border-left: 3px solid var(--rule); padding: 10px 14px; background: var(--panel); border-radius: 0 8px 8px 0; }
.callout-crit { border-left-color: var(--crit); background: #fdecec; }

.phase { margin: 26px 0; }
.phase h3 { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.phase-note { font-size: 12.5px; color: var(--muted); font-weight: 400; letter-spacing: .02em; }
.rec {
  border: 1px solid var(--rule); border-radius: 10px; padding: 18px 20px; margin: 12px 0;
  background: #fff; break-inside: avoid;
}
.rec-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rec-num {
  width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 13px;
  font-weight: 650; flex: none;
}
.rec-head h4 { margin: 0; font-size: 17px; flex: 1 1 auto; letter-spacing: -.01em; }
.rec-meta { display: flex; gap: 18px; margin: 10px 0 12px; font-size: 12.5px; color: var(--muted); flex-wrap: wrap; }
.rec-meta strong { color: var(--ink); }
.rec p { margin: 0 0 10px; font-size: 14.5px; color: var(--ink-2); }
.rec p strong { color: var(--ink); }
.snippet {
  background: #12161c; color: #e6edf3; padding: 14px 16px; border-radius: 8px;
  overflow-x: auto; font-size: 12.5px; line-height: 1.55; margin: 6px 0 0;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.snippet code { white-space: pre; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }

.method p { margin: 0 0 12px; font-size: 14.5px; color: var(--ink-2); max-width: 74ch; }
.method strong { color: var(--ink); }

.foot {
  max-width: 940px; margin: 0 auto; padding: 24px 40px 48px;
  border-top: 1px solid var(--rule); font-size: 13px; color: var(--ink-2);
}
.foot p { margin: 0 0 4px; }

@media (max-width: 720px) {
  .doc, .foot { padding-left: 20px; padding-right: 20px; }
  .cover h1 { font-size: 32px; }
  .bars .barcell { width: 38%; }
}

@media print {
  @page { margin: 14mm; }
  body { background: #fff; font-size: 11pt; }
  .doc { max-width: none; padding: 0; }
  .topbar { padding: 10px 0; }
  .page-break { break-before: page; }
  .sec, .rec, table { break-inside: avoid; }
  .snippet { background: #f4f4f2; color: #111; border: 1px solid var(--rule); }
  a { text-decoration: none; color: inherit; }
}
`;
}
