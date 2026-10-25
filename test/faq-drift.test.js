import test from 'node:test';
import assert from 'node:assert/strict';
import { FAQ, FAQ_COVERS, FAQ_GAME } from '../public/js/faq.js';
import { ROLES, HOUSE_DEFAULTS } from '../public/js/rules.js';
import { COMMON_HOUSE } from '../public/js/table.js';

const text = FAQ.flatMap(([, qs]) => qs.map(([q, a]) => `${q} ${a}`)).join(' ').replace(/<[^>]+>/g, ' ');
const sorted = (a) => [...a].sort();

test('FAQ names every role, house rule and play mode the game has', () => {
  for (const k of Object.keys(FAQ_GAME)) assert.deepEqual(sorted(FAQ_COVERS[k]), sorted(FAQ_GAME[k]), `FAQ ${k} drifted from the game`);
});

test('the FAQ_GAME list matches the game data', () => {
  assert.deepEqual(sorted(FAQ_GAME.roles), sorted(Object.values(ROLES).map((r) => r.name)));
  // every house setting the game knows (rules.js and the shared table layer) has a rule in FAQ_GAME: 2 + 6 keys, 8 named rules
  assert.equal(Object.keys(HOUSE_DEFAULTS).length + Object.keys(COMMON_HOUSE).length, FAQ_GAME.houseRules.length, 'a house setting was added or removed: update the FAQ');
});

test('every role has its own entry in the Roles sections, grouped by side', () => {
  const names = FAQ.filter(([g]) => g.startsWith('Roles: ')).flatMap(([, qs]) => qs.map(([q]) => q));
  assert.deepEqual(sorted(names), sorted(Object.values(ROLES).map((r) => r.name)));
});

test('no filename-style link text and no stale game names in the FAQ', () => {
  assert.ok(!/>[^<]*\.html[^<]*</.test(FAQ.map(([, qs]) => qs.map(([, a]) => a).join('')).join('')), 'link text shows a file name');
  assert.ok(!/Council Night/.test(text));
});
