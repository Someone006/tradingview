# Selling CiteBeam

How to turn this repository into revenue. Three models, in order of how fast they pay.

---

## The market, briefly

- ChatGPT reaches roughly 900M weekly users; Google's AI Overviews reach billions of queries
  a month. Organic search traffic is projected to decline ~25% as answer engines absorb
  discovery-stage queries.
- Every business owner has now heard "AI is replacing Google" and has no idea where they stand.
- Incumbent tools charge **$189–$300 per brand per month**. An agency with 10 clients pays
  **$22K–36K/year** in tooling before doing any work.
- Those tools return a dashboard. Buyers' guides openly note they "require analyst time to
  interpret." The interpretation is the billable part — and CiteBeam ships it.

**The wedge:** you own the tool, so your marginal cost per audit is cents. You sell the
interpretation and the fix, which is what the client actually wanted.

---

## Model 1 — Productised audits (fastest to first revenue)

Sell a one-off **AI Visibility Audit** for **$500–$2,000**.

What the client gets: the white-label HTML/PDF report, a 30-minute walkthrough call, and the
prioritised fix plan with code.

What it costs you: one command, a few cents of API spend, and 20–40 minutes reviewing the
output and adding two or three sentences of context per finding.

**Why it closes:** the report leads with a specific, verifiable, embarrassing fact — "GPTBot is
blocked in your robots.txt", "you are absent from 9 of the 12 questions your buyers ask",
"your competitor is named 3x more often than you." That is not a metric, it is a problem.

### The free-audit funnel

The highest-converting motion, because the crawl needs no API keys:

1. Pick 20–50 businesses in one vertical and one city.
2. Run the crawl-only audit on each — no keys, no cost:
   ```bash
   while read -r domain category; do
     node bin/citebeam.js audit --domain "$domain" --category "$category" \
       --no-visibility --quiet --format html
   done < prospects.txt
   ```
3. Email the ones with a genuinely bad finding. Attach nothing; describe one specific problem
   and offer the report.

Template:

> Subject: ChatGPT can't read {domain}
>
> Hi {name} — I run AI-search visibility audits for {industry} businesses.
>
> I checked {domain} this morning. Your robots.txt currently blocks GPTBot and
> PerplexityBot, which means ChatGPT and Perplexity can't read a single page of your site.
> When someone asks either of them for {category} in {city}, you can't be in the answer.
>
> It's a four-line fix. I've put together a full report — 26 checks, the specific questions
> you're currently losing, and the exact changes to make. Want me to send it over?
>
> {your name}

Only send this when the finding is real. The report shows the actual robots.txt lines, so an
exaggeration gets caught immediately.

---

## Model 2 — Monthly monitoring retainer

**$199–$499/month per client.** Re-run monthly, deliver the report, work the plan.

The recurring value is real: answers shift as engines re-crawl and competitors publish. The
delta section shows exactly what moved since last month, which is what justifies the invoice.

```bash
# 1st of the month, every month
0 9 1 * * cd /srv/citebeam && node bin/citebeam.js audit --brand clients/acme.json --format html,md
```

At 10 clients on $299, that's ~$36K/year against near-zero marginal cost.

**Positioning:** don't sell "monitoring." Sell "we make sure you get recommended, and we prove
it every month."

---

## Model 3 — Sell the software

Because it is self-hosted, zero-dependency and white-label, it packages cleanly.

- **Agency licence, $497–$997 one-time** — unlimited client brands, their branding.
  Sells well to agencies doing the $22K/year tooling maths.
- **Hosted SaaS, $49–$199/month** — put the dashboard behind auth and billing.
  The server is one file; add a session check and a Stripe webhook.
- **Lead magnet** — free single-page checker on your marketing site, gated full report.

---

## Pricing the audit itself

| Tier | Price | Scope |
|---|---|---|
| Snapshot | $297 | Crawl-only audit, report, no call |
| Standard | $997 | Full audit, competitors, 30-min walkthrough |
| Deep | $2,000+ | Multi-location or multi-product, implementation plan |
| Monitoring | $299/mo | Monthly re-run, delta report, quarterly call |
| Done-for-you | $1,500–5,000/mo | Monitoring plus actually implementing the fixes |

The implementation retainer is where the real money is. The audit is how you earn the right to
propose it — every report ends in a prioritised list of work only you have already scoped.

---

## Which verticals buy fastest

Ranked by (pain × ability to pay × how badly they currently rank):

1. **Local high-ticket services** — plumbers, HVAC, roofers, dentists, lawyers, med spas.
   One job is worth $500–$10,000, so one extra recommendation pays for the year. They are also
   the worst-prepared: brochure sites, no schema, no comparison content.
2. **B2B SaaS, $1–20M ARR** — already buy SEO tools, already worried, understand the metric
   instantly, and have budget lines for it.
3. **E-commerce in considered categories** — furniture, mattresses, tools, equipment. Buyers
   research through assistants before purchase.
4. **Professional services** — accountants, agencies, consultancies. Sold on reputation, which
   is exactly what an answer engine is summarising.

Avoid commodity retail and anything with no meaningful research step.

---

## Handling the two objections you will get

**"Can't I just ask ChatGPT myself?"**
You can, once, for one question, with no record. The value is systematic coverage across the
seven ways buyers actually phrase the question, tracked over time, against named competitors,
with the site-side reason you are losing. That is the difference between an anecdote and a
diagnosis.

**"Does any of this actually work?"**
Be honest: the technical fixes are deterministic — an unblocked crawler can read the site, a
blocked one cannot. The content and authority work is directional and compounds over months.
Show the readiness score as the leading indicator you control and the visibility score as the
lagging one. Never promise a ranking; promise the diagnosis and the work.

---

## What not to do

- **Never present simulated output as real data.** Without API keys, CiteBeam labels every run
  as simulated in four places. Those are fixtures for demos. Selling them as measurements is
  fraud and will end your business faster than any competitor will.
- **Never report a blocked crawl as a failing site.** The tool already refuses to; do not
  paper over it in the deck.
- **Do not promise rankings.** Answers are non-deterministic and personalised. Sell the
  diagnosis, the fix, and the trend.
