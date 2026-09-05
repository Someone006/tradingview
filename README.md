# CiteBeam

**Find out whether ChatGPT, Claude, Perplexity and Gemini recommend your business — and get the exact fixes when they don't.**

Self-hosted. Unlimited brands. No per-client fee. White-label reports you can sell.

```bash
git clone <your-repo> citebeam && cd citebeam
node bin/citebeam.js audit --domain example.com --category "what they sell" --no-visibility
```

That's it. No `npm install`, no build step, no database. Node 20+ and nothing else.

---

## Why this exists

Search is moving into AI answers. ChatGPT has roughly 900M weekly users; Google's AI
Overviews reach billions of queries a month; organic search traffic is projected to fall
about 25%. Every business now has a question it cannot answer: **when a buyer asks an AI
assistant for what I sell, am I in the answer?**

The tools that measure this charge **$189–$300 per client per month**. An agency with ten
clients pays $22K–36K a year in tooling. And they mostly return a dashboard — a score, and
then, in the words of one buyer's guide, "analyst time to interpret."

CiteBeam is the other shape of that product:

| | Hosted AI-visibility dashboards | CiteBeam |
|---|---|---|
| Pricing | $189–300 per brand, per month | Self-hosted, unlimited brands |
| Output | A score and some charts | A score **plus the exact fix, with code** |
| Branding | Vendor's | Yours — white-label by default |
| Without API keys | Nothing works | Full site audit still runs |
| Data | Vendor's servers | Your disk |

---

## What it actually does

**1. Site readiness crawl — 26 checks, no API keys needed.**
Fetches the site the way an AI crawler does (plain HTTP, no JavaScript execution) and scores
it against the signals that decide whether an answer engine can cite you:

- **Crawlability** — is `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` actually
  allowed in `robots.txt`? (This is the single most common and most expensive mistake we see:
  a full robots.txt parser resolves it per crawler.) Plus HTTPS, `llms.txt`, sitemap,
  server-rendering, response time, canonicals.
- **Machine readability** — JSON-LD, Organization/LocalBusiness entity schema with `sameAs`,
  FAQPage, Product/Offer, heading hierarchy, question-shaped headings, semantic landmarks.
- **Quotability** — is there a direct answer in the first 60 words, or brand throat-clearing?
  Comparison and "best X" pages. On-page Q&A. Content depth. Concrete numbers vs adjectives.
  Freshness signals. Entity clarity.
- **Trust signals** — third-party profile links, verifiable contact details, named authorship.

**2. Answer visibility measurement.**
Generates buyer questions across seven intent classes — commercial research, comparisons,
alternatives, local, pricing, problem-led, branded — puts them to the real engines, and
measures whether you're named, how early, how favourably, and whether your domain is cited.
Reports answer share against your competitors, and the exact prompts where a competitor is
recommended and you are not.

**3. A prioritised fix plan.**
Every failing check maps to a specific action with copy-paste code, ordered by impact against
effort and split into a 30/60/90-day roadmap. This is the part clients pay for.

**4. Client-ready reports.**
Self-contained HTML (opens offline, prints to PDF), Markdown, JSON, and CSV. Your agency name,
logo and accent colour.

---

## Install

```bash
git clone <your-repo> citebeam
cd citebeam
node bin/citebeam.js help
```

Optional: `npm link` to get a global `citebeam` command. `npm install` is only needed for the
dev typecheck; the product itself has **zero runtime dependencies**.

## Quick start

```bash
# 1. Create a brand profile
node bin/citebeam.js init --domain acme.com --name Acme --category "CRM software"

# 2. Edit brand.json to add competitors and your agency branding, then audit
node bin/citebeam.js audit --brand brand.json

# 3. Open the report
open audits/*.html
```

Two example profiles ship in `brands/` — a SaaS product and a local service business.

```bash
node bin/citebeam.js audit --brand brands/example.json
```

### The dashboard

```bash
node bin/citebeam.js serve          # http://127.0.0.1:4317
```

Run audits from a form, see every tracked brand with a trend sparkline, open or export reports.

---

## API keys

**The site audit needs no keys at all.** Run `--no-visibility` and you get the full 26-check
readiness report and fix plan for free, forever.

For live answer measurement, set any of these in `.env` or the environment:

```bash
OPENAI_API_KEY=sk-...          # ChatGPT
ANTHROPIC_API_KEY=sk-ant-...   # Claude
PERPLEXITY_API_KEY=pplx-...    # Perplexity (returns real citation lists)
GEMINI_API_KEY=...             # Google Gemini
```

Every configured engine runs. With none set, CiteBeam runs an **offline simulation engine** so
the product is fully demonstrable — and labels the output as simulated in the terminal, the
dashboard, the report banner and the JSON. Simulated numbers are fixtures, not measurements;
never hand them to a client as real data.

Check status any time:

```bash
node bin/citebeam.js engines
```

---

## Commands

| Command | What it does |
|---|---|
| `audit` | Run an audit and write reports |
| `serve` | Start the dashboard and REST API |
| `init` | Create a brand profile template |
| `list` | List every brand with a stored run |
| `history <domain>` | Run history with scores over time |
| `report <domain>` | Re-render a stored run in any format |
| `engines` | Show engine and credential status |

Key audit flags:

```bash
--brand <file>        Brand profile JSON
--domain / --category Audit without a profile file
--engines a,b         Pick engines explicitly
--prompts <n>         Prompts to generate (default 24)
--pages <n>           Max pages to crawl (default 12)
--format html,md,csv  Output formats (default html,json)
--no-visibility       Crawl only — no API keys needed
--fail 60             Exit non-zero below this score (CI gate)
```

---

## Use it as a library

```js
import { runAudit, renderReport } from 'citebeam';

const report = await runAudit({
  name: 'Acme', domain: 'acme.com', category: 'CRM software',
  competitors: [{ name: 'Salesforce', domain: 'salesforce.com' }],
});

console.log(report.meta.compositeScore, report.recommendations[0].title);
```

## REST API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/engines` | Engine + credential status |
| `GET` | `/api/brands` | Every tracked brand |
| `GET` | `/api/brands/:key` | History and trend series |
| `GET` | `/api/brands/:key/runs/:id` | Full report JSON |
| `POST` | `/api/audit` | Run an audit |
| `GET` | `/report/:key[/:id]` | Rendered report (`?format=md\|json\|outcomes.csv`) |

The server **binds to `127.0.0.1` and ships without authentication.** If you expose it, put it
behind your own auth proxy.

---

## How the scores work

**Composite** = 55% site readiness + 45% measured answer visibility. Readiness is weighted
higher because it is what you can change this month; visibility is the lagging indicator that
follows.

**Readiness** is a weighted average across four pillars: crawlability 30%, machine readability
25%, quotability 30%, trust signals 15%.

**Visibility** weights presence most heavily, then position in the answer, sentiment of the
surrounding sentence, and whether your own domain was cited.

Grades: A ≥ 85%, B ≥ 70%, C ≥ 55%, D ≥ 40%, F below.

### Honesty guarantees

These are deliberate, and tested:

- **A site that cannot be crawled is never scored as failing.** If the homepage returns 403 or
  times out, readiness comes back as *not measured* — not zero — and the blocked crawl is
  reported as the finding it actually is. Telling a client "you have no structured data" when
  the truth is "we got a 403" is how you lose a client.
- **Simulated runs are labelled everywhere.** Terminal, dashboard badge, report banner, JSON field.
- **Assistant answers are non-deterministic.** One run is a sample, not a census. Track the trend.

---

## Selling this

See **[docs/BUSINESS.md](docs/BUSINESS.md)** for pricing models, the audit-service playbook,
outreach templates, and margin maths. Short version: agencies charge $500–$2,000 for a one-off
AI visibility audit and $199–$499/month for monitoring. Your marginal cost per audit is a few
cents of API spend.

Other docs:

- **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)** — every check, what it measures, why it matters
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — Docker, systemd, scheduled monitoring, CI gating

---

## Development

```bash
npm test           # 49 tests, no network required
npm run typecheck  # JSDoc types via TypeScript
```

The test suite runs entirely offline against fixtures and the deterministic simulation engine.

## License

Commercial license — see [LICENSE](LICENSE). You may use, modify and sell services built with
it; you may not resell the software itself as a competing product.
