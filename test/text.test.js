import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMentions, rankEntities, extractUrls, nameVariants, isAnswerCapsule, sentenceAt, classifyRole } from '../src/util/text.js';

const acme = { name: 'Acme Plumbing', domain: 'acmeplumbing.com' };

test('finds a brand by name, domain and first word', () => {
  assert.equal(findMentions('Try Acme Plumbing today.', acme).mentioned, true);
  assert.equal(findMentions('See acmeplumbing.com', acme).mentioned, true);
  assert.equal(findMentions('Acme is great', acme).mentioned, true);
});

test('does not match inside a longer word', () => {
  assert.equal(findMentions('Acmex Corp is unrelated', acme).mentioned, false);
  assert.equal(findMentions('notacmeplumbing.com', acme).mentioned, false);
});

test('rank follows order of first appearance', () => {
  const text = 'First up is Beta Co, then Acme Plumbing, and finally Gamma Ltd.';
  const r = {
    acme: findMentions(text, acme),
    beta: findMentions(text, { name: 'Beta Co' }),
    gamma: findMentions(text, { name: 'Gamma Ltd' }),
  };
  rankEntities(r);
  assert.equal(r.beta.rank, 1);
  assert.equal(r.acme.rank, 2);
  assert.equal(r.gamma.rank, 3);
});

test('absent entities get rank 0 and firstIndex -1', () => {
  const m = findMentions('Nothing relevant here.', acme);
  assert.equal(m.mentioned, false);
  assert.equal(m.rank, 0);
  assert.equal(m.firstIndex, -1);
  assert.equal(m.count, 0);
});

test('sentiment is scoped to the containing sentence', () => {
  const text = 'Acme Plumbing is excellent and highly recommended. Beta Co is unreliable and poor.';
  assert.ok(findMentions(text, acme).sentiment > 0);
  assert.ok(findMentions(text, { name: 'Beta Co' }).sentiment < 0);
});

test('overlapping variants are counted once', () => {
  // "Acme Plumbing" also matches the variant "Acme"; that is one mention.
  assert.equal(findMentions('Acme Plumbing rocks.', acme).count, 1);
});

test('generic first words are not used as variants', () => {
  assert.ok(!nameVariants({ name: 'The Best Company' }).includes('The'));
});

test('extracts markdown and bare URLs, dropping trailing punctuation', () => {
  const urls = extractUrls('See [docs](https://a.com/x) and https://b.com/y, plus https://c.com.');
  assert.ok(urls.includes('https://a.com/x'));
  assert.ok(urls.includes('https://b.com/y'));
  assert.ok(urls.includes('https://c.com/'));
});

test('answer capsules are distinguished from brand throat-clearing', () => {
  assert.equal(isAnswerCapsule('Welcome to our website, where we have proudly served customers for years and years.'), false);
  assert.equal(isAnswerCapsule('A burst pipe should be shut off at the main within ten minutes to limit water damage.'), true);
  assert.equal(isAnswerCapsule('Too short.'), false);
});

test('sentenceAt returns the enclosing sentence', () => {
  const body = 'One thing here. Two things there. Three at the end.';
  assert.equal(sentenceAt(body, body.indexOf('Two')), 'Two things there.');
});

test('a period inside a token does not end the sentence', () => {
  // `/\s|$/` matches any single character, so an earlier version split
  // "Node.js", decimals and abbreviations mid-sentence, which silently
  // truncated the text the role classifier and sentiment scorer read.
  const a = 'Node.js is the best choice for most teams. Deno is newer.';
  assert.equal(sentenceAt(a, a.indexOf('Node')), 'Node.js is the best choice for most teams.');

  const b = 'It costs 4.5 percent of revenue. That is fair.';
  assert.equal(sentenceAt(b, 0), 'It costs 4.5 percent of revenue.');

  const c = 'Ends without punctuation';
  assert.equal(sentenceAt(c, 0), 'Ends without punctuation');
});

test('a dotted brand name is still classified from its full sentence', () => {
  const m = findMentions('Node.js is the best choice for most teams.',
    { name: 'Node.js', domain: 'nodejs.org' });
  assert.equal(m.role, 'recommended');
});
