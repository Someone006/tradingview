import { categoryText } from '../config.js';

/**
 * The fix catalogue.
 *
 * Competing tools stop at a score. This is the part clients actually pay for:
 * every failing check maps to a specific, sequenced action with the exact code
 * or copy to ship. Rules are templates - `build` receives the audit context and
 * returns the finished recommendation.
 * @module recommend/rules
 */

/**
 * @typedef {Object} RuleContext
 * @property {import('../types.js').BrandProfile} brand
 * @property {import('../types.js').CheckResult} [check]
 * @property {any} readiness
 * @property {any} visibility
 */

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} title
 * @property {(brand: import('../types.js').BrandProfile) => string} [titleFor]
 *   Resolves the title per brand, where a fixed one would read as a template.
 * @property {string} pillar
 * @property {number} impact  1..5
 * @property {number} effort  1..5
 * @property {(ctx:RuleContext)=>{why:string, how:string, snippet?:string}} build
 */

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'unblock-ai-crawlers',
    title: 'Unblock AI crawlers in robots.txt',
    pillar: 'technical',
    impact: 5,
    effort: 1,
    build: ({ readiness }) => {
      const blocked = (readiness.crawlers || []).filter((b) => !b.allowed);
      const names = blocked.map((b) => b.label).join(', ') || 'none';
      return {
        why: `Your robots.txt currently blocks ${blocked.length} AI crawler(s): ${names}. `
          + 'While that block stands, those assistants cannot read a single page of the site, so no '
          + 'content or schema work can possibly surface you there. This is the highest-leverage '
          + 'fix available and it takes minutes.',
        how: 'Add explicit allow rules for the answer-engine crawlers at the top of robots.txt, '
          + 'above any wildcard disallow. Re-crawl afterwards to confirm the block is gone.',
        snippet: `# robots.txt - allow answer engines to read the site\n`
          + AI_BOTS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join('\n')
          + `\nUser-agent: *\nAllow: /\n\nSitemap: https://${readiness.site.domain}/sitemap.xml\n`,
      };
    },
  },
  {
    id: 'ship-robots-txt',
    title: 'Publish a robots.txt that declares your sitemap',
    pillar: 'technical',
    impact: 3,
    effort: 1,
    build: ({ readiness }) => ({
      why: 'Without a robots.txt declaring a sitemap, crawlers discover your pages only by '
        + 'following links. Deep or newly published pages can go unseen for weeks.',
      how: 'Serve a robots.txt at the site root with explicit AI-crawler allowances and a Sitemap line.',
      snippet: `User-agent: *\nAllow: /\n\nSitemap: https://${readiness.site.domain}/sitemap.xml\n`,
    }),
  },
  {
    id: 'publish-llms-txt',
    title: 'Publish an llms.txt route map',
    pillar: 'technical',
    impact: 3,
    effort: 1,
    build: ({ brand }) => ({
      why: 'llms.txt gives assistants an unambiguous, curated list of your most quotable pages '
        + 'instead of making them infer structure from your navigation. It will not rescue pages '
        + 'that are not already discoverable and quotable, but for sites that are, it removes a '
        + 'parsing gamble at effectively zero cost.',
      how: `Publish this at https://${brand.domain}/llms.txt as plain text (content-type text/plain), `
        + 'and keep the link list current as you add cornerstone pages.',
      snippet: `# ${brand.name}\n\n> ${brand.name} provides ${categoryText(brand)}`
        + `${brand.location ? ` in ${brand.location}` : ''}.\n\n`
        + `## Core pages\n\n`
        + `- [Services](https://${brand.domain}/services): what we do and who it is for\n`
        + `- [Pricing](https://${brand.domain}/pricing): current rates and what is included\n`
        + `- [FAQ](https://${brand.domain}/faq): answers to the questions buyers ask most\n`
        + `- [Comparisons](https://${brand.domain}/compare): how we compare to alternatives\n`
        + `- [Contact](https://${brand.domain}/contact): hours, location and phone\n`,
    }),
  },
  {
    id: 'ship-sitemap',
    title: 'Publish a complete XML sitemap',
    pillar: 'technical',
    impact: 3,
    effort: 2,
    build: ({ readiness }) => ({
      why: `Only ${readiness.site.sitemapUrls} sitemap URL(s) were discovered. Pages missing from `
        + 'the sitemap rely entirely on internal links to be found.',
      how: 'Generate a sitemap covering every indexable page, include lastmod dates, and reference '
        + 'it from robots.txt. Most CMS platforms have a one-click plugin for this.',
      snippet: `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
        + `  <url>\n    <loc>https://${readiness.site.domain}/</loc>\n`
        + `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n  </url>\n`
        + `</urlset>\n`,
    }),
  },
  {
    id: 'enable-https',
    title: 'Serve the site over HTTPS',
    pillar: 'technical',
    impact: 5,
    effort: 2,
    build: () => ({
      why: 'The site is not served over HTTPS. Several AI crawlers skip insecure origins outright, '
        + 'and browsers actively warn users away.',
      how: 'Install a TLS certificate (Let\'s Encrypt is free and automatable), then 301-redirect all '
        + 'HTTP traffic to HTTPS and update canonical tags and the sitemap to the https:// origin.',
    }),
  },
  {
    id: 'server-render-content',
    title: 'Server-render your main content',
    pillar: 'technical',
    impact: 5,
    effort: 4,
    build: ({ check }) => ({
      why: 'Sampled pages return little or no text in the raw HTML response. Most AI crawlers do not '
        + 'execute JavaScript, so where a user sees a full page, the crawler sees an empty shell. '
        + 'Everything downstream of this - schema, copy, headings - is invisible until it is fixed.',
      how: 'Move to server-side rendering or static generation for content pages (Next.js SSR/SSG, '
        + 'Nuxt, Astro, or prerendering at the CDN edge). Verify with `curl -s <url> | wc -c` and by '
        + 'reading the raw HTML: the body copy must be present without running scripts.',
      snippet: `# Confirm what a non-JS crawler actually receives\n`
        + `curl -sL -A "GPTBot" https://example.com/ | sed -e 's/<[^>]*>//g' | tr -s '[:space:]' ' ' | head -c 600\n`,
    }),
  },
  {
    id: 'speed-up-origin',
    title: 'Reduce server response time',
    pillar: 'technical',
    impact: 2,
    effort: 3,
    build: ({ check }) => ({
      why: `${check ? check.detail : 'Origin responses are slow.'} Live retrieval runs on a tight `
        + 'time budget; slow origins get dropped from the answer rather than waited for.',
      how: 'Put a CDN in front of the origin, cache HTML for anonymous visitors, and target a '
        + 'time-to-first-byte under 600ms.',
    }),
  },
  {
    id: 'add-canonical',
    title: 'Add canonical URLs to every page',
    pillar: 'technical',
    impact: 2,
    effort: 1,
    build: () => ({
      why: 'Pages without a canonical URL can have their citation credit split across duplicate '
        + 'paths, query-string variants and http/https pairs.',
      how: 'Emit a self-referencing canonical link in the head of every page.',
      snippet: `<link rel="canonical" href="https://example.com/the-page" />`,
    }),
  },
  {
    id: 'add-jsonld',
    title: 'Add JSON-LD structured data sitewide',
    pillar: 'structure',
    impact: 4,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Assistants parse JSON far more reliably than they parse visual HTML layout. A table that '
        + 'renders beautifully for a human is a parsing gamble for a crawler; the same facts in '
        + 'JSON-LD are unambiguous.',
      how: 'Add a JSON-LD block to every template. Start with Organization or LocalBusiness sitewide, '
        + 'then layer page-specific types on top.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: brand.name,
        url: `https://${brand.domain}`,
        description: `${brand.name} provides ${categoryText(brand)}${brand.location ? ` in ${brand.location}` : ''}.`,
      }),
    }),
  },
  {
    id: 'add-entity-schema',
    // Resolved per brand: a software project told to add "LocalBusiness"
    // schema reads as a generic template and costs the report its credibility.
    title: 'Publish entity schema with sameAs links',
    titleFor: (brand) => (brand.location
      ? 'Publish LocalBusiness schema with sameAs links'
      : 'Publish Organization schema with sameAs links'),
    pillar: 'structure',
    impact: 4,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Entity schema is how you tell an engine who you are, so it resolves you as a real '
        + 'business rather than an unfamiliar string. sameAs links connect that entity to your '
        + 'third-party profiles, which is how the engine corroborates that you exist.',
      how: 'Add this to the site-wide template, and list every profile you control in sameAs.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': brand.location ? 'LocalBusiness' : 'Organization',
        name: brand.name,
        url: `https://${brand.domain}`,
        description: `${brand.name} provides ${categoryText(brand)}${brand.location ? ` in ${brand.location}` : ''}.`,
        ...(brand.location ? {
          address: { '@type': 'PostalAddress', addressLocality: brand.location },
          telephone: '+1-000-000-0000',
          openingHours: 'Mo-Fr 09:00-17:00',
        } : {}),
        sameAs: [
          'https://www.linkedin.com/company/your-company',
          'https://www.g2.com/products/your-product',
          'https://www.trustpilot.com/review/your-domain',
        ],
      }),
    }),
  },
  {
    id: 'add-faq-schema',
    title: 'Add FAQPage schema to your key pages',
    pillar: 'structure',
    impact: 4,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Q&A pairs are the single easiest unit for an engine to lift verbatim into an answer, '
        + 'because they arrive pre-chunked and already shaped like a user prompt. Evidence on FAQ '
        + 'schema as a ranking lever is mixed, but its value as clean, unambiguous structure for '
        + 'retrieval is not in dispute.',
      how: 'Add FAQPage schema wherever you answer real buyer questions, and make sure the visible '
        + 'copy on the page matches the schema exactly.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `How much does ${categoryText(brand)} cost?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'State the actual number or range, in the first sentence, with what is included.',
            },
          },
          {
            '@type': 'Question',
            name: `How do I choose a provider for ${categoryText(brand)}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Give three concrete criteria a buyer can check, not marketing adjectives.',
            },
          },
        ],
      }),
    }),
  },
  {
    id: 'add-offer-schema',
    title: 'Publish Product / Service schema with pricing',
    pillar: 'structure',
    impact: 3,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Pricing prompts are among the highest-intent questions a buyer asks, and engines answer '
        + 'them from structured data when it exists. If your price is only in an image or a PDF, a '
        + 'competitor who publishes theirs in JSON wins the answer by default.',
      how: 'Add Service or Product schema with an offers block to each service and pricing page.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: categoryText(brand),
        provider: { '@type': 'Organization', name: brand.name },
        ...(brand.location ? { areaServed: brand.location } : {}),
        offers: {
          '@type': 'Offer',
          price: '149.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      }),
    }),
  },
  {
    id: 'fix-headings',
    title: 'Fix heading hierarchy on key pages',
    pillar: 'structure',
    impact: 3,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Engines chunk a page on its heading boundaries before deciding what to retrieve. Pages '
        + 'with no H1, several H1s, or a flat wall of text get chunked badly or skipped entirely.',
      how: 'Give every page exactly one H1 stating the page topic, then break the body into H2 '
        + 'sections of roughly 150-300 words each. Never pick a heading level for its font size.',
      snippet: `<h1>${titleCase(categoryText(brand))}${brand.location ? ` in ${brand.location}` : ''}</h1>\n`
        + `<h2>How much does ${categoryText(brand)} cost?</h2>\n`
        + `<h2>How long does it take?</h2>\n`
        + `<h2>What is included?</h2>\n`
        + `<h2>How does ${brand.name} compare to the alternatives?</h2>`,
    }),
  },
  {
    id: 'question-headings',
    title: 'Rewrite subheadings as the questions buyers type',
    pillar: 'structure',
    impact: 4,
    effort: 2,
    build: ({ visibility }) => {
      const gap = (visibility && visibility.gaps && visibility.gaps[0]) || null;
      return {
        why: 'A heading that matches the shape of a user prompt is the strongest retrieval hook '
          + 'available. "Our Process" matches nothing anyone asks; "How long does installation take?" '
          + 'matches a real query verbatim.'
          + (gap ? ` For example, nothing on the site currently answers: "${gap.prompt}"` : ''),
        how: 'Take the prompts in the gap list from this audit and turn each into an H2, with a '
          + 'direct answer in the first two sentences underneath it.',
        snippet: gap
          ? `<h2>${escapeHtml(gap.prompt)}</h2>\n<p>Answer it directly in the first sentence, then give the supporting detail.</p>`
          : `<h2>How much does it cost?</h2>\n<p>Answer directly in the first sentence.</p>`,
      };
    },
  },
  {
    id: 'semantic-landmarks',
    title: 'Wrap body copy in semantic landmarks',
    pillar: 'structure',
    impact: 2,
    effort: 1,
    build: () => ({
      why: 'Without <main> or <article>, a parser cannot reliably separate your content from your '
        + 'navigation, cookie banner and footer - so chrome text competes with your actual copy.',
      how: 'Wrap the unique content of each page in <main> and each self-contained piece in <article>.',
      snippet: `<body>\n  <header>...</header>\n  <main>\n    <article>\n      <h1>Page topic</h1>\n      <p>Body copy.</p>\n    </article>\n  </main>\n  <footer>...</footer>\n</body>`,
    }),
  },
  {
    id: 'write-meta-descriptions',
    title: 'Write meta descriptions for every page',
    pillar: 'structure',
    impact: 2,
    effort: 2,
    build: () => ({
      why: 'The meta description is often the first summary an engine reads when deciding whether a '
        + 'page is relevant to a prompt.',
      how: 'Write 140-160 characters per page that state what the page answers, in plain language.',
      snippet: `<meta name="description" content="[What the page answers, in plain language] `
        + `[One concrete differentiator with a number in it]." />`,
    }),
  },
  /* ---------------- Content ---------------- */
  {
    id: 'write-answer-capsules',
    title: 'Open every key page with a 40-60 word answer capsule',
    pillar: 'content',
    impact: 5,
    effort: 2,
    build: ({ brand, check }) => ({
      why: 'Engines lift the first paragraph far more often than any other part of a page. Pages '
        + 'that open with "Welcome to..." or "Founded in 1998..." hand the assistant nothing '
        + 'quotable in the window it actually reads, so it moves on to a competitor who answers '
        + 'the question in sentence one.'
        + (check && check.evidence && check.evidence.length
          ? ` Pages affected include: ${check.evidence.slice(0, 3).map((e) => String(e).split(' - ')[0]).join(', ')}.`
          : ''),
      how: 'Rewrite the opening of each key page so the first 40-60 words answer the page\'s core '
        + 'question outright, with a specific number in it. Put the brand story further down.',
      snippet: `<!-- Before -->\n<p>Welcome to ${brand.name}. For over 20 years we have been proudly serving our community with dedication and integrity.</p>\n\n`
        + `<!-- After -->\n<p>${brand.name} provides ${categoryText(brand)}${brand.location ? ` across ${brand.location}` : ''}, `
        + `[one concrete differentiator with a number] and [second specific fact a buyer cares about]. `
        + `[Who it is for.]</p>`,
    }),
  },
  {
    id: 'build-comparison-pages',
    title: 'Publish comparison and "best X" pages',
    pillar: 'content',
    impact: 5,
    effort: 3,
    build: ({ brand, visibility }) => {
      const rivals = (brand.competitors || []).map((c) => c.name);
      const lost = (visibility && visibility.gaps || []).slice(0, 3).map((g) => g.prompt);
      return {
        why: 'List-shaped pages are the most-cited content type in AI answers by a wide margin, and '
          + 'commercial prompts ("best X for Y", "alternatives to Z") almost always resolve to one. '
          + 'If you publish none, the engine cites whoever did - frequently a competitor or a review '
          + 'site ranking you below them.'
          + (lost.length ? ` You are currently absent from: ${lost.map((p) => `"${p}"`).join(', ')}.` : ''),
        how: 'Publish one honest comparison page per major rival plus a category round-up. Include '
          + 'your competitors and be fair about where they win - engines reward pages that read as '
          + 'genuine comparisons and discount pages that read as sales copy. Use a real table with '
          + 'concrete criteria, and add ItemList schema.',
        snippet: `Suggested pages to publish:\n`
          + `  /best-${slugify(categoryText(brand))}${brand.location ? `-in-${slugify(brand.location)}` : ''}\n`
          + rivals.slice(0, 3).map((r) => `  /${slugify(brand.name)}-vs-${slugify(r)}`).join('\n')
          + (rivals.length ? `\n  /${slugify(rivals[0])}-alternatives\n` : '\n')
          + `\nEach page needs: a one-paragraph verdict up top, a comparison table with 5-7 concrete\n`
          + `criteria, a "who should choose which" section, and a last-updated date.`,
      };
    },
  },
  {
    id: 'add-faq-content',
    title: 'Add a real Q&A section to each key page',
    pillar: 'content',
    impact: 4,
    effort: 2,
    build: ({ visibility }) => {
      const gaps = (visibility && visibility.gaps || []).slice(0, 5).map((g) => g.prompt);
      return {
        why: 'Q&A blocks arrive pre-chunked and already shaped like a prompt, which makes them the '
          + 'cheapest retrievable unit you can publish.',
        how: 'Answer the exact questions buyers ask. The audit already found the ones you are '
          + 'currently losing - start there, one H2 per question, direct answer underneath.',
        snippet: gaps.length
          ? `Questions to answer on-site, taken from prompts you are absent from:\n\n`
            + gaps.map((q) => `  - ${q}`).join('\n')
          : `  - How much does it cost?\n  - How long does it take?\n  - What is included?\n  - How do you compare to alternatives?`,
      };
    },
  },
  {
    id: 'deepen-content',
    title: 'Deepen thin pages',
    pillar: 'content',
    impact: 3,
    effort: 3,
    build: ({ check }) => ({
      why: `${check ? check.detail : 'Several pages are thin.'} Thin pages rarely survive retrieval `
        + 'ranking against a competitor that covers the same question properly.',
      how: 'Bring cornerstone pages to 800+ words of genuinely useful substance: specifics, numbers, '
        + 'process detail, edge cases, and the objections buyers actually raise. Padding does not '
        + 'count - depth means answering more of the question, not saying less in more words.',
    }),
  },
  {
    id: 'add-quotable-stats',
    title: 'Add concrete numbers and named specifics',
    pillar: 'content',
    impact: 4,
    effort: 2,
    build: ({ brand }) => ({
      why: 'Generative-engine research consistently finds that adding statistics, named sources and '
        + 'concrete specifics lifts citation rate. The mechanism is simple: a number is quotable and '
        + 'checkable, an adjective is not. "Fast, friendly service" gives an assistant nothing to '
        + 'repeat; a specific figure gives it a sentence it can lift whole.',
      how: 'Audit your key pages for unsupported adjectives and replace each with a figure you can '
        + 'stand behind: volumes handled, response or delivery times, years in operation, '
        + 'satisfaction rates, price ranges, benchmark results. Cite the source or the period the '
        + 'figure covers.',
      snippet: `Before: "${brand.name} offers fast, reliable ${categoryText(brand)} at competitive prices."\n\n`
        + `After:  "${brand.name} handles [N] [units] per [period] with a [figure] [metric],\n`
        + `         at [price] - roughly [N]% below the category average as of ${new Date().getFullYear()}."\n\n`
        + `Replace each bracket with a number you can defend. One defensible figure beats\n`
        + `five adjectives.`,
    }),
  },
  {
    id: 'add-freshness-signals',
    title: 'Publish and maintain machine-readable dates',
    pillar: 'content',
    impact: 3,
    effort: 1,
    build: () => ({
      why: 'Engines prefer content they can verify as current, and undated pages lose to dated ones '
        + 'on anything time-sensitive. Undated pages also cannot demonstrate that they have been '
        + 'maintained at all.',
      how: 'Emit dateModified in JSON-LD and a visible <time> element on every content page, and '
        + 'genuinely refresh cornerstone pages on a quarterly cycle - re-stamping a stale page is '
        + 'a short-lived trick, not a strategy.',
      snippet: `<time datetime="${new Date().toISOString().slice(0, 10)}">Last updated ${new Date().toISOString().slice(0, 10)}</time>\n\n`
        + jsonBlock({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: 'Page title',
          dateModified: new Date().toISOString(),
          author: { '@type': 'Person', name: 'Author Name' },
        }),
    }),
  },
  {
    id: 'clarify-entity',
    title: 'State who you are, what you do and where, in the opening copy',
    pillar: 'content',
    impact: 4,
    effort: 1,
    build: ({ brand, check }) => ({
      why: `${check ? check.detail : ''} An engine that has to infer your category from context will `
        + 'lose to a competitor who states it plainly. Ambiguity is not sophistication here; it is '
        + 'lost recall.',
      how: 'Make the homepage title, meta description and first paragraph each contain the brand '
        + 'name, the category in the words buyers use, and the market you serve.',
      snippet: `<title>${brand.name} - ${titleCase(categoryText(brand))}${brand.location ? ` in ${brand.location}` : ''}</title>\n`
        + `<meta name="description" content="${brand.name} provides ${categoryText(brand)}${brand.location ? ` in ${brand.location}` : ''}. [One concrete differentiator with a number.]" />\n`
        + `<h1>${titleCase(categoryText(brand))}${brand.location ? ` in ${brand.location}` : ''}</h1>`,
    }),
  },

  /* ---------------- Authority ---------------- */
  {
    id: 'build-third-party-presence',
    title: 'Earn mentions on the sources these engines actually cite',
    pillar: 'authority',
    impact: 5,
    effort: 4,
    build: ({ visibility, brand }) => {
      const domains = (visibility && visibility.citationDomains || [])
        .filter((d) => !d.isOwn).slice(0, 6);
      return {
        why: 'Independent mentions carry weight of their own: an assistant corroborates a claim '
          + 'before repeating it, and your own website is the weakest possible evidence that you are '
          + 'worth recommending. This audit recorded exactly which domains the engines pulled from '
          + 'when answering your buyers\' questions.',
        how: domains.length
          ? 'Work the list below in order - these are the sources actually cited in your category. '
            + 'Claim and complete each profile, gather recent reviews, and get listed in the relevant '
            + 'round-ups. Community threads matter as much as review sites: an authentic answer from '
            + 'a real account in a thread that ranks is worth more than a press release.'
          : 'Claim and complete your profiles on the review and community platforms your buyers use, '
            + 'then pursue inclusion in third-party "best X" round-ups.',
        snippet: domains.length
          ? `Sources cited in your category, most-cited first:\n\n`
            + domains.map((d) => `  ${String(d.count).padStart(3)}x  ${d.domain}`
              + (d.isCompetitor ? '   <- competitor domain' : '')).join('\n')
            + `\n\nTarget: a complete, current ${brand.name} presence on each non-competitor source.`
          : undefined,
      };
    },
  },
  {
    id: 'publish-nap',
    title: 'Publish complete, consistent contact details',
    pillar: 'authority',
    impact: 3,
    effort: 1,
    build: ({ check }) => ({
      why: `${check ? check.detail : ''} Consistent name, address and phone across your site and your `
        + 'third-party profiles is how an engine confirms you are a real, resolvable business rather '
        + 'than an unverifiable brand string.',
      how: 'Publish full contact details in the footer sitewide and mirror them exactly in your '
        + 'LocalBusiness schema and every directory profile. Inconsistencies split your entity.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'Your Business',
        telephone: '+1-512-555-0134',
        email: 'hello@example.com',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '120 Cedar Street',
          addressLocality: 'Austin',
          addressRegion: 'TX',
          postalCode: '78701',
          addressCountry: 'US',
        },
      }),
    }),
  },
  {
    id: 'add-authorship',
    title: 'Attribute content to named, credentialed authors',
    pillar: 'authority',
    impact: 2,
    effort: 2,
    build: () => ({
      why: 'Anonymous content is weaker evidence than attributed content. Where two sources answer '
        + 'a question equally well, a named author with verifiable credentials is the tiebreak.',
      how: 'Add bylines with real author bios and credentials, link each to an author page, and '
        + 'declare the author in JSON-LD.',
      snippet: jsonBlock({
        '@context': 'https://schema.org',
        '@type': 'Article',
        author: {
          '@type': 'Person',
          name: 'Dana Reyes',
          jobTitle: 'Master Plumber, TX License #12345',
          url: 'https://example.com/team/dana-reyes',
        },
      }),
    }),
  },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** @param {any} obj */
function jsonBlock(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

/** @param {string} s */
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** @param {string} s */
function titleCase(s) {
  return String(s).replace(/\b\w/g, (m) => m.toUpperCase());
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** @type {Map<string, Rule>} */
export const RULE_INDEX = new Map(RULES.map((r) => [r.id, r]));
