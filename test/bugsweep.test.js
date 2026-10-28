import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRoom, reduce, gameOverEvent, socketsToDrop } from '../public/js/room.js';

const rng = () => 0.42;
const must = (r) => { assert.ok(r.ok, r.error); return r; };
const act = (room, id, msg) => reduce(room, { playerId: id }, msg, rng);

function lobby(n) {
  const room = newRoom('ABCDEF', 'hk');
  const ids = Array.from({ length: n }, (_, i) => must(reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined }, rng)).data.playerId);
  return { room, ids, host: ids[0] };
}
function start(t) { must(act(t.room, t.host, { type: 'start' })); must(act(t.room, t.host, { type: 'skipReveal' })); }
// Reform win: stack the deck, push the board to four Reforms, then pass one more.
function reformWin(t) {
  const { room } = t; const g = room.game;
  g.reform = 4; g.deck.unshift('R', 'R', 'R');
  const sp = g.speaker; const ch = t.ids.find((id) => id !== sp && id !== g.lastGov?.chancellor);
  must(act(room, sp, { type: 'nominate', id: ch }));
  for (const id of t.ids) must(act(room, id, { type: 'vote', aye: true }));
  must(act(room, sp, { type: 'discard', i: 0 }));
  must(act(room, ch, { type: 'enact', i: 0 }));
}

test('Play again: late watchers are seated and unclaimed open seats are dropped', () => {
  const t = lobby(5); start(t);
  const late = must(reduce(t.room, {}, { type: 'join', name: 'Late' }, rng)).data.playerId;
  assert.ok(t.room.players.find((p) => p.id === late).watch);
  must(act(t.room, t.host, { type: 'kick', id: t.ids[1] })); // opens a seat mid-game
  must(act(t.room, t.host, { type: 'abandon' }));
  assert.equal(t.room.players.find((p) => p.id === late).watch, false);
  assert.equal(t.room.players.some((p) => p.open), false);
  assert.equal(t.room.players.length, 5); // 4 original + Late
});

test('every game-over carries a fresh counter, even after a restart (pop-up key)', () => {
  const t = lobby(5); start(t); reformWin(t);
  assert.equal(t.room.phase, 'over');
  const first = gameOverEvent(t.room, t.host).over;
  assert.ok(act(t.room, t.host, { type: 'undo' }).error, 'undo cannot un-end a finished game');
  must(act(t.room, t.host, { type: 'restart' })); must(act(t.room, t.host, { type: 'skipReveal' }));
  reformWin(t);
  assert.equal(t.room.phase, 'over');
  assert.ok(gameOverEvent(t.room, t.host).over > first);
});

test('pop-up key includes the room code (game 1 of two rooms shares a number)', () => {
  const a = lobby(5); start(a); reformWin(a);
  const b = lobby(5); start(b); reformWin(b);
  assert.equal(gameOverEvent(a.room, a.host).over, gameOverEvent(b.room, b.host).over);
  assert.match(readFileSync(new URL('../public/js/fx.js', import.meta.url), 'utf8'), /overShown === `\$\{S\.code\}:\$\{ev\.over\}`/);
});

test('socketsToDrop returns every other socket bound to a replaced seat', () => {
  const s = [{ ws: 'a', playerId: 'p1' }, { ws: 'b', playerId: 'p2' }, { ws: 'c', playerId: 'p1' }, { ws: 'd', who: 'screen' }];
  assert.deepEqual(socketsToDrop(s, 'p1'), ['a', 'c']);
  assert.deepEqual(socketsToDrop(s, 'p1', 'c'), ['a']);
  assert.deepEqual(socketsToDrop(s, 'p9'), []);
});
