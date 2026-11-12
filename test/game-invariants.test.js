// The Gilded Chamber adapter for the shared game-rules kit (test/kit/game-invariants.mjs, copied unchanged from
// the shared invariants kit). Four properties over seeded games, every table size 5..10 with the house options
// rebalance and exile on and off, in phone mode: game over stays final, no step can block, no leaks (non-interference), and
// no Undo after game over. Physical and hybrid modes are covered by test/sim-invariants.test.js. The Undo property had a
// known bug before rulesVersion 2 was pinned (see docs/logic-audit.md); it passes now and is enforced without a todo.
import { gameInvariantTests, pick } from './kit/game-invariants.mjs';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';
import { knowledgeFor, shuffle, MIN_PLAYERS, MAX_PLAYERS } from '../public/js/rules.js';
import { PRESETS, presetMessages } from '../public/js/presets.js';

const HOST_KEY = 'kit-host';
const GAMES = Number(process.env.KIT_GAMES) || 120;
const CASES = [];
for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) for (const rebalance of [false, true]) for (const exile of [false, true]) CASES.push({ n, house: { rebalance, exile } });

// Every preset's house rules too (anonymous votes and the turn clock are only reached through presets), at every table size.
for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) for (const p of PRESETS) if (p.settings.play === 'phone') CASES.push({ n, house: presetMessages(p).house });

const seats = (room) => room.game.order;
const hostOf = (room) => ({ playerId: room.players.find((p) => p.host).id });
const as = (id) => ({ playerId: id });

const adapter = {
  name: 'The Gilded Chamber',
  cases: CASES,
  setup(c, rng) {
    const room = newRoom('KIT', HOST_KEY);
    for (let i = 0; i < c.n; i++) reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? HOST_KEY : undefined }, rng, 0);
    const H = hostOf(room);
    reduce(room, H, { type: 'house', house: c.house }, rng, 0);
    const res = reduce(room, H, { type: 'start' }, rng, 0);
    if (!res.ok) throw new Error(`setup did not deal: ${res.error}`);
    return room;
  },
  apply(room, actor, msg, rng, now) { const res = reduce(room, actor, msg, rng, now); return { ok: !!res.ok, state: room }; },
  isOver: (room) => room.phase === 'over',
  progress(room, rng) {
    const g = room.game; const ids = seats(room); const H = hostOf(room);
    const voters = g.order.filter((id) => g.alive[id] || g.exiled[id]);
    switch (room.phase) {
      case 'reveal': return ids.filter((id) => !g.ready[id]).map((id) => [as(id), { type: 'ready' }]);
      case 'nominate': {
        const last = g.lastGov;
        const opts = ids.filter((id) => g.alive[id] && !g.exiled[id] && id !== g.speaker && id !== last?.chancellor && !(voters.length > 5 && id === last?.speaker));
        return opts.map((id) => [as(g.speaker), { type: 'nominate', id }]);
      }
      case 'vote': return voters.filter((id) => !(id in g.votes)).map((id) => [as(id), { type: 'vote', aye: rng() < 0.6 }]);
      case 'legislate':
        if (g.leg === 'speaker') return [[as(g.speaker), { type: 'discard', i: 0 }]];
        if (g.leg === 'veto') return [[as(g.speaker), { type: 'vetoReply', accept: rng() < 0.5 }]];
        return [[as(g.nominee), { type: 'enact', i: 0 }]];
      case 'power': {
        if (g.power === 'peek') return [[as(g.speaker), { type: 'peekDone' }]];
        const opts = ids.filter((id) => g.alive[id] && id !== g.speaker && !(g.power === 'investigate' && g.investigated.includes(id)) && !(g.power === 'special' && g.exiled[id]));
        return opts.map((id) => [as(g.speaker), { type: 'power', id }]);
      }
      default: return [[H, { type: 'nonsense' }]];
    }
  },
  fallback(room) {
    const g = room.game; const H = hostOf(room);
    switch (room.phase) {
      case 'reveal': return [H, { type: 'skipReveal' }];
      case 'nominate': return [H, { type: 'skip', id: g.speaker }];
      case 'vote': return [H, { type: 'skip', id: g.order.find((id) => (g.alive[id] || g.exiled[id]) && !(id in g.votes)) }];
      case 'legislate': return [H, { type: 'skip' }];
      case 'power': return [H, { type: 'skip' }];
      default: return null;
    }
  },
  probes(room, rng) {
    const ids = seats(room); const H = hostOf(room); const p = as(pick(rng, ids)); const other = pick(rng, ids);
    return [[p, { type: 'ready' }], [H, { type: 'skipReveal' }], [p, { type: 'nominate', id: other }], [p, { type: 'vote', aye: true }],
      [H, { type: 'tally', ayes: ids }], [p, { type: 'discard', i: 0 }], [p, { type: 'enact', i: 0 }], [p, { type: 'veto' }],
      [p, { type: 'vetoReply', accept: true }], [p, { type: 'power', id: other }], [p, { type: 'peekDone' }], [H, { type: 'check', yes: true }],
      [H, { type: 'hostEnact', policy: 'R' }], [H, { type: 'skip', id: other }], [H, { type: 'skip' }], [H, { type: 'pause' }]];
  },
  // The reducer has no Undo of its own any more (Undo and Redo are steps on the event log, see undo-redo.test.js),
  // so the kit's "no Undo after game over" check sees the reducer refuse it. Going back from the end screen on purpose
  // goes through the log, with a confirm sheet, and never past a secret look.
  undo: (room) => [hostOf(room), { type: 'undo' }],
  fingerprint: (room) => JSON.stringify({ phase: room.phase, game: room.game }),
  viewers: (room) => room.players.map((p) => p.id),
  view: (room, id) => viewForPlayer(room, id),
  secretsRevealed: (room) => room.phase === 'over',
  secretHolders: (room) => (room.game?.roles ? seats(room) : []),
  withSecrets(room, mapping) {
    const r = structuredClone(room); const old = room.game.roles;
    for (const [id, from] of Object.entries(mapping)) r.game.roles[id] = old[from];
    return r;
  },
  // A Syndicate member and the Boss see the other Syndicate members and the Boss (the Boss only at tables of six or
  // fewer); a Loyalist sees nothing. Two others in the same class may swap roles without the viewer noticing.
  knowledgeClass(room, viewer, other) {
    const g = room.game; const mine = g.roles[viewer];
    const tag = knowledgeFor(viewer, g.roles, g.n).find((k) => k.id === other)?.tag || '-';
    return mine === 'reformer' ? 'nothing' : tag;
  },
};

gameInvariantTests(adapter, { games: GAMES });
