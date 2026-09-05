/**
 * Execute a prompt set across engines and score the results.
 * @module analysis/run
 */
import { pool } from '../util/http.js';
import { scoreAnswer, summarise } from './visibility.js';
import { log, c } from '../util/log.js';

/**
 * @param {import('../types.js').BrandProfile} brand
 * @param {import('../types.js').PromptSpec[]} prompts
 * @param {import('./../engines/base.js').Engine[]} engines
 * @param {{concurrency?:number, timeout?:number, onProgress?:(done:number,total:number)=>void}} [opts]
 */
export async function runVisibility(brand, prompts, engines, opts = {}) {
  const { concurrency = 3, timeout = 60000, onProgress } = opts;

  /** @type {Array<{prompt:import('../types.js').PromptSpec, engine:import('./../engines/base.js').Engine}>} */
  const jobs = [];
  for (const engine of engines) {
    for (const prompt of prompts) jobs.push({ prompt, engine });
  }

  log.step(`Querying ${engines.length} engine(s) with ${prompts.length} prompt(s) `
    + `- ${jobs.length} calls`);

  let done = 0;
  const answers = await pool(jobs, concurrency, async ({ prompt, engine }) => {
    const answer = await engine.ask(prompt, { brand, timeout });
    done++;
    if (onProgress) onProgress(done, jobs.length);
    else if (done % 5 === 0 || done === jobs.length) {
      log.info(c.dim(`   ${done}/${jobs.length} answers`));
    }
    return { prompt, answer };
  });

  const outcomes = answers.map(({ prompt, answer }) => scoreAnswer(prompt, answer, brand));
  const failed = outcomes.filter((o) => o.status !== 'answered');
  if (failed.length) {
    log.warn(`${failed.length} call(s) failed: `
      + [...new Set(failed.map((f) => f.error))].slice(0, 3).join('; '));
  }

  const summary = summarise(outcomes, brand);
  log.ok(`Visibility score: ${Math.round(summary.score * 100)}% `
    + `(named in ${Math.round(summary.mentionRate * 100)}% of answers)`);
  return { outcomes, summary };
}
