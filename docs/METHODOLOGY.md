# Methodology

What every check measures, why it matters to an answer engine, and how the scores combine.

---

## The model

An answer engine asks four questions of a site, in order. A failure at any level makes the
levels above it irrelevant — which is why the pillars are weighted the way they are and why
the action plan sequences the way it does.

| Pillar | The engine's question | Weight |
|---|---|---|
| Crawlability | Can I fetch and read this at all? | 30% |
| Machine readability | Can I parse what it means? | 25% |
| Quotability | Is there anything here I can lift into an answer? | 30% |
| Trust signals | Should I repeat what it says? | 15% |

Each check returns a 0–1 score and a weight. A pillar is the weighted mean of its checks; the
readiness score is the weighted mean of the pillars.

---

## Crawlability (technical)

| Check | Weight | What it measures |
|---|---|---|
| AI crawler access | 10 | Whether `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` and others are permitted at the site root, via a full robots.txt parser (grouped user-agents, longest-match precedence, wildcards, `$` anchors) |
| Server-rendered content | 8 | Whether body copy is present in the raw HTML. Most AI crawlers do not execute JavaScript |
| llms.txt | 4 | A curated route map for assistants |
| robots.txt | 3 | Present, and declares a sitemap |
| XML sitemap | 3 | Discovery coverage |
| HTTPS | 3 | Several crawlers skip insecure origins |
| Response time | 2 | Live retrieval runs on a tight budget |
| Canonical URLs | 2 | Prevents citation credit splitting |

**Why AI crawler access is weighted highest:** it is binary and total. A blocked crawler reads
nothing, so every other investment on the site returns zero in that assistant. It is also
usually a four-line fix, which makes it the highest-ROI finding the tool produces.

## Machine readability (structure)

| Check | Weight | What it measures |
|---|---|---|
| JSON-LD present | 7 | Assistants parse JSON more reliably than visual layout |
| Entity schema | 6 | `Organization`/`LocalBusiness` with `sameAs` — resolves you as an entity, not a string |
| Question-shaped headings | 5 | Headings that mirror how users actually prompt |
| FAQPage schema | 5 | Pre-chunked Q&A pairs |
| Product/Service/Offer | 4 | Pricing questions are answered from structured data |
| Heading hierarchy | 4 | Engines chunk on heading boundaries |
| Semantic landmarks | 2 | Separates content from chrome |
| Meta descriptions | 2 | Often the first summary read |

On FAQ schema specifically: evidence for it as a *ranking* lever is genuinely mixed — studies
range from a 28–40% lift to neutral-to-slightly-negative. It is weighted here for what is not
in dispute: it produces clean, unambiguous, pre-chunked structure for retrieval.

## Quotability (content)

| Check | Weight | What it measures |
|---|---|---|
| Comparison / "best X" content | 8 | List-shaped pages are the most-cited content type by a wide margin; commercial prompts almost always resolve to one |
| Answer capsule | 7 | A direct, declarative answer in the first 60 words rather than brand throat-clearing |
| On-page Q&A | 6 | Question-form headings with real answers |
| Quotable statistics | 5 | Concrete figures. A number is quotable and checkable; an adjective is not |
| Entity clarity | 5 | Homepage states who, what and where in its opening copy |
| Content depth | 4 | Median page length; thin pages lose retrieval ranking |
| Freshness signals | 4 | Machine-readable dates |

## Trust signals (authority)

| Check | Weight | What it measures |
|---|---|---|
| Third-party profiles | 6 | Links to platforms engines actually retrieve — G2, Capterra, Trustpilot, Reddit, Yelp, LinkedIn, Wikipedia and similar |
| Contact details (NAP) | 4 | Verifiable name, address, phone |
| Named authorship | 3 | Attributable expertise |

---

## Answer visibility

### Prompt generation

Prompts are generated across seven intent classes, each weighted by commercial value:

| Intent | Weight | Example |
|---|---|---|
| Commercial investigation | 1.00 | "What are the best options for X?" |
| Comparison | 0.90 | "A vs B: which is better?" |
| Alternatives | 0.85 | "What are the best alternatives to A?" |
| Local | 0.85 | "Who offers the best X in Austin, TX?" |
| Pricing | 0.70 | "How much does X typically cost?" |
| Problem | 0.60 | "How should I choose a provider for X?" |
| Branded | 0.35 | "What is Acme and what do they do?" |

Branded prompts are the control group: winning your own name proves little, but *losing* it is
a red alert that the engines do not resolve you as an entity at all.

The set is balanced round-robin across intents so a trimmed run keeps coverage rather than
filling up with one class. Operator-supplied prompts are **pinned** and never trimmed.

### Repeat sampling

`--samples n` asks every prompt n times per engine and pools the results. This changes what the
numbers mean:

- **Mention rate becomes a rate**, reported with a 95% margin of error, so a small
  month-over-month move is not mistaken for a real shift.
- **Prompts are classified** as *locked* (named on every ask), *contested* (named on some), or
  *absent* (never named). Contested prompts are surfaced separately because they are the
  cheapest to convert.
- **Gaps and wins collapse to one row per question**, carrying how many of the asks were lost,
  so a consistent loss is distinguishable from an occasional one.

Cost scales linearly, so the default is 1. Anything presented to a paying client should use
at least 3.

### Scoring an answer

```
score = 0.55                        (named at all)
      + 0.30 × 1/(1 + 0.35×(rank-1))  (how early)
      + 0.20 × sentiment              (clamped ±0.5, sentence-scoped)
      + 0.15 if own domain cited
```
clamped to 0–1. An answer that does not name the brand scores 0.

Position matters because being named first is a materially different commercial outcome to
being listed fourth. Sentiment is scored on the sentence containing the mention only — a wider
window bleeds a competitor's praise onto the brand.

**Answer share** is the headline comparative: of all mentions of any tracked brand across all
answers, what proportion were yours.

---

## Deliberate limitations

- **Assistant answers are non-deterministic and personalised.** A single run is a sample. The
  tool stores history and computes deltas because the trend is the signal.
- **Mention detection is lexical.** A brand referred to only obliquely is not counted. Aliases
  in the brand profile mitigate this.
- **Sentiment is heuristic**, based on a lexicon over the containing sentence. It is directional.
- **The crawl samples pages**, up to `--pages`, prioritising the homepage and high-value page
  types. It is not an exhaustive site audit.
- **A blocked crawl produces no readiness score**, by design. Unmeasured is reported as
  unmeasured, never as failing.
