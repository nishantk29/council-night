// Host Restart: same table, fresh deal, straight into the reveal. And the rulesVersion pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForPlayer, viewForScreen, LATEST_RULES_VERSION, rulesVersion } from '../public/js/room.js';
import { TEAMS, roleList } from '../public/js/rules.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function table(n = 7, house = {}, seed = 3) {
  const rng = seeded(seed);
  const room = newRoom('ABCDEF', 'hk');
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined }, rng).data.playerId);
  if (Object.keys(house).length) assert.ok(reduce(room, { playerId: ids[0] }, { type: 'house', house }).ok);
  assert.ok(reduce(room, { playerId: ids[0] }, { type: 'start' }, rng).ok);
  return { room, ids, rng };
}
const act = (room, id, msg, rng) => reduce(room, { playerId: id }, msg, rng);

test('newRoom is on the latest rules; a room without rulesVersion is version 1 and is not backfilled', () => {
  assert.equal(LATEST_RULES_VERSION, 2);
  const room = newRoom('ABCDEF', 'hk');
  assert.equal(room.rulesVersion, LATEST_RULES_VERSION);
  const old = JSON.parse(JSON.stringify(room)); delete old.rulesVersion; delete old.gameNo;
  assert.equal(rulesVersion(old), 1);
  for (const p of ['a', 'b', 'c', 'd', 'e']) reduce(old, {}, { type: 'join', name: p, hostKey: p === 'a' ? 'hk' : undefined });
  assert.equal(old.rulesVersion, undefined, 'joining never backfills');
});

test('restart keeps code, players, house, mode and host; new deal, reveal phase, gameNo + 1', () => {
  const { room, ids } = table(7, { exile: true, rebalance: true });
  act(room, ids[0], { type: 'anim', on: false });
  for (const id of ids) act(room, id, { type: 'ready' });
  assert.equal(room.phase, 'nominate');
  act(room, ids[1], { type: 'chat', text: 'hello' });
  const keep = () => JSON.stringify({ code: room.code, hostKey: room.hostKey, settings: room.settings, house: room.house, mode: room.mode, anim: room.anim, players: room.players });
  const before = keep(); const no = room.gameNo; const dealt = JSON.stringify(room.game.roles);
  let moved = false;
  for (let seed = 1; seed < 30 && !moved; seed++) { // a fresh shuffle: some seed gives a different deal
    const r = act(room, ids[0], { type: 'restart' }, seeded(seed));
    assert.ok(r.ok, r.error);
    moved = JSON.stringify(room.game.roles) !== dealt;
  }
  assert.ok(moved, 'roles are re-dealt');
  assert.equal(room.phase, 'reveal');
  assert.equal(keep(), before);
  assert.ok(room.gameNo > no);
  assert.deepEqual(Object.values(room.game.roles).sort(), roleList(7).roles.slice().sort());
  assert.equal(room.game.speaker, room.game.order[room.game.rot]);
});

test('restart clears chat, log, board, deck, tracker, votes, powers, investigations, veto state, undo, timers, pause, poll', () => {
  const { room, ids, rng } = table(7);
  for (const id of ids) act(room, id, { type: 'ready' });
  act(room, ids[2], { type: 'chat', text: 'secret plan' });
  act(room, ids[0], { type: 'poll', q: 'Who?', players: true });
  act(room, ids[0], { type: 'timer', secs: 60, label: 'Talk' });
  const g = room.game;
  Object.assign(g, { reform: 3, decree: 4, tracker: 2, vetoRefused: true, power: 'execute', investigated: [ids[1]], confirmedNot: [ids[2]], lastGov: { speaker: ids[0], chancellor: ids[1] }, leg: 'veto' });
  g.seen[ids[0]] = [{ id: ids[1] }]; g.history.push({}); g.deck.shift(); g.discard.push('D'); room.paused = { at: 1 };
  const no = room.gameNo;
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  const n = room.game;
  assert.equal(room.gameNo, no + 1); assert.equal(room.phase, 'reveal');
  assert.equal(n.reform, 0); assert.equal(n.decree, 0); assert.equal(n.tracker, 0); assert.equal(n.vetoRefused, false);
  assert.equal(n.power, null); assert.equal(n.leg, null); assert.equal(n.lastGov, null); assert.equal(n.lastPolicy, null);
  assert.deepEqual(n.investigated, []); assert.deepEqual(n.seen, {}); assert.deepEqual(n.confirmedNot, []); assert.deepEqual(n.history, []);
  assert.deepEqual(n.votes, {}); assert.deepEqual(n.discard, []); assert.equal(n.deck.length, 17); assert.equal(n.winner, null);
  assert.ok(room.log.length === 1 && room.log[0].kind === 'game', 'only the new game line');
  assert.equal(room.log.some((m) => /secret plan/.test(m.text)), false);
  assert.deepEqual(room.undo, [], 'still an empty list for older builds (Undo history lives on the event log)');
  assert.equal(room.timer, null); assert.equal(room.talk, null); assert.equal(room.paused, null); assert.equal(room.poll, null);
});

test('executed and exiled players come back, and a rebalanced table starts fresh', () => {
  const { room, ids, rng } = table(6, { rebalance: true, exile: true });
  room.game.alive[ids[2]] = false; room.game.exiled[ids[3]] = true; room.game.decree = 5;
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  for (const id of ids) { assert.equal(room.game.alive[id], true); assert.ok(!room.game.exiled[id]); }
  assert.equal(room.game.decree, 1, 'rebalanced 6-player table: one Decree on the board, not 5');
  for (const v of [...ids.map((id) => viewForPlayer(room, id)), viewForScreen(room)]) {
    assert.deepEqual(v.game.dead, []); assert.deepEqual(v.game.exiled, []);
  }
});

test('a v1 room moves to the latest rules on restart, and on a fresh start', () => {
  for (const via of ['restart', 'start']) {
    const { room, ids, rng } = table();
    delete room.rulesVersion; delete room.gameNo;
    if (via === 'start') { room.phase = 'lobby'; room.game = null; }
    assert.ok(act(room, ids[0], { type: via }, rng).ok);
    assert.equal(room.rulesVersion, LATEST_RULES_VERSION);
    assert.ok(room.gameNo >= 2);
  }
});

test('Play again from the end screen leaves a v1 room on v1 until the next start', () => {
  const { room, ids, rng } = table();
  delete room.rulesVersion; room.phase = 'over';
  assert.ok(act(room, ids[0], { type: 'again' }, rng).ok);
  assert.equal(room.phase, 'lobby'); assert.equal(room.rulesVersion, undefined);
  assert.ok(act(room, ids[0], { type: 'start' }, rng).ok);
  assert.equal(room.rulesVersion, LATEST_RULES_VERSION);
});

test('only the host restarts, and not from the lobby', () => {
  const { room, ids, rng } = table();
  assert.match(act(room, ids[1], { type: 'restart' }, rng).error, /host/i);
  assert.ok(act(room, null, { type: 'restart' }, rng).error);
  room.phase = 'lobby'; room.game = null;
  assert.match(act(room, ids[0], { type: 'restart' }, rng).error, /restart/i);
});

test('a restart that cannot deal returns the roleList error and changes nothing', () => {
  const { room, ids, rng } = table(5);
  room.players.push({ id: 'x1', name: 'Open', token: 't', host: false, open: true });
  room.players.push({ id: 'x2', name: 'Watcher', token: 't2', host: false, watch: true });
  for (let i = 0; i < 6; i++) room.players.push({ id: `y${i}`, name: `Late${i}`, token: `z${i}`, host: false, watch: true });
  const players = JSON.stringify(room.players); const gameNo = room.gameNo; const game = JSON.stringify(room.game);
  const r = act(room, ids[0], { type: 'restart' }, rng);
  assert.match(r.error, /At most 10/);
  assert.equal(room.gameNo, gameNo); assert.equal(JSON.stringify(room.game), game); assert.equal(JSON.stringify(room.players), players);
  room.players = room.players.filter((p) => p.id[0] !== 'y'); // 5 seated + open + 1 watcher: dealt as 6 (the open seat is dropped)
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  assert.equal(room.game.n, 6);
  assert.equal(room.players.some((p) => p.open), false);
});

test('restart seats watchers like Play again', () => {
  const { room, ids, rng } = table(5);
  const late = act(room, null, { type: 'join', name: 'Late' }, rng).data.playerId; // joins as a watcher mid-game
  assert.equal(room.players.find((p) => p.id === late).watch, true);
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  assert.equal(room.players.find((p) => p.id === late).watch, false);
  assert.equal(room.game.n, 6);
  assert.equal(TEAMS[6][0] + TEAMS[6][1] + 1, 6);
});

test('after a restart every view is the fresh reveal: no stale info', () => {
  const { room, ids, rng } = table(7);
  for (const id of ids) act(room, id, { type: 'ready' });
  act(room, ids[3], { type: 'chat', text: 'old news' });
  act(room, ids[0], { type: 'restart' }, rng);
  const views = [...ids.map((id) => viewForPlayer(room, id)), viewForScreen(room)];
  for (const v of views) {
    assert.equal(v.phase, 'reveal');
    assert.equal(v.gameNo, room.gameNo);
    assert.equal(v.game.reform, 0); assert.equal(v.game.decree, 0); assert.equal(v.game.tracker, 0); assert.deepEqual(v.game.history, []);
    assert.equal(v.game.winner, null); assert.equal(v.game.roles, undefined);
    assert.equal(v.log.some((m) => /old news/.test(m.text)), false);
    assert.equal(v.me?.vote, undefined); assert.equal(v.me?.hand, undefined); assert.equal(v.me?.inquiries, undefined); assert.equal(v.me?.peeked, undefined);
  }
  const screen = views.at(-1);
  assert.equal(screen.me, null); assert.equal(screen.moderator, undefined);
  assert.deepEqual(ids.map((id, i) => views[i].me.role.id).sort(), roleList(7).roles.slice().sort());
});

test('restart works from the end screen and while paused', () => {
  const { room, ids, rng } = table();
  room.phase = 'over'; room.game.winner = 'reform'; room.game.reason = 'reforms';
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  assert.equal(room.phase, 'reveal'); assert.equal(room.game.winner, null);
  act(room, ids[0], { type: 'pause' }, rng);
  assert.ok(act(room, ids[0], { type: 'restart' }, rng).ok);
  assert.equal(room.paused, null);
});
