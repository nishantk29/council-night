import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, POWERS, roleList, startingDeck, knowledgeFor, eligibleChancellors, electionPasses, partyOf } from '../public/js/rules.js';
import { roleCards } from '../public/js/cards.js';

test('team sizes for every table: 5 to 10, Syndicate always a minority with the Boss', () => {
  const want = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [5, 4], 10: [6, 4] };
  for (let n = 5; n <= 10; n++) {
    const l = roleList(n).roles; assert.equal(l.length, n);
    assert.equal(l.filter((r) => r === 'reformer').length, want[n][0]);
    assert.equal(l.filter((r) => r !== 'reformer').length, want[n][1]);
    assert.equal(l.filter((r) => r === 'pretender').length, 1);
  }
  assert.ok(roleList(4).error); assert.ok(roleList(11).error);
});

test('the powers table matches the three classic boards', () => {
  for (const n of [5, 6]) assert.deepEqual(POWERS[n], [null, null, 'peek', 'execute', 'execute']);
  for (const n of [7, 8]) assert.deepEqual(POWERS[n], [null, 'investigate', 'special', 'execute', 'execute']);
  for (const n of [9, 10]) assert.deepEqual(POWERS[n], ['investigate', 'investigate', 'special', 'execute', 'execute']);
});

test('deck: 6 Reforms and 11 Decrees; the rebalanced variant only when switched on', () => {
  for (let n = 5; n <= 10; n++) { const d = startingDeck(n, false); assert.equal(d.deck.length, 17); assert.equal(d.deck.filter((x) => x === 'R').length, 6); assert.equal(d.decree, 0); }
  assert.equal(startingDeck(6, true).decree, 1); assert.equal(startingDeck(6, true).deck.length, 16);
  assert.equal(startingDeck(7, true).deck.filter((x) => x === 'D').length, 10);
  assert.equal(startingDeck(9, true).deck.filter((x) => x === 'D').length, 9);
  assert.equal(startingDeck(8, true).deck.length, 17);
});

test('who knows whom: Syndicate see each other and the Boss; the Boss sees the Syndicate only at 5-6', () => {
  for (let n = 5; n <= 10; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`); const roles = {};
    roleList(n).roles.forEach((r, i) => { roles[ids[i]] = r; });
    for (const id of ids) {
      const k = knowledgeFor(id, roles, n);
      if (roles[id] === 'reformer') assert.equal(k.length, 0);
      if (roles[id] === 'cabal') assert.equal(k.length, TEAMS[n][1]);
      if (roles[id] === 'pretender') assert.equal(k.length, n <= 6 ? TEAMS[n][1] : 0);
      for (const x of k) assert.notEqual(roles[x.id], 'reformer');
    }
  }
  assert.equal(partyOf('pretender'), 'cabal');
});

test('term limits: last Chancellor always barred; last Speaker barred only with more than five alive', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f']; const last = { speaker: 'b', chancellor: 'c' };
  assert.deepEqual(eligibleChancellors('a', six, last, six), ['d', 'e', 'f']);
  const five = six.slice(0, 5);
  assert.deepEqual(eligibleChancellors('a', five, last, five), ['b', 'd', 'e']);
  assert.deepEqual(eligibleChancellors('a', six, null, six), ['b', 'c', 'd', 'e', 'f']);
});

test('elections need a strict majority; a tie fails', () => {
  assert.ok(electionPasses(4, 7)); assert.ok(!electionPasses(3, 6)); assert.ok(electionPasses(4, 6));
});

test('card guide: no card twice, colour = side, policy pile matches the deck', () => {
  for (let n = 5; n <= 10; n++) for (const rb of [false, true]) {
    const c = roleCards(n, rb); const all = [...c.roles.map((x) => x.card), ...c.party, ...c.reform, ...c.decree];
    assert.equal(new Set(all).size, all.length);
    assert.equal(c.roles.length, n); assert.equal(c.party.length, n);
    for (const r of c.roles) assert.equal(/♥/.test(r.card), r.role === 'reformer');
    const d = startingDeck(n, rb); assert.equal(c.reform.length + c.decree.length, d.deck.length);
  }
});
