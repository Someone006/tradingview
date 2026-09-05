/**
 * Execute a prompt set across engines and score the results.
 * @module analysis/run
 */
import { pool } from '../util/http.js';
import { scoreAnswer, summarise } from './visibility.js';
import { log, c } from '../util/log.js';

/**
 * Run the prompt set across engines and score the answers.
 *
 * `samples` asks every prompt more than once. Assistant answers are
 * non-deterministic, so a single ask is one draw from a distribution: a brand
 * that surfaces half the time reads as either a win or a total loss depending
 * on the coin flip. Repeat sampling turns that into a rate with a stated
 * confidence, which is the difference between an anecdote and a measurement.
 * Cost scales linearly with it, so the default stays at 1.
 *
 * @param {import('../types.js').BrandProfile} brand
 * @param {import('../types.js').PromptSpec[]} prompts
 * @param {import('./../engines/base.js').Engine[]} engines
 * @param {{concurrency?:number, timeout?:number, samples?:number, onProgress?:(done:number,total:number)=>void}} [opts]
 */
export async function runVisibility(brand, prompts, engines, opts = {}) {
  const { concurrency = 3, timeout = 60000, onProgress } = opts;
  const samples = Math.max(1, Math.min(10, Math.floor(Number(opts.samples) || 1)));

  /** @type {Array<{prompt:import('../types.js').PromptSpec, engine:import('./../engines/base.js').Engine, sample:number}>} */
  const jobs = [];
  for (const engine of engines) {
    for (const prompt of prompts) {
      for (let sample = 0; sample < samples; sample++) jobs.push({ prompt, engine, sample });
    }
  }

  log.step(`Querying ${engines.length} engine(s) with ${prompts.length} prompt(s)`
    + (samples > 1 ? ` x ${samples} samples` : '') + ` - ${jobs.length} calls`);

  let done = 0;
  const answers = await pool(jobs, concurrency, async ({ prompt, engine, sample }) => {
    const answer = await engine.ask(prompt, { brand, timeout, sample });
    done++;
    if (onProgress) onProgress(done, jobs.length);
    else if (done % 5 === 0 || done === jobs.length) {
      log.info(c.dim(`   ${done}/${jobs.length} answers`));
    }
    return { prompt, answer, sample };
  });

  const outcomes = answers.map(({ prompt, answer, sample }) => ({
    ...scoreAnswer(prompt, answer, brand),
    sample,
  }));
  const failed = outcomes.filter((o) => o.status !== 'answered');
  if (failed.length) {
    log.warn(`${failed.length} call(s) failed: `
      + [...new Set(failed.map((f) => f.error))].slice(0, 3).join('; '));
  }

  const summary = summarise(outcomes, brand, { samples });
  log.ok(`Visibility score: ${Math.round(summary.score * 100)}% `
    + `(named in ${Math.round(summary.mentionRate * 100)}% of answers)`);
  return { outcomes, summary };
}
