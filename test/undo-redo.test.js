// Undo and Redo on the event log (public/js/event-log.js), matching Mafia Night and Quest Night: unlimited back and
// forward on every phone, rev-checked, the seed in each event, back from the end screen with a confirm. One thing is
// this game's own: with UNDO_PAST_SECRET off (the default) Undo never goes back over a secret look (a hand, the
// docket, an Inquiry), says why, and Redo and the host's fallbacks still move the game on.
// Pure part: seeded random games through the log. Room part: the real Durable Object with fake storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { GameLog, KEY, replay, applyEvent, SNAP_EVERY, undoTarget } from '../public/js/event-log.js';
import { viewForPlayer, viewForScreen } from '../public/js/room.js';
import { UNDO_PAST_SECRET, UNDO_PAST_GAME_OVER, NOTIFY_ON_UNDO } from '../public/js/config-defaults.js';
import { newGame, play, move, fallback, stream } from './kit/log-games.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

const GAMES = Number(process.env.UNDO_GAMES || 60);
const SEED = Number(process.env.UNDO_SEED || 1);
const json = (x) => JSON.stringify(x);
const games = (f) => { for (let g = 0; g < GAMES; g++) f(SEED * 1000 + g); };
const PAST = { pastSecret: true };

test('the defaults Nishant and Fennel chose: not back over a secret look, back from the end screen, players told', () => {
  assert.equal(UNDO_PAST_SECRET, false); assert.equal(UNDO_PAST_GAME_OVER, true); assert.equal(NOTIFY_ON_UNDO, true);
});

// ---------- pure: properties over random games ----------
test(`P1: a cold replay of the log gives the live room after every event, and stateAt(i) is the room after i events (${GAMES} games)`, () => {
  let checked = 0;
  games((seed) => {
    const seen = [];
    const G = newGame(seed); seen[G.log.cursor] = json(G.log.room);
    play(G, { onMove: (H) => { seen[H.log.cursor] = json(H.log.room); } });
    const { log } = G;
    assert.equal(json(replay(log.base, log.events)), json(log.room), `${G.tag}: replay differs from live`);
    for (let i = 0; i <= log.events.length; i += 1 + (i % 7)) { if (seen[i]) { assert.equal(json(log.stateAt(i)), seen[i], `${G.tag}: stateAt(${i})`); checked++; } }
  });
  assert.ok(checked > GAMES * 10);
});

// Walks Undo back as far as it goes, checking each landing, then Redo forward again to the same end.
function walk(G, seen, opts) {
  const { log } = G; const end = json(log.room); const len = log.events.length; const visited = []; let steps = 0;
  for (;;) {
    const at = log.cursor; const label = log.undoStep(opts);
    if (label === null) break;
    steps++;
    assert.ok(log.cursor < at); assert.ok(log.events[log.cursor].s, `${G.tag}: undo landed off a step`);
    assert.equal(json(log.room), seen[log.cursor], `${G.tag}: undo to ${log.cursor} is not the room as it was`);
    assert.ok(typeof label === 'string' && label.length);
    visited.push(log.cursor);
  }
  const stop = { phase: log.room.phase, why: log.history(opts).undoWhy, cursor: log.cursor };
  for (const i of visited.reverse().slice(1)) { assert.ok(log.redoStep() !== null); assert.equal(log.cursor, i, `${G.tag}: redo does not retrace undo`); }
  while (log.redoStep() !== null);
  assert.equal(log.cursor, len); assert.equal(json(log.room), end, `${G.tag}: redo to the end is not the same room`);
  return { steps, stop };
}

test(`P2: undo step by step lands just before each step and stops at the last secret look (or the lobby) with a reason; redo gives the end back (${GAMES} games)`, () => {
  let steps = 0; let atSecret = 0;
  games((seed) => {
    const seen = []; const G = newGame(seed); seen[G.log.cursor] = json(G.log.room);
    play(G, { onMove: (H) => { seen[H.log.cursor] = json(H.log.room); } });
    const w = walk(G, seen);
    steps += w.steps;
    if (w.stop.phase === 'lobby') return;
    assert.match(w.stop.why, /secret policies or an Inquiry/, `${G.tag}: stopped in ${w.stop.phase} with "${w.stop.why}"`);
    // the event Undo would take back next is the secret look itself, or a step after one
    const prev = G.log.events.slice(0, w.stop.cursor).findLastIndex((e) => e.s);
    assert.ok(G.log.events.slice(prev, w.stop.cursor).some((e) => e.x), `${G.tag}: stopped with no secret look in the way`);
    atSecret++;
  });
  assert.ok(steps > GAMES * 3, `only ${steps} undo steps`);
  assert.ok(atSecret > GAMES / 4, `only ${atSecret} games stopped at a secret look`);
});

test(`P2b: with UNDO_PAST_SECRET on, the same walk goes all the way back to the lobby (${GAMES} games)`, () => {
  let steps = 0;
  games((seed) => {
    const seen = []; const G = newGame(seed); seen[G.log.cursor] = json(G.log.room);
    play(G, { onMove: (H) => { seen[H.log.cursor] = json(H.log.room); } });
    const w = walk(G, seen, PAST);
    assert.equal(w.stop.phase, 'lobby', `${G.tag}: stopped in ${w.stop.phase}: ${w.stop.why}`);
    steps += w.steps;
  });
  assert.ok(steps > GAMES * 10, `only ${steps} undo steps`);
});

test(`P3: random undo, redo and new moves keep the log consistent, never go back over a secret look, and never lock (${GAMES} games)`, () => {
  let ops = 0; let refused = 0;
  games((seed) => {
    const G = newGame(seed + 77); const S = stream(seed);
    for (let k = 0; k < 300; k++) {
      const { log } = G; const x = S.r();
      if (x < 0.15) {
        const at = log.cursor; const h = log.history();
        if (log.undoStep() !== null) assert.ok(!log.events.slice(log.cursor, at).some((e) => e.x), `${G.tag}: Undo went back over a secret look`);
        else { refused++; assert.ok(h.undoWhy, `${G.tag}: Undo refused with no reason`); }
      } else if (x < 0.25) log.redoStep();
      else if (log.room.phase === 'over') { if (S.chance(0.5)) G.act(G.ids[0], { type: 'again' }); else log.undoStep(); }
      else { const r = move(G); assert.ok(!r.stuck, `${G.tag}: stuck in ${log.room.phase}`); }
      ops++;
      if (k % 25 === 0) assert.equal(json(log.stateAt(log.cursor)), json(log.room), `${G.tag}: op ${k}: the room is not the log`);
      if (k % 10 === 0 && log.room.phase !== 'lobby' && log.room.phase !== 'over') assert.ok(fallbackExists(G), `${G.tag}: no way forward in ${log.room.phase}`);
    }
    assert.equal(json(replay(G.log.base, G.log.events.slice(0, G.log.cursor))), json(G.log.room));
  });
  assert.ok(ops >= GAMES * 300); assert.ok(refused > 0);
});
// A host move is always accepted (tested on a copy, so the game is not changed).
function fallbackExists(G) {
  const copy = { ...G, log: GameLog.restore(structuredClone(G.log.toJSON())), S: stream(1) };
  copy.act = (id, msg) => copy.log.apply(id ? { playerId: id } : { anon: true }, msg, G.t(), [1, 2, 3, 4]);
  return !fallback(copy).stuck;
}

test(`P4: every event replays from its own seed: other seed words give another deal, the same ones give the same room (${GAMES} games)`, () => {
  let differ = 0;
  games((seed) => {
    const G = play(newGame(seed)); const { log } = G;
    const i = log.events.findIndex((e) => e.m.type === 'start');
    const before = log.stateAt(i);
    const a = structuredClone(before), b = structuredClone(before), c = structuredClone(before);
    applyEvent(a, log.events[i]); applyEvent(b, log.events[i]); applyEvent(c, { ...log.events[i], e: log.events[i].e.map((w) => (w ^ 0x9e3779b9) >>> 0) });
    assert.equal(json(a), json(b), `${G.tag}: the same seed gave another deal`);
    if (json(a.game) !== json(c.game)) differ++;
  });
  assert.ok(differ > GAMES * 0.9, `only ${differ} of ${GAMES} deals changed with other seed words`);
});

test('P4 mutation: a log that ignores the seed (Math.random) fails the replay check', () => {
  const real = Math.random; let failed = 0;
  for (let s = 0; s < 10; s++) {
    const G = newGame(s); const ev = G.log.events;
    play(G);
    const leaky = ev.map((e) => ({ ...e, e: [real() * 2 ** 32 >>> 0, 1, 2, 3] }));
    if (json(replay(G.log.base, leaky)) !== json(G.log.room)) failed++;
  }
  assert.equal(failed, 10);
});

test('P5 mutation: a log that forgets to mark secret looks lets Undo go back over one (the P2/P3 checks catch it)', () => {
  let caught = 0;
  for (let s = 0; s < 10; s++) {
    const G = play(newGame(s, { mode: 'phone' })); const { log } = G;
    const events = log.events.map(({ x, ...e }) => e); // the marks dropped
    let c = log.cursor;
    for (let k = 0; k < 500; k++) { const t = undoTarget(events, c, log.stateAt(c)); if (t.i === null) break; c = t.i; }
    if (log.events.slice(c).some((e) => e.x)) caught++;
  }
  assert.equal(caught, 10);
});

// ---------- pure: the semantics ----------
function table5(mode = 'phone', seed = 4242) {
  const G = newGame(seed, { mode }); const { act, ids } = G;
  act(ids[0], { type: 'start' }); act(ids[0], { type: 'skipReveal' });
  return G;
}
const office = (room) => room.game.order.filter((id) => room.game.alive[id] && !room.game.exiled[id]);
const nominee = (room) => office(room).find((id) => id !== room.game.speaker);

test('a single vote is not a step: it goes back with its nomination, and comes back with Redo', () => {
  const G = table5(); const { log, act, ids } = G;
  act(log.room.game.speaker, { type: 'nominate', id: nominee(log.room) });
  act(ids[1], { type: 'vote', aye: true }); act(ids[2], { type: 'vote', aye: false });
  assert.match(log.history().undoLabel, /nominated$/);
  assert.match(log.undoStep(), /nominated$/);
  assert.equal(log.room.phase, 'nominate'); assert.deepEqual(log.room.game.votes, {});
  log.redoStep();
  assert.equal(log.room.phase, 'vote'); assert.deepEqual(Object.keys(log.room.game.votes).sort(), [ids[1], ids[2]].sort());
});

test('the Speaker’s hand: the closing vote can be undone until the Speaker discards; after that Undo says why and Redo still works', () => {
  const G = table5(); const { log, act } = G; const g = () => log.room.game;
  const ch = nominee(log.room); act(g().speaker, { type: 'nominate', id: ch });
  for (const id of g().order) act(id, { type: 'vote', aye: true });
  assert.equal(log.room.phase, 'legislate');
  assert.equal(log.undoStep(), 'The vote'); assert.equal(log.room.phase, 'vote');
  const hand = () => json(log.room.game.hand);
  log.redoStep(); const h0 = hand(); assert.equal(log.room.phase, 'legislate');
  log.undoStep(); log.redoStep(); assert.equal(hand(), h0, 'the same three policies come back');
  act(g().speaker, { type: 'discard', i: 0 });
  assert.ok(log.events.at(-1).x, 'the discard is marked as a secret look');
  const h = log.history(); assert.equal(h.canUndo, false); assert.match(h.undoWhy, /secret policies/);
  assert.equal(log.undoStep(), null);
  act(ch, { type: 'enact', i: 0 });
  assert.equal(log.history().canUndo, false);
  if (log.room.phase !== 'over') assert.ok(!fallback(G).stuck, 'the game still moves on');
});

test('from the end screen (the Boss elected): the confirm path goes back, the roles are hidden again on every phone, Redo ends it again', () => {
  for (let seed = 1; seed < 400; seed++) {
    const G = table5('phone', seed); const { log, act } = G; const g = () => log.room.game;
    const boss = g().order.find((id) => g().roles[id] === 'pretender');
    if (boss === g().speaker) continue;
    // three Decrees on the board, set up through the log is long: start the log from a hand-set board instead
    const room = structuredClone(log.room); room.game.decree = 3;
    const L = new GameLog(room); const a = (id, m) => L.apply({ playerId: id }, m, 5e6, [seed, 2, 3, 4]);
    a(L.room.game.speaker, { type: 'nominate', id: boss });
    if (L.room.phase !== 'vote') continue;
    for (const id of L.room.game.order) a(id, { type: 'vote', aye: true });
    assert.equal(L.room.phase, 'over'); assert.equal(L.room.game.reason, 'pretender');
    const ids = L.room.players.map((p) => p.id);
    assert.ok(viewForPlayer(L.room, ids[1]).game.roles, 'the end screen shows the roles');
    assert.ok(L.history().canUndo, L.history().undoWhy);
    assert.equal(L.undoStep(), 'The vote');
    assert.equal(L.room.phase, 'vote');
    for (const id of ids) assert.equal(viewForPlayer(L.room, id).game.roles, undefined, 'roles are hidden again');
    assert.ok(!json(viewForScreen(L.room)).includes('"roles":{'));
    assert.equal(L.redoStep(), 'The vote'); assert.equal(L.room.phase, 'over');
    assert.equal(L.history({ pastOver: false }).canUndo, false); assert.match(L.history({ pastOver: false }).undoWhy, /over/);
    void act;
    return;
  }
  assert.fail('no seed put the Boss off the Speaker’s chair');
});

test('a game ended by an enacted policy stays ended (the hand was seen): Undo says why, Play again and Restart still work', () => {
  for (let seed = 1; seed < 200; seed++) {
    const G = play(newGame(seed, { mode: 'phone' }));
    const last = G.log.events.at(-1);
    if (!['enact', 'skip'].includes(last.m.type) || !last.x) continue;
    const h = G.log.history(); assert.equal(h.canUndo, false); assert.match(h.undoWhy, /secret/);
    assert.ok(G.act(G.ids[0], { type: 'restart' }).kept, 'Restart works');
    assert.equal(G.log.room.phase, 'reveal');
    return;
  }
  assert.fail('no game ended on an enacted policy');
});

test('physical policies are public: the host’s entries undo one by one, back to the vote', () => {
  const G = table5('physical'); const { log, act, ids } = G;
  act(ids[0], { type: 'nominate', id: nominee(log.room) }); act(ids[0], { type: 'tally', ayes: ids });
  assert.equal(log.room.phase, 'legislate');
  act(ids[0], { type: 'hostEnact', policy: 'R' });
  assert.equal(log.undoStep(), 'The policy'); assert.equal(log.room.phase, 'legislate');
  assert.equal(log.undoStep(), 'The vote count'); assert.equal(log.room.phase, 'vote');
});

test('a mid-game join (a watcher, or someone taking over an opened seat) is where Undo stops; Redo and the fallbacks still work', () => {
  const G = table5(); const { log, act, ids } = G;
  act(log.room.game.speaker, { type: 'nominate', id: nominee(log.room) });
  act(null, { type: 'join', name: 'Late' });
  const h = log.history(); assert.equal(h.canUndo, false); assert.match(h.undoWhy, /joined/);
  assert.equal(log.undoStep(), null);
  assert.ok(!fallback(G).stuck);
  act(ids[0], { type: 'skip', id: ids[1] });
  assert.ok(log.history().canUndo, 'a step after the join can be undone');
});

test('timers, talk turns, chat and the game log come back exactly with the step (room-wide undo)', () => {
  const G = table5(); const { log, act, ids } = G;
  const before = json(log.room);
  act(log.room.game.speaker, { type: 'nominate', id: nominee(log.room) });
  act(ids[0], { type: 'timer', secs: 60 }); act(ids[2], { type: 'chat', text: 'hm' }); act(ids[0], { type: 'talk', secs: 30 });
  log.undoStep();
  assert.equal(json(log.room), before);
});

// ---------- the room, with three phones ----------
function fakeCtx(store = new Map()) {
  const sockets = []; const f = { store, sockets, failPuts: 0 };
  const put1 = (k, v) => { store.set(k, structuredClone(v)); };
  f.ctx = {
    storage: {
      get: async (k) => (Array.isArray(k) ? new Map(k.filter((x) => store.has(x)).map((x) => [x, structuredClone(store.get(x))])) : structuredClone(store.get(k))),
      put: async (k, v) => { if (f.failPuts > 0) { f.failPuts--; throw new Error('storage is down'); } if (typeof k === 'object') for (const [a, b] of Object.entries(k)) put1(a, b); else put1(k, v); },
      setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); },
    },
    blockConcurrencyWhile: (fn) => fn(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  };
  return f;
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const last = (ws, type) => ws.sent.filter((m) => m.type === type).at(-1);
const view = (ws) => last(ws, 'view')?.view;

async function phones(f = fakeCtx()) {
  const room = new Room(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'GUNDOX', hostKey: 'hk' }) }));
  const host = sock(), a = sock(), b = sock(); f.sockets.push(host, a, b);
  await send(room, host, { type: 'hello', join: 'Hana', hostKey: 'hk' });
  await send(room, a, { type: 'hello', join: 'Ann' }); await send(room, b, { type: 'hello', join: 'Ben' });
  for (const n of ['Dee', 'Eve']) { const s = sock(); f.sockets.push(s); await send(room, s, { type: 'hello', join: n }); }
  await send(room, host, { type: 'start' }); await send(room, host, { type: 'skipReveal' });
  const rev = () => view(host).rev;
  return { f, room, host, a, b, rev };
}
const wsOf = (room, id) => room.ctx.getWebSockets().find((s) => s.att?.playerId === id);

test('three phones: Undo and Redo need the current rev; every phone follows; players are told; a player cannot undo', async () => {
  const { room, host, a, b, rev } = await phones();
  const g = room.room.game;
  const before = json(room.room);
  await send(room, wsOf(room, g.speaker), { type: 'nominate', id: nominee(room.room) });
  assert.equal(view(host).phase, 'vote');
  assert.match(view(host).hist.undoLabel, /nominated$/); assert.equal(view(a).hist, undefined, 'only the host gets Undo state');
  assert.equal(typeof view(a).rev, 'number');
  await send(room, a, { type: 'undo', rev: rev() });
  assert.match(last(a, 'error').error, /host/);
  await send(room, host, { type: 'undo', rev: rev() - 1 });
  assert.match(last(host, 'error').error, /moved on/); assert.equal(view(host).phase, 'vote');
  await send(room, host, { type: 'undo' });
  assert.match(last(host, 'error').error, /moved on/, 'an Undo with no rev is refused (two taps never pop two steps)');
  await send(room, host, { type: 'undo', rev: rev() });
  assert.equal(json(room.room), before);
  for (const s of [host, a, b]) assert.equal(view(s).phase, 'nominate');
  assert.match(last(host, 'stepped').label, /nominated$/);
  assert.deepEqual([last(a, 'stepped')?.dir, last(b, 'stepped')?.dir], ['undo', 'undo']);
  await send(room, host, { type: 'redo', rev: rev() });
  assert.equal(view(a).phase, 'vote'); assert.equal(last(a, 'stepped').dir, 'redo');
  await send(room, host, { type: 'redo', rev: rev() });
  assert.equal(last(host, 'error').error, 'Nothing to redo.');
});

test('three phones: after the Speaker discards, the host’s Undo is refused with the reason, and nothing changes', async () => {
  const { room, host, rev } = await phones();
  const g = () => room.room.game;
  await send(room, wsOf(room, g().speaker), { type: 'nominate', id: nominee(room.room) });
  for (const id of g().order) await send(room, wsOf(room, id), { type: 'vote', aye: true });
  assert.equal(room.room.phase, 'legislate');
  await send(room, wsOf(room, g().speaker), { type: 'discard', i: 0 });
  assert.equal(view(host).hist.canUndo, false); assert.match(view(host).hist.undoWhy, /secret policies/);
  const was = json(room.room); const r0 = rev();
  await send(room, host, { type: 'undo', rev: rev() });
  assert.match(last(host, 'error').error, /secret policies/); assert.equal(json(room.room), was); assert.equal(rev(), r0);
});

test('a host entry sent against an older rev is refused and the host gets the latest view', async () => {
  const { room, host, rev } = await phones();
  const old = rev();
  await send(room, host, { type: 'timer', secs: 60 });
  const r0 = rev();
  await send(room, host, { type: 'skip', id: room.room.players[1].id, rev: old });
  assert.match(last(host, 'error').error, /moved on/); assert.equal(rev(), r0);
});

test('storage: the log is written in chunks next to room/log/undo, a cold start carries on the same log', async () => {
  const f = fakeCtx(); const { room, host, rev } = await phones(f);
  for (let i = 0; i < SNAP_EVERY + 10; i++) await send(room, host, { type: 'coin' });
  const meta = f.store.get(KEY.meta);
  assert.equal(meta.len, room.log.events.length); assert.ok(f.store.has(KEY.snap(1)));
  assert.deepEqual(f.store.get('undo'), []); assert.ok(Array.isArray(f.store.get('log')) && f.store.get('room').code === 'GUNDOX', 'an older build still finds room, log and undo');
  const again = new Room(f.ctx, {}); await again.ready;
  assert.equal(again.log.events.length, meta.len); assert.equal(again.log.rev, rev());
  assert.equal(json(again.room), json(room.room));
  assert.ok(again.log.history().canUndo);
});

test('an open room from before the log (with the old 12-step stack and a secret-look barrier) loads, starts a fresh log, and plays on', async () => {
  const f = fakeCtx();
  const G = newGame(9); play(G, { max: 30 });
  const r = structuredClone(G.log.room); const { log, ...rest } = r;
  f.store.set('room', { ...rest, undo: [], undoBarrier: true }); f.store.set('log', log); f.store.set('undo', ['{"game":null,"phase":"lobby"}']);
  const room = new Room(f.ctx, {}); await room.ready;
  assert.equal(room.log.events.length, 0); assert.deepEqual(room.room.undo, []);
  assert.equal(json(room.room.game), json(G.log.room.game));
  assert.equal(room.log.history().canUndo, false, 'nothing from before the log can be undone');
  const host = sock(); host.att = { who: 'player', playerId: G.ids[0], token: room.room.players[0].token }; f.sockets.push(host);
  await send(room, host, { type: 'coin' });
  assert.equal(room.log.events.length, 1); assert.ok(f.store.has(KEY.base));
});

test('a move storage would not keep is taken back: the room goes back to the saved one and every phone follows', async () => {
  const f = fakeCtx(); const { room, host, a } = await phones(f);
  const saved = json(room.room);
  f.failPuts = 1e9; await send(room, host, { type: 'timer', secs: 60 }); f.failPuts = 0;
  assert.equal(last(host, 'error').error, 'That move could not be saved. Try it again.');
  assert.equal(json(room.room), saved); assert.equal(view(a).timer, null);
  assert.equal(json(replay(room.log.base, room.log.events.slice(0, room.log.cursor))), json(room.room));
});

test('a room that cannot be saved at creation answers 503, so the caller tries another code', async () => {
  const f = fakeCtx(); f.failPuts = 1e9;
  const room = new Room(f.ctx, {}); await room.ready;
  const r = await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'GFAILX', hostKey: 'hk' }) }));
  assert.equal(r.status, 503); assert.equal(room.room, null);
});
