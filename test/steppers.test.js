// The setup panel: composition is fixed by table size (read-only counts), live validation, house-rule effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupComposition, seatProblem, houseEffects, planSeats } from '../public/js/steppers.js';
import { roleList, TEAMS, POWERS, POWER_TEXT, MIN_PLAYERS, MAX_PLAYERS } from '../public/js/rules.js';
import { newRoom, reduce } from '../public/js/room.js';

test('counts per table size match TEAMS and the deal; the Boss is one extra Syndicate seat', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const c = setupComposition(n); const list = roleList(n);
    assert.equal(c.ok, true); assert.equal(c.error, '');
    assert.deepEqual(c.rows.map((r) => r.id), ['reformer', 'cabal', 'pretender']);
    for (const r of c.rows) assert.equal(r.count, list.roles.filter((x) => x === r.id).length);
    assert.equal(c.rows.reduce((a, r) => a + r.count, 0), n);
    assert.equal(c.rows[0].count, TEAMS[n][0]); assert.equal(c.rows[1].count, TEAMS[n][1]);
    assert.equal(c.summary, `Set by table size: ${n} players = ${TEAMS[n][0]} Loyalists, ${TEAMS[n][1]} Syndicate, 1 Boss`);
    assert.match(c.reason, /table size/i);
  }
  assert.equal(setupComposition(7).summary, 'Set by table size: 7 players = 4 Loyalists, 2 Syndicate, 1 Boss');
});

test('the powers track is the one for that size', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const c = setupComposition(n);
    assert.equal(c.powers.length, 5);
    c.powers.forEach((p, i) => { assert.equal(p.slot, i + 1); assert.equal(p.power, POWERS[n][i]); assert.equal(p.label, p.power ? POWER_TEXT[p.power][0] : 'No power'); });
  }
});

test('validation: fewer than 5 and more than 10 say why; the plan is clamped so the panel always shows', () => {
  assert.match(seatProblem(4), /1 more player needed/); assert.match(seatProblem(0), /5 more players needed/);
  assert.match(seatProblem(11), /at most 10.*Remove 1/i); assert.equal(seatProblem(5), ''); assert.equal(seatProblem(10), '');
  for (const n of [0, 3, 4, 11, 12]) { const c = setupComposition(n); assert.equal(c.ok, false); assert.ok(c.error); assert.equal(c.n, planSeats(n)); }
  assert.match(setupComposition(3).summary, /a table of 5/);
});

test('live: the counts follow seats joining and leaving, and agree with what Start accepts', () => {
  const room = newRoom('ABCDEF', 'hk'); const ids = [];
  const seated = () => room.players.filter((p) => !p.watch).length;
  for (let i = 0; i < 12; i++) {
    const r = reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined });
    if (r.ok) ids.push(r.data.playerId);
    const c = setupComposition(seated());
    assert.equal(c.ok, seated() >= 5 && seated() <= 10);
  }
  assert.equal(seated(), 10, 'the table stops at 10'); assert.equal(setupComposition(seated()).rows[0].count, 6);
  reduce(room, { playerId: ids[0] }, { type: 'kick', id: ids[9] });
  assert.equal(setupComposition(seated()).summary, 'Set by table size: 9 players = 5 Loyalists, 3 Syndicate, 1 Boss');
  for (const id of ids.slice(4, 9)) reduce(room, { playerId: ids[0] }, { type: 'kick', id });
  assert.equal(setupComposition(seated()).ok, false);
  assert.ok(reduce(room, { playerId: ids[0] }, { type: 'start' }).error, 'the server refuses at 5-1');
  reduce(room, {}, { type: 'join', name: 'Back' });
  assert.ok(reduce(room, { playerId: ids[0] }, { type: 'start' }).ok);
});

test('house switches carry a one-line effect that follows the table size', () => {
  const eff = (n, h = {}) => Object.fromEntries(houseEffects(n, h).map((e) => [e.key, e]));
  assert.deepEqual(houseEffects(7).map((e) => e.key), ['rebalance', 'exile']);
  assert.match(eff(6).rebalance.effect, /1 Decree starts on the board/);
  assert.match(eff(7).rebalance.effect, /1 Decree is left out/);
  assert.match(eff(9).rebalance.effect, /2 Decrees are left out/);
  for (const n of [5, 8, 10]) assert.match(eff(n).rebalance.effect, /No change/);
  assert.equal(eff(7, { rebalance: true, exile: false }).rebalance.on, true); assert.equal(eff(7, { exile: true }).exile.on, true);
  for (const e of houseEffects(8)) assert.ok(e.effect && !/\n/.test(e.effect));
});
