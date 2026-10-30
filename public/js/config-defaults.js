// Every open-question default for the setup carousel, presets page and roles panel lives here, one named constant each.
// Change a value here and nothing else needs to move.

// The preset that is preselected and pinned first as "Recommended". (Open Session = the standard game, no house rules.)
export const DEFAULT_PRESET_ID = 'open-session';
// The turn clock "Gavel Down" sets, in seconds. Must be one of the Phase Timer choices in table.js (30, 60, 90, 120, 180, 300).
export const GAVEL_TURN_TIMER = 60;
// The step the setup opens on when nothing is remembered.
export const SETUP_FIRST_STEP = 0;
// localStorage keys, one per game. The suffix is the schema version: a new shape gets a new key and old values are mapped on load.
export const SETUP_STORE_KEY = 'council.setup.v1';
export const PRESETS_STORE_KEY = 'council.presets.v1';
// Slide between steps: transform only, ease-out. Reduced motion swaps it for a short fade (REDUCED_FADE_MS) or nothing (0).
export const SLIDE_MS = 240;
export const REDUCED_FADE_MS = 120;
// A horizontal swipe counts after this many pixels, and only when it is more horizontal than vertical.
export const SWIPE_MIN_PX = 56;
// The Advanced row on the Deal step starts closed.
export const ADVANCED_OPEN_DEFAULT = false;
// How many presets a phone keeps under "Saved on this phone".
export const MAX_SAVED_PRESETS = 12;
// Roles in this game: the header chip reads "Roles · N" (N = seats) and the panel shows before the player's own role.
export const ROLES_CHIP_LABEL = 'Roles';
// "Mixed" seating plays in Hybrid mode. The engine will not deal an app piece (roles, votes, policy tiles) to a seat with no phone,
// so with one or more phoneless seats every piece starts "at the table"; with none, the engine's own Hybrid default applies
// (roles at the table, votes and policy tiles in the app). The host can change each piece on the Seating step.
export const MIXED_PIECES_PHONELESS = { roles: 'physical', votes: 'physical', cards: 'physical' };
export const MIXED_PIECES_ALL_PHONES = { roles: 'physical', votes: 'app', cards: 'app' };
// Undo and Redo (event-log.js), decided by Nishant and Fennel (Oct 30). UNDO_PAST_SECRET off: Undo stops at the last
// secret look (a hand, the docket, an Inquiry) and says why. UNDO_PAST_GAME_OVER on: from the end screen a confirm
// sheet asks first, and every phone hides the roles again.
export const UNDO_PAST_SECRET = false;
export const UNDO_PAST_GAME_OVER = true;
export const NOTIFY_ON_UNDO = true;                   // players get "The host went back a step" when the game itself changed
