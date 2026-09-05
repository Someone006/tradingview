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

### Reaching prospects in Switzerland — read this before you send anything

**Cold bulk email is a criminal offence in Switzerland.** Art. 3(1)(o) of the Federal Act
Against Unfair Competition (UWG/LCD) prohibits sending mass advertising by
telecommunications without the recipient's prior consent. It applies to B2B, not just
consumers. Under Art. 23 UWG a breach carries a custodial sentence of up to three years or a
monetary penalty. There is no "we found their address on their website" exemption.

An earlier version of this document recommended a cold-email funnel. That advice was wrong
for Switzerland and has been removed. What follows is the compliant version.

**The narrow exception.** You may email an *existing customer* about your own similar
products or services, provided you gave them the chance to refuse at collection and in every
message. That is a retention channel, not an acquisition channel.

**What is actually allowed:**

1. **Phone first.** B2B cold calling remains permissible on the basis of presumed consent
   (*mutmassliche Einwilligung*) where your service is plainly relevant to that business's
   operations. Check the recipient is not marked with an asterisk in the telephone directory —
   that asterisk is a registered objection to advertising calls, and calling anyway is itself
   a UWG breach. Get verbal agreement to send the report, and log who agreed and when.
2. **Then email, because they asked you to.** Consent obtained on a call is consent. Record it.
3. **Inbound and opt-in.** Publish the free checker, gate the full report behind a form with a
   clear, unticked consent box, and use double opt-in for anything list-shaped.
4. **LinkedIn and in-person.** Direct messages on a platform the person opted into, referrals,
   trade associations, local business networks, chambers of commerce.

**The free crawl is still your best asset** — it just travels differently. Run it, then use
the finding as the reason for a *call*, not the payload of a bulk mailing:

```bash
while read -r domain category; do
  node bin/citebeam.js audit --domain "$domain" --category "$category" \
    --no-visibility --quiet --format html
done < prospects.txt
```

A call that opens with "your robots.txt is blocking ChatGPT from reading your site, and I can
show you the line" converts better than any email, and it is lawful.

**Consent log.** Keep, per contact: who consented, when, by what channel, and to what. If a
complaint reaches SECO you will be asked to produce it. A spreadsheet is sufficient.

**Selling outside Switzerland?** The EU is stricter still: GDPR plus the ePrivacy rules, with
Germany's UWG §7 enforced aggressively. Do not assume a Swiss approach travels.

*This is an engineering document, not legal advice. Confirm your approach with a Swiss lawyer
before running outreach at scale.*

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

| Tier | Price (CHF, excl. VAT) | Scope |
|---|---|---|
| Snapshot | 290 | Crawl-only audit, report, no call |
| Standard | 950 | Full audit, competitors, 30-min walkthrough |
| Deep | 2,000+ | Multi-location or multi-product, implementation plan |
| Monitoring | 290/mo | Monthly re-run, delta report, quarterly call |
| Done-for-you | 1,500–5,000/mo | Monitoring plus implementing the fixes |

**Swiss VAT.** The standard rate is 8.1%. You must register for VAT (MWST/TVA) once turnover
reaches **CHF 100,000** a year; below that, registration is voluntary. Once registered, state
clearly whether quoted prices include or exclude VAT — for consumers the Price Indication
Ordinance (PBV/OIP) requires the actual price payable, VAT included. B2B quotes conventionally
show the net price plus VAT, but the treatment must be unambiguous either way.

**Impressum.** A commercial Swiss website must carry an imprint reachable within about two
clicks: legal name, a real street address (no P.O. box), email, and commercial-register and
VAT numbers where you have them. Art. 3(1)(s) UWG. Omitting it is itself an unfair-competition
breach and can be fined.

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
  diagnosis, the fix, and the trend. Under Art. 3(1)(b) UWG, inaccurate or misleading claims
  about your services are themselves unfair competition — so "we will get you into ChatGPT"
  is not merely over-promising, it is actionable.
- **Never send bulk email without consent.** See the outreach section. It is the single
  fastest way to turn this business into a criminal matter.
