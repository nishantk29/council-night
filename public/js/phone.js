// Phones mode helpers: blur-to-reveal timing, Screen Wake Lock during play, haptics and View Transition keys.
// The pure functions are unit-tested; the DOM helpers feature-detect and fail quietly.
export const TAP_REVEAL_MS = 4000; // a quick tap shows the secret this long, then it blurs again
export const HOLD_MS = 350; // pressing longer than this counts as a hold: hide the moment the finger lifts

// How long to keep a secret visible after the finger lifts: 0 after a hold, the tap window after a tap.
export const revealAfterRelease = (heldMs) => (heldMs >= HOLD_MS ? 0 : TAP_REVEAL_MS);

// Keep the screen awake while a game is in progress (not in the lobby, not after the end).
export const wantsWake = (view) => !!(view && view.game && view.phase !== 'lobby' && view.phase !== 'over');

// A new key means a new screen or step, so the page change is animated. Re-renders with the same key are not.
export const screenKey = (mode, view) => [mode, view?.phase || '', view?.game?.leg || '', view?.game?.power || ''].join('|');

// Animations are allowed unless the player asks for reduced motion or the host turned the Animations switch off.
export const motionOk = (view, reducedMotion) => !reducedMotion && view?.anim !== false;

export function makeWake() {
  let lock = null; let want = false;
  const grab = () => {
    if (!want || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then((w) => { lock = w; w.addEventListener('release', () => { lock = null; }); }).catch(() => {});
  };
  document.addEventListener('visibilitychange', grab);
  return (on) => {
    want = !!on;
    if (want) grab(); else if (lock) { lock.release().catch(() => {}); lock = null; }
  };
}

// Browsers block (and log an error for) vibration before the first tap, so wait for a user gesture.
export const haptic = (ms = 15) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch { /* not supported */ } };

// Fullscreen on tap for the lobby QR. Falls back to a fixed overlay class where the API is missing (iPhone Safari).
export function toggleFullscreen(el) {
  const doc = document;
  if (doc.fullscreenElement === el) { doc.exitFullscreen?.(); return false; }
  if (el.classList.contains('is-full')) { el.classList.remove('is-full'); return false; }
  if (el.requestFullscreen) { el.requestFullscreen().catch(() => el.classList.add('is-full')); return true; }
  el.classList.add('is-full'); return true;
}
