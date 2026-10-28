// The host flow never dead-ends. ~300 seeded games, tables of 5 to 10, rebalance and exile on and off, phone, hybrid and
// physical modes, on rulesVersion 1 and 2. At every step the Host's phone is driven ONLY through hostNav and the same
// room messages the screen sends. Other players act as themselves when the Host chooses to wait for them.
// Checked at every step: the big button is disabled only while a choice is missing and its label names it; every
// disabled step has a skip the room accepts and that moves the game on (the exceptions are the three physical steps
// that have no skip in a rulesVersion 1 room); steps with nothing to choose are enabled; every game ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';
import { hostNav } from '../public/js/host-nav.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../public/js/rules.js';

const NOW = 1_800_000_000_000;
const STEP_BOUND = 1500;
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const shuffled = (rng, a) => a.map((x) => [rng(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

const MODES = [{ play: 'phone' }, { play: 'physical' }];
for (const roles of ['app', 'physical']) for (const votes of ['app', 'physical']) for (const cards of ['app', 'physical']) MODES.push({ play: 'hybrid', roles, votes, cards });
const allPhysical = (m) => m.play === 'physical' || (m.roles === 'physical' && m.votes === 'physical' && m.cards === 'physical');

const stats = { games: 0, skips: 0, byPhase: {}, v1Exempt: 0, finished: 0, chaos: 0, check: 0, veto: 0, physLeg: 0, power: {} };
const seen = (key) => { stats.byPhase[key] = (stats.byPhase[key] || 0) + 1; };

function setup(g, rng) {
  const n = MIN_PLAYERS + (g % (MAX_PLAYERS - MIN_PLAYERS + 1));
  const mode = MODES[(g * 7 + Math.floor(g / 6)) % MODES.length];
  const room = newRoom('HOSTNV', 'hk');
  const say = (actor, m) => { const r = reduce(room, actor, m, rng, NOW); assert.ok(r.ok, `${m.type}: ${r.error}`); return r; };
  const ids = [];
  const phoneless = allPhysical(mode) && g % 3 === 0 ? Math.min(2, 1 + (g % 2)) : 0;
  for (let i = 0; i < n - phoneless; i++) ids.push(say({}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? 'hk' : undefined }).data.playerId);
  const H = { playerId: ids[0] };
  for (let i = 0; i < phoneless; i++) say(H, { type: 'addSeat', name: `Seat${i}` });
  say(H, { type: 'mode', mode });
  const sitOut = g % 5 === 4 && n > MIN_PLAYERS && !phoneless;
  say(H, { type: 'house', house: { rebalance: g % 2 === 1, exile: g % 4 >= 2, sitOut } });
  const started = reduce(room, H, { type: 'start' }, rng, NOW);
  if (!started.ok) return null;
  const version = g % 4 < 2 ? 2 : 1; // half the games on version 1: the field is dropped, as in a stored room from before it existed
  if (version === 1) delete room.rulesVersion;
  return { room, H, version, mode };
}

function playGame(g) {
  const rng = lcg(20261027 + g * 977);
  const c = setup(g, rng);
  if (!c) return false;
  stats.games++;
  const { room, H, version } = c;
  const hostId = H.playerId;
  const fresh = () => ({ nominee: null, target: null, tally: {}, card: null, policy: null, answer: null, veto: null });
  const ui = fresh();
  const resetUi = () => Object.assign(ui, fresh());
  const send = (actor, m) => { const r = reduce(room, actor, m, rng, NOW); assert.ok(r.ok, `game ${g} v${version} ${room.phase}: ${m.type} refused: ${r.error}`); return r; };
  const as = (id) => ({ playerId: id });
  const pv = (id) => viewForPlayer(room, id);
  const hv = () => pv(hostId);
  const seats = () => room.players.filter((p) => !p.watch);
  const sendNav = (nav) => { assert.ok(!nav.disabled && nav.send, `enabled "${nav.label}" has something to send`); resetUi(); send(H, nav.send); };
  const key = (v) => { const x = v.game; return JSON.stringify([v.phase, x.speaker, x.nominee, x.tracker, x.reform, x.decree, x.leg, x.vetoRefused, x.voted.length, x.alive.length, x.check?.kind, x.power, x.history.length, room.logN, x.special]); };
  const useSkip = (nav) => {
    const before = key(hv());
    assert.ok(nav.skip.label && nav.skip.msgs.length > 0);
    for (const m of nav.skip.msgs) send(H, m);
    stats.skips++;
    assert.notEqual(key(hv()), before, `game ${g} v${version}: skip "${nav.skip.label}" did not move the game on`);
    resetUi();
  };
  const withUi = () => hostNav(hv(), ui);
  const turn = () => rng() < 0.3;

  for (let step = 0; step < STEP_BOUND && room.phase !== 'over'; step++) {
    const view = hv(); const nav = hostNav(view, ui);
    const gm = view.game; const phase = room.phase;
    seen(phase);
    assert.ok(nav, `game ${g} v${version} ${phase}: the Host has a step with no button`);
    assert.equal(nav.disabled, !nav.send, 'disabled exactly when there is nothing to send');
    assert.equal(nav.disabled, !!nav.missing, 'disabled exactly while something is missing');
    if (!nav.disabled) { assert.equal(nav.skip, null, 'an enabled step needs no skip'); sendNav(nav); continue; }
    const exempt = version === 1 && ((phase === 'chaos') || (phase === 'check') || (phase === 'legislate' && !gm.cardsApp));
    if (exempt) { stats.v1Exempt++; assert.equal(nav.skip, null, 'v1 has no skip here'); } else assert.ok(nav.skip, `game ${g} v${version} ${phase}: disabled "${nav.label}" has no skip`);
    if (!exempt && turn()) { useSkip(nav); continue; }
    const mineSpeaker = gm.speaker === hostId;

    if (phase === 'nominate') {
      const eligible = (v) => v.game.alive.filter((id) => id !== v.game.speaker && !v.game.ineligible.includes(id));
      if (nav.missing === 'nominee') {
        assert.equal(nav.label, 'Choose a Chancellor');
        ui.nominee = shuffled(rng, eligible(view))[0];
        const n2 = withUi(); assert.equal(n2.disabled, false); assert.match(n2.label, /^Nominate /);
        continue;
      }
      assert.equal(nav.missing, 'speaker'); assert.match(nav.label, /^Waiting for .* to nominate$/);
      const sv = pv(gm.speaker);
      send(as(gm.speaker), { type: 'nominate', id: shuffled(rng, eligible(sv))[0] }); resetUi();
      continue;
    }
    if (phase === 'vote') {
      const voters = [...gm.alive, ...gm.exiled];
      if (nav.missing === 'tally') {
        assert.equal(nav.label, 'Tap who voted Aye'); assert.equal(nav.skip.label, 'No one voted Aye');
        const yes = shuffled(rng, voters).slice(0, 1 + Math.floor(rng() * voters.length));
        for (const id of yes) ui.tally[id] = true;
        const n2 = withUi(); assert.equal(n2.disabled, false); assert.equal(n2.label, `Confirm: ${yes.length} Aye, ${voters.length - yes.length} Nay`);
        continue;
      }
      assert.equal(nav.missing, 'votes'); assert.match(nav.label, /^Waiting for \d+ votes?$/);
      const idle = shuffled(rng, voters.filter((id) => !gm.voted.includes(id)));
      assert.ok(!room.players.find((p) => p.id === idle[0]).phoneless, 'a vote waits only for people with phones');
      send(as(idle[0]), { type: 'vote', aye: rng() < 0.6 });
      continue;
    }
    if (phase === 'legislate') {
      if (!gm.cardsApp) {
        stats.physLeg++;
        assert.equal(nav.label, 'Enter what was enacted');
        ui.policy = rng() < 0.5 ? 'R' : 'D';
        const n2 = withUi(); assert.equal(n2.disabled, false); assert.match(n2.label, /^Confirm: a (Reform|Decree) was enacted$/);
        continue;
      }
      if (gm.leg === 'speaker') {
        if (nav.missing === 'card') { assert.equal(nav.label, 'Pick a policy to discard'); ui.card = Math.floor(rng() * 3); const n2 = withUi(); assert.equal(n2.disabled, false); assert.equal(n2.label, 'Discard this policy'); continue; }
        assert.match(nav.label, /^Waiting for .* to discard$/);
        send(as(gm.speaker), { type: 'discard', i: Math.floor(rng() * 3) });
        continue;
      }
      if (gm.leg === 'veto') {
        stats.veto++;
        if (nav.missing === 'veto') { assert.equal(nav.label, 'Agree to the veto, or refuse it'); assert.equal(nav.skip.label, 'Refuse the Veto'); ui.veto = rng() < 0.5; const n2 = withUi(); assert.equal(n2.disabled, false); continue; }
        assert.match(nav.label, /^Waiting for .* to answer the veto$/);
        send(as(gm.speaker), { type: 'vetoReply', accept: rng() < 0.5 });
        continue;
      }
      if (nav.missing === 'card') {
        assert.equal(nav.label, 'Pick a policy to enact');
        if (gm.vetoOn && !gm.vetoRefused && gm.nominee === hostId && rng() < 0.3) { send(H, { type: 'veto' }); resetUi(); continue; }
        ui.card = Math.floor(rng() * 2); const n2 = withUi(); assert.equal(n2.disabled, false); assert.equal(n2.label, 'Enact this policy');
        continue;
      }
      assert.match(nav.label, /^Waiting for .* to enact$/);
      if (gm.vetoOn && !gm.vetoRefused && rng() < 0.3) { send(as(gm.nominee), { type: 'veto' }); continue; }
      send(as(gm.nominee), { type: 'enact', i: Math.floor(rng() * 2) });
      continue;
    }
    if (phase === 'power') {
      const pw = gm.power; stats.power[pw] = (stats.power[pw] || 0) + 1;
      if (nav.missing === 'target') {
        assert.match(nav.label, /^Choose who to (look into|make the next Speaker|execute)$/);
        const pool = gm.alive.filter((id) => id !== gm.speaker && !(pw === 'investigate' && gm.investigated.includes(id)) && !(pw === 'special' && gm.exiled.includes(id)));
        ui.target = shuffled(rng, pool)[0];
        const n2 = withUi(); assert.equal(n2.disabled, false); assert.match(n2.label, /^(Look into|Make|Execute) /);
        continue;
      }
      assert.equal(nav.missing, 'speaker'); assert.match(nav.label, /^Waiting for .* to use the power$/);
      if (pw === 'peek') { send(as(gm.speaker), { type: 'peekDone' }); continue; }
      const pool = gm.alive.filter((id) => id !== gm.speaker && !(pw === 'investigate' && gm.investigated.includes(id)) && !(pw === 'special' && gm.exiled.includes(id)));
      send(as(gm.speaker), { type: 'power', id: shuffled(rng, pool)[0] });
      continue;
    }
    if (phase === 'check') {
      stats.check++;
      assert.match(nav.label, /^Answer: (is the Chancellor|was the executed player) the Boss\?$/);
      ui.answer = rng() < 0.15;
      const n2 = withUi(); assert.equal(n2.disabled, false); assert.match(n2.label, /^Confirm: /);
      continue;
    }
    assert.equal(phase, 'chaos'); stats.chaos++;
    assert.equal(nav.label, 'Enter what was enacted');
    ui.policy = rng() < 0.5 ? 'R' : 'D';
    const n2 = withUi(); assert.equal(n2.disabled, false);
    void mineSpeaker; void seats;
  }
  assert.equal(room.phase, 'over', `game ${g} v${version} never ended in ${STEP_BOUND} steps (phase ${room.phase})`);
  stats.finished++;
  return true;
}

test('host flow never dead-ends: ~300 seeded games drive only through hostNav, every missing choice is named and skippable', () => {
  let games = 0;
  for (let g = 0; g < 360; g++) if (playGame(g)) games++;
  assert.ok(games >= 300, `only ${games} games were dealt`);
  assert.equal(stats.finished, stats.games);
  for (const ph of ['reveal', 'nominate', 'vote', 'legislate', 'power']) assert.ok(stats.byPhase[ph] > 20, `${ph} was exercised`);
  for (const ph of ['chaos', 'check']) assert.ok(stats.byPhase[ph] > 0, `${ph} was exercised`);
  for (const pw of ['investigate', 'special', 'execute', 'peek']) assert.ok(stats.power[pw] > 0, `${pw} power was exercised`);
  assert.ok(stats.skips > 300, 'the skip chips ran');
  assert.ok(stats.v1Exempt > 0, 'a rulesVersion 1 step without a skip ran');
  assert.ok(stats.physLeg > 0 && stats.veto > 0, 'physical policies and a veto ran');
});

test('host flow never dead-ends: steps with nothing to choose are enabled right away', () => {
  const rng = lcg(5);
  const c = setup(0, rng);
  const view = viewForPlayer(c.room, c.H.playerId);
  assert.equal(view.phase, 'reveal');
  const nav = hostNav(view, {});
  assert.equal(nav.disabled, false); assert.equal(nav.label, 'Begin Game'); assert.deepEqual(nav.send, { type: 'skipReveal' });
  assert.equal(hostNav({ ...view, phase: 'lobby' }, {}), null);
  assert.equal(hostNav({ ...view, kind: 'screen' }, {}), null);
  // the docket look has nothing to pick: Done is on at once
  const peek = { ...view, phase: 'power', game: { ...view.game, power: 'peek', speaker: c.H.playerId, alive: view.game.order, exiled: [] } };
  const pn = hostNav(peek, {});
  assert.equal(pn.disabled, false); assert.deepEqual(pn.send, { type: 'peekDone' });
});

test('host flow never dead-ends: the Boss question and the physical tiles have a skip from rulesVersion 2 only', () => {
  const base = { kind: 'player', phase: 'check', rulesVersion: 2, mode: { play: 'physical' }, players: [{ id: 'a', host: true }], me: { id: 'a', host: true },
    game: { speaker: 'a', alive: ['a'], exiled: [], ineligible: [], voted: [], check: { kind: 'chancellor', id: 'a' }, cardsApp: false, investigated: [] } };
  for (const phase of ['check', 'chaos', 'legislate']) {
    const v2 = hostNav({ ...base, phase }, {}); const v1 = hostNav({ ...base, phase, rulesVersion: 1 }, {});
    assert.equal(v2.disabled, true); assert.ok(v2.skip, `${phase} v2 skip`); assert.equal(v1.disabled, true); assert.equal(v1.skip, null, `${phase} v1 has none`);
  }
  assert.equal(hostNav(base, {}).skip.label, 'Answer No');
  assert.equal(hostNav({ ...base, me: { id: 'b' } }, {}), null, 'a player who is not the Host has nothing to answer');
});

test('host flow never dead-ends: the skips the room takes from rulesVersion 2 (random Unrest tile, random physical enact, "No" to the Boss question)', () => {
  const mk = (version) => {
    const rng = lcg(31); const room = newRoom('HOSTNV', 'hk');
    const ids = Array.from({ length: 5 }, (_, i) => reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i ? undefined : 'hk' }, rng).data.playerId);
    const H = { playerId: ids[0] };
    reduce(room, H, { type: 'mode', mode: { play: 'physical' } }, rng);
    assert.ok(reduce(room, H, { type: 'start' }, rng).ok);
    if (version === 1) delete room.rulesVersion;
    reduce(room, H, { type: 'skipReveal' }, rng);
    return { room, H, rng };
  };
  for (const version of [1, 2]) {
    const { room, H, rng } = mk(version);
    room.phase = 'chaos'; room.game.tracker = 3;
    const r = reduce(room, H, { type: 'skip' }, rng);
    if (version === 1) assert.match(r.error, /can’t be skipped/); else { assert.ok(r.ok); assert.equal(room.game.reform + room.game.decree, 1); assert.equal(room.phase, 'nominate'); }
    const m = mk(version); m.room.phase = 'legislate'; m.room.game.leg = 'speaker';
    const r2 = reduce(m.room, m.H, { type: 'skip' }, m.rng);
    if (version === 1) assert.ok(r2.error); else { assert.ok(r2.ok); assert.equal(m.room.game.reform + m.room.game.decree, 1); assert.equal(m.room.game.discards, 2); }
    const k = mk(version); k.room.phase = 'check'; k.room.game.check = { kind: 'chancellor', id: k.room.game.order[1] };
    const r3 = reduce(k.room, k.H, { type: 'skip' }, k.rng);
    if (version === 1) assert.ok(r3.error); else { assert.ok(r3.ok); assert.equal(k.room.phase, 'legislate'); assert.ok(k.room.game.confirmedNot.includes(k.room.game.order[1])); }
  }
});

test('host flow never dead-ends: the screen uses hostNav for the big button and the skip chip', () => {
  const src = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/host-nav\.js'/);
  assert.match(src, /hostNav\(/);
  assert.match(src, /data-a="dockSkip"/);
  assert.match(src, /data-a="dockSend"/);
});
