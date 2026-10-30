import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForPlayer, viewForScreen } from '../public/js/room.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const must = (r) => { assert.ok(r.ok, r.error); return r; };
import { act, logged, undo } from './kit/logged.mjs';
function lobby(n, { house = {}, mode, phoneless = 0, seed = 1 } = {}) {
  const rng = seeded(seed); const room = newRoom('ABCDEF', 'hk'); const ids = [];
  for (let i = 0; i < n - phoneless; i++) ids.push(must(reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined }, rng)).data.playerId);
  const host = ids[0];
  if (mode) must(act(room, host, { type: 'mode', mode }));
  for (let i = 0; i < phoneless; i++) { must(act(room, host, { type: 'addSeat', name: `Card${i}` })); ids.push(room.players.at(-1).id); }
  if (Object.keys(house).length) must(act(room, host, { type: 'house', house }));
  return { room, ids, host, rng };
}
function started(n, opts = {}) {
  const t = lobby(n, opts);
  must(act(t.room, t.host, { type: 'start' }, t.rng));
  if (t.room.phase === 'reveal') must(act(t.room, t.host, { type: 'skipReveal' }));
  return t;
}

test('hybrid: phoneless seats are refused while any piece is in the app', () => {
  const t = lobby(5, { mode: { play: 'hybrid', roles: 'physical', votes: 'app', cards: 'physical' }, phoneless: 1 });
  assert.match(act(t.room, t.host, { type: 'start' }, t.rng).error, /no phone/);
  must(act(t.room, t.host, { type: 'mode', mode: { play: 'hybrid', votes: 'physical' } }));
  must(act(t.room, t.host, { type: 'start' }, t.rng));
});

test('host tools: skip, pause, undo, nudge, open a seat and take it over, hand off', () => {
  const t = logged(started(5));
  const g = () => t.room.game;
  const sp = g().speaker; const ch = t.ids.find((id) => id !== sp);
  must(act(t.room, sp, { type: 'nominate', id: ch }));
  must(act(t.room, t.host, { type: 'pause' }, null, 1000));
  assert.match(act(t.room, t.ids[1], { type: 'vote', aye: true }).error, /paused/);
  must(act(t.room, t.host, { type: 'resume' }));
  for (const id of t.ids.slice(0, 4)) must(act(t.room, id, { type: 'vote', aye: true }));
  const last = t.ids[4];
  must(act(t.room, t.host, { type: 'skip', id: last }));
  assert.ok(g().lastVote.nays.includes(last), 'a skipped vote is a nay');
  assert.ok(['legislate', 'over'].includes(t.room.phase));
  must(undo(t)); // on the event log
  assert.equal(t.room.phase, 'vote', 'undo goes back one step');
  assert.ok(!t.room.log.some((m) => /skipped/.test(m.text)), 'the room is as it was before the skip, its log line too');
  must(act(t.room, t.host, { type: 'nudge', id: last }));
  assert.equal(viewForPlayer(t.room, last).me.nudged, 1);
  const before = g().roles[t.ids[3]];
  must(act(t.room, t.host, { type: 'kick', id: t.ids[3] }));
  const r = must(reduce(t.room, {}, { type: 'join', name: 'Newcomer' }, t.rng));
  assert.equal(r.data.playerId, t.ids[3], 'takes over the same seat');
  assert.equal(viewForPlayer(t.room, t.ids[3]).me.role.id, before);
  must(act(t.room, t.host, { type: 'handoff', id: t.ids[1] }));
  assert.ok(t.room.players.find((p) => p.id === t.ids[1]).host);
  assert.ok(act(t.room, t.host, { type: 'pause' }).error);
});

test('chat, claims, no-claims mode, mute and moderation', () => {
  const t = started(5, { house: { noClaims: false } });
  must(act(t.room, t.ids[1], { type: 'chat', text: 'hello <b>there</b>' }));
  must(act(t.room, t.ids[1], { type: 'claim', text: 'I passed a Reform' }));
  const v = viewForPlayer(t.room, t.ids[2]);
  assert.ok(v.log.some((m) => m.kind === 'claim' && m.by === 'P1'));
  const n = t.room.log.find((m) => m.kind === 'chat').n;
  must(act(t.room, t.host, { type: 'hideMsg', n }));
  assert.equal(viewForPlayer(t.room, t.ids[2]).log.find((m) => m.n === n).text, '(removed by the host)');
  must(act(t.room, t.host, { type: 'mute', id: t.ids[1] }));
  assert.ok(act(t.room, t.ids[1], { type: 'chat', text: 'x' }).error);
  const t2 = started(5, { house: { noClaims: true } });
  assert.ok(act(t2.room, t2.ids[1], { type: 'claim', text: 'x' }).error);
});

test('Table Tools: coin, dice, picker and tallies are logged for all; timers pause', () => {
  const t = started(5);
  must(act(t.room, t.ids[2], { type: 'coin' }, t.rng));
  must(act(t.room, t.ids[2], { type: 'dice', count: 3, sides: 20 }, t.rng));
  must(act(t.room, t.ids[2], { type: 'pickPlayer' }, t.rng));
  const tools = t.room.log.filter((m) => m.kind === 'tool').map((m) => m.text).join('\n');
  assert.match(tools, /coin: (Heads|Tails)/); assert.match(tools, /3d20: \d+, \d+, \d+ \(total \d+\)/); assert.match(tools, /random player: P\d/);
  assert.ok(act(t.room, t.ids[2], { type: 'timer', secs: 60 }).error, 'only the host runs shared timers');
  must(act(t.room, t.host, { type: 'timer', secs: 60 }, t.rng, 1000));
  must(act(t.room, t.host, { type: 'pause' }, t.rng, 21000));
  assert.equal(t.room.timer.left, 40000);
  must(act(t.room, t.host, { type: 'resume' }, t.rng, 99000));
  assert.equal(t.room.timer.endsAt, 139000);
  must(act(t.room, t.host, { type: 'talk', secs: 30 }, t.rng, 0));
  must(act(t.room, t.room.talk.order[0], { type: 'talkNext' }, t.rng, 0));
  assert.equal(t.room.talk.i, 1);
  must(act(t.room, t.host, { type: 'poll', q: 'Who?', players: true }));
  must(act(t.room, t.ids[1], { type: 'pollVote', i: 0 })); must(act(t.room, t.ids[2], { type: 'pollVote', i: 1 }));
  must(act(t.room, t.host, { type: 'pollClose', tiebreak: true }, t.rng));
  assert.match(t.room.log.at(-1).text, /Tie broken at random/);
  must(act(t.room, t.host, { type: 'counter', op: 'add', label: 'Round' }));
  must(act(t.room, t.host, { type: 'counter', op: 'inc', id: t.room.counters[0].id }));
  assert.equal(t.room.counters[0].value, 1);
});

test('house rules: phase timer starts on each phase', () => {
  const t = started(5, { house: { turnTimer: 60 } });
  assert.ok(t.room.timer?.auto);
});

test('storyteller sits out: not dealt, sees the whole deal; players and the screen never do', () => {
  const t = started(6, { house: { sitOut: true } });
  assert.equal(t.room.game.n, 5);
  assert.equal(t.room.game.roles[t.host], undefined);
  assert.equal(Object.keys(viewForPlayer(t.room, t.host).moderator.roles).length, 5);
  assert.equal(viewForPlayer(t.room, t.ids[1]).moderator, undefined);
  assert.equal(viewForScreen(t.room).moderator, undefined);
});

test('secrecy: no view carries a token, the host key or the full deal', () => {
  for (const n of [5, 7, 10]) {
    const t = started(n);
    for (const id of t.ids) assert.ok(!/token|hostKey|"roles":\{/.test(JSON.stringify(viewForPlayer(t.room, id))));
    assert.ok(!/token|hostKey|"role":|"sees"|"roles":\{/.test(JSON.stringify(viewForScreen(t.room))));
  }
});

test('a late joiner watches without a card', () => {
  const t = started(5);
  const r = must(reduce(t.room, {}, { type: 'join', name: 'Late' }, t.rng));
  const v = viewForPlayer(t.room, r.data.playerId);
  assert.equal(v.me.watch, true); assert.equal(v.me.role, undefined);
  assert.equal(t.room.game.n, 5);
});
