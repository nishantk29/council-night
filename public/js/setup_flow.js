// The host's setup flow: state (step, preset, seating, advanced), persistence, the slide, focus and the events for the
// four-step carousel and the Presets page. Rendering is in setup_ui.js, the rules are in presets.js, every default is in
// config-defaults.js. Nothing here can block: a blocked step shows why and offers the fix.
import { SETUP_STEPS, PRESETS, presetById, presetMessages, presetFits, recommendedFor, seatingDefault, seatingOfMode, modeFor, seatingProblem,
  cleanSetup, cleanSaved, addSaved, renameSaved, deleteSaved, stepProblem, furthestStep, houseMatches } from './presets.js';
import { SETUP_STORE_KEY, PRESETS_STORE_KEY, SLIDE_MS, REDUCED_FADE_MS, SWIPE_MIN_PX, ADVANCED_OPEN_DEFAULT, DEFAULT_PRESET_ID } from './config-defaults.js';
import { setupScreen, presetsPage, previewBody } from './setup_ui.js';
import { planSeats } from './steppers.js';

export function makeSetup({ S, send, store, render, esc, ui, art, toast, openSheet, askConfirm, modeNames }) {
  const savedList = () => cleanSaved(store.get(PRESETS_STORE_KEY));
  const persist = (st) => store.set(SETUP_STORE_KEY, JSON.stringify({ code: st.code, step: st.step, presetId: st.presetId, seating: st.seating, adv: st.adv }));
  const seated = (v) => v.players.filter((p) => !p.watch);

  // The state for this room: remembered if it is this room's, else inferred from the room's own settings.
  function state(v) {
    if (S.ui.setup?.code === v.code) return S.ui.setup;
    const saved = savedList(); const raw = store.get(SETUP_STORE_KEY);
    let st = cleanSetup(raw, v.code, saved);
    let had = false; try { had = JSON.parse(raw)?.code === v.code; } catch { /* nothing stored */ }
    if (!had) {
      const m = PRESETS.find((p) => houseMatches(p, v.house)); st.presetId = m ? m.id : DEFAULT_PRESET_ID; st.adv = ADVANCED_OPEN_DEFAULT;
      if (v.mode.play !== 'phone') st.seating = seatingOfMode(v.mode.play);
    }
    S.ui.setup = st; return st;
  }
  const presetOf = (st) => presetById(st.presetId, savedList()) || recommendedFor();
  function ctxOf(v, st) {
    const n = seated(v).length; const preset = presetOf(st);
    return { v, st, n, preset, saved: savedList(), seating: st.seating || seatingDefault(v.players), modeIssue: seatingProblem(v.mode, v.players), esc, ui, art, modeNames, link: `${location.origin}/#/play/${v.code}`, draft: S.ui.draft };
  }

  function announce(text) {
    let el = document.getElementById('gs-live');
    if (!el) { el = document.createElement('div'); el.id = 'gs-live'; el.className = 'sr-only'; el.setAttribute('aria-live', 'polite'); el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30);
  }
  function setStep(v, i, focus = 'heading') {
    const st = state(v); const c = ctxOf(v, st);
    const want = Math.max(0, Math.min(SETUP_STEPS.length - 1, i));
    const cap = Math.max(furthestStep(c.n, c.preset), 0);
    const to = want > st.step ? Math.min(want, cap) : want;
    if (to < want) { const pr = stepProblem(to, c.n, c.preset); if (pr) toast(pr.reason); }
    if (to === st.step) { render(); return; }
    S.ui.slideDir = to > st.step ? 1 : -1; S.ui.setupFocus = focus; st.step = to; st.page = null; persist(st);
    announce(`Step ${to + 1} of ${SETUP_STEPS.length}, ${SETUP_STEPS[to].label}`);
    render();
  }

  function syncMode(v) {
    if (!v.me?.host || v.phase !== 'lobby') return;
    const st = state(v); const want = modeFor(st.seating || seatingDefault(v.players), v.players);
    if (v.mode.play === want.play) { S.ui.modeSent = null; return; }
    if (S.ui.modeSent === `${v.code}:${want.play}`) return;
    S.ui.modeSent = `${v.code}:${want.play}`; send({ type: 'mode', mode: want });
  }

  function usePreset(v, p, custom) {
    const st = state(v); const m = presetMessages(p);
    st.presetId = p.id; st.seating = p.settings.play === 'phone' ? null : seatingOfMode(p.settings.play); st.page = null;
    send({ type: 'house', house: m.house });
    st.step = custom ? 3 : 1; if (custom) st.adv = true;
    S.ui.slideDir = 1; S.ui.setupFocus = 'heading'; persist(st); syncMode(v);
    announce(`${p.name} picked. Step ${st.step + 1} of ${SETUP_STEPS.length}, ${SETUP_STEPS[st.step].label}`);
    render();
  }

  function promptName(title, initial, label, done) {
    const sh = openSheet({ title, cls: 'gs-sheet', bodyHtml: `<label class="gs-lbl" for="gs-name">Name</label><input id="gs-name" class="gs-name" maxlength="28" value="${esc(initial)}" autocomplete="off" enterkeyhint="done">`,
      buttons: [{ label, cls: 'gs-sheet-pri', close: false, onClick: () => { const val = document.getElementById('gs-name')?.value || ''; sh.close(); done(val); } }, { label: 'Cancel', cls: 'gs-sheet-link' }] });
    const input = document.getElementById('gs-name'); input?.focus(); input?.select();
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const val = input.value; sh.close(); done(val); } });
  }

  function previewSheet(v, p) {
    const st = state(v); const c = ctxOf(v, st); const fits = presetFits(p, c.n);
    const buttons = fits
      ? [{ label: 'Use this', cls: 'gs-sheet-pri', onClick: () => usePreset(v, p, false) }, { label: 'Customize from here', cls: 'gs-sheet-link', onClick: () => usePreset(v, p, true) }]
      : [{ label: 'Add players', cls: 'gs-sheet-pri', onClick: () => { st.page = null; setStep(v, 0, 'add'); } }, { label: 'Pick another', cls: 'gs-sheet-link' }];
    openSheet({ title: p.name, cls: 'gs-sheet gs-preview', bodyHtml: previewBody(p, c), buttons });
  }

  function guestLobby(v) {
    const me = v.me; const n = seated(v).length;
    const list = v.players.map((p) => `<li class="gs-chip"><span class="gs-ini" aria-hidden="true">${esc(([...String(p.name).trim()][0] || '?').toUpperCase())}</span><span class="gs-nm">${esc(p.name)}${p.host ? ' <small>Host</small>' : p.id === me.id ? ' <small>You</small>' : ''}${p.watch ? ' <small>sitting out</small>' : ''}</span></li>`).join('');
    return `<section class="gs gs-guest" aria-label="Setup"><h1 class="gs-h" tabindex="-1">Who sits in the chamber?</h1><p class="gs-code"><span>Room <b>${esc(v.code)}</b></span></p>
      <section class="gs-block"><p class="gs-grp">${n} ${n === 1 ? 'member' : 'members'}</p><ul class="gs-chips">${list}</ul></section>
      <p class="gs-note">The host is choosing the table rules and will deal when everyone is here.</p>
      <button type="button" class="gs-sec" data-a="roles">Roles in this game</button><p class="gs-callout">Waiting for the host to start…</p></section>`;
  }

  function html(v) {
    if (!v.me?.host) return guestLobby(v);
    const st = state(v); const c = ctxOf(v, st);
    return st.page === 'presets' ? presetsPage(c) : setupScreen(c);
  }

  // Returns true when the action is the setup's.
  function handle(a, el, v) {
    if (!a.startsWith('gs')) return false;
    const st = state(v); const c = ctxOf(v, st);
    switch (a) {
      case 'gsNext': setStep(v, st.step + 1); return true;
      case 'gsBack': setStep(v, st.step - 1); return true;
      case 'gsGo': if (el.getAttribute('aria-disabled') === 'true') { toast('Finish the steps before this one first.'); return true; } setStep(v, +el.dataset.i, 'heading'); return true;
      case 'gsFix': {
        const go = el.dataset.go;
        if (go === 'add') { const i = document.querySelector('[data-i="seatName"]'); if (i) { i.focus(); return true; } setStep(v, 0, 'add'); }
        else if (go === 'presets') { st.page = 'presets'; S.ui.setupFocus = 'heading'; render(); }
        else setStep(v, +go, 'heading');
        return true;
      }
      case 'gsPresets': st.page = 'presets'; S.ui.setupFocus = 'heading'; render(); return true;
      case 'gsPresetsBack': st.page = null; S.ui.setupFocus = 'heading'; render(); return true;
      case 'gsPick': { const p = presetById(el.dataset.id, c.saved); if (p) previewSheet(v, p); return true; }
      case 'gsSeat': st.seating = el.dataset.v; persist(st); S.ui.modeSent = null; send({ type: 'mode', mode: modeFor(st.seating, v.players) }); render(); return true;
      case 'gsAdv': st.adv = !st.adv; persist(st); render(); return true;
      case 'gsSave': promptName('Save as a preset', 'My table rules', 'Save', (name) => {
        const list = addSaved(savedList(), name, v.mode, v.house); store.set(PRESETS_STORE_KEY, JSON.stringify(list));
        st.presetId = list.at(-1).id; persist(st); toast('Saved on this phone.'); render();
      }); return true;
      case 'gsMenu': {
        const p = presetById(el.dataset.id, c.saved); if (!p) return true;
        openSheet({ title: p.name, cls: 'gs-sheet', bodyHtml: '<p class="gs-small">Saved on this phone only.</p>', buttons: [
          { label: 'Rename', cls: 'gs-sheet-pri', onClick: () => promptName('Rename preset', p.name, 'Rename', (nm) => { store.set(PRESETS_STORE_KEY, JSON.stringify(renameSaved(savedList(), p.id, nm))); render(); }) },
          { label: 'Delete', cls: 'gs-sheet-link', onClick: async () => { if (!(await askConfirm(`Delete ${p.name}? This can’t be undone.`))) return; store.set(PRESETS_STORE_KEY, JSON.stringify(deleteSaved(savedList(), p.id))); if (st.presetId === p.id) { st.presetId = DEFAULT_PRESET_ID; persist(st); } render(); } },
          { label: 'Close', cls: 'gs-sheet-link' }] });
        return true;
      }
      default: return false;
    }
  }

  // After every paint: put focus on the new step's heading, and slide it in (transform and opacity only).
  function afterPaint(reduced) {
    const f = S.ui.setupFocus; const dir = S.ui.slideDir; S.ui.setupFocus = null; S.ui.slideDir = 0;
    const slide = document.querySelector('.gs .gs-slide, .gs-page, .gs-guest');
    if (f && slide) {
      const t = f === 'add' ? document.querySelector('[data-i="seatName"]') : f === 'dot' ? document.querySelector('.gs-dot.now') : slide.querySelector('.gs-h');
      t?.focus({ preventScroll: true });
      if (f === 'heading') window.scrollTo(0, 0); // a new step opens at the top, under the app bar
    }
    if (dir && slide?.animate) {
      if (reduced) { if (REDUCED_FADE_MS > 0) slide.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: 'ease-out' }); }
      else slide.animate([{ opacity: 0, transform: `translateX(${dir * 36}px)` }, { opacity: 1, transform: 'none' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  function onView(v) {
    if (v.phase !== 'lobby') { if (S.ui.setup) { store.del(SETUP_STORE_KEY); S.ui.setup = null; } return; }
    syncMode(v);
  }

  // Swipe is extra: a mostly horizontal pointer move past SWIPE_MIN_PX. Keyboard and switch users use Back, Next and the dots.
  function wire($app) {
    let x0 = 0; let y0 = 0; let down = false;
    $app.addEventListener('pointerdown', (e) => { down = !!e.target.closest?.('.gs-slide') && !e.target.closest('input,select,textarea,button,a'); x0 = e.clientX; y0 = e.clientY; });
    $app.addEventListener('pointercancel', () => { down = false; });
    $app.addEventListener('pointerup', (e) => {
      if (!down) return; down = false; const v = S.view; if (!v?.me?.host || v.phase !== 'lobby' || state(v).page) return;
      const dx = e.clientX - x0; const dy = e.clientY - y0;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const st = state(v); setStep(v, st.step + (dx < 0 ? 1 : -1));
    });
    $app.addEventListener('keydown', (e) => {
      const d = e.target.closest?.('.gs-dot'); if (!d || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); const v = S.view; if (!v) return; const st = state(v);
      setStep(v, st.step + (e.key === 'ArrowRight' ? 1 : -1), 'dot');
    });
  }

  return { html, handle, afterPaint, onView, wire, state };
}
