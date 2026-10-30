import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForPlayer, viewForScreen, broadcastPlan, endedNow } from '../public/js/room.js';
import { POWERS } from '../public/js/rules.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const must = (r) => { assert.ok(r.ok, r.error); return r; };
import { act, logged, undo } from './kit/logged.mjs';

function started(n, { house = {}, mode, phoneless = 0, seed = 1 } = {}) {
  const rng = seeded(seed); const room = newRoom('ABCDEF', 'hk'); const ids = [];
  for (let i = 0; i < n - phoneless; i++) ids.push(must(reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined }, rng)).data.playerId);
  const host = ids[0];
  if (mode) must(act(room, host, { type: 'mode', mode }));
  for (let i = 0; i < phoneless; i++) { must(act(room, host, { type: 'addSeat', name: `Card${i}` })); ids.push(room.players.at(-1).id); }
  if (Object.keys(house).length) must(act(room, host, { type: 'house', house }));
  must(act(room, host, { type: 'start' }, rng));
  must(act(room, host, { type: 'skipReveal' }));
  return { room, ids, host, rng, get g() { return room.game; } };
}
const roleOf = (t, r) => t.ids.filter((id) => t.g.roles[id] === r);
const sp = (t) => t.g.speaker;
const pickChancellor = (t, avoid = []) => viewForPlayer(t.room, t.host).game.alive.find((id) => id !== sp(t) && !viewForPlayer(t.room, t.host).game.ineligible.includes(id) && !avoid.includes(id));
function elect(t, ch, aye = true) {
  must(act(t.room, sp(t), { type: 'nominate', id: ch }, t.rng));
  const vs = t.ids.filter((id) => t.g.alive[id] || t.g.exiled[id]);
  for (const id of vs) must(act(t.room, id, { type: 'vote', aye: typeof aye === 'function' ? aye(id) : aye }, t.rng));
}
// Stack the deck and pass one policy of `p` through a government.
function pass(t, p, ch) {
  t.g.deck.unshift(p, p, p);
  ch ||= pickChancellor(t, roleOf(t, 'pretender'));
  elect(t, ch);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng));
  must(act(t.room, ch, { type: 'enact', i: 0 }, t.rng));
  return ch;
}
const skipPower = (t) => { if (t.room.phase === 'power') must(act(t.room, t.host, { type: 'skip' }, t.rng)); };

test('every table size deals, and nobody sees what they should not (incl. the table screen)', () => {
  for (let n = 5; n <= 10; n++) {
    const t = started(n, { seed: n });
    const scr = JSON.stringify(viewForScreen(t.room));
    assert.ok(!/"role":\{|"roles":\{|"hand":\[|"docket"|"deck":\[/.test(scr));
    for (const id of t.ids) {
      const v = viewForPlayer(t.room, id); const s = JSON.stringify(v);
      assert.ok(!/"roles":\{|"deck":\[|"hand":\[/.test(s), 'no other roles, no deck order');
      if (t.g.roles[id] === 'reformer') assert.equal(v.me.sees.length, 0);
      for (const other of t.ids) if (other !== id && !v.me.sees.some((k) => k.id === other)) assert.ok(!s.includes(`"${other}","tag"`));
    }
    // legislation: only the Speaker, then only the Chancellor, holds the tiles
    const ch = pickChancellor(t); elect(t, ch);
    for (const id of t.ids) assert.equal(!!viewForPlayer(t.room, id).me.hand, id === sp(t));
    assert.equal(viewForPlayer(t.room, sp(t)).me.hand.length, 3);
    must(act(t.room, sp(t), { type: 'discard', i: 1 }, t.rng));
    for (const id of t.ids) assert.equal(!!viewForPlayer(t.room, id).me.hand, id === ch);
    assert.ok(!/"hand":\[/.test(JSON.stringify(viewForScreen(t.room))));
    assert.ok(act(t.room, sp(t), { type: 'enact', i: 0 }).error, 'the Speaker cannot enact');
  }
});

test('deck: draw three, reshuffle the discards in when fewer than three remain', () => {
  const t = started(5, { seed: 3 });
  t.g.deck = ['R', 'D', 'R', 'D']; t.g.discard = Array(13).fill('D');
  const ch = pickChancellor(t, roleOf(t, 'pretender')); elect(t, ch);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }));
  must(act(t.room, ch, { type: 'enact', i: 0 }));
  assert.equal(t.g.reshuffles, 1);
  assert.equal(t.g.deck.length + t.g.discard.length + t.g.reform + t.g.decree, 17);
  assert.equal(t.g.discard.length, 0);
});

test('unrest: three failed governments enact the top tile, ignore its power, reset the tracker and the term limits', () => {
  const t = started(7, { seed: 4 });
  t.g.decree = 1; // the next Decree slot holds a power at 7 players
  pass(t, 'R'); assert.ok(t.g.lastGov);
  for (let k = 0; k < 3; k++) { const before = t.g.tracker; t.g.deck.unshift('D'); elect(t, pickChancellor(t), false); if (k < 2) assert.equal(t.g.tracker, before + 1); }
  assert.equal(t.g.decree, 2); assert.equal(t.g.tracker, 0); assert.equal(t.g.lastGov, null);
  assert.equal(t.room.phase, 'nominate', 'no power from a chaos policy');
  assert.equal(viewForScreen(t.room).game.ineligible.length, 1, 'only the Speaker themself');
});

test('the tracker resets whenever a policy is enacted', () => {
  const t = started(6, { seed: 5 });
  elect(t, pickChancellor(t), false); assert.equal(t.g.tracker, 1);
  pass(t, 'R'); assert.equal(t.g.tracker, 0);
});

test('term limits are enforced on nomination', () => {
  const t = started(7, { seed: 6 });
  const s1 = sp(t); const c1 = pass(t, 'R');
  assert.ok(act(t.room, sp(t), { type: 'nominate', id: c1 }).error, 'last Chancellor barred');
  if (sp(t) !== s1) assert.ok(act(t.room, sp(t), { type: 'nominate', id: s1 }).error, 'last Speaker barred with 7 alive');
  assert.ok(act(t.room, sp(t), { type: 'nominate', id: sp(t) }).error);
});

test('veto unlocks at five Decrees; refusal forces an enactment; acceptance discards both and moves the tracker', () => {
  const t = started(5, { seed: 7 });
  t.g.decree = 4; let ch = pickChancellor(t, roleOf(t, 'pretender'));
  t.g.deck.unshift('D', 'D', 'R'); elect(t, ch);
  must(act(t.room, sp(t), { type: 'discard', i: 2 }));
  assert.ok(act(t.room, ch, { type: 'veto' }).error, 'no veto at 4');
  must(act(t.room, ch, { type: 'enact', i: 0 })); assert.equal(t.g.decree, 5); skipPower(t);
  ch = pickChancellor(t, roleOf(t, 'pretender')); t.g.deck.unshift('D', 'D', 'D'); elect(t, ch);
  logged(t); // Undo is on the event log, from here
  must(act(t.room, sp(t), { type: 'discard', i: 0 }));
  must(act(t.room, ch, { type: 'veto' }));
  must(act(t.room, sp(t), { type: 'vetoReply', accept: false }));
  assert.ok(act(t.room, ch, { type: 'veto' }).error, 'only once');
  // undo, then accept this time
  must(undo(t)); must(undo(t)); // the veto and the answer are public
  assert.equal(t.g.leg, 'chancellor');
  must(act(t.room, ch, { type: 'veto' }));
  const tr = t.g.tracker; const disc = t.g.discard.length;
  must(act(t.room, sp(t), { type: 'vetoReply', accept: true }));
  assert.equal(t.g.tracker, tr + 1); assert.equal(t.g.discard.length, disc + 2); assert.equal(t.g.decree, 5);
  assert.equal(t.room.phase, 'nominate');
});

test('powers by table size fire on the right Decree', () => {
  for (let n = 5; n <= 10; n++) {
    const t = started(n, { seed: 10 + n });
    for (let slot = 0; slot < 5; slot++) {
      pass(t, 'D');
      if (t.room.phase === 'over') break;
      const want = POWERS[n][slot];
      assert.equal(t.room.phase === 'power' ? t.g.power : null, want, `${n} players, Decree ${slot + 1}`);
      skipPower(t);
    }
  }
});

test('inquiry shows the party (the Boss shows as Syndicate) to the Speaker only, never twice', () => {
  const t = started(9, { seed: 21 });
  pass(t, 'D'); assert.equal(t.g.power, 'investigate');
  const s = sp(t); const target = roleOf(t, 'pretender')[0] === s ? roleOf(t, 'cabal')[0] : roleOf(t, 'pretender')[0];
  must(act(t.room, s, { type: 'power', id: target }));
  assert.deepEqual(viewForPlayer(t.room, s).me.inquiries, [{ id: target, party: 'cabal' }]);
  for (const id of t.ids) if (id !== s) assert.ok(!viewForPlayer(t.room, id).me.inquiries);
  assert.ok(!JSON.stringify(viewForScreen(t.room)).includes('"party"'));
  pass(t, 'D'); assert.equal(t.g.power, 'investigate');
  assert.ok(act(t.room, sp(t), { type: 'power', id: target }).error);
});

test('snap election: the chosen Speaker serves once, then the order returns to the left of the caller', () => {
  const t = started(7, { seed: 22 });
  t.g.decree = 2; pass(t, 'D'); assert.equal(t.g.power, 'special');
  const caller = sp(t); const i = t.ids.indexOf(caller);
  const target = t.ids[(i + 3) % 7];
  must(act(t.room, caller, { type: 'power', id: target }));
  assert.equal(sp(t), target); assert.ok(t.g.special);
  elect(t, pickChancellor(t), false);
  assert.equal(sp(t), t.ids[(i + 1) % 7]);
});

test('peek shows the top three to the Speaker only, without changing the pile', () => {
  const t = started(5, { seed: 23 });
  t.g.decree = 2; pass(t, 'D'); assert.equal(t.g.power, 'peek');
  const top = t.g.deck.slice(0, 3);
  assert.deepEqual(viewForPlayer(t.room, sp(t)).me.docket, top);
  for (const id of t.ids) if (id !== sp(t)) assert.ok(!viewForPlayer(t.room, id).me.docket);
  must(act(t.room, sp(t), { type: 'peekDone' })); assert.deepEqual(t.g.deck.slice(0, 3), top);
});

test('a peek is cleared once the next policies are drawn', () => {
  const t = started(5, { seed: 23, cardsApp: true });
  t.g.decree = 2; pass(t, 'D'); assert.equal(t.g.power, 'peek');
  const s = sp(t); must(act(t.room, s, { type: 'peekDone' }));
  assert.ok(viewForPlayer(t.room, s).me.peeked, 'kept after peekDone');
  elect(t, pickChancellor(t), true);
  assert.equal(t.room.phase, 'legislate');
  assert.ok(!viewForPlayer(t.room, s).me.peeked, 'cleared by the next draw');
});

test('win: five Reforms', () => {
  const t = started(6, { seed: 24 });
  for (let k = 0; k < 5; k++) pass(t, 'R');
  assert.equal(t.room.phase, 'over'); assert.equal(t.g.winner, 'reform');
  assert.equal(Object.keys(viewForScreen(t.room).game.roles).length, 6, 'roles revealed at the end');
});

test('win: six Decrees', () => {
  const t = started(5, { seed: 25 });
  for (let k = 0; k < 6 && t.room.phase !== 'over'; k++) { pass(t, 'D'); skipPower(t); }
  assert.equal(t.g.winner, 'cabal'); assert.equal(t.g.reason, 'decrees');
});

test('win: the Boss elected Chancellor after three Decrees (and not before)', () => {
  const t = started(8, { seed: 26 });
  const pre = roleOf(t, 'pretender')[0];
  t.g.decree = 2; t.g.lastGov = null;
  if (sp(t) === pre) elect(t, pickChancellor(t), false);
  elect(t, pre); assert.notEqual(t.room.phase, 'over', 'two Decrees: no win');
  must(act(t.room, sp(t), { type: 'discard', i: 0 })); t.g.hand = ['D', 'D'];
  must(act(t.room, pre, { type: 'enact', i: 0 })); skipPower(t);
  assert.equal(t.g.decree, 3);
  const other = pickChancellor(t, [pre]); elect(t, other);
  assert.ok(t.g.confirmedNot.includes(other), 'others are confirmed not the Boss');
  must(act(t.room, sp(t), { type: 'discard', i: 0 })); t.g.hand = ['R', 'R'];
  must(act(t.room, other, { type: 'enact', i: 0 }));
  t.g.lastGov = null; if (sp(t) === pre) elect(t, pickChancellor(t), false);
  elect(t, pre); assert.equal(t.g.winner, 'cabal'); assert.equal(t.g.reason, 'pretender');
});

test('win: executing the Boss; executed players cannot vote or hold office', () => {
  const t = started(5, { seed: 27 });
  t.g.decree = 3; pass(t, 'D'); assert.equal(t.g.power, 'execute');
  const pre = roleOf(t, 'pretender')[0];
  const victim = t.ids.find((id) => id !== sp(t) && id !== pre);
  must(act(t.room, sp(t), { type: 'power', id: victim }));
  assert.ok(act(t.room, victim, { type: 'vote', aye: true }).error);
  assert.ok(viewForScreen(t.room).game.ineligible.includes(victim));
  pass(t, 'D'); assert.equal(t.g.power, 'execute');
  if (sp(t) === pre) { must(act(t.room, t.host, { type: 'skip' })); return; }
  must(act(t.room, sp(t), { type: 'power', id: pre }));
  assert.equal(t.g.winner, 'reform'); assert.equal(t.g.reason, 'executed');
});

test('exile variant: the exiled still vote but cannot hold office', () => {
  const t = started(5, { seed: 28, house: { exile: true } });
  t.g.decree = 3; pass(t, 'D');
  const pre = roleOf(t, 'pretender')[0];
  const victim = t.ids.find((id) => id !== sp(t) && id !== pre);
  must(act(t.room, sp(t), { type: 'power', id: victim }));
  const ch = pickChancellor(t, [pre]); assert.notEqual(ch, victim);
  must(act(t.room, sp(t), { type: 'nominate', id: ch }));
  must(act(t.room, victim, { type: 'vote', aye: true }));
  assert.ok(act(t.room, sp(t), { type: 'nominate', id: victim }).error);
});

test('anonymous votes hide who voted which way, even at the end', () => {
  const t = started(5, { seed: 29, house: { anonVotes: true } });
  elect(t, pickChancellor(t), (id) => id === t.host);
  const v = viewForScreen(t.room).game.lastVote;
  assert.deepEqual(v.ayes, []); assert.equal(v.yes, 1); assert.equal(v.no, 4);
});

test('fully physical: the host enters votes, policies, chaos tiles and the Boss checks; no secrets on the host phone', () => {
  const t = started(5, { seed: 30, mode: { play: 'physical' }, phoneless: 2 });
  assert.equal(t.g.roles, null); assert.ok(!t.g.cardsApp);
  const hv = () => JSON.stringify(viewForPlayer(t.room, t.host));
  must(act(t.room, t.host, { type: 'nominate', id: t.ids.find((id) => id !== sp(t)) }));
  must(act(t.room, t.host, { type: 'tally', ayes: t.ids.slice(0, 3) }));
  assert.equal(t.room.phase, 'legislate'); assert.equal(t.g.pile, 14);
  must(act(t.room, t.host, { type: 'hostEnact', policy: 'D' }));
  assert.equal(t.g.decree, 1); assert.equal(t.g.discards, 2);
  for (let k = 0; k < 3; k++) { must(act(t.room, t.host, { type: 'nominate', id: t.ids.find((id) => id !== sp(t) && !viewForScreen(t.room).game.ineligible.includes(id)) })); must(act(t.room, t.host, { type: 'tally', ayes: [] })); }
  assert.equal(t.room.phase, 'chaos');
  must(act(t.room, t.host, { type: 'hostEnact', policy: 'D' }));
  assert.equal(t.g.decree, 2); assert.equal(t.room.phase, 'nominate'); assert.equal(t.g.tracker, 0);
  must(act(t.room, t.host, { type: 'nominate', id: t.ids.find((id) => id !== sp(t)) }));
  must(act(t.room, t.host, { type: 'tally', ayes: t.ids }));
  must(act(t.room, t.host, { type: 'hostEnact', policy: 'D' }));
  assert.equal(t.room.phase, 'power'); must(act(t.room, t.host, { type: 'peekDone' }));
  const ch = t.ids.find((id) => id !== sp(t) && !viewForScreen(t.room).game.ineligible.includes(id));
  must(act(t.room, t.host, { type: 'nominate', id: ch }));
  must(act(t.room, t.host, { type: 'tally', ayes: t.ids }));
  assert.equal(t.room.phase, 'check');
  must(act(t.room, t.host, { type: 'check', yes: true }));
  assert.equal(t.g.winner, 'cabal');
  assert.ok(!/"role":\{|"hand":\[|"docket"/.test(hv()));
});

test('hybrid: phones for roles and policies, votes at the table', () => {
  const t = started(6, { seed: 31, mode: { play: 'hybrid', roles: 'app', votes: 'physical', cards: 'app' } });
  const ch = pickChancellor(t);
  must(act(t.room, sp(t), { type: 'nominate', id: ch }));
  assert.ok(act(t.room, t.ids[1], { type: 'vote', aye: true }).error);
  must(act(t.room, t.host, { type: 'tally', ayes: t.ids.slice(0, 4) }));
  assert.equal(t.room.phase, 'legislate');
});

test('pause blocks the game; skips are logged; host hand-off works', () => {
  const t = started(5, { seed: 32 });
  must(act(t.room, t.host, { type: 'pause' }));
  assert.ok(act(t.room, sp(t), { type: 'nominate', id: pickChancellor(t) }).error);
  must(act(t.room, t.host, { type: 'resume' }));
  const ch = pickChancellor(t); elect(t, ch);
  must(act(t.room, t.host, { type: 'skip' })); must(act(t.room, t.host, { type: 'skip' }));
  assert.equal(t.g.reform + t.g.decree, 1);
  assert.ok(t.room.log.some((l) => /skipped/.test(l.text)));
});

test('snap election on the player to the left: they serve twice in a row (classic rule)', () => {
  const t = started(7, { seed: 40 });
  t.g.decree = 2; pass(t, 'D'); assert.equal(t.g.power, 'special');
  const caller = sp(t); const left = t.ids[(t.ids.indexOf(caller) + 1) % 7];
  must(act(t.room, caller, { type: 'power', id: left }));
  elect(t, pickChancellor(t), false);
  assert.equal(sp(t), left, 'the gavel returns to the left of the caller: the same player');
});

// ---------------------------------------------------------------- game over + animations
test('game over: every connected client (each phone, the host, the table screen) gets the game-over event, and only phones get "you won/lost"', () => {
  const t = started(7, { seed: 11 });
  const sockets = [...t.ids.map((id, i) => ({ ws: `p${i}`, who: 'player', playerId: id })), { ws: 'tv', who: 'screen' }, { ws: 'tv2', who: 'screen' }, { ws: 'lurker', who: null }];
  t.g.reform = 4;
  const before = t.room.phase;
  pass(t, 'R');
  assert.equal(t.room.phase, 'over'); assert.ok(endedNow(before, t.room));
  const plan = broadcastPlan(t.room, sockets, new Set(t.ids), { gameOver: endedNow('legislate', t.room) });
  assert.equal(plan.length, sockets.length - 1, 'every joined socket is in the plan, the one that has not joined is not');
  const events = plan.map((p) => ({ ws: p.ws, ev: p.msgs.filter((m) => m.type === 'gameover') }));
  for (const { ws, ev } of events) { assert.equal(ev.length, 1, `${ws} gets exactly one game-over event`); assert.equal(ev[0].winner, 'reform'); assert.equal(ev[0].reason, 'reforms'); assert.equal(ev[0].text, '5 Reforms passed'); assert.equal(ev[0].gameNo, 2); }
  for (const p of plan) assert.equal(p.msgs[0].type, 'view', 'the view (with the roles) arrives before the event');
  for (const [i, id] of t.ids.entries()) {
    const ev = events.find((e) => e.ws === `p${i}`).ev[0];
    assert.equal(ev.you, ['reformer'].includes(t.g.roles[id]) ? 'won' : 'lost');
  }
  for (const e of events.filter((x) => x.ws.startsWith('tv'))) assert.equal(e.ev[0].you, undefined);
  // the event is only sent when the game just ended, never on ordinary updates, and the roles are public by then
  assert.ok(broadcastPlan(t.room, sockets, new Set(), {}).every((p) => p.msgs.length === 1));
  assert.ok(Object.keys(viewForScreen(t.room).game.roles).length === 7);
});

test('game over: only the host can send everyone back to the lobby with the same players; Play again is refused mid-game', () => {
  const t = started(5, { seed: 12 });
  const other = t.ids.find((id) => id !== t.host);
  assert.ok(act(t.room, other, { type: 'again' }).error, 'not while the game runs');
  t.g.reform = 4; pass(t, 'R');
  assert.ok(act(t.room, t.host, { type: 'abandon' }).ok);
  const t2 = started(5, { seed: 12 }); t2.g.reform = 4; pass(t2, 'R');
  const o2 = t2.ids.find((id) => id !== t2.host);
  assert.ok(act(t2.room, o2, { type: 'again' }).error, 'Play again is the host’s');
  must(act(t2.room, t2.host, { type: 'again' }));
  assert.equal(t2.room.phase, 'lobby'); assert.equal(t2.room.players.length, 5);
  assert.ok(act(t2.room, o2, { type: 'abandon' }).error, 'ending a running game stays host-only');
});

test('animations: the host switches them off for the whole table; nobody else can', () => {
  const t = started(5, { seed: 13 });
  const other = t.ids.find((id) => id !== t.host);
  assert.equal(viewForScreen(t.room).anim, true);
  assert.ok(act(t.room, other, { type: 'anim', on: false }).error);
  must(act(t.room, t.host, { type: 'anim', on: false }));
  assert.equal(viewForScreen(t.room).anim, false); assert.equal(viewForPlayer(t.room, other).anim, false);
  must(act(t.room, t.host, { type: 'anim', on: true }));
  assert.equal(viewForPlayer(t.room, other).anim, true);
});

test('animation events carry nothing secret: the game-over event and views of other players never include hands or other roles mid-game', () => {
  const t = started(6, { seed: 14 });
  const ch = pickChancellor(t); elect(t, ch);
  const other = t.ids.find((id) => id !== sp(t) && id !== ch);
  const s = JSON.stringify(viewForPlayer(t.room, other)) + JSON.stringify(viewForScreen(t.room));
  assert.ok(!/"hand":\[|"deck":\[|"roles":\{/.test(s));
  assert.equal(gameOverNone(t.room), null);
});
function gameOverNone(room) { return broadcastPlan(room, [{ ws: 1, who: 'screen' }], new Set(), { gameOver: true })[0].msgs.find((m) => m.type === 'gameover') || null; }

test('close: only the host can close the room, and it flags the room for the Worker to wipe', () => {
  const t = started(5);
  assert.equal(act(t.room, t.ids[1], { type: 'close' }).error, 'Only the host can do that.');
  assert.ok(!t.room.closed);
  must(act(t.room, t.host, { type: 'close' }));
  assert.equal(t.room.closed, true);
});
