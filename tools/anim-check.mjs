// Animation smoothness check: `node tools/anim-check.mjs [--shot path.png]`. Drives the home page, a confirm sheet, hold-to-reveal,
// a card flip, the overlays and host-console step changes at 390x844 (touch, iPhone UA) against the local Worker stand-in, and
// samples getBoundingClientRect every animation frame. Fails on: an element jumping > 40 px in one frame, motion that reverses,
// the container moving, an animation still running 700 ms after it started, an animation replaying on a re-render with the same
// state, any animation under prefers-reduced-motion, or sideways overflow.
import { puppeteer, sleep, UA, VIEWPORT, BASE, server, wss } from './_harness.mjs';

const shotArg = process.argv.indexOf('--shot') > 0 ? process.argv[process.argv.indexOf('--shot') + 1] : null;
const JUMP_MAX = 40; const EPISODE_MS = 800; const RUN_MAX_MS = 700;

// ---- in-page recorder (installed before any script runs). Episodes: the first time an element for a key shows up, its rect
// (relative to its parent, so layout shifts above it don't count) and #app's rect are sampled every frame for 800 ms.
function recorder() {
  const KEYS = { flip: '.dc.flip', sheet: 'dialog.confirm-sheet[open]', role: '.rcard', slam: '#fx .fx-slam', deal: '#fx .fx-hand', pop: '.fx-pop', reveal: '.reveal.is-new', title: '.phase-title' };
  const R = window.__rec = { eps: [], starts: [], open: {}, log: [] };
  const rect = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  addEventListener('animationstart', (e) => R.starts.push({ t: performance.now(), name: e.animationName, cls: String(e.target.className || e.target.tagName).slice(0, 40) }), true);
  const stale = (T0) => document.getAnimations().filter((a) => a.playState === 'running' && a.startTime != null && a.startTime <= T0 + 150).map((a) => a.animationName || a.transitionProperty || 'anim');
  R.mark = () => { const n = R.starts.length; return n; };
  R.startsSince = (n) => R.starts.slice(n).map((s) => s.name);
  R.runningNow = () => document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.transitionProperty || 'anim') + (a.effect?.target ? '@' + a.effect.target.tagName + '.' + (a.effect.target.className?.baseVal ?? a.effect.target.className) + (a.effect.pseudoElement || '') : ''));
  R.sw = () => ({ sw: document.documentElement.scrollWidth, bsw: document.body ? document.body.scrollWidth : 0, iw: innerWidth, x: scrollX });
  const tick = () => {
    const now = performance.now(); const app = document.getElementById('app');
    for (const [k, sel] of Object.entries(KEYS)) {
      const el = document.querySelector(sel); let ep = R.open[k];
      if (!ep && el) ep = R.open[k] = { k, t0: now, T0: document.timeline.currentTime, f: [], app: [], text: (el.textContent || '').slice(0, 24) };
      if (!ep) continue;
      if (now - ep.t0 > 800) { ep.running = stale(ep.T0); R.eps.push(ep); delete R.open[k]; continue; }
      if (el && app) { const p = el.parentElement; const a = rect(el); const b = p ? rect(p) : [0, 0, 0, 0]; ep.f.push({ t: now - ep.t0, rel: [a[0] - b[0], a[1] - b[1], a[2], a[3]], key: (el.textContent || '').slice(0, 24) }); ep.app.push(rect(app)); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const errors = [];
async function newPage({ reduce = false } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setUserAgent(UA); await p.setViewport(VIEWPORT);
  if (reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.evaluateOnNewDocument(recorder);
  p.on('pageerror', (e) => errors.push(e.message)); return p;
}
const click = (p, sel) => p.evaluate((s) => { document.activeElement?.blur?.(); document.querySelector(s)?.click(); }, sel);
const typeIn = async (p, sel, v) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.click(sel, { clickCount: 3 }); await p.type(sel, v); };

// ---- analysis of one episode -> { frames, jump, reversals, appDrift, running }
function analyse(ep) {
  const out = { k: ep.k, frames: ep.f.length, jump: 0, rev: 0, app: 0, run: ep.running || [] };
  // element motion, per identity (same text = same element, even though the page re-renders it)
  const byKey = new Map(); for (const f of ep.f) { if (!byKey.has(f.key)) byKey.set(f.key, []); byKey.get(f.key).push(f); }
  for (const fs of byKey.values()) {
    for (let i = 1; i < fs.length; i++) for (let a = 0; a < 2; a++) out.jump = Math.max(out.jump, Math.abs(fs[i].rel[a] - fs[i - 1].rel[a]));
    // the axis with the most travel must not turn back
    let best = null; for (let a = 0; a < 4; a++) { const v = fs.map((f) => f.rel[a]); const rg = Math.max(...v) - Math.min(...v); if (!best || rg > best.rg) best = { a, rg, v }; }
    if (best && best.rg > 6) { const dir = Math.sign(best.v.at(-1) - best.v[0]); let peak = 0; for (let i = 1; i < best.v.length; i++) { const d = (best.v[i] - best.v[i - 1]) * dir; if (d < -2) out.rev++; peak += d; } }
  }
  if (ep.app.length) for (const i of [0, 2]) { const v = ep.app.map((r) => r[i]); out.app = Math.max(out.app, Math.max(...v) - Math.min(...v)); }
  return out;
}

const rows = []; const fails = [];
const row = (name, a, extra = {}) => {
  const r = { scenario: name, frames: a?.frames ?? '-', jump: a ? Math.round(a.jump) : '-', rev: a?.rev ?? '-', appDrift: a ? +a.app.toFixed(1) : '-', running: a ? (a.run.length ? a.run.join(',') : 'none') : '-', starts: extra.starts ?? '-', ok: true };
  const bad = [];
  if (a && a.jump > JUMP_MAX) bad.push(`jump ${Math.round(a.jump)}px`);
  if (a && a.rev) bad.push(`${a.rev} reversal(s)`);
  if (a && a.app > 0.5) bad.push(`container moved ${a.app.toFixed(1)}px`);
  if (a && a.run.length) bad.push(`still running at ${RUN_MAX_MS}ms: ${a.run.join(',')}`);
  if (extra.bad) bad.push(...extra.bad);
  if (bad.length) { r.ok = false; fails.push(`${name}: ${bad.join('; ')}`); }
  rows.push(r);
};
const takeEps = (p, k) => p.evaluate((k) => window.__rec.eps.filter((e) => e.k === k), k);
const overflow = async (p, label) => { const s = await p.evaluate(() => window.__rec.sw()); if (s.sw > s.iw || s.bsw > s.iw || s.x !== 0) fails.push(`${label}: sideways overflow scrollWidth ${s.sw}/${s.bsw} vs ${s.iw}, scrollX ${s.x}`); };

try {
  // ============================================================ 1. home
  const h = await newPage();
  await h.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(900);
  const home = await h.evaluate(() => ({
    steps: [...document.querySelectorAll('.how li')].map((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
    car: !!document.querySelector('.car-track'),
    hub: [...document.querySelectorAll('a[href="https://gamenight.hatethespurs.com/"]')].map((a) => { const r = a.getBoundingClientRect(); return { w: r.width, h: r.height }; }),
    workers: /workers\.dev/.test(document.body.innerHTML),
    runningNow: window.__rec.runningNow(), starts: window.__rec.starts.map((s) => s.name),
    // glass is allowed only on the floating tab bar (kit-bars.css, Nishant 30 Oct); anything else blurred on home fails
    blur: [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return !e.matches('.tabbar') && ((s.backdropFilter && s.backdropFilter !== 'none') || (s.filter && /blur/.test(s.filter))); }).length,
  }));
  const bad = [];
  if (home.steps.length !== 4 || !home.steps.every(Boolean)) bad.push('How to Play must show 4 visible steps');
  if (home.car) bad.push('How to Play must not be a carousel');
  if (!home.hub.length || home.hub[0].h < 44 || home.hub[0].w < 44) bad.push('All Games link missing or under 44px');
  if (home.hub.length < 2) bad.push('All Games link needed in the header and the footer');
  if (home.workers) bad.push('workers.dev link on home');
  if (home.runningNow.length) bad.push(`running on idle home: ${home.runningNow}`);
  if (home.blur) bad.push(`${home.blur} element(s) with backdrop-filter/blur on home`);
  row('home (load, idle)', null, { starts: home.starts.length, bad });
  await overflow(h, 'home');
  if (shotArg) await h.screenshot({ path: shotArg });
  // screen change: one opacity fade, nothing moves
  const n0 = await h.evaluate(() => window.__rec.mark());
  await click(h, 'a.side'); await sleep(900);
  const run2 = await h.evaluate(() => window.__rec.runningNow());
  const st2 = await h.evaluate((n) => window.__rec.startsSince(n), n0);
  row('home -> FAQ (screen fade)', null, { starts: st2.length, bad: [...(run2.length ? [`running: ${run2}`] : []), ...(st2.length > 1 ? [`${st2.length} animations for one screen change`] : [])] });
  await overflow(h, 'faq');
  await h.goto(BASE, { waitUntil: 'networkidle0' });

  // ============================================================ 2. play a game: sheet, hold-to-reveal, flip, overlays, steps
  await typeIn(h, '[data-i="hostName"]', 'Host'); await click(h, '[data-a="host"]');
  await h.waitForFunction(() => /#\/play\/[A-Z]{6}/.test(location.hash), { timeout: 15000 });
  const code = (await h.evaluate(() => location.hash)).split('/').pop();
  await h.waitForSelector('.layout', { timeout: 15000 });
  const pages = [h];
  for (let i = 1; i < 5; i++) {
    const p = await newPage(); pages.push(p); await p.goto(`${BASE}/#/play/${code}`, { waitUntil: 'networkidle0' });
    await typeIn(p, '[data-i="joinName"]', `Pl${i}xx`); await click(p, '[data-a="join"]'); await sleep(400);
  }
  const seen = new Set(); const replay = []; let steps = 0, idle = 0, over = false; let revealDone = false;
  const GO = /^(start|ready|skipReveal|nominate|vote|discard|enact|veto|vetoReply|check|power|peekDone)$/;
  const actsIn = (src) => { const re = new RegExp(src); const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('[data-a]')].filter((b) => vis(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && re.test(b.dataset.a)); };
  const holdRole = async (p) => { // a real touch press and hold on the role card, twice (second press = same state, must not animate)
    const out = [];
    for (let k = 0; k < 2; k++) {
      const box = await p.evaluate(() => { const r = document.querySelector('[data-a="reveal"][data-k="role"]')?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (!box) return null;
      const n = await p.evaluate(() => window.__rec.mark());
      await p.touchscreen.touchStart(box.x, box.y); await sleep(EPISODE_MS); await p.touchscreen.touchEnd(); await sleep(250);
      out.push(await p.evaluate((n) => window.__rec.startsSince(n), n));
    }
    return out;
  };
  while (steps++ < 600 && !over && idle < 40) {
    let acted = false;
    for (let i = 0; i < pages.length && !over; i++) {
      const p = pages[i];
      const st = await p.evaluate((fn, src) => ({ n: new Function('src', `return (${fn})(src)`)(src).length, over: !!document.querySelector('.winner, .victory, [class*="victory"]'), title: (document.querySelector('.phase-title, h1')?.innerText || '') }), actsIn.toString(), GO.source);
      const key = `${i === 0 ? 'host' : 'player'}:${st.title}`;
      if (!seen.has(key)) {
        seen.add(key); await sleep(950); // let this step's animations finish, then re-render the same state and count replays
        if (i === 0) {
          const n = await p.evaluate(() => window.__rec.mark());
          for (const t of ['chat', 'game']) { await click(p, `[data-a="tab"][data-v="${t}"]`); await sleep(260); }
          const s = await p.evaluate((n) => window.__rec.startsSince(n), n); if (s.length) replay.push(`${key}: ${s.join(',')}`);
          await overflow(p, key);
        }
        if (!revealDone && i > 0 && await p.$('[data-a="reveal"][data-k="role"]')) {
          const r = await holdRole(p); revealDone = true;
          if (r) { const ep = (await takeEps(p, 'role')).at(-1); row('role reveal (hold x2)', ep ? analyse(ep) : null, { starts: r.map((x) => x.length).join('/'), bad: [...(r[0].length ? [`animation on press: ${r[0]}`] : []), ...(r[1].length ? [`replay on 2nd press: ${r[1]}`] : [])] }); }
        }
      }
      if (st.over) { over = true; await sleep(1100); break; }
      if (!st.n) { if (await p.$('[data-a="reveal"]')) { await p.evaluate(() => document.querySelector('[data-a="reveal"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(120); } else continue; }
      await p.evaluate((fn, src) => { const a = new Function('src', `return (${fn})(src)`)(src); (a.find((b) => b.dataset.a === 'start') || a[Math.random() * a.length | 0])?.click(); }, actsIn.toString(), GO.source);
      await sleep(250);
      if (!seen.has('sheet') && await p.$('dialog.confirm-sheet[open]')) seen.add('sheet'); // recorder episode handles the measuring
      await sleep(seen.has('sheet') && !seen.has('sheet-done') ? 900 : 0);
      if (seen.has('sheet')) seen.add('sheet-done');
      await p.evaluate(() => document.querySelector('dialog.confirm-sheet [data-a="confirmYes"]')?.click());
      acted = true; await sleep(100);
    }
    idle = acted ? 0 : idle + 1; await sleep(acted ? 40 : 300);
  }
  await sleep(900);
  // collect episodes from every page
  const all = []; for (const p of pages) for (const e of await p.evaluate(() => window.__rec.eps)) all.push(e);
  const group = (k, label, pick = 'worst') => {
    const eps = all.filter((e) => e.k === k && e.f.length > 3);
    if (!eps.length) { row(`${label} (not reached)`, null, { bad: [`${label}: never occurred in the game`] }); return; }
    const an = eps.map(analyse); const w = an.reduce((a, b) => (b.jump + b.rev * 100 + b.app * 10 + b.run.length * 1000 > a.jump + a.rev * 100 + a.app * 10 + a.run.length * 1000 ? b : a));
    row(`${label} x${eps.length}`, { ...w, frames: Math.round(an.reduce((s, x) => s + x.frames, 0) / an.length) });
  };
  group('sheet', 'confirm sheet open'); group('flip', 'card flip (enacted policy)'); group('slam', 'overlay: enactment slam'); group('deal', 'overlay: cards drawn');
  group('reveal', 'result card enter'); group('pop', 'victory pop-up');
  // host-console step change: the title of the step moves as little as the container does
  { const steps2 = all.filter((e) => e.k === 'title' && e.f.length > 3 && e.app.length); const an = steps2.map(analyse);
    const w = an.reduce((a, b) => (b.jump + b.app * 10 > a.jump + a.app * 10 ? b : a), an[0]);
    row(`host step changes x${an.length}`, w ? { ...w, frames: Math.round(an.reduce((s, x) => s + x.frames, 0) / an.length) } : null, { bad: an.length ? [] : ['no step change recorded'] }); }
  row('re-render, same state (tab toggle at every host step)', null, { starts: replay.length, bad: replay.map((r) => `replay ${r}`) });
  for (const p of pages) await overflow(p, 'game page');
  // floating glass bars (kit-bars.css): at most 1 live blur layer per screen, only on the tab bar, never animated
  for (const p of pages) { const g = await p.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
    const b = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return vis(e) && ((s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none')); });
    const anim = document.getAnimations().filter((a) => a.effect?.target?.matches?.('.tabbar') && /backdrop|filter/i.test(JSON.stringify(a.effect.getKeyframes()))).length;
    return { n: b.length, other: b.filter((e) => !e.matches('.tabbar')).map((e) => e.className).slice(0, 3), anim }; });
    if (g.n > 1 || g.other.length || g.anim) fails.push(`game page: glass budget ${g.n} blur layer(s)${g.other.length ? ', not on the bar: ' + g.other.join(',') : ''}${g.anim ? ', blur animated' : ''}`); }
  if (!over) fails.push('game never reached the end screen');

  // ============================================================ 3. reduced motion: nothing animates, anywhere
  const rp = [await newPage({ reduce: true })]; const r0 = rp[0];
  await r0.goto(BASE, { waitUntil: 'networkidle0' });
  await typeIn(r0, '[data-i="hostName"]', 'Host'); await click(r0, '[data-a="host"]');
  await r0.waitForFunction(() => /#\/play\/[A-Z]{6}/.test(location.hash), { timeout: 15000 });
  const rcode = (await r0.evaluate(() => location.hash)).split('/').pop(); await r0.waitForSelector('.layout', { timeout: 15000 });
  for (let i = 1; i < 5; i++) { const p = await newPage({ reduce: true }); rp.push(p); await p.goto(`${BASE}/#/play/${rcode}`, { waitUntil: 'networkidle0' }); await typeIn(p, '[data-i="joinName"]', `Rd${i}xx`); await click(p, '[data-a="join"]'); await sleep(400); }
  let rrun = 0; const rbad = []; let rover = false; let rsteps = 0, ridle = 0;
  while (rsteps++ < 600 && !rover && ridle < 40) {
    let acted = false;
    for (const p of rp) {
      const st = await p.evaluate((fn, src) => ({ n: new Function('src', `return (${fn})(src)`)(src).length, over: !!document.querySelector('.winner, .victory, [class*="victory"]') }), actsIn.toString(), GO.source);
      if (st.over) { rover = true; break; }
      if (!st.n) { if (await p.$('[data-a="reveal"]')) { await p.evaluate(() => document.querySelector('[data-a="reveal"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(120); } else continue; }
      await p.evaluate((fn, src) => { const a = new Function('src', `return (${fn})(src)`)(src); (a.find((b) => b.dataset.a === 'start') || a[Math.random() * a.length | 0])?.click(); }, actsIn.toString(), GO.source);
      await sleep(120); await p.evaluate(() => document.querySelector('dialog.confirm-sheet [data-a="confirmYes"]')?.click());
      const run = await p.evaluate(() => window.__rec.runningNow()); if (run.length) { rrun++; rbad.push(run.join(',')); }
      acted = true;
    }
    ridle = acted ? 0 : ridle + 1; await sleep(acted ? 40 : 250);
  }
  await sleep(1000);
  let rstarts = 0; for (const p of rp) { rstarts += await p.evaluate(() => window.__rec.starts.length); const run = await p.evaluate(() => window.__rec.runningNow()); if (run.length) rbad.push(run.join(',')); }
  row(`reduced motion (whole game, ${rp.length} phones)`, null, { starts: rstarts, bad: [...(rstarts ? [`${rstarts} animationstart event(s)`] : []), ...(rbad.length ? [`running: ${[...new Set(rbad)].join(' | ')}`] : []), ...(rover ? [] : ['reduced-motion game never finished'])] });
} finally { await browser.close(); server.close(); wss.close(); }

if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 3)); fails.push(`page errors: ${[...new Set(errors)].slice(0, 2).join(' | ')}`); }
console.table(rows);
const uniq = [...new Set(fails)];
console.log(`${rows.length} scenarios, ${uniq.length} problem(s)`); for (const x of uniq) console.log(' -', x);
process.exit(uniq.length ? 1 : 0);
