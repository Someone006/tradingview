import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, scoreReadiness } from '../src/crawler/checks.js';
import { goodSite, badSite, brand } from './fixtures/site.js';

test('a well-built site scores highly', () => {
  const checks = runChecks(goodSite(), brand);
  const s = scoreReadiness(checks);
  assert.ok(s.overall > 0.8, `expected > 0.8, got ${s.overall}`);
  assert.equal(s.counts.total, checks.length);
  assert.ok(s.counts.pass > s.counts.fail);
});

test('a broken site scores badly', () => {
  const checks = runChecks(badSite(), brand);
  const s = scoreReadiness(checks);
  assert.ok(s.overall < 0.25, `expected < 0.25, got ${s.overall}`);
  assert.ok(s.counts.fail > 15);
});

test('every check returns a well-formed result', () => {
  for (const site of [goodSite(), badSite()]) {
    for (const c of runChecks(site, brand)) {
      assert.ok(c.id, 'check has an id');
      assert.ok(c.title, `check ${c.id} has a title`);
      assert.ok(['technical', 'structure', 'content', 'authority'].includes(c.pillar), `${c.id} pillar`);
      assert.ok(c.score >= 0 && c.score <= 1, `${c.id} score in range, got ${c.score}`);
      assert.ok(['pass', 'warn', 'fail', 'info'].includes(c.status), `${c.id} status`);
      assert.ok(typeof c.detail === 'string' && c.detail.length > 0, `${c.id} detail`);
      assert.ok(c.weight > 0, `${c.id} weight`);
    }
  }
});

test('blocked AI crawlers are detected and drive the score down', () => {
  const checks = runChecks(badSite(), brand);
  const access = checks.find((c) => c.id === 'ai-crawler-access');
  assert.equal(access.status, 'fail');
  assert.ok(access.score < 0.5);
  assert.equal(access.fixId, 'unblock-ai-crawlers');
});

test('pillar scores stay within range and cover all pillars', () => {
  const s = scoreReadiness(runChecks(goodSite(), brand));
  for (const [k, v] of Object.entries(s.pillars)) {
    assert.ok(v >= 0 && v <= 1, `${k} = ${v}`);
  }
  assert.deepEqual(Object.keys(s.pillars).sort(),
    ['authority', 'content', 'structure', 'technical']);
});

test('scoring an empty check list does not throw', () => {
  const s = scoreReadiness([]);
  assert.equal(s.overall, 0);
  assert.equal(s.counts.total, 0);
});
