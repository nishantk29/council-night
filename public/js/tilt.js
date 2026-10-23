// Card tilt and lift (the Transit-style cards): pointer / touch press and device tilt, spring motion, CSS transforms only.
// Rules this file keeps: one rAF loop that runs only while a card is moving (nothing runs while idle: sensor events are
// dead-banded, pointer events only store coordinates); a card gets an inline transform and will-change only while it is
// away from rest, and both are removed once it settles (so no card is left as a containing block for the fixed bottom
// button); nothing is added on reduced-motion or low-end phones (they get flat cards), or when the host turned
// animations off. The page re-renders on every update, so cards that left the DOM are simply dropped.
const SEL = '.stage,.reveal,.board,.stat,.winner,.join-code,.path,.home-hero';
const SKIP = 'input,textarea,select,[contenteditable]';
const MAX_DEV = 6; // degrees of device tilt
const PERSPECTIVE = 900;

export function makeTilt({ enabled = () => true } = {}) {
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const lite = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  if (lite || reduced.matches) return { flat: true };

  // [rx, ry, z, scale]: value, velocity, target; stiffness and damping per channel
  const K = [220, 220, 260, 260]; const C = [14, 14, 13, 11];
  const cards = new Map(); // el -> { x, v, t, aim, press, px, py, dx, dy }
  let raf = 0; let last = 0; let cur = null; let pendingMove = null;

  const stateOf = (el) => {
    let s = cards.get(el);
    if (!s) { s = { x: [0, 0, 0, 1], v: [0, 0, 0, 0], t: [0, 0, 0, 1], aim: false, press: false, px: .5, py: .5, dx: 0, dy: 0 }; cards.set(el, s); }
    return s;
  };
  function aim(el) {
    const s = stateOf(el);
    if (s.aim) { s.t[0] = (.5 - s.py) * 12; s.t[1] = (s.px - .5) * 12; s.t[2] = s.press ? 0 : 16; s.t[3] = s.press ? .985 : 1.01; }
    else { s.t[0] = s.dy; s.t[1] = s.dx; s.t[2] = 0; s.t[3] = 1; }
    wake();
  }
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0; let again = false;
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    for (const [el, s] of cards) {
      if (!el.isConnected) { cards.delete(el); continue; }
      let moving = false;
      for (let i = 0; i < 4; i++) {
        const n = Math.ceil(dt / .008) || 1; const h = dt / n;
        for (let k = 0; k < n; k++) { s.v[i] += (K[i] * (s.t[i] - s.x[i]) - C[i] * s.v[i]) * h; s.x[i] += s.v[i] * h; }
        if (Math.abs(s.t[i] - s.x[i]) < .01 && Math.abs(s.v[i]) < .05) { s.x[i] = s.t[i]; s.v[i] = 0; } else moving = true;
      }
      el.classList.toggle('tilting', moving); // will-change only while it moves
      if (!moving && !s.aim && !s.dx && !s.dy) { el.style.transform = ''; cards.delete(el); continue; }
      el.style.transform = `perspective(${PERSPECTIVE}px) translate3d(0,0,${s.x[2].toFixed(2)}px) rotateX(${s.x[0].toFixed(2)}deg) rotateY(${s.x[1].toFixed(2)}deg) scale(${s.x[3].toFixed(4)})`;
      if (moving) again = true;
    }
    if (again) { raf = requestAnimationFrame(tick); } else last = 0;
  }

  // ---- pointer: events only store coordinates; the spring does the rest
  const point = (el, e) => { const r = el.getBoundingClientRect(); const s = stateOf(el); s.px = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))); s.py = Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))); };
  const release = (el) => { const s = cards.get(el); if (!s) return; s.aim = false; s.press = false; aim(el); };
  const find = (e) => { const t = e.target; return t?.closest && !t.closest(SKIP) ? t.closest(SEL) : null; };
  let queued = false;
  const flush = () => { queued = false; if (pendingMove && pendingMove.el.isConnected) { const { el, e } = pendingMove; point(el, e); stateOf(el).aim = true; aim(el); } pendingMove = null; };
  const schedule = (el, e) => { pendingMove = { el, e: { clientX: e.clientX, clientY: e.clientY } }; if (!queued) { queued = true; requestAnimationFrame(flush); } };
  function onMove(e) {
    if (!enabled() || (e.pointerType !== 'mouse' && !cur)) return;
    const el = find(e);
    if (el !== cur) { if (cur) release(cur); cur = e.pointerType === 'mouse' ? el : cur; if (!el) return; }
    if (el) schedule(el, e);
  }
  function onDown(e) {
    if (!enabled()) return;
    const el = find(e); if (!el) return;
    cur = el; point(el, e); const s = stateOf(el); s.aim = true; s.press = true; aim(el);
  }
  function onUp() { if (cur) { const el = cur; const s = cards.get(el); if (s) s.press = false; release(el); cur = null; } }
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('pointercancel', onUp, { passive: true });
  document.addEventListener('pointerleave', onUp, { passive: true });

  // ---- device tilt: relative to a slowly following base, dead-banded, and only cards on screen move
  let base = null; let askedOri = false; let devQueued = false; const dev = { x: 0, y: 0, ax: 0, ay: 0 };
  function applyDev() {
    devQueued = false;
    if (!enabled()) return;
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const s = stateOf(el); s.dx = dev.ax; s.dy = dev.ay; if (!s.aim) aim(el);
    }
  }
  function onOri(e) {
    if (e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    base.g += (e.gamma - base.g) * .01; base.b += (e.beta - base.b) * .01;
    dev.x = Math.max(-MAX_DEV, Math.min(MAX_DEV, (e.gamma - base.g) * .4));
    dev.y = Math.max(-MAX_DEV, Math.min(MAX_DEV, -(e.beta - base.b) * .4));
    if (Math.abs(dev.x - dev.ax) < .6 && Math.abs(dev.y - dev.ay) < .6) return;
    dev.ax = dev.x; dev.ay = dev.y;
    if (!devQueued) { devQueued = true; requestAnimationFrame(applyDev); }
  }
  function askOrientation() {
    if (askedOri || !('DeviceOrientationEvent' in window)) return;
    askedOri = true; const D = window.DeviceOrientationEvent;
    if (typeof D.requestPermission === 'function') D.requestPermission().then((r) => { if (r === 'granted') addEventListener('deviceorientation', onOri, { passive: true }); }).catch(() => {});
    else addEventListener('deviceorientation', onOri, { passive: true });
  }
  // iOS asks for permission only from a tap; elsewhere the listener is added at once (it is dead-banded and rAF-throttled)
  if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') document.addEventListener('click', askOrientation, { once: true });
  else askOrientation();

  return { flat: false };
}
