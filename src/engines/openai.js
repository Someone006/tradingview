/** OpenAI adapter - stands in for ChatGPT answers. @module engines/openai */
import { postJson } from '../util/http.js';
import { okAnswer, errorAnswer, SYSTEM_PROMPT } from './base.js';
import { extractUrls } from '../util/text.js';

const MODEL = process.env.CITEBEAM_OPENAI_MODEL || 'gpt-4o-mini';
const ENDPOINT = process.env.OPENAI_BASE_URL
  ? `${String(process.env.OPENAI_BASE_URL).replace(/\/$/, '')}/chat/completions`
  : 'https://api.openai.com/v1/chat/completions';

/** @type {import('./base.js').Engine} */
export const engine = {
  id: 'openai',
  label: 'ChatGPT (OpenAI)',
  live: true,
  get ready() { return !!process.env.OPENAI_API_KEY; },
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
        max_tokens: 700,
      }, {
        timeout: ctx.timeout,
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      if (!res.ok) {
        const msg = res.json?.error?.message || `HTTP ${res.status}`;
        return errorAnswer('openai', prompt.id, msg, Date.now() - started);
      }
      const text = res.json?.choices?.[0]?.message?.content ?? '';
      return okAnswer('openai', prompt.id, text, extractUrls(text), Date.now() - started);
    } catch (err) {
      return errorAnswer('openai', prompt.id, err, Date.now() - started);
    }
  },
};
