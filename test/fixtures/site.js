/** Synthetic site snapshots used across the test suite. */
import * as H from '../../src/util/html.js';

/**
 * Build a PageSnapshot from raw HTML the way the crawler would.
 * @param {string} url @param {string} html @param {number} [latencyMs]
 */
export function page(url, html, latencyMs = 200) {
  return {
    url, status: 200, html,
    text: H.toText(html),
    title: H.title(html),
    description: H.meta(html, 'description'),
    headings: H.extractHeadings(html),
    jsonld: H.extractJsonLd(html),
    links: H.extractLinks(html, url),
    bytes: html.length, latencyMs,
  };
}

const GOOD_HOME = `<!doctype html><html><head>
<title>Northwind Plumbing - 24/7 Emergency Plumbers in Austin, TX</title>
<meta name="description" content="Northwind Plumbing provides 24/7 emergency plumbing services across Austin, Texas, with a 45-minute average response time and flat-rate pricing.">
<link rel="canonical" href="https://northwindplumbing.com/">
<meta name="author" content="Dana Reyes">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"Plumber","name":"Northwind Plumbing","telephone":"+1-512-555-0134",
 "address":{"@type":"PostalAddress","streetAddress":"120 Cedar Street","addressLocality":"Austin"},
 "sameAs":["https://www.yelp.com/biz/northwind","https://g2.com/x","https://facebook.com/nw"],
 "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8"}},
{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How fast?"},{"@type":"Question","name":"Cost?"},{"@type":"Question","name":"Areas?"}]},
{"@type":"Service","name":"Emergency plumbing","offers":{"@type":"Offer","price":"149"},"dateModified":"__RECENT__"}]}</script>
</head><body><header><nav><a href="/pricing">Pricing</a></nav></header>
<main>
<h1>Emergency Plumbing in Austin, TX</h1>
<p>Northwind Plumbing dispatches a licensed emergency plumber anywhere in Austin within 45 minutes, 24 hours a day, at a flat rate of $149 per callout with no overtime surcharge.</p>
<h2>How fast can you get to me?</h2>
<p>Our median arrival time across 3,200 callouts in 2025 was 41 minutes, and 94% of jobs were resolved on the first visit.</p>
<h2>What does an emergency callout cost?</h2>
<p>Flat $149 callout, applied against the repair. Average repair invoice is $380 and 87% of customers pay under $500.</p>
<h2>Which areas do you cover?</h2>
<p>We cover all of Travis County and 12 surrounding ZIP codes.</p>
<time datetime="__RECENT__">Updated</time>
</main>
<footer><a href="https://www.yelp.com/biz/northwind">Yelp</a><a href="https://www.bbb.org/x">BBB</a>
<a href="https://facebook.com/nw">Facebook</a><a href="https://linkedin.com/company/nw">LinkedIn</a>
<p>Call +1-512-555-0134 or email help@northwindplumbing.com. 120 Cedar Street, Austin.</p></footer>
</body></html>`;

const GOOD_COMPARE = `<!doctype html><html><head>
<title>Best Emergency Plumbers in Austin: 2026 Comparison</title>
<meta name="description" content="An independent comparison of the seven best emergency plumbing companies in Austin, ranked by response time, pricing transparency and licensing.">
<link rel="canonical" href="https://northwindplumbing.com/best-emergency-plumbers-austin">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","author":{"@type":"Person","name":"Dana Reyes"},"dateModified":"__RECENT__"}</script>
</head><body><main>
<h1>Best Emergency Plumbers in Austin (2026)</h1>
<p>The seven emergency plumbing companies below serve Austin 24/7; they are ranked by median response time, which ranges from 41 to 190 minutes across the group.</p>
<h2>How did we rank these plumbers?</h2><p>We compared 3,200 callouts, 18 published price sheets and Texas licensing records for each company across a 12-month window ending in March 2026.</p>
<h2>Which plumber is cheapest for a burst pipe?</h2><p>Flat-rate providers averaged $149 versus $220 for hourly billing, a 32% difference on a typical two-hour job.</p>
<h2>What should you ask before booking?</h2><p>Confirm the licence number, the callout fee and whether overtime applies after 6pm.</p>
</main></body></html>`;

const BAD_HOME = `<!doctype html><html><head><title>Home</title></head>
<body><div id="root"></div>
<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>
</body></html>`;

/** A site that should score well. */
export function goodSite() {
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  const swap = (h) => h.replaceAll('__RECENT__', recent);
  return {
    domain: 'northwindplumbing.com',
    origin: 'https://northwindplumbing.com',
    reachable: true,
    robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://northwindplumbing.com/sitemap.xml\n',
    llmsTxt: '# Northwind Plumbing\n\n> 24/7 emergency plumbers in Austin.\n\n- [Pricing](https://northwindplumbing.com/pricing)\n- [FAQ](https://northwindplumbing.com/faq)\n- [Comparison](https://northwindplumbing.com/best-emergency-plumbers-austin)\n',
    sitemapUrls: Array.from({ length: 20 }, (_, i) => `https://northwindplumbing.com/p${i}`)
      .concat(['https://northwindplumbing.com/best-emergency-plumbers-austin',
        'https://northwindplumbing.com/vs-rivercity',
        'https://northwindplumbing.com/plumber-alternatives']),
    pages: [
      page('https://northwindplumbing.com', swap(GOOD_HOME)),
      page('https://northwindplumbing.com/best-emergency-plumbers-austin', swap(GOOD_COMPARE)),
    ],
  };
}

/** A site that should score badly: JS-only, AI crawlers blocked, no schema. */
export function badSite() {
  return {
    domain: 'blocked.example',
    origin: 'http://blocked.example',
    reachable: true,
    robotsTxt: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n',
    llmsTxt: null,
    sitemapUrls: [],
    pages: [page('http://blocked.example', BAD_HOME, 4200)],
  };
}

export const brand = {
  name: 'Northwind Plumbing',
  domain: 'northwindplumbing.com',
  aliases: [],
  category: 'emergency plumbing services',
  location: 'Austin, TX',
  audience: 'homeowners with urgent plumbing failures',
  competitors: [
    { name: 'RiverCity Plumbers', domain: 'rivercityplumbers.com', aliases: [] },
    { name: 'Lone Star Drain Co', domain: 'lonestardrain.com', aliases: ['Lone Star Drain'] },
  ],
  extraPrompts: [],
  keyPages: [],
  branding: {},
};
