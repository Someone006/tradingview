/**
 * Engine registry and selection.
 * @module engines/index
 */
import { engine as openai } from './openai.js';
import { engine as anthropic } from './anthropic.js';
import { engine as perplexity } from './perplexity.js';
import { engine as gemini } from './gemini.js';
import { engine as simulated } from './simulated.js';

/** @type {import('./base.js').Engine[]} */
export const ALL_ENGINES = [openai, anthropic, perplexity, gemini, simulated];

/** @param {string} id */
export function getEngine(id) {
  return ALL_ENGINES.find((e) => e.id === id) || null;
}

/** Live engines that currently have credentials. */
export function readyEngines() {
  return ALL_ENGINES.filter((e) => e.live && e.ready);
}

/**
 * Resolve which engines to run.
 *
 * Explicit selection wins. Otherwise every credentialed live engine runs; if
 * none are credentialed we fall back to the offline simulation so the tool
 * still produces a full report, clearly marked as simulated.
 *
 * @param {string[]} [requested] Engine ids from --engines.
 * @returns {{engines: import('./base.js').Engine[], simulated: boolean, notes: string[]}}
 */
export function resolveEngines(requested) {
  const notes = [];
  if (requested && requested.length) {
    const engines = [];
    for (const id of requested) {
      const e = getEngine(id);
      if (!e) { notes.push(`Unknown engine "${id}" - skipped.`); continue; }
      if (e.live && !e.ready) {
        notes.push(`${e.label} has no API key set - skipped.`);
        continue;
      }
      engines.push(e);
    }
    if (engines.length) {
      return { engines, simulated: engines.every((e) => !e.live), notes };
    }
    notes.push('None of the requested engines were usable.');
  }

  const live = readyEngines();
  if (live.length) return { engines: live, simulated: false, notes };

  notes.push('No AI provider API keys found - running the offline simulation engine. '
    + 'Visibility figures below are illustrative fixtures, not real measurements. '
    + 'Set OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY or GEMINI_API_KEY for live data.');
  return { engines: [simulated], simulated: true, notes };
}
