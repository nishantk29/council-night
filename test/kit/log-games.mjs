// Seeded random games played through the event log (public/js/event-log.js), for the undo, redo and replay tests.
// Every move is an event with seed words drawn from the game's own stream, so a game is the same on every run.
// Moves: random legal-ish messages from random seats (tools and chat included), with the host's fallbacks when
// nothing else is accepted, in phone, physical and mixed play, 5 to 10 players, some house rules on.
// Same shape as Quest Night's test/kit/log-games.mjs; the moves are this game's.
import { GameLog } from '../../public/js/event-log.js';
import { newRoom } from '../../public/js/room.js';

export function stream(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const u32 = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const r = () => u32() / 0x100000000;
  return { u32, r, pick: (a) => a[Math.floor(r() * a.length)], chance: (p) => r() < p, seed4: () => [u32(), u32(), u32(), u32()] };
}

export const MODES = {
  phone: null,
  physical: { play: 'physical' },
  mixed: { play: 'hybrid', roles: 'physical', votes: 'app', cards: 'app' },
  tiles: { play: 'hybrid', roles: 'app', votes: 'physical', cards: 'physical' },
};

// A table in the lobby, through the log: n seats, a mode, maybe some house rules. Returns { log, ids, S, t(), act() }.
export function newGame(seed, { Log = GameLog, mode: want } = {}) {
  const S = stream(seed); let clock = 1_000_000;
  const log = new Log(newRoom('GLOGME', 'hk'));
  const t = () => (clock += 1 + Math.floor(S.r() * 4000));
  const act = (id, msg) => log.apply(id ? { playerId: id } : { anon: true }, msg, t(), S.seed4());
  const n = 5 + Math.floor(S.r() * 6); const ids = [];
  for (let i = 0; i < n; i++) ids.push(act(null, { type: 'join', name: `P${i}`, hostKey: i ? undefined : 'hk' }).data.playerId);
  const mode = want || S.pick(Object.keys(MODES));
  if (MODES[mode]) act(ids[0], { type: 'mode', mode: MODES[mode] });
  if (S.chance(0.5)) act(ids[0], { type: 'house', house: { rebalance: S.chance(0.5), exile: S.chance(0.3), anonVotes: S.chance(0.3) } });
  return { log, ids, S, t, act, mode, tag: `seed=${seed} ${n}p ${mode}` };
}

// One move: a random message from a random seat, or the host's fallback. Returns the result (kept or not).
export function move(G) {
  const { log, ids, S, act } = G; const room = log.room; const g = room.game; const H = ids[0];
  const any = () => S.pick(ids);
  if (room.phase === 'lobby') return act(H, { type: 'start' });
  if (S.chance(0.05)) return act(any(), S.pick([{ type: 'chat', text: `hi ${S.u32() % 100}` }, { type: 'coin' }, { type: 'dice', count: 2, sides: 6 }, { type: 'pickPlayer' }]));
  if (S.chance(0.02)) return act(H, { type: 'timer', secs: 60 });
  const sp = g.speaker; const ch = g.nominee || any();
  const cands = [
    [any(), { type: 'ready' }], [sp, { type: 'nominate', id: any() }], [H, { type: 'nominate', id: any() }],
    [any(), { type: 'vote', aye: S.chance(0.6) }], [H, { type: 'tally', ayes: ids.filter(() => S.chance(0.6)) }],
    [H, { type: 'check', yes: S.chance(0.2) }],
    [sp, { type: 'discard', i: Math.floor(S.r() * 3) }], [ch, { type: 'enact', i: Math.floor(S.r() * 2) }],
    [ch, { type: 'veto' }], [sp, { type: 'vetoReply', accept: S.chance(0.5) }],
    [H, { type: 'hostEnact', policy: S.chance(0.5) ? 'R' : 'D' }], [H, { type: 'hostVeto' }],
    [sp, { type: 'power', id: any() }], [H, { type: 'power', id: any() }], [sp, { type: 'peekDone' }],
  ];
  for (let k = 0; k < 14; k++) { const [who, msg] = S.pick(cands); const r = act(who, msg); if (r.kept) return r; }
  return fallback(G);
}
export function fallback(G) {
  const { log, ids, act } = G; const room = log.room; const H = ids[0];
  const fb = [{ type: 'skipReveal' }, { type: 'skip' }, ...ids.map((id) => ({ type: 'skip', id })),
    { type: 'tally', ayes: ids }, { type: 'check', yes: false }, { type: 'hostEnact', policy: 'R' }, { type: 'peekDone' }];
  for (const m of fb) { const r = act(H, m); if (r.kept) return r; }
  return { error: `stuck in ${room.phase}`, kept: false, stuck: true };
}

// Plays a game to the end (or `max` moves). onMove(G, r) after each kept move.
export function play(G, { max = 600, onMove = () => {} } = {}) {
  for (let i = 0; i < max && G.log.room.phase !== 'over'; i++) {
    const r = move(G); if (r.stuck) throw new Error(`${G.tag}: ${r.error}`);
    onMove(G, r);
  }
  return G;
}
