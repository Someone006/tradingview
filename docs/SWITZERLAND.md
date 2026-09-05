# Running CiteBeam as a Swiss business

Engineering notes on the Swiss rules that touch this product. **Not legal advice** — confirm
anything material with a Swiss lawyer. Sources are named so you can check them yourself.

---

## 1. Outreach: UWG Art. 3(1)(o)

Mass advertising by telecommunications — email included — requires the recipient's **prior
consent**. This is opt-in, it covers B2B, and Art. 23 UWG makes a breach punishable by up to
three years' custody or a monetary penalty.

| Channel | Allowed cold? |
|---|---|
| Bulk email | **No.** Prior consent required |
| Email to an existing customer about similar services | Yes, with a refusal option every time |
| B2B phone call | Yes, on presumed consent — unless the number carries a directory asterisk |
| LinkedIn / platform DM | Generally yes, within platform rules |
| Inbound form with unticked consent box | Yes |

Keep a consent log: who, when, which channel, what for.

## 2. Data protection: revFADP / revDSG (in force 1 Sept 2023)

CiteBeam stores audit runs, and those can contain personal data — a sole trader's business
name is their name, crawled pages carry contact details, and assistant answers can name people.

What the Act requires of you as controller, and what the tool provides:

| Obligation | Where |
|---|---|
| Inform people before collecting (Art. 19) | Your privacy notice — `citebeam privacy register` drafts the facts |
| Keep data only as long as needed (Art. 6) | `citebeam privacy purge --days 730 --confirm` |
| Right of access (Art. 25) | `citebeam privacy export <domain> --out file.json` |
| Right to erasure (Art. 32) | `citebeam privacy erase <domain> --confirm` |
| Records of processing | `citebeam privacy register` |

Set `CITEBEAM_CONTROLLER` and `CITEBEAM_DPO_CONTACT` so the register names your entity.

Note the difference from the GDPR: the FADP is **opt-out** for general processing — inform
people and let them object, rather than collecting consent for everything. Marketing email is
the exception, and that exception comes from the UWG, not the FADP.

**Cross-border.** AI provider APIs generally run outside Switzerland. Only prompt text (brand
name, category) is sent to them — never crawled page content — but confirm your provider's
terms and transfer mechanism before processing client data. If your clients are in the EU,
the GDPR applies on top of all of this.

## 3. Crawling

CiteBeam honours `robots.txt` for its own fetches and identifies itself as `CiteBeam`. A site
that disallows crawling is reported as *not crawled*, never scored as failing. `--ignore-robots`
exists for sites you own or have written permission to audit; using it against a third party
removes the main evidence that you acted reasonably.

Rate limiting is on by default via bounded concurrency, and only public pages are fetched — no
authentication is bypassed.

## 4. Website obligations

- **Impressum** (Art. 3(1)(s) UWG): legal name, street address (not a P.O. box), email, and
  commercial-register / VAT numbers where applicable, reachable in about two clicks.
- **Price indication** (PBV/OIP): to consumers, show the actual price payable including VAT.
  B2B quotes usually show net plus VAT — either is fine, ambiguity is not.
- **VAT (MWST/TVA)**: standard rate **8.1%**. Registration is mandatory above **CHF 100,000**
  annual turnover. (An increase to 8.8% was discussed for 2026 and has been deferred — check
  the current rate before quoting.)

## 5. Claims you make about the service

Art. 3(1)(b) UWG makes inaccurate or misleading statements about your own services unfair
competition. Since AI answers are non-deterministic and personalised, **do not promise
rankings, placements or traffic**. Sell the measurement, the diagnosis and the remediation.
The report's own methodology section states these limits — leave that in.
