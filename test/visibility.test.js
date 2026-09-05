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
