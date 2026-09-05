/**
 * Engine adapter contract.
 *
 * An engine takes a prompt and returns what an AI assistant would tell a buyer,
 * plus whatever citations it exposes. Adapters must never throw: a failed call
 * is reported as an errored answer so one dead provider cannot void a run.
 * @module engines/base
 */

/**
 * @typedef {Object} Engine
 * @property {string} id
 * @property {string} label
 * @property {boolean} live         True when it calls a real provider.
 * @property {boolean} ready        True when credentials are present.
 * @property {(prompt: import('../types.js').PromptSpec, ctx: EngineContext) => Promise<import('../types.js').EngineAnswer>} ask
 */

/**
 * @typedef {Object} EngineContext
 * @property {import('../types.js').BrandProfile} brand
 * @property {number} timeout
 * @property {number} [sample] Zero-based repeat index when sampling.
 */

/**
 * The system instruction sent to every live engine. It deliberately asks for
 * the answer a real buyer would receive - naming specific companies - rather
 * than a hedge, because a hedged answer measures nothing.
 */
export const SYSTEM_PROMPT = [
  'You are a helpful assistant answering a consumer or business buyer research question.',
  'Answer the way you naturally would for a real user who is deciding what to buy.',
  'Name specific real companies, products or providers you would actually recommend, in order of preference.',
  'Be concrete and concise. Do not refuse, and do not give a generic "it depends" answer without naming options.',
  'If you cite sources, include the full URLs.',
].join(' ');

/**
 * Build a well-formed errored answer.
 * @param {string} engine @param {string} promptId @param {any} err @param {number} latencyMs
 * @returns {import('../types.js').EngineAnswer}
 */
export function errorAnswer(engine, promptId, err, latencyMs = 0) {
  return {
    engine, promptId, status: 'error', text: '', citations: [], latencyMs,
    error: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Build a well-formed successful answer.
 * @param {string} engine @param {string} promptId @param {string} text
 * @param {string[]} citations @param {number} latencyMs
 * @returns {import('../types.js').EngineAnswer}
 */
export function okAnswer(engine, promptId, text, citations, latencyMs) {
  return {
    engine, promptId, status: 'answered',
    text: String(text || ''),
    citations: [...new Set((citations || []).filter(Boolean))],
    latencyMs,
  };
}
