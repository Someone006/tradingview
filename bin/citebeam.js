#!/usr/bin/env node
/**
 * CiteBeam CLI.
 * @module bin/citebeam
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, list } from '../src/cli/args.js';
import { loadEnv, loadBrand, validateBrand, engineAvailability, DEFAULTS } from '../src/config.js';
import { runAudit } from '../src/audit.js';
import { renderReport } from '../src/report/html.js';
import { toJson, toMarkdown, outcomesCsv, checksCsv, recommendationsCsv } from '../src/report/exports.js';
import { Store } from '../src/store/store.js';
import { log, c, setQuiet, bar, pct } from '../src/util/log.js';
import { slug } from '../src/util/id.js';
import { ALL_ENGINES } from '../src/engines/index.js';
import { PILLAR_LABELS } from '../src/crawler/checks.js';

loadEnv();
const { command, flags, positional } = parseArgs(process.argv);
if (flags.q || flags.quiet) setQuiet(true);

const COMMANDS = {
  audit: cmdAudit,
  serve: cmdServe,
  init: cmdInit,
  list: cmdList,
  history: cmdHistory,
  report: cmdReport,
  engines: cmdEngines,
  help: cmdHelp,
};

const fn = COMMANDS[command || 'help'] || null;
if (!fn) {
  log.error(`Unknown command: ${command}`);
  cmdHelp();
  process.exit(1);
}
try {
  await fn();
} catch (err) {
  log.error(err instanceof Error ? err.message : String(err));
  if (flags.debug && err instanceof Error) console.error(err.stack);
  process.exit(1);
}

/* ------------------------------------------------------------------ */

async function cmdAudit() {
  const brand = resolveBrandInput();
  const store = new Store(flags.data || DEFAULTS.dataDir);
  const previous = flags.compare === false ? null : store.previous(brand.domain);

  const report = await runAudit(brand, {
    engines: list(flags.engines),
    promptCount: Number(flags.prompts || DEFAULTS.promptCount),
    maxPages: Number(flags.pages || DEFAULTS.maxPages),
    skipVisibility: !!flags['no-visibility'],
    skipReadiness: !!flags['no-readiness'],
    previous,
  });

  if (!flags['no-save']) store.save(report);

  const outDir = path.resolve(flags.out || DEFAULTS.outDir);
  mkdirSync(outDir, { recursive: true });
  const base = `${slug(brand.domain)}-${report.id}`;

  /** @type {string[]} */
  const written = [];
  const formats = list(flags.format).length ? list(flags.format) : ['html', 'json'];
  const write = (ext, body) => {
    const f = path.join(outDir, `${base}.${ext}`);
    writeFileSync(f, body);
    written.push(f);
  };
  if (formats.includes('html')) write('html', renderReport(report));
  if (formats.includes('json')) write('json', toJson(report));
  if (formats.includes('md') || formats.includes('markdown')) write('md', toMarkdown(report));
  if (formats.includes('csv')) {
    write('outcomes.csv', outcomesCsv(report));
    write('checks.csv', checksCsv(report));
    write('actions.csv', recommendationsCsv(report));
  }

  printSummary(report);
  log.blank();
  for (const f of written) log.ok(`Wrote ${path.relative(process.cwd(), f)}`);

  if (flags.open) {
    const html = written.find((f) => f.endsWith('.html'));
    if (html) log.info(c.dim(`\nOpen it with:  file://${html}`));
  }
  if (flags.fail === true || typeof flags.fail === 'number') {
    const threshold = typeof flags.fail === 'number' ? flags.fail / 100 : 0.5;
    const score = report.meta.compositeScore;
    if (score !== null && score < threshold) {
      log.error(`Composite score ${pct(score)} is below the --fail threshold of ${pct(threshold)}`);
      process.exit(2);
    }
  }
}

function printSummary(report) {
  const rd = report.readiness || {};
  const vis = report.visibility || {};
  log.blank();
  log.info(c.bold('  Scores'));
  log.info(`   composite   ${bar(report.meta.compositeScore ?? 0)}  ${pct(report.meta.compositeScore ?? 0)} (${report.meta.grade})`);
  if (!vis.skipped) log.info(`   visibility  ${bar(vis.score)}  ${pct(vis.score)}`);
  if (!rd.blocked && rd.overall !== null) {
    log.info(`   readiness   ${bar(rd.overall)}  ${pct(rd.overall)}`);
    log.blank();
    for (const [k, v] of Object.entries(rd.pillars || {})) {
      if (v === null) continue;
      log.info(`   ${String(PILLAR_LABELS[k] || k).padEnd(20)} ${bar(v, 16)}  ${pct(v)}`);
    }
  }
  if (!vis.skipped && (vis.shareOfVoice || []).length) {
    log.blank();
    log.info(c.bold('  Answer share'));
    for (const s of vis.shareOfVoice.slice(0, 6)) {
      log.info(`   ${(s.isBrand ? c.cyan(s.name) : s.name).padEnd(34)} ${bar(s.share, 16)}  ${pct(s.share)}`);
    }
  }
  if ((vis.gaps || []).length) {
    log.blank();
    log.info(c.bold(`  Losing ${vis.gaps.length} question(s) to competitors, e.g.`));
    for (const g of vis.gaps.slice(0, 3)) {
      log.info(c.dim(`   "${g.prompt}"`));
      log.info(c.dim(`      -> ${g.winners.join(', ')}`));
    }
  }
  const recs = report.recommendations || [];
  if (recs.length) {
    log.blank();
    log.info(c.bold('  Top actions'));
    for (const [i, r] of recs.slice(0, 5).entries()) {
      const tint = r.severity === 'critical' ? c.red : r.severity === 'high' ? c.yellow : c.dim;
      log.info(`   ${i + 1}. ${tint(`[${r.severity}]`)} ${r.title}`);
    }
  }
  if (report.delta) {
    const d = report.delta;
    const sign = (n) => (n > 0 ? c.green(`+${Math.round(n * 100)}pts`) : n < 0 ? c.red(`${Math.round(n * 100)}pts`) : c.dim('no change'));
    log.blank();
    log.info(c.bold('  Since last run'));
    log.info(`   composite ${sign(d.composite)} | visibility ${sign(d.visibility)} | readiness ${sign(d.readiness)}`);
    if (d.resolved.length) log.info(c.green(`   resolved: ${d.resolved.join(', ')}`));
    if (d.introduced.length) log.info(c.yellow(`   new: ${d.introduced.join(', ')}`));
  }
}

async function cmdServe() {
  const { startServer } = await import('../src/server/server.js');
  await startServer({
    port: Number(flags.port || DEFAULTS.port),
    dataDir: flags.data || DEFAULTS.dataDir,
    host: flags.host || '127.0.0.1',
  });
}

async function cmdInit() {
  const file = flags.out || positional[0] || 'brand.json';
  if (existsSync(file) && !flags.force) {
    throw new Error(`${file} already exists. Pass --force to overwrite.`);
  }
  const template = {
    name: flags.name || 'Your Brand',
    domain: flags.domain || 'yourbrand.com',
    category: flags.category || 'what you sell, in the words your buyers use',
    location: flags.location || '',
    audience: 'who buys this, described the way they would describe themselves',
    aliases: [],
    competitors: [
      { name: 'Competitor One', domain: 'competitorone.com' },
      { name: 'Competitor Two', domain: 'competitortwo.com' },
    ],
    extraPrompts: ['Any additional question you want tested verbatim'],
    keyPages: [],
    branding: {
      agencyName: '', logoUrl: '', accent: '#1f2933',
      contactEmail: '', website: '', footerNote: '',
    },
  };
  if (!template.location) delete template.location;
  writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
  log.ok(`Created ${file}`);
  log.info(c.dim(`Edit it, then run:  citebeam audit --brand ${file}`));
}

async function cmdList() {
  const store = new Store(flags.data || DEFAULTS.dataDir);
  const brands = store.brands();
  if (!brands.length) {
    log.info('No audits yet. Run: citebeam audit --brand brand.json');
    return;
  }
  log.blank();
  for (const b of brands) {
    const l = b.latest || {};
    log.info(`  ${c.bold(b.name.padEnd(28))} ${String(b.domain).padEnd(28)} `
      + `${String(l.grade || '-').padEnd(3)} ${pct(l.composite ?? 0).padStart(4)}  `
      + c.dim(`${b.runs} run(s), last ${String(l.createdAt || '').slice(0, 10)}`));
  }
  log.blank();
}

async function cmdHistory() {
  const key = flags.brand || positional[0];
  if (!key) throw new Error('Usage: citebeam history <domain>');
  const store = new Store(flags.data || DEFAULTS.dataDir);
  const rows = store.history(key);
  if (!rows.length) { log.info(`No runs found for ${key}`); return; }
  log.blank();
  log.info(`  ${'DATE'.padEnd(12)} ${'RUN'.padEnd(24)} ${'COMP'.padStart(5)} ${'VIS'.padStart(5)} ${'RDY'.padStart(5)}`);
  for (const r of rows) {
    log.info(`  ${String(r.createdAt).slice(0, 10).padEnd(12)} ${String(r.id).padEnd(24)} `
      + `${pct(r.composite ?? 0).padStart(5)} ${pct(r.visibility ?? 0).padStart(5)} ${pct(r.readiness ?? 0).padStart(5)}`
      + (r.simulated ? c.dim('  simulated') : ''));
  }
  log.blank();
}

async function cmdReport() {
  const key = flags.brand || positional[0];
  if (!key) throw new Error('Usage: citebeam report <domain> [--run <id>] [--format html|md|json]');
  const store = new Store(flags.data || DEFAULTS.dataDir);
  const report = flags.run ? store.load(key, String(flags.run)) : store.latest(key);
  if (!report) throw new Error(`No stored run found for ${key}`);
  const fmt = String(flags.format || 'html');
  const body = fmt === 'md' ? toMarkdown(report) : fmt === 'json' ? toJson(report) : renderReport(report);
  if (flags.out) {
    writeFileSync(String(flags.out), body);
    log.ok(`Wrote ${flags.out}`);
  } else {
    process.stdout.write(body);
  }
}

async function cmdEngines() {
  log.blank();
  log.info(c.bold('  Engines'));
  for (const e of ALL_ENGINES) {
    const state = !e.live ? c.dim('offline fixture')
      : e.ready ? c.green('ready') : c.yellow('no API key');
    log.info(`   ${e.id.padEnd(12)} ${String(e.label).padEnd(28)} ${state}`);
  }
  log.blank();
  log.info(c.bold('  Credentials'));
  for (const a of engineAvailability()) {
    log.info(`   ${a.envVar.padEnd(22)} ${a.ready ? c.green('set') : c.dim('not set')}`);
  }
  log.blank();
}

function resolveBrandInput() {
  if (flags.brand) return loadBrand(String(flags.brand));
  if (flags.domain) {
    return validateBrand({
      name: flags.name || String(flags.domain).replace(/^www\./, '').split('.')[0],
      domain: String(flags.domain),
      category: flags.category || 'products and services',
      location: flags.location,
      competitors: list(flags.competitors).map((n) => ({ name: n })),
    });
  }
  const fallback = 'brand.json';
  if (existsSync(fallback)) return loadBrand(fallback);
  throw new Error(
    'No brand specified.\n'
    + '  citebeam init                       create a brand.json template\n'
    + '  citebeam audit --brand brand.json   audit from a profile\n'
    + '  citebeam audit --domain acme.com --category "CRM software"');
}

function cmdHelp() {
  const v = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  console.log(`
${c.bold('CiteBeam')} v${v} - AI search visibility & AEO audits

${c.bold('USAGE')}
  citebeam <command> [options]

${c.bold('COMMANDS')}
  audit         Run a full audit and write a report
  serve         Start the dashboard and REST API
  init          Create a brand profile template
  list          List every brand with a stored run
  history       Show run history for a brand
  report        Re-render a stored run
  engines       Show engine and credential status
  help          Show this message

${c.bold('AUDIT OPTIONS')}
  --brand <file>        Brand profile JSON (default: brand.json)
  --domain <domain>     Audit a domain without a profile file
  --category <text>     Required with --domain
  --competitors a,b     Competitor names, comma separated
  --engines a,b         openai, anthropic, perplexity, gemini, simulated
  --prompts <n>         Prompts to generate (default ${DEFAULTS.promptCount})
  --pages <n>           Max pages to crawl (default ${DEFAULTS.maxPages})
  --format a,b          html, json, md, csv (default html,json)
  --out <dir>           Output directory (default ${DEFAULTS.outDir})
  --no-visibility       Skip AI queries, crawl only (no API keys needed)
  --no-readiness        Skip the crawl, query engines only
  --no-save             Do not record the run in the store
  --fail [score]        Exit non-zero below this score, 0-100 (CI gate)
  -q, --quiet           Suppress progress output

${c.bold('EXAMPLES')}
  citebeam init --domain acme.com --name Acme --category "CRM software"
  citebeam audit --brand brand.json --format html,md,csv
  citebeam audit --domain acme.com --category "CRM software" --no-visibility
  citebeam audit --brand brand.json --fail 60      ${c.dim('# CI gate')}
  citebeam serve --port 4317

${c.bold('CREDENTIALS')} ${c.dim('(optional - the crawler works without them)')}
  OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY
  Put them in a .env file or the environment. Without any key, CiteBeam runs
  its offline simulation engine and labels the output as simulated.
`);
}
