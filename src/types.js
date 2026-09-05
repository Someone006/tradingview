/**
 * CiteBeam shared type definitions (JSDoc — no build step required).
 * @module types
 */

/**
 * @typedef {Object} Competitor
 * @property {string} name           Canonical competitor name.
 * @property {string} [domain]       Competitor primary domain, used for citation attribution.
 * @property {string[]} [aliases]    Alternate spellings / product names.
 */

/**
 * @typedef {Object} BrandProfile
 * @property {string} name           Canonical brand name, e.g. "Northwind Plumbing".
 * @property {string} domain         Primary domain, e.g. "northwindplumbing.com".
 * @property {string[]} [aliases]    Alternate names the brand is known by.
 * @property {string} category       What the brand sells, e.g. "emergency plumbing services".
 * @property {string} [location]     Geographic market, e.g. "Austin, TX". Enables local prompt sets.
 * @property {string} [audience]     Buyer description, e.g. "homeowners with burst pipes".
 * @property {Competitor[]} [competitors]
 * @property {string[]} [extraPrompts]   Custom prompts appended to the generated set.
 * @property {string[]} [keyPages]       Additional URLs to crawl beyond discovery.
 * @property {Branding} [branding]       White-label report branding.
 */

/**
 * @typedef {Object} Branding
 * @property {string} [agencyName]
 * @property {string} [logoUrl]
 * @property {string} [accent]       Hex colour, e.g. "#4f46e5".
 * @property {string} [contactEmail]
 * @property {string} [website]
 * @property {string} [footerNote]
 */

/**
 * @typedef {'answered'|'error'|'skipped'} PromptStatus
 */

/**
 * @typedef {Object} PromptSpec
 * @property {string} id
 * @property {string} text            The question posed to the AI engine.
 * @property {PromptIntent} intent
 * @property {number} weight          Commercial value of the prompt (0..1).
 * @property {string} [note]
 */

/**
 * @typedef {'commercial_investigation'|'branded'|'comparison'|'local'|'problem'|'alternative'|'pricing'} PromptIntent
 */

/**
 * @typedef {Object} EngineAnswer
 * @property {string} engine          Engine id, e.g. "openai".
 * @property {string} promptId
 * @property {PromptStatus} status
 * @property {string} text            Raw answer text.
 * @property {string[]} citations     Cited URLs, when the engine exposes them.
 * @property {number} latencyMs
 * @property {string} [error]
 */

/**
 * @typedef {Object} MentionResult
 * @property {boolean} mentioned
 * @property {number} firstIndex      Character offset of first mention, -1 if absent.
 * @property {number} rank            1-based ordinal among all detected entities, 0 if absent.
 * @property {number} count
 * @property {number} sentiment       -1..1 heuristic sentiment of surrounding context.
 * @property {MentionRole} role       What the mention does for the entity.
 * @property {string} [roleSentence]  The sentence the role was read from.
 * @property {string[]} snippets
 */

/**
 * Whether a mention endorses, merely lists, passingly names, or steers away
 * from the entity. Presence alone is not a commercial outcome.
 * @typedef {'recommended'|'listed'|'referenced'|'dismissed'} MentionRole
 */

/**
 * @typedef {Object} PromptOutcome
 * @property {string} promptId
 * @property {string} promptText
 * @property {PromptIntent} intent
 * @property {number} weight
 * @property {string} engine
 * @property {PromptStatus} status
 * @property {MentionResult} brand
 * @property {Record<string, MentionResult>} competitors
 * @property {string[]} citations
 * @property {boolean} ownDomainCited
 * @property {string} [error]
 * @property {string} answerExcerpt
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} id
 * @property {string} title
 * @property {'technical'|'content'|'authority'|'structure'} pillar
 * @property {number} score          0..1 normalised score.
 * @property {number} weight         Relative importance.
 * @property {'pass'|'warn'|'fail'|'info'} status
 * @property {string} detail         Human-readable finding.
 * @property {string[]} [evidence]   Concrete observed values.
 * @property {string} [fixId]        Links to a recommendation rule.
 */

/**
 * @typedef {Object} PageSnapshot
 * @property {string} url
 * @property {number} status
 * @property {string} html
 * @property {string} text
 * @property {string} title
 * @property {string} description
 * @property {Array<{level:number,text:string}>} headings
 * @property {any[]} jsonld
 * @property {string[]} links
 * @property {number} bytes
 * @property {number} latencyMs
 * @property {string} [error]
 */

/**
 * @typedef {Object} SiteSnapshot
 * @property {string} domain
 * @property {string} origin
 * @property {PageSnapshot[]} pages
 * @property {string|null} robotsTxt
 * @property {string|null} llmsTxt
 * @property {string[]} sitemapUrls
 * @property {boolean} reachable
 * @property {string} [error]
 */

/**
 * @typedef {Object} Recommendation
 * @property {string} id
 * @property {string} title
 * @property {string} why
 * @property {string} how
 * @property {string} [snippet]
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {number} impact          1..5
 * @property {number} effort          1..5
 * @property {number} priority        Derived ordering score.
 * @property {string} pillar
 * @property {string} [evidence]
 */

/**
 * @typedef {Object} AuditReport
 * @property {string} id
 * @property {string} createdAt
 * @property {BrandProfile} brand
 * @property {string[]} enginesUsed
 * @property {boolean} simulated
 * @property {Object} visibility
 * @property {Object} readiness
 * @property {Recommendation[]} recommendations
 * @property {PromptOutcome[]} outcomes
 * @property {CheckResult[]} checks
 * @property {Object} [delta]
 * @property {Object} meta
 */

export {};
