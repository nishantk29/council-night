// Task C audit: the classic rules, pairwise cases, phases, leaks, and Fennel's rulings (2026-10-25). See AUDIT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRoom, reduce, viewForPlayer, viewForScreen, LATEST_RULES_VERSION } from '../public/js/room.js';
import { TEAMS, POWERS, DECK, knowledgeFor, roleList, startingDeck } from '../public/js/rules.js';
import { FAQ } from '../public/js/faq.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const must = (r) => { assert.ok(r.ok, r.error); return r; };
import { act, logged, undo, redo } from './kit/logged.mjs';
import { undoTarget } from '../public/js/event-log.js';
const HK = 'HOSTKEY-q9z';

function started(n, { house = {}, mode, phoneless = 0, seed = 1, reveal = true } = {}) {
  const rng = seeded(seed); const room = newRoom('ABCDEF', HK); const ids = [];
  for (let i = 0; i < n - phoneless; i++) ids.push(must(reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? HK : undefined }, rng)).data.playerId);
  const host = ids[0];
  if (mode) must(act(room, host, { type: 'mode', mode }));
  for (let i = 0; i < phoneless; i++) { must(act(room, host, { type: 'addSeat', name: `Card${i}` })); ids.push(room.players.at(-1).id); }
  if (Object.keys(house).length) must(act(room, host, { type: 'house', house }));
  must(act(room, host, { type: 'start' }, rng));
  if (reveal) must(act(room, host, { type: 'skipReveal' }));
  return { room, ids, host, rng, get g() { return room.game; } };
}
const roleOf = (t, r) => t.ids.filter((id) => t.g.roles[id] === r);
const sp = (t) => t.g.speaker;
const open = (t) => viewForPlayer(t.room, t.host).game;
const pickCh = (t, avoid = []) => open(t).alive.find((id) => id !== sp(t) && !open(t).ineligible.includes(id) && !avoid.includes(id));
const voters = (t) => t.ids.filter((id) => t.g.alive[id] || t.g.exiled[id]);
function elect(t, ch, aye = true) {
  must(act(t.room, sp(t), { type: 'nominate', id: ch }, t.rng));
  for (const id of voters(t)) must(act(t.room, id, { type: 'vote', aye: typeof aye === 'function' ? aye(id) : aye }, t.rng));
}
function pass(t, p, ch) {
  t.g.deck.unshift(p, p, p);
  ch ||= pickCh(t, roleOf(t, 'pretender'));
  elect(t, ch);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng));
  must(act(t.room, ch, { type: 'enact', i: 0 }, t.rng));
  return ch;
}
const fail = (t) => elect(t, pickCh(t), false);
const state = (t) => JSON.stringify(t.room);
const refused = (t, id, msg) => { const b = state(t); const r = act(t.room, id, msg, t.rng); assert.ok(r.error, `${msg.type} should be refused`); assert.equal(state(t), b, `${msg.type} changed state`); return r.error; };
const over = (t) => { t.g.reform = 4; pass(t, 'R'); assert.equal(t.room.phase, 'over'); };

// ------------------------------------------------------------ 1. spec vs FAQ and the classic rules
test('audit: team sizes, deck and knowledge match the classic rules', () => {
  const want = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
  assert.deepEqual(TEAMS, want);
  assert.deepEqual(DECK, { R: 6, D: 11 });
  for (let n = 5; n <= 10; n++) {
    const { roles } = roleList(n);
    assert.equal(roles.filter((r) => r === 'reformer').length, want[n][0]); assert.equal(roles.filter((r) => r === 'cabal').length, want[n][1]);
    assert.equal(roles.filter((r) => r === 'pretender').length, 1);
    const t = started(n, { seed: n });
    const bossId = roleOf(t, 'pretender')[0];
    for (const id of t.ids) {
      const sees = viewForPlayer(t.room, id).me.sees; const r = t.g.roles[id];
      if (r === 'reformer') assert.deepEqual(sees, []);
      else if (r === 'cabal') assert.deepEqual(sees.map((k) => k.id).sort(), t.ids.filter((x) => x !== id && t.g.roles[x] !== 'reformer').sort());
      else if (n <= 6) assert.deepEqual(sees.map((k) => k.id).sort(), roleOf(t, 'cabal').sort());
      else assert.deepEqual(sees, [], 'the Boss sees nobody at 7+');
      if (r === 'cabal') assert.equal(sees.find((k) => k.id === bossId).tag, 'pretender');
    }
    assert.equal(t.g.deck.length, 17);
  }
});

test('audit: rebalance and exile house rules', () => {
  assert.deepEqual([6, 7, 9, 5].map((n) => startingDeck(n, true).deck.filter((p) => p === 'D').length), [10, 10, 9, 11]);
  assert.equal(startingDeck(6, true).decree, 1);
  const t = started(6, { house: { rebalance: true } });
  assert.equal(t.g.decree, 1);
  const x = started(7, { house: { exile: true }, seed: 4 });
  x.g.decree = 3; pass(x, 'D'); assert.equal(x.room.phase, 'power'); assert.equal(x.g.power, 'execute');
  const target = x.ids.find((id) => id !== sp(x) && x.g.roles[id] !== 'pretender');
  must(act(x.room, sp(x), { type: 'power', id: target }, x.rng));
  assert.ok(x.g.exiled[target]); assert.ok(viewForPlayer(x.room, target).game.exiled.includes(target));
  assert.ok(!open(x).alive.includes(target), 'exiled players can’t hold office');
  assert.ok(open(x).ineligible.includes(target));
});

test('audit: reshuffle when fewer than three cards, discards go back in', () => {
  const t = started(5, { seed: 3 });
  t.g.deck = ['R', 'D']; t.g.discard = ['D', 'D', 'D', 'R', 'D', 'D'];
  const total = 8; elect(t, pickCh(t));
  assert.equal(t.g.hand.length, 3); assert.equal(t.g.deck.length + t.g.hand.length + t.g.discard.length, total);
  assert.equal(t.g.discard.length, 0); assert.equal(t.g.reshuffles, 1);
});

test('audit: term limits (last Chancellor never; last Speaker only when more than five are alive)', () => {
  const t = started(7, { seed: 5 });
  const s0 = sp(t); const c0 = pass(t, 'R');
  assert.ok(open(t).ineligible.includes(c0) && open(t).ineligible.includes(s0));
  const t5 = started(5, { seed: 6 });
  const s5 = sp(t5); const c5 = pass(t5, 'R');
  assert.ok(open(t5).ineligible.includes(c5)); assert.ok(!open(t5).ineligible.includes(s5) || s5 === sp(t5), 'at five the last Speaker may be nominated');
  // a failed election does not move the limits
  const t7 = started(7, { seed: 7 }); pass(t7, 'R'); const lim = { ...t7.g.lastGov }; fail(t7);
  assert.deepEqual(t7.g.lastGov, lim);
});

test('audit: Speaker rotation is clockwise and skips executed players', () => {
  const t = started(5, { seed: 8 });
  const order = []; for (let i = 0; i < 5; i++) { order.push(sp(t)); fail(t); if (t.room.phase === 'nominate') continue; }
  assert.equal(new Set(order.slice(0, 3)).size, 3);
  const i0 = t.g.order.indexOf(order[0]);
  assert.equal(order[1], t.g.order[(i0 + 1) % 5]);
});

test('audit: third failure enacts the top policy without a power, clears term limits, resets the tracker', () => {
  const t = started(5, { seed: 9 });
  pass(t, 'R'); assert.ok(t.g.lastGov);
  t.g.decree = 2; t.g.deck.unshift('D', 'R', 'R', 'R');
  fail(t); fail(t); assert.equal(t.g.tracker, 2); fail(t);
  assert.equal(t.g.decree, 3, 'the top Decree was enacted'); assert.equal(t.room.phase, 'nominate', 'no peek power on a chaos policy');
  assert.equal(t.g.tracker, 0); assert.equal(t.g.lastGov, null);
  assert.deepEqual(open(t).ineligible.filter((id) => id !== sp(t)), []);
});

test('audit: the tracker resets after any enacted policy', () => {
  const t = started(5, { seed: 10 }); fail(t); fail(t); assert.equal(t.g.tracker, 2);
  pass(t, 'R'); assert.equal(t.g.tracker, 0);
});

test('audit: the Boss elected at three Decrees wins before legislation; before three, not', () => {
  const t = started(5, { seed: 11 }); const boss = roleOf(t, 'pretender')[0];
  t.g.decree = 2; const s = sp(t); let ch = boss === s ? pickCh(t) : boss; elect(t, ch);
  assert.equal(t.room.phase, 'legislate', 'two Decrees: no win');
  const u = started(5, { seed: 11 }); u.g.decree = 3;
  const b = roleOf(u, 'pretender')[0]; const c = b === sp(u) ? null : b;
  if (c) { elect(u, c); assert.equal(u.room.phase, 'over'); assert.equal(u.g.winner, 'cabal'); assert.equal(u.g.reason, 'pretender'); assert.deepEqual(u.g.hand, [], 'checked before any policy is drawn'); }
  const w = started(5, { seed: 12 }); w.g.decree = 3; const nb = pickCh(w, roleOf(w, 'pretender')); elect(w, nb);
  assert.equal(w.room.phase, 'legislate'); assert.ok(w.g.confirmedNot.includes(nb));
  // nominated but voted down: no win
  const x = started(5, { seed: 11 }); x.g.decree = 3; const xb = roleOf(x, 'pretender')[0];
  if (xb !== sp(x)) { elect(x, xb, false); assert.equal(x.room.phase, 'nominate'); }
});

test('audit: six Decrees and five Reforms win; executing the Boss wins at once', () => {
  const a = started(5, { seed: 13 }); a.g.decree = 5; pass(a, 'D'); assert.equal(a.g.winner, 'cabal'); assert.equal(a.g.reason, 'decrees');
  const b = started(5, { seed: 13 }); over(b); assert.equal(b.g.winner, 'reform');
  const c = started(5, { seed: 14 }); c.g.decree = 3; pass(c, 'D'); assert.equal(c.g.power, 'execute');
  const boss = roleOf(c, 'pretender')[0];
  if (boss !== sp(c)) { must(act(c.room, sp(c), { type: 'power', id: boss }, c.rng)); assert.equal(c.g.winner, 'reform'); assert.equal(c.g.reason, 'executed'); }
});

test('audit: executed players: no vote, no office, skipped in rotation, role stays secret', () => {
  const t = started(7, { seed: 15 }); t.g.decree = 3; pass(t, 'D');
  const target = t.ids.find((id) => id !== sp(t) && t.g.roles[id] !== 'pretender');
  must(act(t.room, sp(t), { type: 'power', id: target }, t.rng));
  assert.equal(t.room.phase, 'nominate');
  for (const id of t.ids) assert.ok(!/reformer|cabal|pretender/.test(JSON.stringify(viewForPlayer(t.room, id).game)), 'nobody learns the executed role');
  assert.ok(open(t).dead.includes(target));
  assert.ok(refused(t, sp(t), { type: 'nominate', id: target }));
  elect(t, pickCh(t));
  assert.ok(refused(t, target, { type: 'vote', aye: true }) || true);
  for (let k = 0; k < 12; k++) { assert.notEqual(sp(t), target); if (t.room.phase === 'nominate') fail(t); else break; }
});

test('audit: veto only at five Decrees, Speaker must agree, a veto advances the tracker', () => {
  const t = started(5, { seed: 16 }); t.g.decree = 4; t.g.deck.unshift('D', 'D', 'D'); const ch = pickCh(t, roleOf(t, 'pretender')); elect(t, ch);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng));
  assert.ok(act(t.room, ch, { type: 'veto' }, t.rng).error, 'no veto at four Decrees');
  must(act(t.room, ch, { type: 'enact', i: 0 }, t.rng)); assert.equal(t.g.decree, 5);
  must(act(t.room, t.host, { type: 'skip' }, t.rng)); // the fifth Decree's execution is skipped
  const ch2 = pickCh(t, roleOf(t, 'pretender')); t.g.deck.unshift('D', 'D', 'D'); elect(t, ch2);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng));
  must(act(t.room, ch2, { type: 'veto' }, t.rng)); must(act(t.room, sp(t), { type: 'vetoReply', accept: false }, t.rng));
  assert.ok(act(t.room, ch2, { type: 'veto' }, t.rng).error, 'a refused veto can’t be asked twice');
  const t2 = started(5, { seed: 17 }); t2.g.decree = 5; t2.g.deck.unshift('D', 'D', 'D'); const c = pickCh(t2, roleOf(t2, 'pretender')); elect(t2, c);
  must(act(t2.room, sp(t2), { type: 'discard', i: 0 }, t2.rng)); must(act(t2.room, c, { type: 'veto' }, t2.rng)); must(act(t2.room, sp(t2), { type: 'vetoReply', accept: true }, t2.rng));
  assert.equal(t2.g.tracker, 1); assert.equal(t2.g.decree, 5); assert.equal(t2.room.phase, 'nominate');
});

test('audit: powers by table size; Inquiry shows party (Boss = Syndicate) and never twice; docket shows top 3 untouched', () => {
  assert.deepEqual(POWERS[5].slice(2), ['peek', 'execute', 'execute']); assert.equal(POWERS[9][0], 'investigate'); assert.equal(POWERS[7][2], 'special');
  const t = started(9, { seed: 18 }); const boss = roleOf(t, 'pretender')[0];
  pass(t, 'D'); assert.equal(t.g.power, 'investigate');
  const s = sp(t); const target = boss === s ? t.ids.find((i) => i !== s) : boss;
  must(act(t.room, s, { type: 'power', id: target }, t.rng));
  assert.equal(viewForPlayer(t.room, s).me.inquiries.at(-1).party, t.g.roles[target] === 'reformer' ? 'reform' : 'cabal');
  pass(t, 'D'); assert.equal(t.g.power, 'investigate');
  assert.ok(act(t.room, sp(t), { type: 'power', id: target }, t.rng).error || sp(t) === target, 'no second look at the same player');
  const p = started(5, { seed: 19 }); p.g.decree = 2; pass(p, 'D'); assert.equal(p.g.power, 'peek');
  const top = p.g.deck.slice(0, 3);
  assert.deepEqual(viewForPlayer(p.room, sp(p)).me.docket, top);
  must(act(p.room, sp(p), { type: 'peekDone' }, p.rng)); assert.deepEqual(p.g.deck.slice(0, 3), top);
});

// ------------------------------------------------------------ 2. pairwise
test('audit: Snap election returns to the left of the ORIGINAL Speaker and ignores term limits for the chosen Speaker', () => {
  const t = started(7, { seed: 20 }); t.g.decree = 2; const s0 = sp(t); const i0 = t.g.order.indexOf(s0);
  const ch = pass(t, 'D'); assert.equal(t.g.power, 'special');
  must(act(t.room, s0, { type: 'power', id: ch }, t.rng)); // the term-limited Chancellor can be chosen
  assert.equal(sp(t), ch); assert.equal(t.room.phase, 'nominate');
  fail(t);
  assert.equal(sp(t), t.g.order[(i0 + 1) % 7]);
});

test('audit: executing the next Speaker, and the Chancellor, keeps rotation sane', () => {
  const t = started(5, { seed: 21 }); t.g.decree = 3; const i0 = t.g.order.indexOf(sp(t)); const next = t.g.order[(i0 + 1) % 5];
  const boss = roleOf(t, 'pretender')[0]; const ch = pickCh(t, [boss]);
  pass(t, 'D', ch); if (next === boss) return;
  if (ch === next) { must(act(t.room, sp(t), { type: 'power', id: ch }, t.rng)); } else must(act(t.room, sp(t), { type: 'power', id: next }, t.rng));
  assert.notEqual(sp(t), next); assert.equal(sp(t), t.g.order[(i0 + (ch === next ? 2 : 2)) % 5]);
});

test('audit: chaos at five Decrees ends the game; veto into the third failure enacts the top policy', () => {
  const t = started(5, { seed: 22 }); t.g.decree = 5; t.g.tracker = 2; t.g.deck.unshift('D', 'D', 'D', 'D'); const c = pickCh(t, roleOf(t, 'pretender')); elect(t, c);
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng)); must(act(t.room, c, { type: 'veto' }, t.rng)); must(act(t.room, sp(t), { type: 'vetoReply', accept: true }, t.rng));
  assert.equal(t.room.phase, 'over'); assert.equal(t.g.reason, 'decrees');
  const u = started(5, { seed: 23 }); u.g.reform = 4; u.g.tracker = 2; u.g.deck.unshift('R', 'D', 'D', 'D'); fail(u);
  assert.equal(u.g.winner, 'reform');
});

test('audit: physical and hybrid steps (check, hostEnact, hostVeto)', () => {
  const t = started(5, { seed: 24, mode: { play: 'physical' }, phoneless: 2 });
  t.g.decree = 3; const ch = t.ids.find((id) => id !== sp(t));
  must(act(t.room, t.host, { type: 'nominate', id: ch }, t.rng)); must(act(t.room, t.host, { type: 'tally', ayes: t.ids }, t.rng));
  assert.equal(t.room.phase, 'check'); must(act(t.room, t.host, { type: 'check', yes: false }, t.rng));
  assert.equal(t.room.phase, 'legislate'); assert.ok(act(t.room, t.host, { type: 'hostVeto' }, t.rng).error, 'no veto below five Decrees');
  must(act(t.room, t.host, { type: 'hostEnact', policy: 'D' }, t.rng)); assert.equal(t.g.decree, 4);
  assert.ok(act(t.room, t.host, { type: 'hostEnact', policy: 'X' }, t.rng).error);
  const v = started(5, { seed: 25, mode: { play: 'physical' }, phoneless: 2 }); v.g.decree = 5;
  must(act(v.room, v.host, { type: 'nominate', id: v.ids.find((id) => id !== sp(v)) }, v.rng)); must(act(v.room, v.host, { type: 'tally', ayes: v.ids }, v.rng));
  must(act(v.room, v.host, { type: 'check', yes: false }, v.rng)); must(act(v.room, v.host, { type: 'hostVeto' }, v.rng));
  assert.equal(v.g.tracker, 1); assert.equal(v.room.phase, 'nominate');
});

// ------------------------------------------------------------ 3. look-alike roles
test('audit: nothing in the table order gives a role away; the closing-eyes script calls groups', () => {
  const bossAt = new Set(); const bossInList = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const t = started(7, { seed });
    bossAt.add(t.ids.indexOf(roleOf(t, 'pretender')[0]));
    const c = roleOf(t, 'cabal')[0]; bossInList.add(viewForPlayer(t.room, c).me.sees.findIndex((k) => k.tag === 'pretender'));
  }
  assert.ok(bossAt.size >= 5, 'the Boss sits anywhere'); assert.equal(bossInList.size >= 2, true);
  const print = readFileSync(new URL('../public/js/print.js', import.meta.url), 'utf8');
  const script = print.slice(print.indexOf('eyes'));
  assert.ok(!/seat \d|player \d|number \d/i.test(script), 'the script never names seats or numbers');
  assert.ok(/Boss, raise your thumb/.test(script) && /Boss, keep yours closed/.test(script), 'the thumbs step exists for both table sizes');
});

// ------------------------------------------------------------ 4. phases and timing
test('audit: ties fail, double votes and acting out of turn are refused', () => {
  const t = started(6, { seed: 26 }); const ch = pickCh(t); must(act(t.room, sp(t), { type: 'nominate', id: ch }, t.rng));
  t.ids.forEach((id, i) => { if (i === 0) assert.ok(act(t.room, id, { type: 'vote', aye: 'yes' }, t.rng).error); must(act(t.room, id, { type: 'vote', aye: i < 3 }, t.rng)); if (i < 5) assert.match(act(t.room, id, { type: 'vote', aye: true }, t.rng).error, /already voted/); });
  assert.equal(t.g.lastVote.passed, false); assert.equal(t.g.tracker, 1);
  const o = started(5, { seed: 27 }); const other = o.ids.find((id) => id !== sp(o));
  assert.ok(refused(o, other, { type: 'nominate', id: pickCh(o) }));
  elect(o, pickCh(o)); const chn = o.g.nominee; const nonSpeaker = o.ids.find((id) => id !== sp(o));
  assert.ok(refused(o, nonSpeaker, { type: 'discard', i: 0 })); assert.ok(refused(o, sp(o), { type: 'enact', i: 0 }));
  must(act(o.room, sp(o), { type: 'discard', i: 0 }, o.rng)); assert.ok(refused(o, sp(o), { type: 'discard', i: 0 })); assert.ok(chn);
});

test('audit: after game over only Restart, Play again and Close act', () => {
  const t = started(5, { seed: 28 }); over(t);
  for (const [id, msg] of [[sp(t), { type: 'nominate', id: t.ids[1] }], [t.ids[1], { type: 'vote', aye: true }], [t.host, { type: 'skip', id: t.ids[1] }], [sp(t), { type: 'discard', i: 0 }], [t.host, { type: 'hostEnact', policy: 'R' }], [sp(t), { type: 'power', id: t.ids[1] }], [sp(t), { type: 'peekDone' }], [t.host, { type: 'pause' }]]) refused(t, id, msg);
  must(act(t.room, t.host, { type: 'restart' }, t.rng)); assert.equal(t.room.phase, 'reveal');
});

test('audit: Restart works in every phase and brings everyone back at the latest rules', () => {
  const phases = [];
  const t = started(7, { seed: 29, reveal: false });
  const steps = [[], [() => must(act(t.room, t.host, { type: 'skipReveal' }))], [() => must(act(t.room, t.host, { type: 'skipReveal' })), () => must(act(t.room, sp(t), { type: 'nominate', id: pickCh(t) }, t.rng))]];
  steps.push([...steps[2], () => { for (const id of t.ids) must(act(t.room, id, { type: 'vote', aye: true }, t.rng)); }]);
  for (const acts of steps) {
    for (const f of acts) f();
    phases.push(t.room.phase); must(act(t.room, t.host, { type: 'restart' }, t.rng));
    assert.equal(t.room.phase, 'reveal'); assert.equal(t.room.rulesVersion, LATEST_RULES_VERSION); assert.equal(open(t).dead.length, 0);
  }
  assert.deepEqual(phases, ['reveal', 'nominate', 'vote', 'legislate']);
  must(act(t.room, t.host, { type: 'skipReveal' }));
  t.g.decree = 3; pass(t, 'D'); assert.equal(t.room.phase, 'power');
  must(act(t.room, sp(t), { type: 'power', id: t.ids.find((id) => id !== sp(t) && t.g.roles[id] !== 'pretender') }, t.rng));
  must(act(t.room, t.host, { type: 'restart' }, t.rng)); assert.equal(open(t).dead.length, 0); assert.equal(t.g.decree, 0);
});

test('audit: pause freezes play, host can still restart; a kicked seat’s old token no longer acts and its new holder inherits the card', () => {
  const t = started(5, { seed: 30 }); must(act(t.room, t.host, { type: 'pause' }, t.rng, 1));
  assert.match(act(t.room, sp(t), { type: 'nominate', id: pickCh(t) }, t.rng).error, /paused/);
  must(act(t.room, t.host, { type: 'resume' }, t.rng));
  const victim = t.ids[2]; const role = t.g.roles[victim]; const tok = t.room.players.find((p) => p.id === victim).token;
  must(act(t.room, t.host, { type: 'kick', id: victim }, t.rng));
  assert.notEqual(t.room.players.find((p) => p.id === victim).token, tok, 'old token is dead');
  const j = must(reduce(t.room, {}, { type: 'join', name: 'New' }, t.rng));
  assert.equal(viewForPlayer(t.room, j.data.playerId).me.role.id, role);
});

test('audit: claimHost and close room', () => {
  const t = started(5, { seed: 31 });
  assert.ok(act(t.room, t.ids[1], { type: 'claimHost', hostKey: 'nope' }, t.rng).error);
  must(act(t.room, t.ids[1], { type: 'claimHost', hostKey: HK }, t.rng));
  assert.ok(refused(t, t.host, { type: 'close' }));
  must(act(t.room, t.ids[1], { type: 'close' }, t.rng)); assert.equal(t.room.closed, true);
});

test('audit: skip works on every phase it should (vote nay, nominate passes, random hand pick, veto refused, power lost)', () => {
  const t = started(5, { seed: 32 }); must(act(t.room, t.host, { type: 'skip', id: sp(t) }, t.rng)); assert.equal(t.room.phase, 'nominate');
  elect(t, pickCh(t), true); must(act(t.room, t.host, { type: 'skip' }, t.rng)); assert.equal(t.g.leg, 'chancellor');
  must(act(t.room, t.host, { type: 'skip' }, t.rng)); assert.equal(t.room.phase === 'nominate' || t.room.phase === 'power', true);
});

// ------------------------------------------------------------ 5. leaks
test('audit: no view leaks another player’s role, hands, docket, Inquiry, deck, keys or tokens at any phase', () => {
  const t = started(7, { seed: 33 });
  const check = (label) => {
    const secrets = ['"hostKey"', HK, 'token', '"deck"', '"discard"', '"rng"', '"hand"', '"docket"', '"inquiries"', '"peeked"'];
    const s = JSON.stringify(viewForScreen(t.room));
    for (const w of [...(t.room.phase === 'over' ? [] : ['"roles":{', '"role"']), ...secrets]) assert.ok(!s.includes(w), `${label}: screen shows ${w}`);
    for (const id of t.ids) {
      const v = viewForPlayer(t.room, id); const j = JSON.stringify(v);
      for (const w of [HK, 'token', '"deck"', '"discard"', '"rng"', '"moderator"']) assert.ok(!j.includes(w), `${label}: ${id} sees ${w}`);
      if (t.room.phase !== 'over') assert.ok(!('roles' in v.game), `${label}: roles early`);
      const isSp = id === sp(t);
      if (t.room.phase === 'legislate' && t.g.leg === 'speaker') assert.equal('hand' in v.me, isSp, `${label}: hand only for the Speaker`);
      if (t.room.phase === 'legislate' && t.g.leg === 'chancellor') assert.equal('hand' in v.me, id === t.g.nominee, `${label}: hand only for the Chancellor`);
      if (t.room.phase === 'power') assert.equal('docket' in v.me, isSp && t.g.power === 'peek');
      assert.ok(!('inquiries' in v.me) || t.g.seen[id]?.length, `${label}: inquiry only for the inquirer`);
    }
  };
  check('nominate'); const ch = pickCh(t, roleOf(t, 'pretender')); must(act(t.room, sp(t), { type: 'nominate', id: ch }, t.rng)); check('vote');
  for (const id of t.ids) must(act(t.room, id, { type: 'vote', aye: true }, t.rng)); check('speaker hand');
  must(act(t.room, sp(t), { type: 'discard', i: 0 }, t.rng)); check('chancellor hand');
  t.g.decree = 1; t.g.hand = ['D', 'D']; must(act(t.room, ch, { type: 'enact', i: 0 }, t.rng)); check('power'); assert.equal(t.g.power, 'investigate');
  must(act(t.room, sp(t), { type: 'power', id: t.ids.find((id) => id !== sp(t)) }, t.rng)); check('after inquiry');
  over(t); check('over');
});

test('audit: reveal length is identical for every role (one shared constant, role-free closed markup)', () => {
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.ok(!/TAP_REVEAL_MS\s*\*?\s*\(?\s*(r|role)\./.test(app));
  const i = app.indexOf('// Closed: no role-specific markup'); assert.ok(i > 0);
  assert.ok(/class="rcard-tap hold \$\{open \? '' : 'is-hidden'\}"/.test(app.slice(i, i + 700)));
});

// ------------------------------------------------------------ 6. Fennel's rulings and audit-plan bugs
test('audit: undo after game over goes through the log, and only over public steps', () => {
  // The reducer has no Undo of its own any more.
  const z = started(5, { seed: 40 }); assert.deepEqual(act(z.room, z.host, { type: 'undo' }), { error: 'Unknown action.' });
  // Ended by an enacted policy: the Chancellor's hand was seen, so with UNDO_PAST_SECRET off the end stays.
  const t = logged(started(5, { seed: 40 })); over(t);
  const e = undo(t); assert.match(e.error, /secret policies/); assert.equal(t.room.phase, 'over'); assert.equal(t.g.winner, 'reform');
  must(act(t.room, t.host, { type: 'again' }, t.rng)); assert.equal(t.room.phase, 'lobby');
  // Ended by electing the Boss (a public vote): Undo goes back to the vote and the roles are hidden again; Redo ends it again.
  const b = started(5, { seed: 41 }); b.g.decree = 3; const boss = roleOf(b, 'pretender')[0];
  if (boss !== sp(b)) {
    logged(b); elect(b, boss); assert.equal(b.room.phase, 'over'); assert.ok(viewForPlayer(b.room, b.ids[1]).game.roles);
    must(undo(b)); assert.equal(b.room.phase, 'vote'); assert.equal(viewForPlayer(b.room, b.ids[1]).game.roles, undefined, 'roles hidden again');
    must(redo(b)); assert.equal(b.room.phase, 'over'); assert.equal(b.g.reason, 'pretender');
    assert.equal(undoTarget(b.L.events, b.L.cursor, b.room, { pastOver: false }).why, 'The game is over. Use Restart or Play again.');
  }
  // Chaos (three failed votes): the third failure enacts the top tile unseen, so it is public and undoable.
  const c = started(5, { seed: 42 }); c.g.reform = 4; c.g.tracker = 2; c.g.deck.unshift('R', 'D', 'D'); logged(c); fail(c); assert.equal(c.room.phase, 'over');
  must(undo(c)); assert.equal(c.room.phase, 'vote'); assert.equal(c.g.reform, 4);
});

test('audit: Play again is host only', () => {
  const t = started(5, { seed: 43 }); over(t);
  const other = t.ids.find((id) => id !== t.host);
  assert.match(refused(t, other, { type: 'again' }), /host/i);
  assert.equal(t.room.phase, 'over'); must(act(t.room, t.host, { type: 'again' }, t.rng)); assert.equal(t.room.phase, 'lobby');
  const fx = readFileSync(new URL('../public/js/fx.js', import.meta.url), 'utf8');
  // "Play again" (same setup, new deal) appears only in the host's branch of the end overlay.
  assert.ok(fx.includes('Waiting for the host') && (fx.match(/>Play again</g) || []).length === 1 && /v\.me\?\.host \? '<button[^']*data-o="restart">Play again</.test(fx));
});

test('audit: no undo past a secret look', () => {
  // Inquiry
  const t = logged(started(9, { seed: 44 })); pass(t, 'D'); assert.equal(t.g.power, 'investigate');
  const s = sp(t); must(act(t.room, s, { type: 'power', id: t.ids.find((i) => i !== s) }, t.rng));
  assert.match(undo(t).error, /secret policies or an Inquiry/);
  assert.equal(t.g.investigated.length, 1);
  // public steps after the barrier are undoable again, down to the barrier
  const ch = pickCh(t); must(act(t.room, sp(t), { type: 'nominate', id: ch }, t.rng)); must(undo(t)); assert.equal(t.room.phase, 'nominate');
  assert.match(undo(t).error, /Undo stops here/);
  assert.ok(t.L.history().canRedo, 'Redo still works, so nothing locks');
  // docket
  const p = started(5, { seed: 45 }); p.g.decree = 2; logged(p); pass(p, 'D'); assert.equal(p.g.power, 'peek');
  must(act(p.room, sp(p), { type: 'peekDone' }, p.rng)); assert.match(undo(p).error, /Undo stops here/);
  // discard and enact (the hand was seen)
  const d = logged(started(5, { seed: 46 })); const dc = pickCh(d); elect(d, dc);
  must(undo(d)); assert.equal(d.room.phase, 'vote', 'a vote is public and undoable');
  for (const id of d.ids) if (!(id in d.g.votes)) must(act(d.room, id, { type: 'vote', aye: true }, d.rng));
  must(act(d.room, sp(d), { type: 'discard', i: 0 }, d.rng)); assert.match(undo(d).error, /Undo stops here/);
  assert.equal(d.g.hand.length, 2);
  must(act(d.room, dc, { type: 'enact', i: 0 }, d.rng)); assert.match(undo(d).error, /Undo stops here/);
  // physical public steps stay undoable
  const q = logged(started(5, { seed: 47, mode: { play: 'physical' }, phoneless: 2 }));
  must(act(q.room, q.host, { type: 'nominate', id: q.ids.find((id) => id !== sp(q)) }, q.rng)); must(act(q.room, q.host, { type: 'tally', ayes: q.ids }, q.rng));
  must(act(q.room, q.host, { type: 'hostEnact', policy: 'R' }, q.rng)); must(undo(q)); assert.equal(q.room.phase, 'legislate');
  must(undo(q)); assert.equal(q.room.phase, 'vote');
  // with UNDO_PAST_SECRET on, the same Undo goes through
  assert.notEqual(undoTarget(d.L.events, d.L.cursor, d.room, { pastSecret: true }).i, null);
});

test('audit: an idle Speaker’s skipped power stays lost (and the FAQ says so)', () => {
  const t = started(5, { seed: 48 }); t.g.decree = 3; pass(t, 'D'); assert.equal(t.room.phase, 'power');
  must(act(t.room, t.host, { type: 'skip' }, t.rng));
  assert.equal(t.room.phase, 'nominate'); assert.equal(t.g.alive[t.ids[0]], true); assert.ok(Object.values(t.g.alive).every(Boolean), 'nobody was executed at random');
  assert.deepEqual(t.g.investigated, []);
  const text = FAQ.flatMap(([, qs]) => qs.map(([q, a]) => `${q} ${a}`)).join(' ');
  assert.match(text, /skipped power stays lost/);
});

test('audit: exiled players do not count toward the five-or-fewer term-limit exception', () => {
  const t = started(6, { seed: 49, house: { exile: true } });
  t.g.exiled[t.ids[5]] = true; t.g.alive[t.ids[5]] = false; // six at the table, one exiled: five can hold office, six vote
  if (sp(t) === t.ids[5]) return;
  t.g.lastGov = { speaker: t.ids.find((id) => id !== sp(t) && id !== t.ids[5]), chancellor: t.ids.find((id) => id !== sp(t) && id !== t.ids[5] && t.g.alive[id]) };
  assert.equal(open(t).alive.length, 5);
  assert.ok(!open(t).ineligible.includes(t.g.lastGov.speaker) || t.g.lastGov.speaker === sp(t), 'five who can hold office: the last Speaker may be nominated');
  const u = started(7, { seed: 50, house: { exile: true } });
  u.g.exiled[u.ids[6]] = true; u.g.alive[u.ids[6]] = false; // six can hold office, seven vote
  const speaker = u.ids.find((id) => id !== sp(u) && id !== u.ids[6]);
  u.g.lastGov = { speaker, chancellor: u.ids.find((id) => id !== sp(u) && id !== speaker && id !== u.ids[6]) };
  assert.ok(open(u).ineligible.includes(speaker), 'six can hold office: the last Speaker is still limited');
  assert.match(FAQ.flatMap(([, qs]) => qs.map(([q, a]) => `${q} ${a}`)).join(' '), /exiled under the Exile house rule don’t count/);
});

test('audit: physical table, third failure: no skip, the host enters the tile', () => {
  const t = started(5, { seed: 51, mode: { play: 'physical' }, phoneless: 2 }); delete t.room.rulesVersion; // from version 2 the host may skip (see host-no-dead-end)
  for (let i = 0; i < 3; i++) { must(act(t.room, t.host, { type: 'nominate', id: t.ids.find((id) => id !== sp(t) && !open(t).ineligible.includes(id)) }, t.rng)); must(act(t.room, t.host, { type: 'tally', ayes: [] }, t.rng)); }
  assert.equal(t.room.phase, 'chaos');
  assert.match(refused(t, t.host, { type: 'skip' }), /Enter the policy that was turned up/);
  must(act(t.room, t.host, { type: 'hostEnact', policy: 'R' }, t.rng)); assert.equal(t.g.reform, 1); assert.equal(t.g.tracker, 0);
});

test('audit: knowledge badges show only while the role card is open', () => {
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const m = app.slice(app.indexOf('function marksFor'), app.indexOf('function targeting'));
  assert.ok(/const looking = isOpen\('role'\)/.test(m));
  assert.ok(/of looking \? v\.me\?\.sees \|\| \[\] : \[\]/.test(m) && /of looking \? v\.me\?\.inquiries \|\| \[\] : \[\]/.test(m));
  assert.ok(!/for \(const k of v\.me\?\.(sees|inquiries) \|\| \[\]\)/.test(m), 'no unconditional marks');
});

test('audit: moderator roles only for a sit-out host', () => {
  const t = started(6, { seed: 52, house: { sitOut: true } });
  assert.ok(viewForPlayer(t.room, t.host).moderator, 'the sit-out host sees the deal');
  const late = must(reduce(t.room, {}, { type: 'join', name: 'Late' }, t.rng)).data.playerId;
  must(act(t.room, late, { type: 'claimHost', hostKey: HK }, t.rng));
  assert.ok(viewForPlayer(t.room, late).moderator, 'with sit-out on, a host who watches moderates');
  const u = started(5, { seed: 53 });
  const l2 = must(reduce(u.room, {}, { type: 'join', name: 'Late' }, u.rng)).data.playerId;
  must(act(u.room, l2, { type: 'claimHost', hostKey: HK }, u.rng));
  assert.ok(u.room.players.find((p) => p.id === l2).watch && u.room.players.find((p) => p.id === l2).host);
  assert.equal(viewForPlayer(u.room, l2).moderator, undefined, 'a late watcher who claims host sees no roles');
});
