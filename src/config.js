/**
 * Configuration loading: env vars, .env file, brand profiles and defaults.
 * @module config
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Load a .env file into process.env without overwriting real env vars.
 * Keeps the tool dependency-free while staying familiar to buyers.
 * @param {string} [file]
 */
export function loadEnv(file = '.env') {
  const p = path.resolve(file);
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export const DEFAULTS = {
  dataDir: process.env.CITEBEAM_DATA_DIR || 'data',
  outDir: process.env.CITEBEAM_OUT_DIR || 'audits',
  maxPages: Number(process.env.CITEBEAM_MAX_PAGES || 12),
  crawlConcurrency: Number(process.env.CITEBEAM_CRAWL_CONCURRENCY || 4),
  engineConcurrency: Number(process.env.CITEBEAM_ENGINE_CONCURRENCY || 3),
  promptCount: Number(process.env.CITEBEAM_PROMPT_COUNT || 24),
  // Repeat asks per prompt. 1 keeps a run cheap; 3-5 turns a coin flip
  // into a rate. Cost scales linearly, so raising it is a deliberate act.
  samples: Number(process.env.CITEBEAM_SAMPLES || 1),
  port: Number(process.env.PORT || process.env.CITEBEAM_PORT || 4317),
  requestTimeout: Number(process.env.CITEBEAM_TIMEOUT || 15000),
};

/**
 * Which engines have credentials available right now.
 * @returns {{id:string, ready:boolean, envVar:string, label:string}[]}
 */
export function engineAvailability() {
  return [
    { id: 'openai', label: 'ChatGPT (OpenAI)', envVar: 'OPENAI_API_KEY', ready: !!process.env.OPENAI_API_KEY },
    { id: 'anthropic', label: 'Claude (Anthropic)', envVar: 'ANTHROPIC_API_KEY', ready: !!process.env.ANTHROPIC_API_KEY },
    { id: 'perplexity', label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', ready: !!process.env.PERPLEXITY_API_KEY },
    { id: 'gemini', label: 'Google Gemini', envVar: 'GEMINI_API_KEY', ready: !!process.env.GEMINI_API_KEY },
  ];
}

/**
 * Read and validate a brand profile JSON file.
 * @param {string} file
 * @returns {import('./types.js').BrandProfile}
 */
export function loadBrand(file) {
  const p = path.resolve(file);
  if (!existsSync(p)) throw new Error(`Brand profile not found: ${p}`);
  let json;
  try { json = JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`Brand profile is not valid JSON (${file}): ${e.message}`); }
  return validateBrand(json);
}

/**
 * Normalise and validate a brand profile object.
 * @param {any} input
 * @returns {import('./types.js').BrandProfile}
 */
export function validateBrand(input) {
  const errors = [];
  if (!input || typeof input !== 'object') throw new Error('Brand profile must be an object');
  if (!input.name || typeof input.name !== 'string') errors.push('"name" is required');
  if (!input.domain || typeof input.domain !== 'string') errors.push('"domain" is required');
  if (!input.category || typeof input.category !== 'string') {
    errors.push('"category" is required (what the brand sells, e.g. "project management software")');
  }
  if (errors.length) throw new Error(`Invalid brand profile:\n  - ${errors.join('\n  - ')}`);

  const competitors = (Array.isArray(input.competitors) ? input.competitors : [])
    .map((cmp) => (typeof cmp === 'string' ? { name: cmp } : cmp))
    .filter((cmp) => cmp && cmp.name)
    .map((cmp) => ({
      name: String(cmp.name),
      domain: cmp.domain ? String(cmp.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '') : undefined,
      aliases: Array.isArray(cmp.aliases) ? cmp.aliases.map(String) : [],
    }));

  return {
    name: String(input.name).trim(),
    domain: String(input.domain).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''),
    aliases: Array.isArray(input.aliases) ? input.aliases.map(String) : [],
    category: String(input.category).trim(),
    location: input.location ? String(input.location).trim() : undefined,
    audience: input.audience ? String(input.audience).trim() : undefined,
    competitors,
    extraPrompts: Array.isArray(input.extraPrompts) ? input.extraPrompts.map(String) : [],
    keyPages: Array.isArray(input.keyPages) ? input.keyPages.map(String) : [],
    branding: input.branding && typeof input.branding === 'object' ? input.branding : {},
  };
}
