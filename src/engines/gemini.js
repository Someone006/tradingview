/** Google Gemini adapter - proxy for AI Overviews style answers. @module engines/gemini */
import { postJson } from '../util/http.js';
import { okAnswer, errorAnswer, SYSTEM_PROMPT } from './base.js';
import { extractUrls } from '../util/text.js';

const MODEL = process.env.CITEBEAM_GEMINI_MODEL || 'gemini-2.0-flash';

/** @type {import('./base.js').Engine} */
export const engine = {
  id: 'gemini',
  label: 'Google Gemini',
  live: true,
  get ready() { return !!process.env.GEMINI_API_KEY; },
  async ask(prompt, ctx) {
    const started = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    try {
      const res = await postJson(url, {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt.text }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      }, {
        timeout: ctx.timeout,
        headers: { 'x-goog-api-key': String(process.env.GEMINI_API_KEY) },
      });
      if (!res.ok) {
        const msg = res.json?.error?.message || `HTTP ${res.status}`;
        return errorAnswer('gemini', prompt.id, msg, Date.now() - started);
      }
      const parts = res.json?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p && p.text).filter(Boolean).join('\n');
      const grounding = res.json?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const cited = grounding.map((g) => g?.web?.uri).filter(Boolean);
      return okAnswer('gemini', prompt.id, text,
        [...cited, ...extractUrls(text)], Date.now() - started);
    } catch (err) {
      return errorAnswer('gemini', prompt.id, err, Date.now() - started);
    }
  },
};
