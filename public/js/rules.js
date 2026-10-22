// Council Night: the rules, written once and shared by the Worker, the browser and the tests.
// Mechanics follow the classic hidden-role policy game exactly; names, theme and wording are original.
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

// Reformers and the Cabal (not counting the Pretender) by table size.
export const TEAMS = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
export const REFORM_TO_WIN = 5;
export const DECREE_TO_WIN = 6;
export const VETO_AT = 5;            // veto is unlocked once 5 Decrees are on the board
export const PRETENDER_DANGER = 3;   // from 3 Decrees, electing the Pretender as Chancellor wins for the Cabal
export const TRACKER_MAX = 3;        // the third failed government in a row: the top policy is enacted
export const DECK = { R: 6, D: 11 };

// Executive powers on each Decree slot (slot 1 to 5; slot 6 wins).
export const POWERS = {
  5: [null, null, 'peek', 'execute', 'execute'], 6: [null, null, 'peek', 'execute', 'execute'],
  7: [null, 'investigate', 'special', 'execute', 'execute'], 8: [null, 'investigate', 'special', 'execute', 'execute'],
  9: ['investigate', 'investigate', 'special', 'execute', 'execute'], 10: ['investigate', 'investigate', 'special', 'execute', 'execute'],
};
export const POWER_TEXT = {
  investigate: ['Inquiry', 'The Speaker sees one player’s party card in secret.'],
  special: ['Snap election', 'The Speaker chooses the next Speaker.'],
  peek: ['The docket', 'The Speaker looks at the top three policies in secret.'],
  execute: ['Execution', 'The Speaker removes a player from the game.'],
};

export const SIDES = { reform: { name: 'the Reformers', short: 'Reformers' }, cabal: { name: 'the Cabal', short: 'Cabal' } };
export const ROLES = {
  reformer: { id: 'reformer', name: 'Reformer', side: 'reform', blurb: 'Pass five Reforms, or find the Pretender and remove them. Trust carefully.' },
  cabal: { id: 'cabal', name: 'Cabal member', side: 'cabal', blurb: 'You know the Cabal and the Pretender. Pass six Decrees, or put the Pretender in the Chancellor’s chair.' },
  pretender: { id: 'pretender', name: 'The Pretender', side: 'cabal', blurb: 'Lead the Cabal from the shadows. Look trustworthy: after three Decrees, being elected Chancellor wins the game.' },
};
export const partyOf = (role) => (role === 'reformer' ? 'reform' : 'cabal'); // the Pretender's party card says Cabal

export const DEFAULT_SETTINGS = {};
export const HOUSE_DEFAULTS = { rebalance: false, exile: false };
export function cleanSettings() { return {}; }

export function roleList(n) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS) return { error: `You need at least ${MIN_PLAYERS} players.` };
  if (n > MAX_PLAYERS) return { error: `At most ${MAX_PLAYERS} players can play.` };
  const [r, c] = TEAMS[n];
  return { roles: [...Array(r).fill('reformer'), ...Array(c).fill('cabal'), 'pretender'] };
}

// The policy deck for a table. The rebalanced community variant (off by default): at 6 players the game
// starts with one Decree already on the board; at 7 one Decree and at 9 two Decrees are left out of the deck.
export function startingDeck(n, rebalance) {
  let d = DECK.D; let board = 0;
  if (rebalance && n === 6) { d -= 1; board = 1; }
  if (rebalance && n === 7) d -= 1;
  if (rebalance && n === 9) d -= 2;
  return { deck: [...Array(DECK.R).fill('R'), ...Array(d).fill('D')], decree: board };
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// What one player learns at the start: [{ id, tag }] where tag is 'cabal' or 'pretender'.
export function knowledgeFor(id, roles, n) {
  const mine = roles[id];
  const others = Object.keys(roles).filter((x) => x !== id);
  if (mine === 'cabal') return others.filter((x) => roles[x] !== 'reformer').map((x) => ({ id: x, tag: roles[x] }));
  if (mine === 'pretender' && n <= 6) return others.filter((x) => roles[x] === 'cabal').map((x) => ({ id: x, tag: 'cabal' }));
  return [];
}

// Term limits: the last elected Chancellor can't be nominated; nor the last elected Speaker, unless only five
// or fewer players are left. `office` = players allowed to hold office (alive, and not exiled).
export function eligibleChancellors(speaker, office, lastGov, alive) {
  return office.filter((id) => id !== speaker && id !== lastGov?.chancellor && !(alive.length > 5 && id === lastGov?.speaker));
}
export const electionPasses = (ayes, voters) => ayes * 2 > voters;
