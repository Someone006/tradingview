/** Anthropic adapter - stands in for Claude answers. @module engines/anthropic */
import { postJson } from '../util/http.js';
import { okAnswer, errorAnswer, SYSTEM_PROMPT } from './base.js';
import { extractUrls } from '../util/text.js';

const MODEL = process.env.CITEBEAM_ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** @type {import('./base.js').Engine} */
export const engine = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  live: true,
  get ready() { return !!process.env.ANTHROPIC_API_KEY; },
  async ask(prompt, ctx) {
    const started = Date.now();
    try {
      const res = await postJson(ENDPOINT, {
        model: MODEL,
        max_tokens: 900,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.text }],
      }, {
        timeout: ctx.timeout,
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) {
        const msg = res.json?.error?.message || `HTTP ${res.status}`;
        return errorAnswer('anthropic', prompt.id, msg, Date.now() - started);
      }
      const text = (res.json?.content || [])
        .filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
      return okAnswer('anthropic', prompt.id, text, extractUrls(text), Date.now() - started);
    } catch (err) {
      return errorAnswer('anthropic', prompt.id, err, Date.now() - started);
    }
  },
};
