// Presets, the setup carousel's rules and the saved-preset store (public/js/presets.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetById, presetFits, presetMessages, roomMatches, mixFor, recommendedFor, seatingDefault, seatingOfMode, SEATING_MODE, SEATINGS,
  modeFor, seatingProblem, cleanSetup, stepProblem, furthestStep, SETUP_STEPS, cleanSaved, addSaved, renameSaved, deleteSaved, PRESET_HOUSE_KEYS, setsLine } from '../public/js/presets.js';
import { DEFAULT_PRESET_ID, GAVEL_TURN_TIMER, MAX_SAVED_PRESETS } from '../public/js/config-defaults.js';
import { newRoom, reduce } from '../public/js/room.js';
import { TEAMS, MIN_PLAYERS, MAX_PLAYERS, HOUSE_DEFAULTS } from '../public/js/rules.js';
import { COMMON_HOUSE, MODE_PRESETS } from '../public/js/table.js';

const KEY = 'preset-host';
const seat = (n, rng = Math.random) => {
  const room = newRoom('PRE', KEY);
  for (let i = 0; i < n; i++) reduce(room, {}, { type: 'join', name: `P${i}`, hostKey: i === 0 ? KEY : undefined }, rng, 0);
  return room;
};
const host = (room) => ({ playerId: room.players.find((p) => p.host).id });

test('the six presets, names exactly as drawn, Open Session first and recommended', () => {
  assert.deepEqual(PRESETS.map((p) => p.name), ['Open Session', 'Fair Chamber', 'No One Sits Out', 'Closed Ballot', 'Gavel Down', 'The Back Room']);
  assert.equal(recommendedFor().id, DEFAULT_PRESET_ID); assert.equal(PRESETS[0].id, DEFAULT_PRESET_ID);
  assert.deepEqual(PRESETS.map((p) => p.difficulty), ['Beginner', 'Classic', 'Beginner', 'Classic', 'Classic', 'Veteran']);
  for (const p of PRESETS) { assert.equal(p.min, 5); assert.equal(p.max, 10); assert.ok(p.vibe && !/—|–/.test(p.vibe)); }
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
});

test('every preset is valid at every table size 5 to 10: it deals, the fixed TEAMS mix comes out, and the room holds exactly the preset', () => {
  for (const p of PRESETS) for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    assert.ok(presetFits(p, n), `${p.name} fits ${n}`);
    const room = seat(n); const H = host(room); const msg = presetMessages(p);
    assert.ok(reduce(room, H, { type: 'mode', mode: msg.mode }, Math.random, 0).ok, `${p.name} mode`);
    assert.ok(reduce(room, H, { type: 'house', house: msg.house }, Math.random, 0).ok, `${p.name} house`);
    assert.ok(roomMatches(p, room.mode, room.house), `${p.name} at ${n}: room holds the preset`);
    const res = reduce(room, H, { type: 'start' }, Math.random, 0);
    assert.ok(res.ok, `${p.name} at ${n} deals: ${res.error}`);
    if (room.game.roles) { // Host-only mode keeps roles at the table, so there is nothing dealt in the app to count
      const counts = {}; for (const r of Object.values(room.game.roles)) counts[r] = (counts[r] || 0) + 1;
      assert.deepEqual([counts.reformer, counts.cabal, counts.pretender], [TEAMS[n][0], TEAMS[n][1], 1], `${p.name} at ${n} mix`);
    } else assert.equal(p.settings.play, 'physical');
    assert.deepEqual(mixFor(n).map((m) => m.count), [TEAMS[n][0], TEAMS[n][1], 1]);
    assert.equal(room.mode.play, p.settings.play);
  }
});

test('a preset only sets settings the game already has', () => {
  const known = new Set([...Object.keys(HOUSE_DEFAULTS), ...Object.keys(COMMON_HOUSE)]);
  for (const p of PRESETS) {
    assert.ok(['phone', 'physical', 'hybrid'].includes(p.settings.play));
    for (const k of Object.keys(presetMessages(p).house)) assert.ok(PRESET_HOUSE_KEYS.includes(k) && known.has(k), `${p.name}: ${k}`);
    for (const k of Object.keys(p.settings.house)) assert.ok(known.has(k), `${p.name}: unknown house rule ${k}`);
  }
  assert.ok([30, 60, 90, 120, 180, 300].includes(GAVEL_TURN_TIMER), 'the Gavel Down clock is a Phase Timer choice');
  const gd = presetById('gavel-down'); assert.equal(presetMessages(gd).house.turnTimer, GAVEL_TURN_TIMER);
  assert.equal(setsLine(PRESETS[0]), 'No house rules');
});

test('applying a preset replaces the previous preset, and leaves the host\'s other house rules alone', () => {
  const room = seat(6); const H = host(room);
  reduce(room, H, { type: 'house', house: { noClaims: true, firstLeader: 'host', anonVotes: true, exile: true } }, Math.random, 0);
  const m = presetMessages(presetById('fair-chamber'));
  reduce(room, H, { type: 'house', house: m.house }, Math.random, 0);
  assert.deepEqual([room.house.rebalance, room.house.exile, room.house.anonVotes, room.house.turnTimer], [true, false, false, 0]);
  assert.equal(room.house.noClaims, true); assert.equal(room.house.firstLeader, 'host');
});

test('the Back Room is Host-only mode and deals in physical mode', () => {
  const room = seat(7); const H = host(room); const m = presetMessages(presetById('the-back-room'));
  reduce(room, H, { type: 'mode', mode: m.mode }, Math.random, 0); reduce(room, H, { type: 'house', house: m.house }, Math.random, 0);
  assert.equal(room.mode.play, 'physical'); assert.equal(room.house.rebalance, true);
  assert.ok(reduce(room, H, { type: 'start' }, Math.random, 0).ok);
});

test('seating maps onto the three play modes and is preselected from who joined', () => {
  assert.deepEqual(SEATINGS.map((s) => SEATING_MODE[s]), ['phone', 'physical', 'hybrid']);
  for (const s of SEATINGS) assert.equal(seatingOfMode(SEATING_MODE[s]), s);
  const P = (n, phoneless) => Array.from({ length: n }, (_, i) => ({ phoneless: i < phoneless }));
  assert.equal(seatingDefault(P(6, 0)), 'own');
  assert.equal(seatingDefault([{ phoneless: false }, { phoneless: true }, { phoneless: true }]), 'one');
  assert.equal(seatingDefault([{}, {}, { phoneless: true }]), 'mixed');
  assert.equal(seatingDefault([{ watch: true, phoneless: true }, {}, {}]), 'own');
});

test('the remembered setup: old, damaged or foreign values map to a valid state', () => {
  const ok = cleanSetup({ code: 'ABC', step: 2, presetId: 'closed-ballot', seating: 'mixed', adv: true }, 'ABC');
  assert.deepEqual(ok, { code: 'ABC', step: 2, presetId: 'closed-ballot', seating: 'mixed', adv: true });
  assert.deepEqual(cleanSetup(JSON.stringify(ok), 'ABC'), ok);
  const d = { code: 'ABC', step: 0, presetId: DEFAULT_PRESET_ID, seating: null, adv: false };
  for (const bad of [null, undefined, 'x{', 7, [], {}, { code: 'OTHER', step: 3, presetId: 'gavel-down' }]) assert.deepEqual(cleanSetup(bad, 'ABC'), d, JSON.stringify(bad));
  assert.equal(cleanSetup({ code: 'ABC', step: 99 }, 'ABC').step, SETUP_STEPS.length - 1);
  assert.equal(cleanSetup({ code: 'ABC', step: -4 }, 'ABC').step, 0);
  assert.equal(cleanSetup({ code: 'ABC', step: 'two', presetId: 'gone', seating: 'nope' }, 'ABC').presetId, DEFAULT_PRESET_ID);
  const saved = cleanSaved([{ id: 'saved-1', name: 'Mine', settings: { play: 'phone', house: { exile: true } } }]);
  assert.equal(cleanSetup({ code: 'ABC', presetId: 'saved-1' }, 'ABC', saved).presetId, 'saved-1');
  assert.equal(cleanSetup({ code: 'ABC', presetId: 'saved-1' }, 'ABC', []).presetId, DEFAULT_PRESET_ID, 'a deleted saved preset falls back');
});

test('no step can block: every table size has a valid default, and every blocked Next names a reason and a fix', () => {
  for (let n = -1; n <= 14; n++) for (const p of PRESETS) for (let s = 0; s < SETUP_STEPS.length; s++) {
    const pr = stepProblem(s, n, p);
    if (pr) { assert.ok(pr.reason.length > 8 && !/\n/.test(pr.reason), `reason n=${n} s=${s}`); assert.ok(pr.fix?.label && pr.fix.go !== undefined, `fix n=${n} s=${s}`); }
    if (s === 2) assert.equal(pr, null, 'Seating never blocks');
    if (n >= MIN_PLAYERS && n <= MAX_PLAYERS) assert.equal(pr, null, `${p.name} at ${n} step ${s} is open`);
  }
  assert.match(stepProblem(0, 3, PRESETS[0]).reason, /Add 2 more members to start \(5 minimum\)\./);
  assert.match(stepProblem(0, 4, PRESETS[0]).reason, /Add 1 more member to start/);
  assert.equal(stepProblem(0, 11, PRESETS[0]).fix.label, 'Remove members');
  assert.equal(stepProblem(3, 4, PRESETS[0]).fix.go, 0);
  assert.equal(furthestStep(8, PRESETS[0]), 3); assert.equal(furthestStep(3, PRESETS[0]), 0);
  // a preset that stops fitting (a narrower range) offers Change preset
  const narrow = { ...PRESETS[0], name: 'Narrow', min: 8 };
  assert.equal(stepProblem(1, 6, narrow).fix.go, 'presets'); assert.match(stepProblem(1, 6, narrow).reason, /Narrow needs 8\+ players\. Change preset or add players\./);
  assert.equal(furthestStep(6, narrow), 1);
});

test('saved presets: add, rename, delete, clean, capped', () => {
  let list = [];
  list = addSaved(list, '  Friday   table ', { play: 'hybrid' }, { exile: true, turnTimer: 90, noClaims: true }, 1000);
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Friday table'); assert.equal(list[0].saved, true);
  assert.deepEqual(list[0].settings, { play: 'hybrid', house: { exile: true, turnTimer: 90 } });
  assert.deepEqual(cleanSaved(JSON.stringify(list)), list);
  list = renameSaved(list, list[0].id, 'Sunday'); assert.equal(list[0].name, 'Sunday');
  assert.equal(renameSaved(list, list[0].id, '   ')[0].name, 'Sunday', 'an empty name keeps the old one');
  assert.deepEqual(deleteSaved(list, list[0].id), []);
  assert.deepEqual(cleanSaved('not json'), []); assert.deepEqual(cleanSaved([{ name: 'x' }, null, { id: 'a', name: 'b', settings: { play: 'bad' } }]), []);
  let many = []; for (let i = 0; i < MAX_SAVED_PRESETS + 4; i++) many = addSaved(many, `T${i}`, { play: 'phone' }, {}, i);
  assert.equal(many.length, MAX_SAVED_PRESETS); assert.equal(many.at(-1).name, `T${MAX_SAVED_PRESETS + 3}`);
  const sv = list[0] ?? addSaved([], 'S', { play: 'phone' }, { rebalance: true }, 5)[0];
  assert.ok(presetFits(sv, 5) && presetFits(sv, 10));
});

test('Mixed seating never produces a mode the engine cannot deal; Own phones with a phoneless seat names the reason and a fix', () => {
  const fresh = () => { const room = seat(6); reduce(room, host(room), { type: 'addSeat', name: 'Flo' }, Math.random, 0); return room; };
  for (const s of SEATINGS) if (s !== 'own') {
    const room = fresh(); const H = host(room); const mode = modeFor(s, room.players);
    assert.equal(seatingProblem(mode, room.players), '', `${s} with a phoneless seat is dealable`);
    assert.ok(reduce(room, H, { type: 'mode', mode }, Math.random, 0).ok);
    assert.ok(reduce(room, H, { type: 'start' }, Math.random, 0).ok, `${s} deals`);
  }
  const room = fresh(); const H = host(room); const own = MODE_PRESETS.phone; // what the server holds once Own phones is picked
  assert.match(seatingProblem(own, room.players), /Flo has no phone\. Set roles, votes, cards to “at the table”, or remove the seat\./);
  assert.deepEqual(stepProblem(3, 6, PRESETS[0], seatingProblem(own, room.players)).fix, { label: 'Change seating', go: 2 });
  assert.equal(stepProblem(3, 6, PRESETS[0], ''), null);
  reduce(room, H, { type: 'mode', mode: own }, Math.random, 0); // the engine says the same thing
  assert.ok(reduce(room, H, { type: 'start' }, Math.random, 0).error);
  // with every seat on a phone, Mixed keeps the engine's own Hybrid default
  assert.deepEqual(modeFor('mixed', [{ name: 'A' }, { name: 'B' }]), { play: 'hybrid', roles: 'physical', votes: 'app', cards: 'app' });
});
