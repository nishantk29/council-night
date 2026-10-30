// Unit-test helpers for Undo, which lives on the event log (event-log.js), not in the reducer. `logged(t)` starts a
// log from the table as it is now (so a test may set up the board by hand first), and from then on `act` on that
// room goes through the log. `undo(t)` / `redo(t)` step it and point t.room (and t.g) at the rebuilt room.
import { reduce } from '../../public/js/room.js';
import { GameLog } from '../../public/js/event-log.js';

const LOGS = new WeakMap();
let n = 0;
const seedOf = (rng) => [0, 0, 0, 0].map(() => Math.floor((rng ? rng() : ((n = (n * 1103515245 + 12345) >>> 0) / 4294967296)) * 4294967296));
export const act = (room, id, msg, rng, now) => {
  const L = LOGS.get(room);
  return L ? L.apply({ playerId: id }, msg, now ?? Date.now(), seedOf(rng)) : reduce(room, { playerId: id }, msg, rng, now);
};
const sync = (t) => { t.room = t.L.room; LOGS.set(t.room, t.L); return t; };
export function logged(t) {
  t.L = new GameLog(t.room);
  Object.defineProperty(t, 'g', { get() { return t.room.game; }, configurable: true });
  return sync(t);
}
export function undo(t) { const why = t.L.history().undoWhy; if (t.L.undoStep() === null) return { error: why || 'Nothing to undo.' }; sync(t); return { ok: true }; }
export function redo(t) { if (t.L.redoStep() === null) return { error: 'Nothing to redo.' }; sync(t); return { ok: true }; }
