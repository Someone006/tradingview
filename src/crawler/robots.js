/**
 * robots.txt parsing focused on AI/answer-engine crawlers.
 *
 * Accidentally blocking GPTBot or ClaudeBot is the single most common and most
 * expensive AEO mistake we see: the site is invisible to the assistant no
 * matter how good the content is. This module resolves, per crawler, whether
 * the site's root is actually fetchable.
 * @module crawler/robots
 */

/**
 * The crawlers that feed answer engines, and what each one powers.
 * @type {Array<{ua:string, label:string, powers:string, critical:boolean}>}
 */
export const AI_CRAWLERS = [
  { ua: 'GPTBot', label: 'GPTBot', powers: 'ChatGPT training + browsing index', critical: true },
  { ua: 'OAI-SearchBot', label: 'OAI-SearchBot', powers: 'ChatGPT Search results', critical: true },
  { ua: 'ChatGPT-User', label: 'ChatGPT-User', powers: 'ChatGPT live page fetches', critical: true },
  { ua: 'ClaudeBot', label: 'ClaudeBot', powers: 'Claude index', critical: true },
  { ua: 'Claude-User', label: 'Claude-User', powers: 'Claude live page fetches', critical: false },
  { ua: 'PerplexityBot', label: 'PerplexityBot', powers: 'Perplexity answers + citations', critical: true },
  { ua: 'Perplexity-User', label: 'Perplexity-User', powers: 'Perplexity live fetches', critical: false },
  { ua: 'Google-Extended', label: 'Google-Extended', powers: 'Gemini + AI Overviews grounding', critical: true },
  { ua: 'Applebot-Extended', label: 'Applebot-Extended', powers: 'Apple Intelligence', critical: false },
  { ua: 'CCBot', label: 'CCBot', powers: 'Common Crawl (feeds many models)', critical: false },
  { ua: 'meta-externalagent', label: 'Meta AI', powers: 'Meta AI answers', critical: false },
];

/**
 * @typedef {Object} RobotsGroup
 * @property {string[]} agents
 * @property {Array<{type:'allow'|'disallow', path:string}>} rules
 */

/**
 * Parse robots.txt into user-agent groups.
 * @param {string|null} txt
 * @returns {RobotsGroup[]}
 */
export function parseRobots(txt) {
  /** @type {RobotsGroup[]} */
  const groups = [];
  if (!txt) return groups;
  /** @type {RobotsGroup|null} */
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of String(txt).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one rule block.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      current.rules.push({ type: /** @type {'allow'|'disallow'} */ (field), path: value });
    }
  }
  return groups;
}

/**
 * Select the group that applies to a user agent. Per the robots spec the most
 * specific matching user-agent token wins; `*` is the fallback.
 * @param {RobotsGroup[]} groups
 * @param {string} ua
 * @returns {RobotsGroup|null}
 */
export function groupFor(groups, ua) {
  const needle = String(ua).toLowerCase();
  /** @type {RobotsGroup|null} */
  let best = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const agent of g.agents) {
      if (agent === '*') {
        if (bestLen < 0) { best = g; bestLen = 0; }
        continue;
      }
      // robots.txt user-agent matching is a case-insensitive prefix/substring test.
      if (needle === agent || needle.startsWith(agent) || agent.startsWith(needle)) {
        if (agent.length > bestLen) { best = g; bestLen = agent.length; }
      }
    }
  }
  return best;
}

/**
 * Decide whether a path is allowed for a user agent.
 * Longest matching rule wins; ties resolve to allow, per Google's spec.
 * @param {RobotsGroup[]} groups
 * @param {string} ua
 * @param {string} path
 * @returns {boolean}
 */
export function isAllowed(groups, ua, path = '/') {
  const group = groupFor(groups, ua);
  if (!group || group.rules.length === 0) return true;

  let bestLen = -1;
  let allowed = true;
  for (const rule of group.rules) {
    // An empty Disallow means "allow everything" and matches nothing.
    if (rule.type === 'disallow' && rule.path === '') continue;
    if (!pathMatches(rule.path, path)) continue;
    const len = rule.path.length;
    if (len > bestLen || (len === bestLen && rule.type === 'allow')) {
      bestLen = len;
      allowed = rule.type === 'allow';
    }
  }
  return allowed;
}

/**
 * robots.txt path matching, including `*` wildcards and `$` anchors.
 * @param {string} pattern @param {string} path
 */
export function pathMatches(pattern, path) {
  if (pattern === '') return false;
  if (pattern === '/') return true;
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes('*')) {
    return anchored ? path === body : path.startsWith(body);
  }
  const re = new RegExp(
    '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    + (anchored ? '$' : ''),
  );
  return re.test(path);
}

/**
 * Full AI-crawler access report for a site.
 * @param {string|null} robotsTxt
 * @returns {Array<{ua:string,label:string,powers:string,critical:boolean,allowed:boolean,explicit:boolean}>}
 */
export function auditAiAccess(robotsTxt) {
  const groups = parseRobots(robotsTxt);
  const named = new Set(groups.flatMap((g) => g.agents));
  return AI_CRAWLERS.map((bot) => ({
    ...bot,
    allowed: isAllowed(groups, bot.ua, '/'),
    explicit: named.has(bot.ua.toLowerCase()),
  }));
}
