#!/usr/bin/env node
/**
 * CiteBeam CLI.
 * @module bin/citebeam
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, list } from '../src/cli/args.js';
import { loadEnv, loadBrand, validateBrand, engineAvailability, DEFAULTS } from '../src/config.js';
import { runAudit } from '../src/audit.js';
import { renderReport } from '../src/report/html.js';
import { toJson, toMarkdown, outcomesCsv, checksCsv, recommendationsCsv } from '../src/report/exports.js';
import { Store } from '../src/store/store.js';
import { purgeExpired, exportSubject, eraseSubject, processingRegister, DEFAULT_RETENTION_DAYS } from '../src/store/privacy.js';
import { log, c, setQuiet, bar, pct } from '../src/util/log.js';
import { slug } from '../src/util/id.js';
import { ALL_ENGINES } from '../src/engines/index.js';
import { fetchText } from '../src/util/http.js';
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
  privacy: cmdPrivacy,
  doctor: cmdDoctor,
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
    samples: Number(flags.samples || DEFAULTS.samples),
    maxPages: Number(flags.pages || DEFAULTS.maxPages),
    respectRobots: !flags['ignore-robots'],
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
  if (!vis.skipped && vis.promptsAnswered) {
    log.blank();
    log.info(c.bold('  Presence vs influence'));
    log.info(`   named       ${bar(vis.mentionRate, 16)}  ${pct(vis.mentionRate)}`);
    log.info(`   recommended ${bar(vis.recommendationRate, 16)}  ${pct(vis.recommendationRate)}`);
    if (vis.dismissedCount) {
      log.info(c.red(`   dismissed in ${vis.dismissedCount} answer(s) - buyers steered away`));
    }
    const surf = vis.surfaces || {};
    if (surf.totalCitations) {
      log.info(c.dim(`   ${pct(surf.offSiteShare)} of cited sources are sites you do not own`));
    }
  }
  if (!vis.skipped && (vis.shareOfVoice || []).length) {
    log.blank();
    log.info(c.bold('  Answer share'));
    for (const s of vis.shareOfVoice.slice(0, 6)) {
      log.info(`   ${(s.isBrand ? c.cyan(s.name) : s.name).padEnd(34)} ${bar(s.share, 16)}  ${pct(s.share)}`);
    }
  }
  if ((vis.stability || []).length && vis.samples > 1) {
    const contested = vis.stability.filter((x) => x.stability === 'contested');
    log.blank();
    log.info(c.bold(`  Asked each prompt ${vis.samples}x - ${contested.length} contested`));
    log.info(c.dim(`   mention rate ${pct(vis.mentionRate)} +/- ${pct(vis.marginOfError)}`));
    for (const x of contested.slice(0, 4)) {
      log.info(`   ${c.yellow(`${x.named}/${x.asked}`)} "${x.prompt.slice(0, 62)}${x.prompt.length > 62 ? '...' : ''}"`);
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

/**
 * Preflight check. Answers one question before a paying client is involved:
 * is this installation actually able to produce a report right now, and which
 * parts will be missing if it is not.
 */
async function cmdDoctor() {
  const checks = [];
  const add = (ok, label, detail) => checks.push({ ok, label, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20, `Node.js ${process.versions.node}`,
    major >= 20 ? 'supported' : 'CiteBeam needs Node 20 or newer');

  add(typeof fetch === 'function', 'fetch available',
    typeof fetch === 'function' ? 'built in' : 'missing - upgrade Node');

  const creds = engineAvailability();
  const ready = creds.filter((e) => e.ready);
  add(true, `AI providers configured: ${ready.length} of ${creds.length}`,
    ready.length
      ? ready.map((e) => e.id).join(', ')
      : 'none - site audits work fully; answer measurement will be simulated');

  // Can we actually reach the outside world? Without this nothing works.
  let net = false;
  let netDetail = '';
  try {
    const res = await fetchText('https://nodejs.org/robots.txt', { timeout: 8000, retries: 0 });
    net = res.status > 0;
    netDetail = `reachable (HTTP ${res.status})`;
  } catch (err) {
    netDetail = `no outbound access: ${err instanceof Error ? err.message : err}`;
  }
  add(net, 'Outbound network', netDetail);

  const store = new Store(flags.data || DEFAULTS.dataDir);
  let writable = false;
  try {
    const probe = path.join(store.dir, '.write-probe');
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    writable = true;
  } catch (err) {
    /* reported below */
  }
  add(writable, 'Data directory writable', store.dir);

  const controller = !!process.env.CITEBEAM_CONTROLLER;
  add(controller, 'Data controller named (revFADP)',
    controller
      ? String(process.env.CITEBEAM_CONTROLLER).slice(0, 60)
      : 'CITEBEAM_CONTROLLER not set - required before you process client data');

  log.blank();
  log.info(c.bold('  CiteBeam preflight'));
  log.blank();
  for (const ch of checks) {
    const mark = ch.ok ? c.green('ok  ') : c.yellow('warn');
    log.info(`   ${mark} ${ch.label.padEnd(38)} ${c.dim(ch.detail)}`);
  }
  log.blank();

  const blocking = checks.filter((ch) => !ch.ok
    && !/providers configured|controller named/i.test(ch.label));
  if (blocking.length) {
    log.error(`${blocking.length} blocking issue(s). Fix these before auditing a client.`);
    process.exitCode = 1;
  } else {
    log.ok('Ready to run an audit.');
    if (!ready.length) {
      log.info(c.dim('   Add an API key for live answer measurement; the site audit '
        + 'is already fully functional.'));
    }
    if (!controller) {
      log.info(c.dim('   Set CITEBEAM_CONTROLLER before handling client data.'));
    }
  }
}

/**
 * Data-protection operations. Grouped under one command so the whole surface
 * is discoverable when someone is answering a data-subject request under time
 * pressure.
 */
async function cmdPrivacy() {
  const store = new Store(flags.data || DEFAULTS.dataDir);
  const action = positional[0] || flags.action || 'register';
  const target = positional[1] || flags.brand;

  if (action === 'register') {
    const reg = processingRegister(store);
    if (flags.out) {
      writeFileSync(String(flags.out), JSON.stringify(reg, null, 2));
      log.ok(`Wrote ${flags.out}`);
    } else {
      console.log(JSON.stringify(reg, null, 2));
    }
    return;
  }

  if (action === 'purge') {
    // `?? `, not `||`: --days 0 means "purge everything" and must not
    // silently fall through to the default retention window.
    const days = Number(flags.days ?? DEFAULT_RETENTION_DAYS);
    const dryRun = !flags.confirm;
    const res = purgeExpired(store, { days, dryRun });
    log.blank();
    log.info(`  Retention: ${days} days (cutoff ${res.cutoff.slice(0, 10)})`);
    log.info(`  ${res.removed.length} run(s) past retention, ${res.kept} kept`);
    for (const r of res.removed.slice(0, 12)) {
      log.info(c.dim(`   ${r.brand}  ${r.id}  ${String(r.createdAt).slice(0, 10)}`));
    }
    log.blank();
    if (dryRun) log.warn('Dry run - nothing deleted. Re-run with --confirm to delete.');
    else log.ok(`Deleted ${res.removed.length} run(s).`);
    return;
  }

  if (action === 'export') {
    if (!target) throw new Error('Usage: citebeam privacy export <domain> [--out file.json]');
    const out = String(flags.out || `${slug(target)}-data-export.json`);
    const res = exportSubject(store, store.brandKey(target), out);
    log.ok(`Exported ${res.runCount} run(s) to ${res.file}`);
    return;
  }

  if (action === 'erase') {
    if (!target) throw new Error('Usage: citebeam privacy erase <domain> --confirm');
    if (!flags.confirm) {
      const n = store.history(store.brandKey(target)).length;
      log.warn(`This permanently deletes ${n} run(s) for ${target}.`);
      log.info('Re-run with --confirm to proceed.');
      return;
    }
    const res = eraseSubject(store, store.brandKey(target));
    log.ok(`Erased ${res.runsDeleted} run(s) for ${target}.`);
    return;
  }

  throw new Error(`Unknown privacy action "${action}". `
    + 'Use: register | purge | export | erase');
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
  privacy       Data-protection operations (see below)
  doctor        Check this installation is ready to audit a client
  help          Show this message

${c.bold('PRIVACY')} ${c.dim('(Swiss revFADP support)')}
  citebeam privacy register              Describe what this deployment processes
  citebeam privacy purge --days 730      Delete runs past retention (add --confirm)
  citebeam privacy export <domain>       Right-of-access export (Art. 25)
  citebeam privacy erase <domain>        Right-to-erasure (Art. 32, add --confirm)

${c.bold('AUDIT OPTIONS')}
  --brand <file>        Brand profile JSON (default: brand.json)
  --domain <domain>     Audit a domain without a profile file
  --category <text>     Required with --domain
  --competitors a,b     Competitor names, comma separated
  --engines a,b         openai, anthropic, perplexity, gemini, simulated
  --prompts <n>         Prompts to generate (default ${DEFAULTS.promptCount})
  --samples <n>         Ask each prompt n times, 1-10 (default ${DEFAULTS.samples}).
                        Answers vary run to run; 3-5 turns a single coin
                        flip into a rate. Multiplies API cost by n.
  --pages <n>           Max pages to crawl (default ${DEFAULTS.maxPages})
  --format a,b          html, json, md, csv (default html,json)
  --out <dir>           Output directory (default ${DEFAULTS.outDir})
  --no-visibility       Skip AI queries, crawl only (no API keys needed)
  --ignore-robots       Crawl pages robots.txt disallows. Only for sites you
                        own or have written permission to audit.
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
