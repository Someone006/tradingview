/** Tiny structured logger with TTY-aware colour. @module util/log */

const ESC = '\u001b[';
const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code, s) => (useColour ? `${ESC}${code}m${s}${ESC}0m` : String(s));

export const c = {
  dim: (s) => paint('2', s),
  bold: (s) => paint('1', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  blue: (s) => paint('34', s),
  magenta: (s) => paint('35', s),
  cyan: (s) => paint('36', s),
};

let quiet = false;
/** @param {boolean} v */
export function setQuiet(v) { quiet = v; }

export const log = {
  info: (...a) => { if (!quiet) console.log(...a); },
  step: (msg) => { if (!quiet) console.log(c.cyan('->'), msg); },
  ok: (msg) => { if (!quiet) console.log(c.green('OK'), msg); },
  warn: (msg) => { if (!quiet) console.warn(c.yellow('!'), msg); },
  error: (msg) => console.error(c.red('x'), msg),
  blank: () => { if (!quiet) console.log(''); },
};

/**
 * Render a horizontal bar for terminal score display.
 * @param {number} value 0..1
 * @param {number} width
 */
export function bar(value, width = 24) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const filled = Math.round(v * width);
  const glyph = '#'.repeat(filled) + '.'.repeat(width - filled);
  if (v >= 0.7) return c.green(glyph);
  if (v >= 0.4) return c.yellow(glyph);
  return c.red(glyph);
}

/** Format a 0..1 score as a percentage string. @param {number} v */
export function pct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}
