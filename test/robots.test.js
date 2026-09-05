import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed, auditAiAccess, pathMatches } from '../src/crawler/robots.js';

test('parses grouped user-agent blocks', () => {
  const groups = parseRobots('User-agent: A\nUser-agent: B\nDisallow: /x\n\nUser-agent: C\nAllow: /');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].agents, ['a', 'b']);
  assert.equal(groups[0].rules.length, 1);
});

test('an explicit block beats the wildcard group', () => {
  const g = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /');
  assert.equal(isAllowed(g, 'GPTBot', '/'), false);
  assert.equal(isAllowed(g, 'ClaudeBot', '/'), true);
});

test('the longest matching rule wins, ties go to allow', () => {
  const g = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public');
  assert.equal(isAllowed(g, 'X', '/private/secret'), false);
  assert.equal(isAllowed(g, 'X', '/private/public/page'), true);
});

test('an empty Disallow means allow everything', () => {
  const g = parseRobots('User-agent: *\nDisallow:');
  assert.equal(isAllowed(g, 'X', '/anything'), true);
});

test('comments and blank lines are ignored', () => {
  const g = parseRobots('# a comment\n\nUser-agent: *   # trailing\nDisallow: /x\n');
  assert.equal(isAllowed(g, 'X', '/x'), false);
});

test('wildcards and end anchors work', () => {
  assert.equal(pathMatches('/*.pdf$', '/docs/a.pdf'), true);
  assert.equal(pathMatches('/*.pdf$', '/docs/a.pdf?x=1'), false);
  assert.equal(pathMatches('/a/*/c', '/a/b/c'), true);
  assert.equal(pathMatches('/', '/anything'), true);
});

test('no robots.txt means everything is allowed', () => {
  for (const bot of auditAiAccess(null)) assert.equal(bot.allowed, true);
});

test('the access audit reports every tracked crawler', () => {
  const rows = auditAiAccess('User-agent: *\nAllow: /');
  assert.ok(rows.length >= 10);
  assert.ok(rows.some((r) => r.ua === 'GPTBot' && r.critical));
  assert.ok(rows.every((r) => typeof r.allowed === 'boolean'));
});
