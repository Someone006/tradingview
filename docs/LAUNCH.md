# Launch checklist

From a fresh clone to an invoice. Follow it in order; nothing here is optional
except where marked.

---

## Part 1 — Set up once (about 20 minutes)

### 1. Install and verify

```bash
git clone <your-repo> citebeam && cd citebeam
node bin/citebeam.js doctor
```

`doctor` tells you whether this machine can produce a report right now. Every line must
read `ok` before a paying client is involved. Two `warn` lines are acceptable at this
stage — no API keys, and no controller set — and Part 2 fixes both.

### 2. Name yourself as data controller

Required before you process any client data under the revFADP.

```bash
cp .env.example .env
```

Then in `.env`:

```bash
CITEBEAM_CONTROLLER="Your Company GmbH, Bahnhofstrasse 1, 8001 Zurich"
CITEBEAM_DPO_CONTACT=datenschutz@your-company.ch
CITEBEAM_RETENTION_DAYS=730
```

### 3. Optional: add an API key

Without one, the **site audit runs in full** and answer measurement is simulated and
labelled as such. That is enough to sell the Kurzanalyse tier. Add a key when you sell
your first Vollanalyse:

```bash
OPENAI_API_KEY=sk-...
```

Re-run `node bin/citebeam.js doctor` — the provider line should now show your key.

### 4. Publish your sales page

Take the artifact, fill in every ochre `[placeholder]` in the Impressum and
Datenschutzerklärung, and have a Swiss lawyer read the privacy text once. Do not publish
with placeholders visible.

---

## Part 2 — Per client (about 15 minutes of your time)

### Step 1 — You: write the brand profile

The only real input the system needs. Two minutes.

```bash
node bin/citebeam.js init --out clients/bergmann.json
```

Then edit it:

```json
{
  "name": "Bergmann Sanitär",
  "domain": "bergmann-sanitaer.ch",
  "location": "Zürich",
  "languages": ["de", "fr"],
  "category": {
    "de": "Notfall-Sanitärdienst",
    "fr": "service de plomberie d'urgence"
  },
  "competitors": [
    { "name": "AquaFix Zürich", "domain": "aquafix.ch" },
    { "name": "Rohr Profi", "domain": "rohrprofi.ch" }
  ],
  "branding": { "agencyName": "Ihre Agentur", "accent": "#0b6e77" }
}
```

**The `category` wording decides the quality of the whole audit.** Write what the customer
would type, not what the company calls itself. "Notfall-Sanitärdienst" is right;
"ganzheitliche Gebäudetechniklösungen" produces prompts nobody asks.

### Step 2 — The system: measure

```bash
node bin/citebeam.js audit --brand clients/bergmann.json --samples 3
```

For a free prospecting audit, add `--no-visibility` — no API keys, no cost:

```bash
node bin/citebeam.js audit --brand clients/bergmann.json --no-visibility
```

What runs, without you touching anything:

| Stage | What happens |
|---|---|
| Crawl | Reads robots.txt, honours it, fetches up to 12 pages the way an AI crawler does — no JavaScript |
| Checks | Scores 26 signals across crawlability, machine readability, quotability, trust |
| Prompts | Generates buyer questions per language across seven intent classes |
| Query | Asks each question of every configured engine, `--samples` times |
| Classify | Marks each mention recommended / listed / referenced / dismissed |
| Surfaces | Classifies every cited source and computes how much you don't control |
| Recommend | Maps findings to sequenced fixes with copy-paste code |
| Write | Emits HTML, Markdown, JSON and CSV, and records the run for next month's delta |

Roughly 10–60 seconds. Reports land in `audits/`.

### Step 3 — You: read it before the client does

Ten minutes. Open the HTML and check three things:

1. **Is the crawl real?** If the banner says the site could not be crawled, that *is* the
   finding — lead with it, don't send a report full of "not measured".
2. **Does the simulated banner appear?** If so you have no API keys. Never present that
   section as real data.
3. **Add two sentences of context per critical finding.** The tool knows the site; you know
   the client. This is the part they are paying for.

### Step 4 — You: deliver

Send the HTML (or print to PDF), book thirty minutes, walk through the action plan. Close
on implementation or monthly monitoring.

### Step 5 — The system: track over time

```bash
node bin/citebeam.js history bergmann-sanitaer.ch
```

Every subsequent audit computes a delta against the previous run automatically. That delta
is what justifies the monitoring invoice.

Automate it:

```cron
0 9 1 * * cd /srv/citebeam && node bin/citebeam.js audit --brand clients/bergmann.json --samples 3 --quiet
```

---

## Part 3 — Ongoing obligations

```bash
node bin/citebeam.js privacy purge --days 730 --confirm   # monthly or quarterly
node bin/citebeam.js privacy export <domain> --out x.json # on an access request
node bin/citebeam.js privacy erase <domain> --confirm     # on an erasure request
```

Keep your consent log current. See [SWITZERLAND.md](SWITZERLAND.md).

---

## The honest division of labour

**The system does:** crawling, scoring, prompt generation, querying, classification, surface
analysis, prioritisation, report writing, history and deltas, retention and data-subject
mechanics.

**You do:** write the category wording, review the report, add client context, make the call,
present the findings, and win the work. No software does the selling.

---

## Before your first paid audit

- [ ] `doctor` shows no blocking issues
- [ ] `CITEBEAM_CONTROLLER` set
- [ ] Sales page published with real Impressum and privacy text
- [ ] You ran an audit on **your own** website first and read the whole report
- [ ] You can explain the composite score, answer share, and one critical finding out loud
- [ ] Consent log exists, even if it is one spreadsheet
- [ ] You know which tier you are selling and what it costs
