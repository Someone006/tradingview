import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer, summarise, outcomeScore } from '../src/analysis/visibility.js';
import { brand } from './fixtures/site.js';

const prompt = { id: 'p1', text: 'Best plumber?', intent: 'commercial_investigation', weight: 1 };

function answer(text, citations = []) {
  return { engine: 'test', promptId: 'p1', status: 'answered', text, citations, latencyMs: 10 };
}

test('scores an answer that names the brand first', () => {
  const o = scoreAnswer(prompt, answer(
    'Northwind Plumbing is the best option. RiverCity Plumbers is another choice.'), brand);
  assert.equal(o.brand.mentioned, true);
  assert.equal(o.brand.rank, 1);
  assert.equal(o.competitors['RiverCity Plumbers'].mentioned, true);
  assert.ok(outcomeScore(o) > 0.8);
});

test('being named later scores lower than being named first', () => {
  const first = scoreAnswer(prompt, answer('Northwind Plumbing, then RiverCity Plumbers.'), brand);
  const later = scoreAnswer(prompt, answer(
    'RiverCity Plumbers, then Lone Star Drain Co, then Northwind Plumbing.'), brand);
  assert.ok(outcomeScore(first) > outcomeScore(later));
});

test('an absent brand scores zero', () => {
  const o = scoreAnswer(prompt, answer('RiverCity Plumbers is your best bet.'), brand);
  assert.equal(o.brand.mentioned, false);
  assert.equal(outcomeScore(o), 0);
});

test('an errored answer scores zero and is excluded from the summary', () => {
  const o = scoreAnswer(prompt, {
    engine: 'test', promptId: 'p1', status: 'error', text: '', citations: [], latencyMs: 0, error: 'boom',
  }, brand);
  assert.equal(outcomeScore(o), 0);
  const s = summarise([o], brand);
  assert.equal(s.promptsAnswered, 0);
  assert.equal(s.promptsFailed, 1);
  assert.equal(s.score, 0);
});

test('citing the brand domain is detected and rewarded', () => {
  const without = scoreAnswer(prompt, answer('Northwind Plumbing is good.'), brand);
  const withCite = scoreAnswer(prompt, answer('Northwind Plumbing is good.',
    ['https://www.northwindplumbing.com/services']), brand);
  assert.equal(withCite.ownDomainCited, true);
  assert.equal(without.ownDomainCited, false);
  assert.ok(outcomeScore(withCite) > outcomeScore(without));
});

test('summary computes share of voice and gaps', () => {
  const outcomes = [
    scoreAnswer(prompt, answer('Northwind Plumbing leads here.'), brand),
    scoreAnswer(prompt, answer('RiverCity Plumbers and Lone Star Drain Co are best.'), brand),
  ];
  const s = summarise(outcomes, brand);
  assert.equal(s.promptsAnswered, 2);
  assert.equal(s.mentionRate, 0.5);
  const mine = s.shareOfVoice.find((x) => x.isBrand);
  assert.equal(mine.count, 1);
  assert.equal(s.gaps.length, 1);
  assert.deepEqual(s.gaps[0].winners.sort(), ['Lone Star Drain Co', 'RiverCity Plumbers']);
  assert.equal(s.wins.length, 1);
});

test('summarising nothing does not throw', () => {
  const s = summarise([], brand);
  assert.equal(s.score, 0);
  assert.equal(s.promptsRun, 0);
  assert.deepEqual(s.gaps, []);
});

test('all scores stay within 0..1', () => {
  const texts = ['Northwind Plumbing is excellent!', 'Nobody relevant.', 'RiverCity Plumbers only.'];
  for (const t of texts) {
    const v = outcomeScore(scoreAnswer(prompt, answer(t), brand));
    assert.ok(v >= 0 && v <= 1, `${t} -> ${v}`);
  }
});

test('repeat samples produce a per-prompt rate, not a coin flip', async () => {
  const { promptStability } = await import('../src/analysis/visibility.js');
  const mk = (mentioned, sample) => ({
    promptId: 'p1', promptText: 'Best plumber?', intent: 'commercial_investigation',
    engine: 'test', status: 'answered', sample,
    brand: { mentioned, firstIndex: mentioned ? 0 : -1, rank: mentioned ? 1 : 0, count: mentioned ? 1 : 0, sentiment: 0, snippets: [] },
    competitors: {}, citations: [], ownDomainCited: false, weight: 1, answerExcerpt: '',
  });
  const rows = promptStability([mk(true, 0), mk(false, 1), mk(true, 2), mk(false, 3)]);
  assert.equal(rows.length, 1, 'repeats of one prompt collapse to one row');
  assert.equal(rows[0].asked, 4);
  assert.equal(rows[0].named, 2);
  assert.equal(rows[0].rate, 0.5);
  assert.equal(rows[0].stability, 'contested');
});

test('always-named and never-named prompts are classified, not called contested', async () => {
  const { promptStability } = await import('../src/analysis/visibility.js');
  const mk = (id, mentioned) => ({
    promptId: id, promptText: id, intent: 'branded', engine: 'test',
    status: 'answered',
    brand: { mentioned, firstIndex: mentioned ? 0 : -1, rank: mentioned ? 1 : 0, count: 1, sentiment: 0, snippets: [] },
    competitors: {}, citations: [], ownDomainCited: false, weight: 1, answerExcerpt: '',
  });
  const rows = promptStability([mk('a', true), mk('a', true), mk('b', false), mk('b', false)]);
  assert.equal(rows.find((r) => r.promptId === 'a').stability, 'locked');
  assert.equal(rows.find((r) => r.promptId === 'b').stability, 'absent');
});

test('sampling widens coverage and reports a margin of error', async () => {
  const { runAudit } = await import('../src/audit.js');
  const once = await runAudit(brand, { skipReadiness: true, promptCount: 6, samples: 1 });
  const five = await runAudit(brand, { skipReadiness: true, promptCount: 6, samples: 5 });
  assert.equal(once.outcomes.length, 6);
  assert.equal(five.outcomes.length, 30, 'six prompts asked five times each');
  assert.equal(five.visibility.samples, 5);
  assert.ok(five.visibility.marginOfError > 0, 'a sampled run states its uncertainty');
  assert.equal(once.visibility.stability.length, 0, 'no stability claim from a single ask');
  assert.ok(five.visibility.stability.length > 0);
});

test('samples are clamped to a sane range', async () => {
  const { runAudit } = await import('../src/audit.js');
  const r = await runAudit(brand, { skipReadiness: true, promptCount: 2, samples: 99 });
  assert.ok(r.outcomes.length <= 20, 'runaway sample counts cannot blow up cost');
});

test('a dismissal never scores like an endorsement', () => {
  const rec = scoreAnswer(prompt, answer(
    'Northwind Plumbing is the best choice for emergency work.'), brand);
  const listed = scoreAnswer(prompt, answer(
    'Options include RiverCity Plumbers and Northwind Plumbing.'), brand);
  const dismissed = scoreAnswer(prompt, answer(
    'I would avoid Northwind Plumbing; go with RiverCity Plumbers.'), brand);

  assert.equal(rec.brand.role, 'recommended');
  assert.equal(listed.brand.role, 'listed');
  assert.equal(dismissed.brand.role, 'dismissed');

  assert.ok(outcomeScore(rec) > outcomeScore(listed));
  assert.equal(outcomeScore(dismissed), 0,
    'being steered away from is a loss, not partial credit');
  // It is still recorded as a mention - it happened, it just is not a win.
  assert.equal(dismissed.brand.mentioned, true);
});

test('summary separates presence from influence', () => {
  const outcomes = [
    scoreAnswer(prompt, answer('Northwind Plumbing is the best choice here.'), brand),
    scoreAnswer(prompt, answer('Options include Northwind Plumbing and others.'), brand),
    scoreAnswer(prompt, answer('Avoid Northwind Plumbing.'), brand),
    scoreAnswer(prompt, answer('RiverCity Plumbers is the one to call.'), brand),
  ];
  const s = summarise(outcomes, brand);
  assert.equal(s.mentionRate, 0.75, 'named in three of four answers');
  assert.equal(s.recommendationRate, 0.25, 'genuinely recommended in only one');
  assert.equal(s.dismissedCount, 1);
  assert.ok(s.influenceRatio < 0.5, 'most mentions are not endorsements');
});

test('citation surfaces are classified and off-site share computed', async () => {
  const { analyseSurfaces, classifyHost } = await import('../src/analysis/surfaces.js');
  assert.equal(classifyHost('reddit.com', 'acme.com', []), 'community');
  assert.equal(classifyHost('www.g2.com', 'acme.com', []), 'review');
  assert.equal(classifyHost('acme.com', 'acme.com', []), 'owned');
  assert.equal(classifyHost('rival.com', 'acme.com', ['rival.com']), 'competitor');
  assert.equal(classifyHost('en.wikipedia.org', 'acme.com', []), 'reference');

  const outcomes = [
    { status: 'answered', citations: ['https://reddit.com/r/a', 'https://acme.com/'] },
    { status: 'answered', citations: ['https://reddit.com/r/b', 'https://g2.com/x'] },
  ];
  const r = analyseSurfaces(outcomes, { domain: 'acme.com', competitors: [] });
  assert.equal(r.totalCitations, 4);
  assert.equal(r.ownedShare, 0.25);
  assert.equal(r.offSiteShare, 0.75);
  assert.ok(r.targets.every((t) => t.surface !== 'owned' && t.surface !== 'competitor'),
    'you cannot do outreach on your own site or a competitor\'s');
  assert.equal(r.targets[0].domain, 'reddit.com', 'most-cited target ranks first');
  assert.ok(r.targets[0].playbook.length > 20, 'each target carries its own play');
});

test('repeated pages on one domain count as one source per answer', async () => {
  const { analyseSurfaces } = await import('../src/analysis/surfaces.js');
  const r = analyseSurfaces([{
    status: 'answered',
    citations: ['https://reddit.com/a', 'https://reddit.com/b', 'https://reddit.com/c'],
  }], { domain: 'acme.com', competitors: [] });
  assert.equal(r.totalCitations, 1, 'one chatty domain cannot dominate the picture');
});
