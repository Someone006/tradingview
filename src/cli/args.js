/**
 * Tiny argv parser. Supports --flag, --key value, --key=value and -abc bundles.
 * @module cli/args
 */

/**
 * @param {string[]} argv
 * @returns {{command:string, flags:Record<string,any>, positional:string[]}}
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  /** @type {Record<string, any>} */
  const flags = {};
  /** @type {string[]} */
  const positional = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq > -1) {
        flags[body.slice(0, eq)] = coerce(body.slice(eq + 1));
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('-')) { flags[body] = coerce(next); i++; }
        else flags[body] = true;
      }
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) flags[ch] = true;
    } else if (!command) {
      command = a;
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

/** @param {string} v */
function coerce(v) {
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/**
 * Read a comma-separated list flag.
 * @param {any} v
 * @returns {string[]}
 */
export function list(v) {
  if (v === undefined || v === null || v === true) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
