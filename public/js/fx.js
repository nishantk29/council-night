// The Gilded Chamber pop-outs: card draws, enactment slams, the Unrest tracker, executions and the victory pop-up.
// Styles live in fx.css. Rules this file keeps: only transform and opacity are animated; will-change is set while an
// element animates and removed after; at most ~20 particles per burst, all removed afterwards; nothing runs while idle
// (the tilt listeners exist only while a card is open); every effect is <= 1.2 s, ignores pointer events and never
// blocks the game. Only public facts are animated for everyone: a card's face is shown only on its holder's own phone.
import { art, ROLE_ART } from './art.js';
import { TRACKER_MAX } from './rules.js';

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
// Low-end phones get flat 2D pops and fewer particles.
const LITE = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const PARTS = LITE ? 8 : 18;
const TEAM_COLORS = {
  reform: ['#5B8FD0', '#9CC3F0', '#2F5A8A', '#E2B04A'],
  cabal: ['#E8590C', '#FF7A33', '#C2310F', '#E2B04A'],
};
const WIN_NAME = { reform: 'The Loyalists', cabal: 'The Syndicate' };
const ROLE_LABEL = { reformer: 'Loyalist', cabal: 'Syndicate member', pretender: 'The Boss' };
const rand = (a, b) => a + Math.random() * (b - a);

export function makeFx({ S, send, esc }) {
  const $html = document.documentElement;
  const $app = document.getElementById('app');
  const $fx = Object.assign(document.createElement('div'), { id: 'fx' });
  $fx.setAttribute('aria-hidden', 'true');
  document.body.append($fx);
  if (LITE) $html.dataset.fxlite = '1';

  const on = (v = S.view) => v?.anim !== false && !reduced.matches;
  const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name || '?';
  const release = (el, cls) => { el.classList.remove(cls); el.style.animationDelay = ''; el.style.willChange = ''; };

  // ------------------------------------------------------------ effects on the page itself
  // The page re-renders on every update, so an effect on a page element is kept in `live` and re-applied (continuing
  // where it left off) to whatever element now matches, until it ends.
  const live = [];
  function addLive(find, cls, { delay = 0, dur = 700, stagger = 0 } = {}) {
    live.push({ find, cls, dur, stagger, start: performance.now() + delay });
    applyLive();
  }
  function applyLive() {
    const now = performance.now();
    for (let k = live.length - 1; k >= 0; k--) {
      const L = live[k]; const els = [...L.find()];
      const end = L.start + L.dur + L.stagger * Math.max(0, els.length - 1);
      clearTimeout(L.t);
      if (now >= end) { els.forEach((e) => release(e, L.cls)); live.splice(k, 1); continue; }
      els.forEach((e, i) => {
        if (e.classList.contains(L.cls)) return;
        e.style.animationDelay = `${Math.round(L.start + i * L.stagger - now)}ms`; e.style.willChange = 'transform, opacity'; e.classList.add(L.cls);
      });
      L.t = setTimeout(applyLive, end - now + 30);
    }
  }
  const shake = (cls = 'fx-shake') => addLive(() => $app.querySelectorAll('.col-main'), cls, { dur: 400 });

  // ------------------------------------------------------------ particles (own tiny helper, no libraries)
  function burst(host, kind, team, { n = PARTS, x = 50, y = 50, delay = 0 } = {}) {
    const colors = TEAM_COLORS[team] || TEAM_COLORS.reform; const made = [];
    for (let i = 0; i < Math.min(n, 20); i++) {
      const p = document.createElement('i'); const a = rand(0, Math.PI * 2); const d = rand(90, 210);
      p.className = `fx-p fx-${kind}`;
      p.style.cssText = kind === 'spark'
        ? `left:${x}%;top:${y}%;--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--r:${Math.round(rand(-200, 200))}deg;--c:${colors[i % colors.length]};--w:${Math.round(rand(6, 12))}px;--t:${Math.round(rand(520, 760))}ms;--d:${delay + Math.round(rand(0, 80))}ms`
        : `left:${rand(8, 92).toFixed(1)}%;top:-4%;--dx:${Math.round(rand(-70, 70))}px;--dy:${Math.round(rand(300, 520))}px;--r:${Math.round(rand(360, 800))}deg;--c:${colors[i % colors.length]};--w:${Math.round(rand(7, 12))}px;--t:${Math.round(rand(900, 1150))}ms;--d:${delay + Math.round(rand(0, 140))}ms`;
      p.style.willChange = 'transform, opacity'; made.push(p);
    }
    host.append(...made);
    setTimeout(() => made.forEach((p) => { p.style.willChange = ''; p.remove(); }), 1500 + delay);
  }

  // ------------------------------------------------------------ overlay queue (one at a time, each <= 1.2 s)
  const queue = []; let busy = false;
  function play(kind, data) {
    if (!on() || document.hidden) return;
    queue.push([kind, data]); if (queue.length > 3) queue.shift();
    pump();
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true; const [kind, data] = queue.shift();
    const el = Object.assign(document.createElement('div'), { className: `fx-ov fx-ov-${kind}` });
    el.innerHTML = OVERLAYS[kind](data); $fx.append(el);
    const ms = RUN[kind]?.(el, data) || 1100;
    setTimeout(() => { el.remove(); busy = false; pump(); }, ms);
  }
  function clearOverlays() { queue.length = 0; $fx.querySelectorAll('.fx-ov').forEach((e) => e.remove()); busy = false; }

  const lines = '<span class="fx-line fx-line-t"></span><span class="fx-line fx-line-b"></span><span class="fx-diamond"></span>';
  const OVERLAYS = {
    // A policy slams onto the board: Loyalist blue or Syndicate red-orange.
    slam: ({ policy }) => `<div class="fx-3d ${policy === 'R' ? 'is-reform' : 'is-decree'}">${lines}<div class="fx-slam"><span class="fx-slam-face">${art(policy === 'R' ? 'torch' : 'chain')}<b>${policy === 'R' ? 'Reform' : 'Decree'}</b></span><em class="fx-stamp">Enacted</em></div></div>`,
    // Cards drawn from the pile slide out, face down: only that they were drawn is public.
    deal: ({ count }) => `<div class="fx-3d">${lines}<div class="fx-hand">${Array.from({ length: count }, (_, i) => `<span class="fx-back" style="--i:${i};--o:${i - (count - 1) / 2}">${art('sun')}</span>`).join('')}</div></div>`,
    // Third failed government: the tracker clicks forward and the table shakes.
    unrest: () => `<div class="fx-3d"><div class="fx-pill gl-card"><b>Unrest</b><span class="fx-pips">${[0, 1, 2].map((i) => `<i class="${i < TRACKER_MAX - 1 ? 'on' : 'last'}"></i>`).join('')}</span><b class="fx-3of3">3/3</b></div></div>`,
    // An execution: the table dims and the player's card fades out.
    execute: ({ name, exiled }) => `<div class="fx-scrim"></div><div class="fx-3d"><div class="fx-victim gl-card"><span class="fx-disc">${esc([...name][0] || '?')}</span><b>${esc(name)}</b><small>${exiled ? 'was exiled' : 'was executed'}</small><span class="fx-gone"></span></div></div>`,
  };
  const RUN = {
    slam(el, { policy }) {
      const team = policy === 'R' ? 'reform' : 'cabal';
      burst(el, 'spark', team, { delay: 260 }); setTimeout(() => shake(), 280);
      addLive(() => $app.querySelectorAll(policy === 'R' ? `.board.a-reform .slot.is-reform:nth-child(${S.view.game.reform})` : `.board.a-cabal .slot.is-decree:nth-child(${S.view.game.decree})`), 'fx-slot-slam', { delay: 520, dur: 600 });
      return 1150;
    },
    deal() { return 1000; },
    unrest() { setTimeout(() => shake('fx-shake-big'), 430); return 1050; },
    execute() { return 1200; },
  };

  // ------------------------------------------------------------ what changed in the public view
  function onView(prev, v) {
    if (v.phase === 'lobby' || !v.game) { last = {}; handSig = ''; }
    if (v.phase !== 'over') closeOver();
    if (!prev?.game || !v.game || !on(v)) return;
    const p = prev.game; const g = v.game;
    const enacted = g.reform + g.decree > p.reform + p.decree;
    if (g.tracker > p.tracker && g.tracker < TRACKER_MAX) addLive(() => $app.querySelectorAll(`.rejects i:nth-of-type(${g.tracker})`), 'fx-click', { dur: 450 });
    const third = p.tracker === TRACKER_MAX - 1 && (g.tracker >= TRACKER_MAX || (enacted && g.tracker === 0 && g.lastPolicy && !g.lastPolicy.byGov));
    if (third) play('unrest');
    if (enacted && g.lastPolicy) play('slam', { policy: g.lastPolicy.policy });
    for (const id of g.dead) if (!p.dead.includes(id)) play('execute', { name: nameOf(v, id), exiled: g.exiled.includes(id) });
    if (v.phase === 'legislate' && g.cardsApp && !v.me?.hand && (prev.phase !== 'legislate' || p.leg !== g.leg) && g.leg !== 'veto') play('deal', { count: g.leg === 'speaker' ? 3 : 2 });
  }

  // ------------------------------------------------------------ after every render
  let last = {}; let handSig = '';
  function after() {
    $html.dataset.fx = on() ? 'on' : 'off';
    if (!on()) return;
    for (const el of $app.querySelectorAll('[data-roll]')) { // numbers that roll when they change
      const k = el.dataset.roll; const val = el.textContent;
      if (k in last && last[k] !== val) addLive(() => $app.querySelectorAll(`[data-roll="${k}"]`), 'fx-roll', { dur: 480 });
      last[k] = val;
    }
    const me = S.view?.me; const hand = me?.hand || me?.docket;
    const sig = hand ? `${S.view.phase}${S.view.game?.leg}${hand.join('')}` : '';
    if (sig && sig !== handSig) { // the holder's own policy tiles are dealt in, with gold lines sweeping out
      addLive(() => $app.querySelectorAll('.tiles'), 'fx-gold', { dur: 900 });
      addLive(() => $app.querySelectorAll('.tiles .tile-btn, .tiles > .tile'), 'fx-deal', { dur: 560, stagger: 110 });
    }
    handSig = sig;
    applyLive();
  }

  // ------------------------------------------------------------ the victory pop-up
  let over = null; let tiltOff = null; let prevFocus = null;
  const fan = () => { // an art-deco gold fan: alternating gold rays with fine concentric arcs
    const R = 150; const n = 13; let d = '';
    for (let i = 0; i < n; i += 2) { const a0 = Math.PI + (i * Math.PI) / n; const a1 = Math.PI + ((i + 1) * Math.PI) / n; d += `<path d="M160 160L${(160 + R * Math.cos(a0)).toFixed(1)} ${(160 + R * Math.sin(a0)).toFixed(1)}A${R} ${R} 0 0 1 ${(160 + R * Math.cos(a1)).toFixed(1)} ${(160 + R * Math.sin(a1)).toFixed(1)}z"/>`; }
    return `<svg class="fx-fan" viewBox="0 0 320 170" aria-hidden="true"><g fill="var(--gold)">${d}</g><g fill="none" stroke="var(--gold)" stroke-width="2"><path d="M10 160a150 150 0 0 1 300 0"/><path d="M40 160a120 120 0 0 1 240 0"/><path d="M70 160a90 90 0 0 1 180 0"/></g></svg>`;
  };
  const mascot = (side) => `<svg class="fx-mascot" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="44" r="28" fill="var(--${side === 'reform' ? 'reform' : 'cabal'}-fill)" stroke="var(--gold)" stroke-width="3"/><path d="M22 20l7-10 6 8 5-11 5 11 6-8 7 10z" fill="var(--gold)"/><circle cx="31" cy="42" r="4" fill="#FFF8EC"/><circle cx="49" cy="42" r="4" fill="#FFF8EC"/><circle cx="32" cy="43" r="2" fill="#1A1410"/><circle cx="50" cy="43" r="2" fill="#1A1410"/><path d="M29 54q11 11 22 0" fill="none" stroke="#FFF8EC" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="52" r="3.5" fill="#FFF8EC" opacity=".35"/><circle cx="56" cy="52" r="3.5" fill="#FFF8EC" opacity=".35"/></svg>`;

  function rolesHtml(v) {
    const roles = v.game?.roles; if (!roles) return '<p class="fx-turn">Everyone, turn your cards over.</p>';
    return `<ul class="fx-roles">${v.players.filter((p) => roles[p.id]).map((p, i) => { const r = roles[p.id];
      return `<li class="a-${r.side}" style="--i:${i}">${art(ROLE_ART[r.id])}<span><b>${esc(p.name)}</b><small>${ROLE_LABEL[r.id] || esc(r.name)}</small></span></li>`; }).join('')}</ul>`;
  }

  function showOver(ev) {
    const v = S.view; if (!v || S.ui.overShown === ev.gameNo) return;
    S.ui.overShown = ev.gameNo; closeOver(true); clearOverlays();
    const motion = on(); const side = ev.winner === 'reform' ? 'reform' : 'cabal';
    const el = document.createElement('div');
    el.id = 'fx-over'; el.className = `fx-over a-${side} ${motion ? '' : 'is-static'}`;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'fx-over-h');
    const you = ev.you === 'won' ? '<p class="fx-you is-won">You won!</p>' : ev.you === 'lost' ? '<p class="fx-you is-lost">You lost</p>' : '';
    el.innerHTML = `<div class="fx-scrim" data-o="close"></div>
      <div class="fx-pop">${fan()}<div class="fx-card gl-card">
        <span class="fx-spec"></span>
        <div class="fx-band">${mascot(side)}<h2 id="fx-over-h">${WIN_NAME[side]} win!</h2></div>
        <p class="fx-reason">${esc(ev.text)}</p>${you}
        <div class="fx-roles-wrap">${rolesHtml(v)}</div>
        <div class="fx-btns">${v.kind === 'screen' ? '' : '<button type="button" class="btn big" data-o="again">Play again</button>'}<button type="button" class="btn ghost" data-o="close">Close</button></div>
      </div></div><div class="fx-parts"></div>`;
    el.addEventListener('click', (e) => { const o = e.target.closest('[data-o]')?.dataset.o; if (o === 'again') { send({ type: 'again' }); closeOver(); } else if (o === 'close') closeOver(); });
    prevFocus = document.activeElement; document.body.append(el); over = el;
    el.querySelector('.fx-btns .btn')?.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
    if (motion) {
      burst(el.querySelector('.fx-parts'), 'conf', side, { delay: 250 });
      if (!LITE) tiltOff = enableTilt(el.querySelector('.fx-card'));
      if (navigator.vibrate) try { navigator.vibrate(ev.you === 'won' ? [40, 40, 60] : 30); } catch { /* ignore */ }
    }
  }
  const onKey = (e) => { if (e.key === 'Escape') closeOver(); };
  function closeOver(now = false) {
    if (!over) return;
    const el = over; over = null; tiltOff?.(); tiltOff = null; document.removeEventListener('keydown', onKey);
    if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true }); prevFocus = null;
    if (now || el.classList.contains('is-static') || !on()) { el.remove(); return; }
    el.classList.add('is-out'); setTimeout(() => el.remove(), 180);
  }
  // The roles appear once the game is over: if the view with them lands after the pop-up, fill them in.
  function refreshOver(v) { if (over && v.game?.roles) { const w = over.querySelector('.fx-roles-wrap'); if (w && !w.querySelector('.fx-roles')) w.innerHTML = rolesHtml(v); } }

  // Subtle pointer / device tilt: listeners exist only while the card is open, updates are throttled to one per frame.
  function enableTilt(card) {
    let raf = 0; let tx = 0; let ty = 0;
    const apply = () => { raf = 0; card.style.setProperty('--rx', `${(-ty * 7).toFixed(2)}deg`); card.style.setProperty('--ry', `${(tx * 9).toFixed(2)}deg`); card.style.setProperty('--sx', `${(tx * 60).toFixed(1)}px`); card.style.setProperty('--sy', `${(ty * 40).toFixed(1)}px`); };
    const set = (x, y) => { tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y)); if (!raf) raf = requestAnimationFrame(apply); };
    const move = (e) => set((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    const tilt = (e) => { if (e.gamma != null && e.beta != null) set(e.gamma / 30, (e.beta - 45) / 30); };
    addEventListener('pointermove', move, { passive: true }); addEventListener('deviceorientation', tilt, { passive: true });
    return () => { removeEventListener('pointermove', move); removeEventListener('deviceorientation', tilt); cancelAnimationFrame(raf); };
  }

  return {
    onView(prev, v) { onView(prev, v); refreshOver(v); },
    after, gameOver: showOver,
    reset() { clearOverlays(); closeOver(true); last = {}; handSig = ''; },
  };
}
