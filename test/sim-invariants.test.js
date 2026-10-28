// Whole The Gilded Chamber games under invariant oracles: seeded, in-process, no server. Every table size from 5 to 10,
// the house options (rebalance, exile, anonymous votes, first Speaker) on and off, and the phone, physical and hybrid play
// modes. Each game plays random but legal moves, mixes in illegal ones (they must be refused and change nothing), and adds
// pauses, Undo, the host's skips, late joiners, Restarts (also mid-game) and Play again. The first test to run plays every
// game once and records what broke; the five tests below each read their own part of that record. The rules are written out
// again here, so a slip in rules.js or room.js shows up as a disagreement. With physical roles the sim deals its own secret
// roles and answers the table's questions from them. scripts/sim-games.mjs is the online version.
// Coverage: SIM_GAMES=2000 by default (under 20 s). Table sizes rotate fastest, so every size meets every play mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForPlayer, viewForScreen, rulesVersion, LATEST_RULES_VERSION } from '../public/js/room.js';
import { roleList, startingDeck, shuffle, TEAMS, MIN_PLAYERS, MAX_PLAYERS, VETO_AT, PRETENDER_DANGER, REFORM_TO_WIN, DECREE_TO_WIN, TRACKER_MAX } from '../public/js/rules.js';

const GAMES = Number(process.env.SIM_GAMES) || 2000;
const SEED = 20261027;
const NOW = 1_800_000_000_000;
const HOST_KEY = 'sim-host';
const MAX_STEPS = 3000; // per room, a guard against a table that never finishes
const MAX_DEALS = 3;
const PHASES = new Set(['reveal', 'nominate', 'vote', 'legislate', 'power', 'check', 'chaos', 'over']);
const WIN_SIDE = { reforms: 'reform', executed: 'reform', decrees: 'cabal', pretender: 'cabal' };

const MODES = [{ play: 'phone' }, { play: 'physical' }];
for (const roles of ['app', 'physical']) for (const votes of ['app', 'physical']) for (const cards of ['app', 'physical']) MODES.push({ play: 'hybrid', roles, votes, cards });
const caseFor = (g) => ({
  n: MIN_PLAYERS + (g % (MAX_PLAYERS - MIN_PLAYERS + 1)), mode: MODES[Math.floor(g / 6) % MODES.length],
  house: { rebalance: g % 4 === 1, exile: g % 7 === 6, anonVotes: g % 9 === 8, firstLeader: g % 3 === 0 ? 'host' : 'random' },
});

function lcg(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const as = (id) => ({ playerId: id });
const hostId = (room) => room.players.find((p) => p.host).id;
const seatIds = (room) => room.players.filter((p) => !p.watch).map((p) => p.id);
// Everything a refused action must leave alone.
const snap = (room) => JSON.stringify({ players: room.players, game: room.game, phase: room.phase, logN: room.logN, paused: room.paused,
  timer: room.timer, mode: room.mode, house: room.house, rulesVersion: room.rulesVersion, undo: room.undo.length });
// Every role card in a view (an object with a sideName), wherever it sits.
const roleCardsIn = (x, out = []) => { if (x && typeof x === 'object') { if ('sideName' in x) out.push(x); for (const [k, v] of Object.entries(x)) if (k !== 'log' && k !== 'history') roleCardsIn(v, out); } return out; };
// The Boss's knowledge under the classic rules: the Syndicate, but only at tables of six or fewer. A Syndicate member
// knows the other Syndicate members and the Boss, and nothing else. Loyalists know nothing.
function expectedSees(id, roles, n) {
  const others = Object.keys(roles).filter((x) => x !== id);
  if (roles[id] === 'cabal') return others.filter((x) => roles[x] !== 'reformer').map((x) => ({ id: x, tag: roles[x] }));
  if (roles[id] === 'pretender' && n <= 6) return others.filter((x) => roles[x] === 'cabal').map((x) => ({ id: x, tag: 'cabal' }));
  return [];
}
// The host's skip: accepted everywhere except the three facts at the table (Fennel ruling 5): the unrest tile, the Boss
// check and physical legislation refuse it in every rulesVersion.
function skipOk(room) {
  const g = room.game; if (!g || room.phase === 'over') return false;
  return !(room.phase === 'chaos' || room.phase === 'check' || (room.phase === 'legislate' && !g.cardsApp));
}

const bad = (st, m) => st.rec.impossible.push(`${st.tag} [${st.steps}] ${st.room.phase}: ${m}`);

// One action. expect: true = must be accepted, false = must be refused and change nothing, undefined = not judged.
function send(st, actor, msg, expect) {
  const { room } = st;
  const before = expect === false ? snap(room) : null;
  let res;
  try { res = reduce(room, actor, msg, st.rng, NOW + st.steps); } catch (e) { bad(st, `${msg.type} threw: ${e.stack.split('\n').slice(0, 2).join(' ')}`); return false; }
  st.stats.moves++;
  if (expect === false) {
    st.stats.illegal++;
    if (res.ok) bad(st, `illegal ${msg.type} was accepted`);
    else if (snap(room) !== before) bad(st, `refused ${msg.type} changed the table`);
  } else if (expect === true && !res.ok) bad(st, `legal ${msg.type} refused: ${res.error}`);
  checkState(st);
  return !!res.ok;
}

// The table's state after every action: nothing impossible.
function checkState(st) {
  const { room } = st; const g = room.game;
  if (!g) { if (room.phase !== 'lobby') bad(st, 'no game, but not in the lobby'); return; }
  if (room.phase === 'lobby') bad(st, 'a game is running in the lobby');
  if (!PHASES.has(room.phase)) bad(st, 'unknown phase');
  // Policies: the deck (or pile), discards, hands and the board always add up to the tiles this table was dealt.
  const hand = g.cardsApp ? g.hand.length : room.phase === 'legislate' ? 3 : room.phase === 'chaos' ? 1 : 0;
  const drawn = g.cardsApp ? g.deck.length + g.discard.length : g.pile + g.discards;
  if (st.total && (drawn < 0 || drawn + hand + g.reform + g.decree !== st.total)) bad(st, `policies ${drawn}+${hand}+${g.reform}+${g.decree} != ${st.total}`);
  // Unrest: the tracker counts 0 to 2, and reads 3 only while the host is asked for the turned-over tile.
  if (g.tracker < 0 || g.tracker > TRACKER_MAX || (g.tracker === TRACKER_MAX && room.phase !== 'chaos')) bad(st, `tracker ${g.tracker}`);
  if (g.reform > REFORM_TO_WIN || g.decree > DECREE_TO_WIN || (room.phase !== 'over' && (g.reform >= REFORM_TO_WIN || g.decree >= DECREE_TO_WIN))) bad(st, `board ${g.reform}R ${g.decree}D`);
  if (room.phase === 'over') return;
  // Executed players never act, vote or stand for office; exiled players keep their vote but not their office.
  if (!g.alive[g.speaker] || g.exiled[g.speaker]) bad(st, `Speaker ${g.speaker} is out of the game`);
  for (const id of g.order) {
    if (!g.alive[id] && !g.exiled[id] && (id === g.speaker || id in g.votes || (id === g.nominee && ['vote', 'legislate'].includes(room.phase)))) bad(st, `executed ${id} still acts`); // the stale Chancellor is shown until the next nomination, so it counts only mid-government
    if (g.exiled[id] && id === g.nominee && ['vote', 'legislate'].includes(room.phase)) bad(st, `exiled ${id} is the Chancellor`);
  }
}

// Term limits, checked when the Chancellor is named (the last government is still the previous one then).
function checkNominee(st) {
  const { room } = st; const g = room.game; const last = g.lastGov;
  const office = g.order.filter((id) => g.alive[id] && !g.exiled[id]);
  if (!office.includes(g.nominee) || g.nominee === g.speaker) bad(st, `nominated ${g.nominee}, who may not hold office`);
  if (last && (g.nominee === last.chancellor || (office.length > 5 && g.nominee === last.speaker))) bad(st, 'term limits broken');
}

function dealt(st) {
  const { room } = st; const g = room.game; const n = g.n;
  if (!g.roles) { const deal = shuffle(roleList(n).roles, st.rng); st.truth = Object.fromEntries(g.order.map((id, i) => [id, deal[i]])); } // physical roles: the sim's own deal
  else st.truth = { ...g.roles };
  const sd = startingDeck(n, room.house.rebalance);
  st.total = sd.deck.length + sd.decree;
  const count = (role) => Object.values(st.truth).filter((r) => r === role).length;
  if (Object.keys(st.truth).length !== n || count('reformer') !== TEAMS[n][0] || count('cabal') !== TEAMS[n][1] || count('pretender') !== 1) bad(st, 'the deal does not match the roles for this table');
  if (!!g.roles !== (room.mode.roles === 'app')) bad(st, 'roles dealt by the app in a physical deal, or the reverse');
  if (room.phase !== 'reveal' || g.decree !== sd.decree || g.reform || g.tracker) bad(st, 'a new deal does not start clean');
  if (g.cardsApp ? g.deck.length !== sd.deck.length : g.pile !== sd.deck.length) bad(st, 'the new deal has the wrong number of policies');
}

function deal(st) {
  if (!send(st, as(hostId(st.room)), { type: 'start' }, true)) return false;
  dealt(st); return true;
}

// Phase by phase, the legal move the table would make. Returns nothing; every move is sent and judged.
function progress(st) {
  const { room, rng, stats } = st; const g = room.game; const H = as(hostId(room));
  const voters = g.order.filter((id) => g.alive[id] || g.exiled[id]);
  switch (room.phase) {
    case 'reveal': {
      const unready = g.order.filter((id) => !g.ready[id]);
      if (rng() < 0.15) send(st, H, { type: 'skipReveal' }, true);
      else send(st, as(pick(rng, unready)), { type: 'ready' }, true);
      return;
    }
    case 'nominate': {
      const last = g.lastGov;
      const opts = g.order.filter((id) => g.alive[id] && !g.exiled[id] && id !== g.speaker && id !== last?.chancellor && !(voters.length > 5 && id === last?.speaker));
      if (!opts.length) { bad(st, 'no eligible Chancellor'); return; }
      send(st, as(g.speaker), { type: 'nominate', id: pick(rng, opts) }, true);
      return;
    }
    case 'vote': {
      checkNominee(st);
      if (room.mode.votes === 'app') {
        const todo = voters.filter((id) => !(id in g.votes));
        send(st, as(pick(rng, todo)), { type: 'vote', aye: rng() < 0.5 }, true);
      } else send(st, H, { type: 'tally', ayes: voters.filter(() => rng() < 0.5) }, true);
      return;
    }
    case 'legislate': {
      if (!g.cardsApp) {
        if (g.decree >= VETO_AT && rng() < 0.15) { if (send(st, H, { type: 'hostVeto' }, true)) stats.vetoes++; return; }
        send(st, H, { type: 'hostEnact', policy: rng() < 0.6 ? 'R' : 'D' }, true);
      } else if (g.leg === 'speaker') send(st, as(g.speaker), { type: 'discard', i: Math.floor(rng() * 3) }, true);
      else if (g.leg === 'chancellor') {
        if (g.decree >= VETO_AT && !g.vetoRefused && rng() < 0.3) send(st, as(g.nominee), { type: 'veto' }, true);
        else send(st, as(g.nominee), { type: 'enact', i: Math.floor(rng() * 2) }, true);
      } else { const accept = rng() < 0.5; if (send(st, as(g.speaker), { type: 'vetoReply', accept }, true) && accept) stats.vetoes++; }
      return;
    }
    case 'power': {
      stats.powers[g.power] = (stats.powers[g.power] || 0) + 1;
      if (g.power === 'peek') { send(st, as(g.speaker), { type: 'peekDone' }, true); return; }
      const opts = g.order.filter((id) => g.alive[id] && id !== g.speaker
        && !(g.power === 'investigate' && g.investigated.includes(id)) && !(g.power === 'special' && g.exiled[id]));
      send(st, as(g.speaker), { type: 'power', id: pick(rng, opts) }, true);
      return;
    }
    case 'check': { // physical roles: the host answers from the sim's own deal (the table knows, the app does not)
      const id = g.check.id; send(st, H, { type: 'check', yes: st.truth[id] === 'pretender' }, true);
      return;
    }
    case 'chaos': send(st, H, { type: 'hostEnact', policy: rng() < 0.6 ? 'R' : 'D' }, true); return;
    default: bad(st, `no move for phase ${room.phase}`);
  }
}

// Illegal moves for this phase: each one is refused by rule, so it must change nothing.
function tryIllegal(st) {
  const { room, rng } = st; const g = room.game; const H = as(hostId(room));
  const others = g.order.filter((id) => id !== hostId(room) && id !== g.speaker && id !== g.nominee);
  if (!others.length) return;
  const other = as(pick(rng, others));
  const menu = [
    [other, { type: 'restart' }], [other, { type: 'again' }], [other, { type: 'undo' }], [other, { type: 'skipReveal' }],
    [other, { type: 'skip', id: other.playerId }], [other, { type: 'pause' }], [other, { type: 'nonsense' }], [H, { type: 'nonsense' }],
    [H, { type: 'start' }], [other, { type: 'nominate', id: other.playerId }], [as(g.speaker), { type: 'nominate', id: g.speaker }],
    [other, { type: 'power', id: g.speaker }], [other, { type: 'discard', i: 0 }], [other, { type: 'enact', i: 0 }],
    [other, { type: 'peekDone' }], [other, { type: 'veto' }], [other, { type: 'vetoReply', accept: true }],
  ];
  if (room.phase !== 'vote') menu.push([other, { type: 'vote', aye: true }], [H, { type: 'tally', ayes: [] }]);
  if (room.phase !== 'reveal') menu.push([other, { type: 'ready' }]);
  if (room.phase !== 'check') menu.push([H, { type: 'check', yes: true }]);
  if (g.cardsApp) menu.push([H, { type: 'hostEnact', policy: 'R' }]);
  const [actor, msg] = pick(rng, menu);
  send(st, actor, msg, false);
}

function kickWatchers(st) {
  const { room } = st; const H = as(hostId(room));
  for (const p of room.players.filter((x) => x.watch && !x.host)) send(st, H, { type: 'kick', id: p.id }, true);
}

// Restart: a fresh deal for the same table, with nothing of the old game left.
function restart(st, mid) {
  const { room, stats } = st; kickWatchers(st);
  const code = room.code; const gameNo = room.gameNo; const ids = room.players.map((p) => p.id);
  if (!send(st, as(hostId(room)), { type: 'restart' }, true)) return false;
  stats.restarts++; if (mid) stats.midRestarts++;
  const g = room.game; const sd = startingDeck(g.n, room.house.rebalance);
  const bad2 = (m) => st.rec.restart.push(`${st.tag} [${st.steps}]: ${m}`);
  if (room.code !== code) bad2('the room code changed');
  if (!ids.every((id) => room.players.some((p) => p.id === id))) bad2('a player was lost');
  if (room.rulesVersion !== LATEST_RULES_VERSION) bad2(`rulesVersion ${room.rulesVersion} after Restart`);
  if (room.gameNo !== gameNo + 1) bad2('gameNo did not move on');
  if (room.phase !== 'reveal') bad2(`phase ${room.phase} after Restart`);
  if (g.history.length || g.lastVote || g.lastGov || g.tracker || g.reform || g.decree !== sd.decree) bad2('old results survived');
  if (Object.keys(g.ready).length) bad2('old ready marks survived');
  if (room.log.some((e) => e.kind !== 'game')) bad2('old log or chat survived');
  if (room.paused || room.timer || room.undo.length) bad2('a pause, a timer or undo history survived');
  dealt(st);
  return true;
}

function again(st) {
  const { room, stats } = st; kickWatchers(st);
  send(st, as(hostId(room)), { type: 'again' }, true); stats.agains++;
  deal(st);
}

// One move from the current phase: mostly legal, now and then an illegal one, a pause, an Undo or a skip.
function step(st) {
  const { room, rng, stats } = st; const g = room.game; const H = as(hostId(room));
  if (room.paused) { // a paused table refuses every game action
    send(st, as(pick(rng, g.order)), { type: 'vote', aye: true }, false);
    send(st, H, { type: 'resume' }, true);
    return;
  }
  if (rng() < 0.02) { send(st, H, { type: 'pause' }, true); stats.pauses++; return; }
  if (rng() < 0.02) tryIllegal(st);
  if (rng() < 0.01) { // Undo: accepted only when there is a step to take back
    const can = room.undo.length > 0;
    if (send(st, H, { type: 'undo' }, can) && can) stats.undos++;
    return;
  }
  if (rng() < 0.004) { restart(st, true); return; }
  if (rng() < 0.01) { send(st, {}, { type: 'join', name: `W${st.late++}` }); stats.joins++; }
  if (rng() < 0.03) { // the host's skip, wherever the table has one
    const ok = skipOk(room);
    const id = room.phase === 'reveal' ? pick(rng, g.order.filter((x) => !g.ready[x]))
      : room.phase === 'vote' ? pick(rng, g.order.filter((x) => (g.alive[x] || g.exiled[x]) && !(x in g.votes))) : g.order[0];
    send(st, H, { type: 'skip', id }, ok);
    if (ok) stats.skips++;
    return;
  }
  progress(st);
}

// Who sees what, at this moment: no secret reaches a view it should not, and a reconnect sees the same game.
function checkViews(st) {
  const { room, rng, stats } = st; const g = room.game; if (!g) return;
  const over = room.phase === 'over';
  const online = new Set(room.players.filter(() => rng() < 0.5).map((p) => p.id));
  const leak = (who, m) => st.rec.leaks.push(`${st.tag} [${st.steps}] ${room.phase} ${who}: ${m}`);
  const know = (who, m) => st.rec.knowledge.push(`${st.tag} [${st.steps}] ${room.phase} ${who}: ${m}`);
  const anon = room.house.anonVotes;
  const audit = (who, v, viewer) => {
    stats.views++;
    const txt = JSON.stringify(v);
    if (/"(token|hostKey)":/.test(txt)) leak(who, 'a secret field');
    if (/"(deck|discard)":\[/.test(txt)) leak(who, 'deck or discard order');
    if (anon && /\(aye: /.test(txt)) leak(who, 'named votes shown while votes are anonymous');
    if (anon && [v.game.lastVote, ...v.game.history].some((h) => h && (h.ayes.length || h.nays.length))) leak(who, 'a vote is named');
    if (over) {
      if (g.roles && (Object.keys(v.game.roles || {}).length !== g.order.length || g.order.some((id) => v.game.roles[id]?.id !== st.truth[id]))) know(who, 'the end reveal is wrong');
      return;
    }
    const own = viewer && v.me?.role ? [v.me.role] : [];
    const cards = roleCardsIn(v);
    if (cards.length > own.length || cards.some((c) => !own.includes(c))) leak(who, `${cards.length} role card(s) shown before the end`);
    if (!viewer) { if (v.me || /"(hand|docket|sees|inquiries|peeked)":/.test(txt)) leak(who, 'the table screen shows a secret'); return; }
    const me = viewer; const seated = g.order.includes(me);
    if (v.me?.hand && !(room.phase === 'legislate' && g.cardsApp && me === (g.leg === 'speaker' ? g.speaker : g.nominee))) leak(who, 'a hand someone else should not see');
    if (v.me?.docket && !(room.phase === 'power' && g.power === 'peek' && g.cardsApp && me === g.speaker)) leak(who, 'the docket');
    if (JSON.stringify(v.me?.inquiries) !== JSON.stringify(seated ? g.seen[me] : undefined)) leak(who, 'inquiry results do not match the speaker’s own');
    for (const q of v.me?.inquiries || []) if (q.party !== (st.truth[q.id] === 'reformer' ? 'reform' : 'cabal')) know(who, `inquiry on ${q.id} gave the wrong party`);
    if (seated && g.roles) {
      stats.seesChecked++;
      if (v.me?.role?.id !== st.truth[me]) know(who, `role card ${v.me?.role?.id} but the deal is ${st.truth[me]}`);
      const want = expectedSees(me, st.truth, g.n).map((k) => `${k.id}:${k.tag}`).sort().join();
      const got = (v.me.sees || []).map((k) => `${k.id}:${k.tag}`).sort().join();
      if (got !== want) know(who, `sees [${got}], should see [${want}]`);
    } else if (v.me?.role || v.me?.sees) leak(who, 'a role card with no role to see');
  };
  for (const p of room.players) if (over || rng() < 0.3) audit(`player ${p.id}`, viewForPlayer(room, p.id, online), p.id); // every viewer at the end, a sample before
  const one = pick(rng, room.players).id; // a reconnect sees the same game (one viewer per check keeps the run short)
  if (JSON.stringify(viewForPlayer(room, one, new Set(seatIds(room))).game) !== JSON.stringify(viewForPlayer(room, one, online).game)) st.rec.leaks.push(`${st.tag}: a reconnect changed the game view`);
  audit('screen', viewForScreen(room, online), null);
}

// The game is over: the winner and the reason follow from the rules and the sim's own deal.
function checkWinner(st) {
  const { room } = st; const g = room.game; const w = (m) => st.rec.winner.push(`${st.tag}: ${m}`);
  const boss = Object.keys(st.truth).find((id) => st.truth[id] === 'pretender');
  if (!g.winner || !g.reason) return w('the game ended with no winner');
  if (WIN_SIDE[g.reason] !== g.winner) return w(`reason ${g.reason} for ${g.winner}`);
  if (g.reason === 'reforms' && g.reform !== REFORM_TO_WIN) w(`5 Reforms claimed with ${g.reform}`);
  if (g.reason === 'decrees' && g.decree !== DECREE_TO_WIN) w(`6 Decrees claimed with ${g.decree}`);
  if (g.reason === 'executed' && g.alive[boss] !== false) w('the Boss was not removed');
  if (g.reason === 'pretender' && (!g.lastGov || st.truth[g.lastGov.chancellor] !== 'pretender' || g.decree < PRETENDER_DANGER)) w('the Boss was not elected Chancellor after 3 Decrees');
  st.rec.stats.winners[g.winner] = (st.rec.stats.winners[g.winner] || 0) + 1;
  st.rec.stats.reasons[g.reason] = (st.rec.stats.reasons[g.reason] || 0) + 1;
  if (room.phase !== 'over') w('the winner was set on a game still running');
}

function playGame(index, rng, rec) {
  const c = caseFor(index);
  const room = newRoom(`SIM${index}`, HOST_KEY);
  const st = { rec, rng, stats: rec.stats, room, tag: `game ${index} (${c.n} players, ${c.mode.play})`, steps: 0, late: 1, lastPhase: null, truth: {}, total: 0 };
  rec.stats.games++;
  for (let i = 0; i < c.n; i++) send(st, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? HOST_KEY : undefined }, true);
  send(st, as(hostId(room)), { type: 'mode', mode: c.mode }, true);
  send(st, as(hostId(room)), { type: 'house', house: c.house }, true);
  deal(st);
  // A room started before rulesVersion was pinned: it keeps version 1 until Restart or Play again.
  if (rng() < 0.2) { delete room.rulesVersion; rec.stats.legacy++; }
  let deals = 1;
  for (let i = 0; ; i++) {
    if (room.phase === 'over') {
      checkWinner(st);
      checkViews(st);
      if (deals >= MAX_DEALS || rng() < 0.4) break;
      deals++;
      if (!(rng() < 0.5 && restart(st, false))) again(st);
      continue;
    }
    if (i >= MAX_STEPS) { bad(st, `no finish in ${MAX_STEPS} steps`); break; }
    st.steps = i;
    step(st);
    if (room.game && ((room.phase !== st.lastPhase && ['reveal', 'power', 'check', 'chaos'].includes(room.phase)) || rng() < 0.01)) checkViews(st);
    st.lastPhase = room.phase;
  }
}

let RESULT = null;
function simulate() {
  if (RESULT) return RESULT;
  const rec = { impossible: [], leaks: [], knowledge: [], winner: [], restart: [],
    stats: { games: 0, moves: 0, illegal: 0, pauses: 0, undos: 0, skips: 0, joins: 0, restarts: 0, midRestarts: 0, agains: 0, legacy: 0,
      views: 0, seesChecked: 0, vetoes: 0, winners: {}, reasons: {}, powers: {} } };
  const rng = lcg(SEED);
  for (let g = 0; g < GAMES; g++) playGame(g, rng, rec);
  RESULT = rec;
  return rec;
}

test('sim: no impossible states', () => {
  const rec = simulate();
  assert.deepEqual(rec.impossible.slice(0, 10), [], `${rec.impossible.length} impossible state(s)`);
  assert.equal(rec.stats.games, GAMES);
  assert.ok(rec.stats.illegal > GAMES, 'illegal moves were barely tried');
  assert.ok(rec.stats.undos > 0 && rec.stats.skips > 0 && rec.stats.pauses > 0, 'Undo, skips or pauses were never used');
});

test('sim: right winner', () => {
  const rec = simulate();
  assert.deepEqual(rec.winner.slice(0, 10), [], `${rec.winner.length} wrong winner(s)`);
  for (const side of ['reform', 'cabal']) assert.ok(rec.stats.winners[side] > 0, `no game was won by ${side}`);
  for (const reason of ['reforms', 'decrees', 'executed', 'pretender']) assert.ok(rec.stats.reasons[reason] > 0, `no game ended by ${reason}`);
});

test('sim: knowledge correct', () => {
  const rec = simulate();
  assert.deepEqual(rec.knowledge.slice(0, 10), [], `${rec.knowledge.length} knowledge problem(s)`);
  assert.ok(rec.stats.seesChecked > GAMES, 'knowledge was barely checked');
});

test('sim: no leaks', () => {
  const rec = simulate();
  assert.deepEqual(rec.leaks.slice(0, 10), [], `${rec.leaks.length} leak(s)`);
  assert.ok(rec.stats.views > GAMES, 'views were barely checked');
});

test('sim: restart resets', () => {
  const rec = simulate();
  assert.deepEqual(rec.restart.slice(0, 10), [], `${rec.restart.length} problem(s)`);
  assert.ok(rec.stats.restarts > 0 && rec.stats.midRestarts > 0 && rec.stats.agains > 0, 'Restart or Play again was barely exercised');
});
