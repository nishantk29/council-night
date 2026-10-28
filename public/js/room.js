// The Gilded Chamber room: the game reducer and the per-viewer projections. Table things (chat, tools, host
// controls, play modes) come from table.js. Secrecy lives in viewForPlayer / viewForScreen: the deck order,
// the discard pile, hands, peeks and inquiry results never leave the room except to the one player entitled.
import { ROLES, SIDES, TEAMS, MIN_PLAYERS, MAX_PLAYERS, REFORM_TO_WIN, DECREE_TO_WIN, VETO_AT, PRETENDER_DANGER, TRACKER_MAX,
  POWERS, POWER_TEXT, roleList, startingDeck, shuffle, knowledgeFor, partyOf, eligibleChancellors, electionPasses, HOUSE_DEFAULTS, DEFAULT_SETTINGS } from './rules.js';
import { newTable, reduceTable, tableView, onPhaseChange, modeProblem, log, byId, seatIds } from './table.js';

// Open rooms keep the rules they started with: a room without rulesVersion is version 1 (never backfilled). A new
// room, a fresh deal and Restart all move to the latest. Rule-affecting fixes are gated on (room.rulesVersion || 1) >= 2.
export const LATEST_RULES_VERSION = 2;
export const rulesVersion = (room) => room.rulesVersion || 1;

export function newRoom(code, hostKey) {
  const room = newTable(code, hostKey, DEFAULT_SETTINGS, HOUSE_DEFAULTS);
  room.rulesVersion = LATEST_RULES_VERSION; room.gameNo = 1;
  return room;
}

const ok = (data = {}) => ({ ok: true, data });
const err = (error) => ({ error });
const alive = (room) => room.game.order.filter((id) => room.game.alive[id]);
const office = (room) => alive(room).filter((id) => !room.game.exiled[id]);
const voters = (room) => room.game.order.filter((id) => room.game.alive[id] || room.game.exiled[id]);
const HOOKS = { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, houseDefaults: HOUSE_DEFAULTS, alive: (room) => (room.game ? voters(room) : seatIds(room)) };
const UNDOABLE = new Set(['nominate', 'vote', 'tally', 'discard', 'enact', 'veto', 'vetoReply', 'hostEnact', 'hostVeto', 'power', 'peekDone', 'check', 'skip']);
const GAME = new Set([...UNDOABLE, 'ready', 'skipReveal']);
const nm = (room, id) => byId(room, id)?.name || '?';
const PNAME = { R: 'Reform', D: 'Decree' };
// Why the game ended, in the words the game-over pop-up shows on every screen (chosen here, once, by the server).
export const WIN_TEXT = { reforms: '5 Reforms passed', decrees: '6 Decrees passed', pretender: 'The Boss was elected Chancellor', executed: 'The Boss was removed' };

function finish(room, winner, reason, now) {
  const g = room.game; g.winner = winner; g.reason = reason; room.phase = 'over'; room.overN = (room.overN || 0) + 1; room.undo = []; room.undoBarrier = false; // every role is public now: nothing can be un-ended
  log(room, 'game', winner === 'reform' ? 'The Loyalists win.' : 'The Syndicate wins.', null, now);
}

// Draw pile bookkeeping. With physical policies the app tracks only the counts (the real tiles are on the table).
function ensureDeck(room, rng, now) {
  const g = room.game;
  g.peek = {}; // every call precedes a draw, which makes any earlier peek stale
  if (g.cardsApp) { if (g.deck.length < 3) { g.deck = shuffle([...g.deck, ...g.discard], rng); g.discard = []; g.reshuffles++; log(room, 'game', 'Fewer than three policies left: the discards were shuffled back into the pile.', null, now); } }
  else if (g.pile < 3) { g.pile += g.discards; g.discards = 0; g.reshuffles++; g.reshuffleNow = true; log(room, 'game', 'Fewer than three policies left: shuffle the discard pile back into the draw pile.', null, now); }
}

function startGame(room, rng, now, restart = false) {
  const ids = seatIds(room); const n = ids.length;
  const list = roleList(n); if (list.error) return err(list.error);
  const mp = modeProblem(room); if (mp) return err(mp);
  let roles = null;
  if (room.mode.roles === 'app') { const d = shuffle(list.roles, rng); roles = {}; ids.forEach((id, i) => { roles[id] = d[i]; }); }
  const sd = startingDeck(n, room.house.rebalance);
  const hostSeat = ids.indexOf(room.players.find((p) => p.host)?.id);
  const first = room.house.firstLeader === 'host' && hostSeat >= 0 ? hostSeat : Math.floor(rng() * n);
  const cardsApp = room.mode.cards === 'app';
  room.game = {
    roles, n, order: ids, alive: Object.fromEntries(ids.map((id) => [id, true])), exiled: {},
    rot: first, speaker: ids[first], special: false, nominee: null, lastGov: null,
    votes: {}, tracker: 0, reform: 0, decree: sd.decree, cardsApp,
    deck: cardsApp ? shuffle(sd.deck, rng) : [], discard: [], pile: sd.deck.length, discards: 0, reshuffles: 0, reshuffleNow: false,
    hand: [], leg: null, vetoRefused: false, power: null, check: null, investigated: [], seen: {}, peek: {}, confirmedNot: [],
    history: [], lastVote: null, lastPolicy: null, ready: {}, winner: null, reason: null,
  };
  room.phase = 'reveal'; room.undo = []; room.undoBarrier = false;
  if (restart) { // a clean slate: nothing from the old game survives
    room.log = []; room.logN = 0; room.timer = null; room.talk = null; room.paused = null; room.poll = null;
    room.counters = []; room.nudges = {};
  }
  room.rulesVersion = LATEST_RULES_VERSION;
  room.gameNo = (room.gameNo || 1) + 1;
  log(room, 'game', `${restart ? 'Restarted' : 'New game'}: ${n} players, ${TEAMS[n][0]} Loyalists, ${TEAMS[n][1]} Syndicate and the Boss.${sd.decree ? ' Rebalanced: one Decree starts on the board.' : ''}`, null, now);
  return ok();
}

function nextSpeaker(room) {
  const g = room.game; const n = g.order.length;
  g.special = false;
  for (let k = 1; k <= n; k++) { const i = (g.rot + k) % n; if (g.alive[g.order[i]] && !g.exiled[g.order[i]]) { g.rot = i; g.speaker = g.order[i]; break; } }
  g.nominee = null; g.votes = {}; g.hand = []; g.leg = null; g.vetoRefused = false; g.power = null;
  room.phase = 'nominate';
}

function enactPolicy(room, p, byGov, rng, now) {
  const g = room.game;
  if (p === 'R') g.reform++; else g.decree++;
  g.tracker = 0; g.reshuffleNow = false;
  g.lastPolicy = { policy: p, byGov, speaker: byGov ? g.speaker : null, chancellor: byGov ? g.nominee : null };
  log(room, 'game', `${byGov ? `${nm(room, g.speaker)} and ${nm(room, g.nominee)} enacted a ${PNAME[p]}` : `Unrest: the top policy, a ${PNAME[p]}, was enacted`}. Reforms ${g.reform}, Decrees ${g.decree}.`, null, now);
  if (g.reform >= REFORM_TO_WIN) return finish(room, 'reform', 'reforms', now);
  if (g.decree >= DECREE_TO_WIN) return finish(room, 'cabal', 'decrees', now);
  ensureDeck(room, rng, now);
  const power = byGov && p === 'D' ? POWERS[g.n][g.decree - 1] : null;
  if (power) { g.power = power; room.phase = 'power'; log(room, 'game', `Power: ${POWER_TEXT[power][0]}. ${POWER_TEXT[power][1]}`, null, now); return; }
  nextSpeaker(room);
}

function failGovernment(room, rng, now, why) {
  const g = room.game;
  g.tracker++;
  log(room, 'game', `${why} Unrest ${g.tracker} of ${TRACKER_MAX}.`, null, now);
  if (g.tracker >= TRACKER_MAX) {
    g.lastGov = null; // term limits are forgotten
    if (g.cardsApp) { ensureDeck(room, rng, now); enactPolicy(room, g.deck.shift(), false, rng, now); } // moves the Speaker on
    else { ensureDeck(room, rng, now); g.pile -= 1; room.phase = 'chaos'; } // the host turns over the top tile and enters it
    return;
  }
  nextSpeaker(room);
}

function resolveVote(room, rng, now) {
  const g = room.game; const vs = voters(room);
  const ayes = vs.filter((id) => g.votes[id]); const nays = vs.filter((id) => !g.votes[id]);
  const passed = electionPasses(ayes.length, vs.length);
  const rec = { speaker: g.speaker, chancellor: g.nominee, ayes, nays, passed, tracker: g.tracker };
  g.history.push(rec); g.lastVote = rec; g.votes = {};
  log(room, 'game', `Election: ${nm(room, g.speaker)} and ${nm(room, g.nominee)} ${passed ? 'elected' : 'turned down'} ${ayes.length}–${nays.length}${room.house.anonVotes ? '' : ` (aye: ${ayes.map((id) => nm(room, id)).join(', ') || 'nobody'})`}.`, null, now);
  if (!passed) return failGovernment(room, rng, now, 'The government was turned down.');
  g.lastGov = { speaker: g.speaker, chancellor: g.nominee };
  if (g.decree >= PRETENDER_DANGER) {
    if (g.roles) {
      if (g.roles[g.nominee] === 'pretender') return finish(room, 'cabal', 'pretender', now);
      g.confirmedNot.push(g.nominee); log(room, 'game', `${nm(room, g.nominee)} is not the Boss.`, null, now);
    } else { g.check = { kind: 'chancellor', id: g.nominee }; room.phase = 'check'; return; }
  }
  startLegislation(room, rng, now);
}

function startLegislation(room, rng, now) {
  const g = room.game;
  room.phase = 'legislate'; g.leg = 'speaker'; g.vetoRefused = false;
  ensureDeck(room, rng, now);
  if (g.cardsApp) g.hand = g.deck.splice(0, 3);
  else g.pile -= 3;
}

function gameReduce(room, actor, msg, rng, now) {
  const me = actor.playerId ? byId(room, actor.playerId) : null;
  const isHost = !!me?.host; const g = room.game;
  const seated = me && g && g.order.includes(me.id);
  const isPhys = (id) => byId(room, id)?.phoneless || room.mode.play === 'physical';
  const asSeat = (id) => me && (me.id === id || (isHost && isPhys(id))); // the host acts for a phoneless seat

  switch (msg.type) {
    case 'settings': return isHost ? ok() : err('Only the host can change the setup.');
    case 'start': {
      if (!isHost) return err('Only the host can deal.');
      if (room.phase !== 'lobby') return err('The game has already started.');
      return startGame(room, rng, now);
    }
    case 'restart': { // host: a fresh deal for the same table, straight into the reveal
      if (!isHost) return err('Only the host can restart.');
      if (room.phase === 'lobby') return err('Nothing to restart yet.');
      // Same as Play again: seats nobody took over are dropped and late watchers sit in the new deal. If the table
      // cannot be dealt, everything is put back.
      const prevPlayers = room.players; const was = prevPlayers.map((p) => p.watch);
      room.players = prevPlayers.filter((p) => !p.open);
      for (const p of room.players) p.watch = !!(p.host && room.house.sitOut);
      const res = startGame(room, rng, now, true);
      if (res.error) { room.players = prevPlayers; prevPlayers.forEach((p, i) => { p.watch = was[i]; }); } else onPhaseChange(room, now); // a phase timer starts like a fresh deal
      return res;
    }
    case 'ready': {
      if (room.phase !== 'reveal' || !seated) return err('Not now.');
      g.ready[me.id] = true;
      if (g.order.every((id) => g.ready[id] || byId(room, id).phoneless)) nextSpeakerFirst(room);
      return ok();
    }
    case 'skipReveal': { if (!isHost || room.phase !== 'reveal') return err('Not now.'); nextSpeakerFirst(room); return ok(); }
    case 'nominate': {
      if (room.phase !== 'nominate') return err('It isn’t time to nominate.');
      if (!asSeat(g.speaker)) return err('Only the Speaker nominates.');
      const ok2 = eligibleChancellors(g.speaker, office(room), g.lastGov, alive(room));
      if (!ok2.includes(msg.id)) return err('That player can’t be nominated (term limits, or not in the game).');
      g.nominee = msg.id; g.votes = {}; room.phase = 'vote';
      return ok();
    }
    case 'vote': {
      if (room.phase !== 'vote') return err('There is no election right now.');
      if (room.mode.votes !== 'app') return err('Votes are cast at the table in this game.');
      if (!me || !voters(room).includes(me.id)) return err('Only players still in the game vote.');
      if (typeof msg.aye !== 'boolean') return err('Vote aye or nay.');
      if (me.id in g.votes) return err('You have already voted.');
      g.votes[me.id] = msg.aye;
      if (Object.keys(g.votes).length >= voters(room).length) resolveVote(room, rng, now);
      return ok();
    }
    case 'tally': {
      if (!isHost || room.phase !== 'vote') return err('Only the host enters the table’s votes, during an election.');
      const yes = new Set(Array.isArray(msg.ayes) ? msg.ayes : []);
      g.votes = Object.fromEntries(voters(room).map((id) => [id, yes.has(id)]));
      resolveVote(room, rng, now); return ok();
    }
    case 'check': { // physical roles: the table answers "is the new Chancellor the Boss?" / "was the executed player?"
      if (!isHost || room.phase !== 'check') return err('Not now.');
      const c = g.check; g.check = null;
      if (c.kind === 'chancellor') {
        if (msg.yes) return (finish(room, 'cabal', 'pretender', now), ok());
        g.confirmedNot.push(c.id); log(room, 'game', `${nm(room, c.id)} is not the Boss.`, null, now);
        startLegislation(room, rng, now); return ok();
      }
      if (msg.yes) return (finish(room, 'reform', 'executed', now), ok());
      log(room, 'game', `${nm(room, c.id)} was not the Boss.`, null, now);
      nextSpeaker(room); return ok();
    }
    case 'discard': { // the Speaker discards one of three, passing two to the Chancellor
      if (room.phase !== 'legislate' || g.leg !== 'speaker' || !g.cardsApp) return err('Not now.');
      if (!asSeat(g.speaker) || (isHost && me.id !== g.speaker && !isPhys(g.speaker))) return err('Only the Speaker holds these policies.');
      const i = msg.i; if (!(i >= 0 && i < 3)) return err('Choose one policy to discard.');
      g.discard.push(g.hand.splice(i, 1)[0]); g.leg = 'chancellor';
      return ok();
    }
    case 'enact': {
      if (room.phase !== 'legislate' || g.leg !== 'chancellor' || !g.cardsApp) return err('Not now.');
      if (!me || me.id !== g.nominee) return err('Only the Chancellor enacts.');
      const i = msg.i; if (!(i >= 0 && i < 2)) return err('Choose one policy to enact.');
      const p = g.hand.splice(i, 1)[0]; g.discard.push(...g.hand); g.hand = [];
      enactPolicy(room, p, true, rng, now); return ok();
    }
    case 'veto': { // the Chancellor proposes a veto (only once 5 Decrees are on the board)
      if (room.phase !== 'legislate' || g.leg !== 'chancellor' || !g.cardsApp) return err('Not now.');
      if (!me || me.id !== g.nominee) return err('Only the Chancellor can propose a veto.');
      if (g.decree < VETO_AT) return err('Veto unlocks after five Decrees.');
      if (g.vetoRefused) return err('The Speaker already refused a veto this session.');
      g.leg = 'veto'; log(room, 'game', `${nm(room, g.nominee)} proposed a veto.`, null, now);
      return ok();
    }
    case 'vetoReply': {
      if (room.phase !== 'legislate' || g.leg !== 'veto') return err('Not now.');
      if (!me || me.id !== g.speaker) return err('Only the Speaker answers a veto.');
      if (!msg.accept) { g.leg = 'chancellor'; g.vetoRefused = true; log(room, 'game', `${nm(room, g.speaker)} refused the veto.`, null, now); return ok(); }
      g.discard.push(...g.hand); g.hand = [];
      failGovernment(room, rng, now, 'The Speaker agreed to the veto: both policies were discarded.'); return ok();
    }
    case 'hostEnact': { // physical policies: the host enters what the Chancellor turned up
      if (!isHost || !['legislate', 'chaos'].includes(room.phase) || g.cardsApp) return err('Not now.');
      if (msg.policy !== 'R' && msg.policy !== 'D') return err('Reform or Decree?');
      if (room.phase === 'chaos') { enactPolicy(room, msg.policy, false, rng, now); return ok(); }
      g.discards += 2; enactPolicy(room, msg.policy, true, rng, now); return ok();
    }
    case 'hostVeto': {
      if (!isHost || room.phase !== 'legislate' || g.cardsApp) return err('Not now.');
      if (g.decree < VETO_AT) return err('Veto unlocks after five Decrees.');
      g.discards += 3; // the Speaker's discard plus both vetoed tiles
      failGovernment(room, rng, now, 'The Speaker agreed to the veto: both policies were discarded.'); return ok();
    }
    case 'power': {
      if (room.phase !== 'power') return err('No power to use now.');
      if (!asSeat(g.speaker) || (isHost && me.id !== g.speaker && !isPhys(g.speaker))) return err('Only the Speaker uses the power.');
      const t = msg.id; const pw = g.power;
      if (pw === 'peek') return err('Look at the docket, then tap Done.');
      if (!alive(room).includes(t) || t === g.speaker) return err('Choose another player still in the game.');
      if (pw === 'special' && !office(room).includes(t)) return err('An exiled player can’t be Speaker.');
      if (pw === 'investigate') {
        if (g.investigated.includes(t)) return err('Nobody can be looked into twice.');
        g.investigated.push(t);
        if (g.roles) (g.seen[g.speaker] ||= []).push({ id: t, party: partyOf(g.roles[t]) });
        log(room, 'game', `${nm(room, g.speaker)} looked into ${nm(room, t)}’s party${g.roles ? '' : ' (they hand over their party card in secret)'}.`, null, now);
        nextSpeaker(room); return ok();
      }
      if (pw === 'special') {
        log(room, 'game', `Snap election: ${nm(room, g.speaker)} chose ${nm(room, t)} as the next Speaker.`, null, now);
        const rot = g.rot; nextSpeaker(room); g.rot = rot; g.speaker = t; g.special = true; return ok();
      }
      if (pw === 'execute') {
        if (room.house.exile) g.exiled[t] = true;
        g.alive[t] = false;
        log(room, 'game', `${nm(room, g.speaker)} ${room.house.exile ? 'exiled' : 'executed'} ${nm(room, t)}.`, null, now);
        if (g.roles) { if (g.roles[t] === 'pretender') { finish(room, 'reform', 'executed', now); return ok(); } nextSpeaker(room); return ok(); }
        g.check = { kind: 'executed', id: t }; room.phase = 'check'; return ok();
      }
      return err('Unknown power.');
    }
    case 'peekDone': {
      if (room.phase !== 'power' || g.power !== 'peek') return err('Not now.');
      if (!asSeat(g.speaker) && !isHost) return err('Only the Speaker.');
      if (g.cardsApp && me.id === g.speaker) g.peek[g.speaker] = [...g.deck.slice(0, 3)]; // keep what they saw on their own phone
      log(room, 'game', `${nm(room, g.speaker)} looked at the top three policies.`, null, now);
      nextSpeaker(room); return ok();
    }
    case 'skip': {
      if (!isHost) return err('Only the host can skip.');
      const p = byId(room, msg.id);
      if (room.phase === 'reveal') { if (!p) return err('No such player.'); g.ready[p.id] = true; if (g.order.every((id) => g.ready[id] || byId(room, id).phoneless)) nextSpeakerFirst(room); return ok(); }
      if (room.phase === 'vote') {
        if (!p || !voters(room).includes(p.id) || p.id in g.votes) return err('That player has voted already.');
        g.votes[p.id] = false; log(room, 'host', `The host skipped ${p.name}’s vote (counted as nay).`, null, now);
        if (Object.keys(g.votes).length >= voters(room).length) resolveVote(room, rng, now); return ok();
      }
      if (room.phase === 'nominate') { log(room, 'host', `The host passed the Speaker’s turn on from ${nm(room, g.speaker)}.`, null, now); nextSpeaker(room); return ok(); }
      if (room.phase === 'legislate' && g.cardsApp) { // an idle Speaker or Chancellor: the server chooses at random, in the open
        if (g.leg === 'speaker') { g.discard.push(g.hand.splice(Math.floor(rng() * 3), 1)[0]); g.leg = 'chancellor'; log(room, 'host', `The host skipped ${nm(room, g.speaker)}: a random policy was discarded.`, null, now); return ok(); }
        if (g.leg === 'veto') { g.leg = 'chancellor'; g.vetoRefused = true; log(room, 'host', 'The host skipped the Speaker: the veto is refused.', null, now); return ok(); }
        const i = Math.floor(rng() * 2); const pol = g.hand.splice(i, 1)[0]; g.discard.push(...g.hand); g.hand = [];
        log(room, 'host', `The host skipped ${nm(room, g.nominee)}: a random policy was enacted.`, null, now);
        enactPolicy(room, pol, true, rng, now); return ok();
      }
      if (room.phase === 'chaos') {
        if (rulesVersion(room) < 2) return err('Enter the policy that was turned up. It can’t be skipped.');
        const pol = randomPolicy(room, rng); log(room, 'host', `The host skipped the Unrest tile: a random ${PNAME[pol]} was enacted, drawn by the server.`, null, now);
        enactPolicy(room, pol, false, rng, now); return ok();
      }
      if (room.phase === 'legislate' && !g.cardsApp && rulesVersion(room) >= 2) { // physical tiles: the server picks what the Chancellor "turned up", weighted by what is left
        const pol = randomPolicy(room, rng); log(room, 'host', `The host skipped ${nm(room, g.nominee)}: a random ${PNAME[pol]} was enacted, drawn by the server.`, null, now);
        g.discards += 2; enactPolicy(room, pol, true, rng, now); return ok();
      }
      if (room.phase === 'check' && rulesVersion(room) >= 2) { // the neutral answer: "no"
        log(room, 'host', 'The host answered the question for the table: no.', null, now);
        return gameReduce(room, actor, { type: 'check', yes: false }, rng, now);
      }
      if (room.phase === 'power') { log(room, 'host', 'The host skipped the power.', null, now); nextSpeaker(room); return ok(); }
      return err('Nothing to skip now.');
    }
    case 'anim': { // the host's switch for the pop-out animations, for every screen at the table
      if (!isHost) return err('Only the host can do that.');
      room.anim = !!msg.on; return ok();
    }
    case 'again': case 'abandon': {
      if (!isHost) return err(msg.type === 'again' ? 'Waiting for the host to start the next game.' : 'Only the host can do that.');
      if (msg.type === 'again' && room.phase !== 'over') return err('Finish this game first.');
      room.players = room.players.filter((p) => !p.open); // seats nobody took over
      for (const p of room.players) p.watch = p.host ? !!room.house.sitOut : false; // late watchers sit in the next deal
      room.game = null; room.phase = 'lobby'; room.undo = []; room.undoBarrier = false; room.timer = null; room.talk = null; room.paused = null;
      if (msg.type === 'abandon') log(room, 'host', 'The host ended the game.', null, now);
      return ok();
    }
    case 'close': { // host: close the room for everyone; the Worker then wipes it and frees the code
      if (!isHost) return err('Only the host can do that.');
      room.closed = true;
      return ok();
    }
    default: return err('Unknown action.');
  }
}
// A policy for a skipped physical step: the odds follow the tiles not yet on the board (the discards are unknown to the app).
function randomPolicy(room, rng) {
  const g = room.game; const sd = startingDeck(g.n, room.house.rebalance);
  const r = Math.max(0, sd.deck.filter((x) => x === 'R').length - g.reform); const d = Math.max(0, sd.deck.filter((x) => x === 'D').length - (g.decree - sd.decree));
  return r + d > 0 && rng() * (r + d) < r ? 'R' : 'D';
}
function nextSpeakerFirst(room) { // the first Speaker is the one chosen at the deal
  const g = room.game; g.speaker = g.order[g.rot]; room.phase = 'nominate';
}

const SECRET_STEPS = new Set(['discard', 'enact', 'peekDone']);
function secretStep(room, msg) {
  const g = room.game; if (!g) return false;
  if (SECRET_STEPS.has(msg.type)) return true;
  if (msg.type === 'power') return g.power === 'investigate';
  return msg.type === 'skip' && room.phase === 'legislate' && g.cardsApp; // a random pick from a hand someone has seen
}

export function reduce(room, actor, msg, rng = Math.random, now = Date.now()) {
  if (!msg || typeof msg.type !== 'string') return err('Bad message.');
  const before = room.phase;
  if (msg.type === 'undo' && actor.playerId && byId(room, actor.playerId)?.host) {
    if (room.phase === 'over') return err('Can’t undo once the game is over.');
    if (!room.undo.length && room.undoBarrier) return err('Can\'t undo past a secret look');
  }
  const t = reduceTable(room, actor, msg, rng, now, HOOKS);
  if (t) { if (msg.type === 'undo' && t.ok) onPhaseChange(room, now); return t; }
  if (room.paused && GAME.has(msg.type)) return err('The game is paused.');
  if (GAME.has(msg.type) && !room.game) return err('No game is running.');
  const snap = room.game && UNDOABLE.has(msg.type) ? JSON.stringify({ game: room.game, phase: room.phase }) : null;
  const sawSecret = secretStep(room, msg); // a step that shows a secret (a hand, the docket, an Inquiry) can't be taken back
  const res = gameReduce(room, actor, msg, rng, now);
  if (res.ok && snap) {
    const g = room.game;
    if (room.phase === 'over') { room.undo = []; room.undoBarrier = false; }
    else if (sawSecret) { room.undo = []; room.undoBarrier = true; }
    else { room.undo.push(snap); if (room.undo.length > 12) room.undo.shift(); }
  }
  if (res.ok && room.phase !== before) onPhaseChange(room, now);
  return res;
}

// ---------------------------------------------------------------- views
const roleView = (id) => { const r = ROLES[id]; return { id: r.id, name: r.name, side: r.side, sideName: SIDES[r.side].name, blurb: r.blurb }; };

function publicGame(room) {
  const g = room.game; if (!g) return null;
  const anon = room.house.anonVotes;
  const hist = (h) => h && ({ ...h, yes: h.ayes.length, no: h.nays.length, ayes: anon ? [] : h.ayes, nays: anon ? [] : h.nays });
  const inGame = ['nominate', 'vote'].includes(room.phase);
  return {
    n: g.n, order: g.order, alive: alive(room), exiled: Object.keys(g.exiled).filter((k) => g.exiled[k]), dead: g.order.filter((id) => !g.alive[id]),
    speaker: g.speaker, special: g.special, nominee: g.nominee, lastGov: g.lastGov,
    ineligible: inGame ? g.order.filter((id) => !eligibleChancellors(g.speaker, office(room), g.lastGov, alive(room)).includes(id)) : [],
    tracker: g.tracker, reform: g.reform, decree: g.decree, powers: POWERS[g.n], vetoOn: g.decree >= VETO_AT,
    pile: g.cardsApp ? g.deck.length : g.pile, discards: g.cardsApp ? g.discard.length : g.discards, reshuffles: g.reshuffles, reshuffleNow: g.reshuffleNow,
    leg: room.phase === 'legislate' ? g.leg : null, vetoRefused: g.vetoRefused, power: room.phase === 'power' ? g.power : null, check: g.check,
    investigated: g.investigated, confirmedNot: g.confirmedNot, cardsApp: g.cardsApp, appRoles: !!g.roles,
    voted: room.phase === 'vote' ? voters(room).filter((id) => id in g.votes) : [],
    ready: room.phase === 'reveal' ? g.order.filter((id) => g.ready[id]) : [],
    history: g.history.map(hist), lastVote: hist(g.lastVote), lastPolicy: g.lastPolicy,
    winner: g.winner, reason: g.reason,
  };
}

function endReveal(room, view) {
  const g = room.game;
  if (g && room.phase === 'over' && g.roles) view.game.roles = Object.fromEntries(g.order.map((id) => [id, roleView(g.roles[id])]));
}

export function viewForPlayer(room, playerId, connected = new Set()) {
  const view = { kind: 'player', ...tableView(room, playerId, connected), game: publicGame(room), anim: room.anim !== false, rulesVersion: rulesVersion(room) };
  const me = byId(room, playerId); const g = room.game;
  if (g && me && g.order.includes(me.id)) {
    if (g.roles) { view.me.role = roleView(g.roles[me.id]); view.me.sees = knowledgeFor(me.id, g.roles, g.n); }
    if (g.seen[me.id]) view.me.inquiries = g.seen[me.id];
    if (g.peek[me.id]) view.me.peeked = g.peek[me.id];
    view.me.out = !g.alive[me.id];
    if (room.phase === 'vote' && me.id in g.votes) view.me.vote = g.votes[me.id];
    if (room.phase === 'legislate' && g.cardsApp) {
      if (g.leg === 'speaker' && me.id === g.speaker) view.me.hand = [...g.hand];
      if ((g.leg === 'chancellor' || g.leg === 'veto') && me.id === g.nominee) view.me.hand = [...g.hand];
    }
    if (room.phase === 'power' && g.power === 'peek' && me.id === g.speaker && g.cardsApp) view.me.docket = g.deck.slice(0, 3);
  }
  if (g && me?.host && me.watch && room.house.sitOut && g.roles) view.moderator = { roles: Object.fromEntries(g.order.map((id) => [id, roleView(g.roles[id])])) };
  endReveal(room, view);
  return view;
}

export function viewForScreen(room, connected = new Set()) {
  const view = { kind: 'screen', ...tableView(room, null, connected), game: publicGame(room), anim: room.anim !== false, rulesVersion: rulesVersion(room) };
  endReveal(room, view);
  return view;
}

// ---------------------------------------------------------------- game over
export const endedNow = (phaseBefore, room) => phaseBefore !== 'over' && room.phase === 'over';

// The game-over event: the server decides the winner and the reason once. `you` is each player's own result,
// worked out from their own role; the table screen and anyone without a known role get none.
export function gameOverEvent(room, playerId = null) {
  const g = room.game; if (!g || room.phase !== 'over') return null;
  const ev = { type: 'gameover', gameNo: room.gameNo || 0, over: room.overN || 0, winner: g.winner, reason: g.reason, text: WIN_TEXT[g.reason] || '' };
  const role = playerId && g.roles && g.order.includes(playerId) ? ROLES[g.roles[playerId]] : null;
  if (role) ev.you = role.side === g.winner ? 'won' : 'lost';
  return ev;
}

// Sockets to drop because their seat was removed or taken over (the new holder has a new token).
export const socketsToDrop = (sockets, playerId, exceptWs = null) => sockets.filter((s) => s.playerId === playerId && s.ws !== exceptWs).map((s) => s.ws);

// What to send each open socket after a change: its own view, plus the game-over event when the game just ended.
// sockets: [{ ws, who: 'player' | 'screen' | null, playerId }]. Sockets that have not joined get nothing.
export function broadcastPlan(room, sockets, connected, { gameOver = false } = {}) {
  const plan = [];
  for (const s of sockets) {
    if (!s.who) continue;
    const player = s.who === 'screen' ? null : s.playerId;
    const msgs = [{ type: 'view', view: player ? viewForPlayer(room, player, connected) : viewForScreen(room, connected) }];
    const ev = gameOver ? gameOverEvent(room, player) : null;
    if (ev) msgs.push(ev); // after the view, so the roles it reveals are already on screen
    plan.push({ ws: s.ws, msgs });
  }
  return plan;
}
