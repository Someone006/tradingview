/**
 * Perplexity adapter. Uniquely valuable here because Perplexity returns an
 * explicit citation list, which is the ground truth for "who gets cited".
 * @module engines/perplexity
 */
import { postJson } from '../util/http.js';
import { okAnswer, errorAnswer, SYSTEM_PROMPT } from './base.js';
import { extractUrls } from '../util/text.js';

const MODEL = process.env.CITEBEAM_PERPLEXITY_MODEL || 'sonar';
const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

/** @type {import('./base.js').Engine} */
export const engine = {
  id: 'perplexity',
  label: 'Perplexity',
  live: true,
  get ready() { return !!process.env.PERPLEXITY_API_KEY; },
  async ask(prompt, ctx) {
    const started = Date.now();
    try {
      const res = await postJson(ENDPOINT, {
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt.text },
        ],
        temperature: 0.3,
      }, {
        timeout: ctx.timeout,
        headers: { authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      });
      if (!res.ok) {
        const msg = res.json?.error?.message || `HTTP ${res.status}`;
        return errorAnswer('perplexity', prompt.id, msg, Date.now() - started);
      }
      const text = res.json?.choices?.[0]?.message?.content ?? '';
      const structured = Array.isArray(res.json?.citations)
        ? res.json.citations
        : (res.json?.search_results || []).map((r) => r && r.url).filter(Boolean);
      return okAnswer('perplexity', prompt.id, text,
        [...structured, ...extractUrls(text)], Date.now() - started);
    } catch (err) {
      return errorAnswer('perplexity', prompt.id, err, Date.now() - started);
    }
  },
};
