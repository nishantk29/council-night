// The setup panel (lobby and "Change setup first"). Gilded's teams are fixed by table size, so the composition is
// read-only counts in the stepper look (disabled), plus the powers track and the house-rule switches.
// Pure: the UI renders it, the tests check it.
import { TEAMS, POWERS, POWER_TEXT, MIN_PLAYERS, MAX_PLAYERS, roleList, startingDeck } from './rules.js';
import { ROLE_ART } from './art.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const planSeats = (players) => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number.isInteger(players) ? players : MIN_PLAYERS));

// Why the game cannot start with this many seated, or '' when it can.
export function seatProblem(players) {
  if (!Number.isInteger(players) || players < MIN_PLAYERS) { const k = MIN_PLAYERS - (Number.isInteger(players) ? players : 0); return `${plural(k, 'more player', 'more players')} needed: the game starts at ${MIN_PLAYERS} and seats up to ${MAX_PLAYERS}.`; }
  if (players > MAX_PLAYERS) return `Too many players: at most ${MAX_PLAYERS} can play. Remove ${players - MAX_PLAYERS}.`;
  return '';
}

// players: seated count. Returns { n, seated, ok, error, rows, summary, powers }.
export function setupComposition(players) {
  const n = planSeats(players);
  const error = seatProblem(players);
  const [r, c] = TEAMS[n];
  const rows = [
    { id: 'reformer', label: 'Loyalists', icon: ROLE_ART.reformer, side: 'reform', count: r, blurb: 'Pass five Reforms, or remove the Boss.' },
    { id: 'cabal', label: 'Syndicate', icon: ROLE_ART.cabal, side: 'cabal', count: c, blurb: 'Pass six Decrees, or elect the Boss Chancellor.' },
    { id: 'pretender', label: 'The Boss', icon: ROLE_ART.pretender, side: 'cabal', count: 1, blurb: 'On the Syndicate’s side. Looks trustworthy.' },
  ];
  const powers = POWERS[n].map((p, i) => ({ slot: i + 1, power: p, label: p ? POWER_TEXT[p][0] : 'No power' }));
  return { n, seated: players, ok: !error && !roleList(players).error, error, rows, powers,
    summary: `Set by table size: ${error ? `a table of ${n}` : `${n} players`} = ${r} Loyalists, ${c} Syndicate, 1 Boss`,
    reason: 'Set by table size.' };
}

// The two house-rule switches that touch the setup, each with a one-line effect for this table size.
export function houseEffects(players, house = {}) {
  const n = planSeats(players);
  const classic = startingDeck(n, false); const reb = startingDeck(n, true);
  const left = classic.deck.length - reb.deck.length; // Decrees left out of the pile
  const rebalance = reb.decree ? `At ${n} players ${plural(reb.decree, 'Decree starts', 'Decrees start')} on the board.`
    : left ? `At ${n} players ${plural(left, 'Decree is', 'Decrees are')} left out of the policy pile.` : `No change at ${n} players.`;
  return [
    { key: 'rebalance', label: 'Rebalanced Tables', on: !!house.rebalance, effect: rebalance },
    { key: 'exile', label: 'Exile Instead of Execution', on: !!house.exile, effect: 'Removed players stay and still vote, but can’t hold office.' },
  ];
}
