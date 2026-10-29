// The Gilded Chamber presets, the setup carousel's rules and the saved-preset store. Pure: the UI renders it, the tests check it.
// The role mix is fixed by the engine (TEAMS in rules.js), so a preset only sets what the game already has: the play mode
// (Phones / Hybrid / Host-only) and the house rules rebalance, exile, anonVotes and turnTimer. Nothing here is a new rule,
// so no rulesVersion bump is needed: rooms pin house rules and mode when the deal happens, as before.
import { TEAMS, MIN_PLAYERS, MAX_PLAYERS } from './rules.js';
import { DEFAULT_PRESET_ID, GAVEL_TURN_TIMER, MAX_SAVED_PRESETS, SETUP_FIRST_STEP, MIXED_PIECES_PHONELESS, MIXED_PIECES_ALL_PHONES } from './config-defaults.js';

// The four house rules a preset owns. Applying a preset resets all four, so "no house rules" really means none.
export const PRESET_HOUSE_KEYS = ['rebalance', 'exile', 'anonVotes', 'turnTimer'];
const HOUSE_OFF = { rebalance: false, exile: false, anonVotes: false, turnTimer: 0 };

export const DIFFICULTY = { Beginner: 1, Classic: 2, Veteran: 3 };

// { id, name, vibe, min, max, difficulty, settings: { play, house } }. Names exactly as drawn in the mockup.
export const PRESETS = [
  { id: 'open-session', name: 'Open Session', vibe: 'The standard game on everyone’s phone.', min: 5, max: 10, difficulty: 'Beginner', sets: [], settings: { play: 'phone', house: {} } },
  { id: 'fair-chamber', name: 'Fair Chamber', vibe: 'Evens out the tables that lean Syndicate.', min: 5, max: 10, difficulty: 'Classic', sets: ['Rebalanced deck'], settings: { play: 'phone', house: { rebalance: true } } },
  { id: 'no-one-sits-out', name: 'No One Sits Out', vibe: 'Removed players stay and keep voting.', min: 5, max: 10, difficulty: 'Beginner', sets: ['Exile, not execution'], settings: { play: 'phone', house: { exile: true } } },
  { id: 'closed-ballot', name: 'Closed Ballot', vibe: 'Votes show as totals, not names.', min: 5, max: 10, difficulty: 'Classic', sets: ['Anonymous votes'], settings: { play: 'phone', house: { anonVotes: true } } },
  { id: 'gavel-down', name: 'Gavel Down', vibe: 'Quick sessions. Each turn has a clock.', min: 5, max: 10, difficulty: 'Classic', sets: [`${GAVEL_TURN_TIMER} second turn clock`], settings: { play: 'phone', house: { turnTimer: GAVEL_TURN_TIMER } } },
  { id: 'the-back-room', name: 'The Back Room', vibe: 'Real cards and tiles. One phone keeps the board.', min: 5, max: 10, difficulty: 'Veteran', sets: ['Host-only mode', 'Rebalanced deck'], settings: { play: 'physical', house: { rebalance: true } } },
];
export const presetById = (id, saved = []) => PRESETS.find((p) => p.id === id) || saved.find((p) => p.id === id) || null;
export const recommendedFor = () => PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) || PRESETS[0]; // same for every table size: all presets seat 5 to 10

export const presetFits = (p, n) => Number.isInteger(n) && n >= p.min && n <= p.max;
// The line a preset that does not fit shows in place of its range.
export const presetRange = (p) => `${p.min}–${p.max} players`;
export const needsText = (p, n) => (n < p.min ? `Needs ${p.min}+ players. You have ${n}.` : `Seats up to ${p.max}. You have ${n}.`);

// The fixed role mix at n, read-only: [{ id, label, count }]. Same list for every preset (the engine fixes it).
export function mixFor(n) {
  const k = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number.isInteger(n) ? n : MIN_PLAYERS));
  const [r, c] = TEAMS[k];
  return [{ id: 'reformer', label: 'Loyalists', count: r }, { id: 'cabal', label: 'Syndicate', count: c }, { id: 'pretender', label: 'The Boss', count: 1 }];
}

// The two messages that put a preset's settings in the room: { mode, house }. Replaces all four preset-owned house rules.
export function presetMessages(p) {
  return { mode: { play: p.settings.play }, house: { ...HOUSE_OFF, ...Object.fromEntries(Object.entries(p.settings.house || {}).filter(([k]) => PRESET_HOUSE_KEYS.includes(k))) } };
}
// Does the room's house rules hold exactly this preset's? (The play mode follows the Seating step, so it is checked apart.)
export function houseMatches(p, house) {
  const want = presetMessages(p).house;
  return PRESET_HOUSE_KEYS.every((k) => (house?.[k] || (k === 'turnTimer' ? 0 : false)) === want[k]);
}
export const roomMatches = (p, mode, house) => (mode?.play || 'phone') === p.settings.play && houseMatches(p, house);
// One plain line for what a preset (or the room) sets: used on cards and in the Deal summary.
export function setsLine(p) { return p.sets?.length ? p.sets.join(', ') : 'No house rules'; }

// ---- Seating: the three plain choices, mapped onto the engine's play modes.
export const SEATINGS = ['own', 'one', 'mixed'];
export const SEATING_MODE = { own: 'phone', one: 'physical', mixed: 'hybrid' };
export const SEATING_TEXT = { own: ['Own phones', 'Everyone plays on their own phone.'], one: ['One phone', 'Pass this phone. Each member looks in private.'], mixed: ['Mixed', 'Some on their phones, the rest on this phone.'] };
export const seatingOfMode = (play) => ({ phone: 'own', physical: 'one', hybrid: 'mixed' })[play] || 'own';
// Preselected from who has joined: everyone on a phone = own, nobody but the host = one, both = mixed.
export function seatingDefault(players) {
  const seated = players.filter((p) => !p.watch);
  const phoneless = seated.filter((p) => p.phoneless).length; const onPhone = seated.length - phoneless;
  if (phoneless === 0) return 'own';
  if (onPhone <= 1) return 'one';
  return 'mixed';
}

// The mode message for a seating choice. Hybrid carries its pieces; the others are the engine's presets as they are.
export function modeFor(seating, players) {
  const play = SEATING_MODE[seating] || 'phone';
  if (play !== 'hybrid') return { play };
  return { play, ...(players.some((p) => !p.watch && p.phoneless) ? MIXED_PIECES_PHONELESS : MIXED_PIECES_ALL_PHONES) };
}
// The engine's own rule, in the engine's words: an app piece needs a phone at every seat. '' when the table can be dealt.
export function seatingProblem(mode, players) {
  const noPhone = players.filter((p) => !p.watch && p.phoneless);
  const need = ['roles', 'votes', 'cards'].filter((k) => mode?.[k] === 'app');
  return noPhone.length && need.length ? `${noPhone.map((p) => p.name).join(', ')} ${noPhone.length > 1 ? 'have' : 'has'} no phone. Set ${need.join(', ')} to “at the table”, or remove the seat.` : '';
}

// ---- The remembered setup: { code, step, presetId, seating, adv }. Old or damaged values map to a valid state, never an error.
export const SETUP_STEPS = [
  { key: 'players', label: 'Members', next: 'Table rules' },
  { key: 'rules', label: 'Table rules', next: 'Seating' },
  { key: 'seating', label: 'Seating', next: 'Review' },
  { key: 'deal', label: 'Deal', next: null },
];
export function cleanSetup(raw, code, saved = []) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { o = null; } }
  const ok = o && typeof o === 'object' && o.code === code;
  const step = ok && Number.isInteger(o.step) ? Math.max(0, Math.min(SETUP_STEPS.length - 1, o.step)) : SETUP_FIRST_STEP;
  const presetId = ok && presetById(o.presetId, saved) ? o.presetId : DEFAULT_PRESET_ID;
  const seating = ok && SEATINGS.includes(o.seating) ? o.seating : null; // null = follow who has joined
  return { code, step, presetId, seating, adv: ok ? !!o.adv : false };
}

// Why a step cannot go on, and the one fix link: { reason, fix: { label, go } } or null. `go` is a step index or 'add' (focus the name field).
// Seating never blocks. Step 4's "Deal" is blocked by the same two things as steps 1 and 2.
export function stepProblem(step, n, preset, modeIssue = '') {
  if (step === 0 || step === 3) {
    if (n < MIN_PLAYERS) { const k = MIN_PLAYERS - n; return { reason: `Add ${k} more ${k === 1 ? 'member' : 'members'} to start (${MIN_PLAYERS} minimum).`, fix: { label: 'Add a name', go: step === 0 ? 'add' : 0 } }; }
    if (n > MAX_PLAYERS) { const k = n - MAX_PLAYERS; return { reason: `Too many members: ${MAX_PLAYERS} at most. Remove ${k}.`, fix: { label: 'Remove members', go: step === 0 ? 'add' : 0 } }; }
  }
  if ((step === 1 || step === 3) && preset && !presetFits(preset, n)) return { reason: `${preset.name} ${n < preset.min ? `needs ${preset.min}+ players` : `seats up to ${preset.max}`}. Change preset or add players.`, fix: { label: 'Change preset', go: 'presets' } };
  if (step === 3 && modeIssue) return { reason: modeIssue, fix: { label: 'Change seating', go: 2 } };
  return null;
}
// The furthest step reachable right now (swiping or tapping a dot forward past an invalid step snaps back to it).
export function furthestStep(n, preset) {
  for (let s = 0; s < SETUP_STEPS.length - 1; s++) if (stepProblem(s, n, preset)) return s;
  return SETUP_STEPS.length - 1;
}

// ---- Saved presets (this phone only): [{ id, name, vibe, min, max, difficulty, settings, saved: true }]
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);
export function cleanSaved(raw) {
  let a = raw;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = []; } }
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const p of a) {
    const name = cleanName(p?.name); const play = ['phone', 'physical', 'hybrid'].includes(p?.settings?.play) ? p.settings.play : null;
    if (!name || !play || typeof p.id !== 'string' || out.some((x) => x.id === p.id)) continue;
    const house = Object.fromEntries(PRESET_HOUSE_KEYS.filter((k) => p.settings.house?.[k]).map((k) => [k, k === 'turnTimer' ? +p.settings.house[k] || 0 : true]));
    out.push(savedPreset(p.id, name, { play, house }));
  }
  return out.slice(0, MAX_SAVED_PRESETS);
}
function savedPreset(id, name, settings) {
  const house = settings.house || {};
  const sets = [settings.play === 'physical' ? 'Host-only mode' : settings.play === 'hybrid' ? 'Hybrid mode' : '', house.rebalance && 'Rebalanced deck', house.exile && 'Exile, not execution', house.anonVotes && 'Anonymous votes', house.turnTimer && `${house.turnTimer} second turn clock`].filter(Boolean);
  return { id, name, vibe: 'Your own table rules.', min: MIN_PLAYERS, max: MAX_PLAYERS, difficulty: 'Classic', sets, settings, saved: true };
}
// Current room settings as a new saved preset. Returns the new list (never throws; a full list drops the oldest).
export function addSaved(list, name, mode, house, now = Date.now()) {
  const nm = cleanName(name) || 'My table rules';
  const settings = { play: ['phone', 'physical', 'hybrid'].includes(mode?.play) ? mode.play : 'phone', house: Object.fromEntries(PRESET_HOUSE_KEYS.filter((k) => house?.[k]).map((k) => [k, k === 'turnTimer' ? +house[k] : true])) };
  const next = [...list, savedPreset(`saved-${now.toString(36)}-${list.length}`, nm, settings)];
  return next.slice(-MAX_SAVED_PRESETS);
}
export const renameSaved = (list, id, name) => list.map((p) => (p.id === id && cleanName(name) ? { ...p, name: cleanName(name) } : p));
export const deleteSaved = (list, id) => list.filter((p) => p.id !== id);

// ---- Plain words for the Deal step. `house` is the room's house rules.
export function advancedSummary(house = {}) {
  const bits = [house.turnTimer ? `Phase timer ${house.turnTimer >= 60 ? `${house.turnTimer / 60} min` : `${house.turnTimer} sec`}` : 'No phase timer',
    house.anonVotes ? 'votes as totals' : 'votes by name'];
  return `${bits.join(', ')}.`;
}
export function playersLine(players, max = 3) {
  const names = players.filter((p) => !p.watch).map((p) => p.name);
  return names.length <= max ? `${names.length}: ${names.join(', ')}` : `${names.length}: ${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}
