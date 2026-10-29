// Polish e2e (Oct 28 sweep). Static files come from public/, and the room WebSocket is answered in-process by public/js/room.js.
// Checks: long action-bar labels fit their button; a one-word answer is centred beside a two-line one; carousel dots, log
// filters and short links are 44px targets; a focused field is not covered by the tab bar or action bar with a phone keyboard up.
// usage: node tools/polish.e2e.mjs [repoDir]   exit 0 = pass, 1 = fail
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const require = createRequire('/workspace/forge/pw/');
const { chromium } = require('playwright-core');
const repo = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(repo, 'public');
const R = await import(path.join(repo, 'public/js/room.js'));
const CODE = 'POLISH';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const serve = (route) => { const u = new URL(route.request().url());
  if (u.pathname.startsWith("/api/room/")) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"exists":true}' });
  const f = path.join(pub, u.pathname === '/' ? '/index.html' : u.pathname);
  if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'cache-control': 'no-store' } }); };
let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const A = (room, id, msg) => { const r = R.reduce(room, { playerId: id }, msg, rng); if (r?.error) throw new Error(`${msg.type}: ${r.error}`); };
function table({ mode = 'phone', phase = 'lobby', n = 5 } = {}) {
  seed = 7; const room = R.newRoom(CODE, 'hk');
  room.ids = ['Host Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus'].slice(0, n).map((name, i) => R.reduce(room, {}, { type: 'join', name, hostKey: i ? undefined : 'hk' }, rng).data.playerId);
  const host = room.ids[0];
  if (mode === 'physical') A(room, host, { type: 'mode', mode: { play: 'physical', roles: 'physical', votes: 'physical', cards: 'physical' } });
  if (phase === 'lobby') return room;
  A(room, host, { type: 'start' }); for (const id of room.ids) if (room.phase === 'reveal') R.reduce(room, { playerId: id }, { type: 'ready' }, rng); if (room.phase === 'reveal') A(room, host, { type: 'skipReveal' });
  for (let k = 0; k < 12 && room.phase !== phase; k++) { // physical table: the host enters a Decree each round until the phase comes up
    const g = room.game;
    if (room.phase === 'power') { if (g.power === 'peek') A(room, host, { type: 'peekDone' }); else A(room, host, { type: 'power', id: room.ids.find((id) => id !== g.speaker && g.alive[id]) }); continue; }
    if (room.phase === 'check') { A(room, host, { type: 'check', yes: false }); continue; }
    if (room.phase === 'nominate') { for (const id of room.ids) if (id !== g.speaker && !R.reduce(room, { playerId: host }, { type: 'nominate', id }, rng)?.error) break; continue; }
    if (room.phase === 'vote') { A(room, host, { type: 'tally', ayes: room.ids }); continue; }
    if (room.phase === 'legislate') { A(room, host, { type: 'hostEnact', policy: 'D' }); continue; }
  }
  if (room.phase !== phase) throw new Error(`could not reach ${phase} (at ${room.phase})`);
  return room;
}
async function open(browser, { w, h = 844, room, as, hash }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.route('**/*', serve);
  if (room) {
    const socks = [];
    const send = () => { for (const s of socks) s.ws.send(JSON.stringify({ type: 'view', view: R.viewForPlayer(room, s.id, new Set(room.ids)) })); };
    await page.routeWebSocket(/\/ws\//, (ws) => { const s = { ws, id: null }; socks.push(s); ws.onMessage((raw) => { const m = JSON.parse(raw); if (m.type === 'hello' && m.playerId) { s.id = m.playerId; send(); } else if (s.id && m.type !== 'ping') { R.reduce(room, { playerId: s.id }, m, rng); send(); } }); });
    const p = room.players.find((x) => x.id === as);
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`council.player.${CODE}`, JSON.stringify({ playerId: p.id, token: p.token })]);
  }
  await page.goto('http://game.test/' + (hash || `#/play/${CODE}`)); await page.waitForTimeout(1200);
  return { page, ctx };
}
const results = []; const check = (name, pass, info) => { results.push({ name, pass }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info)}`); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
// 1 + 2. the Boss question (physical table): the long dock label fits, and "No" is centred beside "Yes, the Boss"
for (const w of [375, 390]) {
  const room = table({ mode: 'physical', phase: 'check' }); const { page, ctx } = await open(browser, { w, room, as: room.ids[0] });
  const r = await page.evaluate(() => { const b = document.querySelector('.dock [data-a="dockSend"]'); const t = b.textContent.trim();
    const range = document.createRange(); range.selectNodeContents(b); const tr = range.getBoundingClientRect(); const br = b.getBoundingClientRect();
    const ch = [...document.querySelectorAll('.choice-pair .choice')].map((c) => { const rg = document.createRange(); rg.selectNodeContents(c); const a = rg.getBoundingClientRect(); const cb = c.getBoundingClientRect(); return Math.round(Math.abs((a.top + a.bottom) / 2 - (cb.top + cb.bottom) / 2)); });
    return { t, textLeft: Math.round(tr.left), textRight: Math.round(tr.right), btnLeft: Math.round(br.left), btnRight: Math.round(br.right), choiceOffCentre: ch }; });
  check(`dock label fits its button at ${w}`, r.textLeft >= r.btnLeft && r.textRight <= r.btnRight, r);
  check(`answer buttons centred at ${w}`, r.choiceOffCentre.length === 2 && r.choiceOffCentre.every((x) => x <= 6), r.choiceOffCentre);
  await ctx.close();
}
// 3. 44px targets: How to Play carousel dots and the FAQ link; log filters
{ const { page, ctx } = await open(browser, { w: 390, hash: '#/rules' });
  const dots = await page.$$eval('[data-a="slide"]', (x) => x.map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
  const links = await page.$$eval('main a.link', (x) => x.map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
  const fits = await page.evaluate(() => { const d = document.querySelector('.car-dots'); return d ? d.scrollWidth <= d.clientWidth + 1 : true; });
  check('carousel dots and links are 44px', dots.length > 0 && dots.every((x) => x >= 44) && links.every((x) => x >= 44) && fits, { dots, links, fits }); await ctx.close(); }
{ const room = table({ phase: 'lobby' }); const { page, ctx } = await open(browser, { w: 390, room, as: room.ids[0] });
  await page.evaluate(() => document.querySelector('[data-a="tab"][data-v="log"]')?.click()); await page.waitForTimeout(300);
  const log = await page.$$eval('[data-a="logFilter"]', (x) => x.map((e) => Math.round(e.getBoundingClientRect().height)));
  check('log filters are 44px tall', log.length >= 3 && log.every((x) => x >= 44), { log }); await ctx.close(); }
// 4. typing on a phone: the focused field and its Add button are not under the tab bar or the action bar
for (const w of [375, 390]) {
  const room = table({ phase: 'lobby' }); const { page, ctx } = await open(browser, { w, room, as: room.ids[0] });
  await page.focus('[data-i="seatName"]');
  const r = await page.evaluate(() => { const f = document.activeElement; const kbTop = innerHeight * 0.55, shift = innerHeight - kbTop; window.scrollBy(0, f.getBoundingClientRect().bottom - (kbTop - 8));
    const rects = [f, f.closest('.add-seat')?.querySelector('button')].filter(Boolean).map((e) => e.getBoundingClientRect()); const cov = [];
    for (const e of document.querySelectorAll('.tabbar, .sticky-act')) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue; const b = e.getBoundingClientRect(); for (const r of rects) if (b.height && b.top - shift < r.bottom - 2 && b.bottom - shift > r.top + 2) cov.push(e.className); }
    return { focused: f.dataset.i, cov }; });
  check(`field not covered while typing at ${w}`, r.focused === 'seatName' && r.cov.length === 0, r);
  await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(200);
  const back = await page.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display !== 'none' && getComputedStyle(document.querySelector('.sticky-act')).display !== 'none');
  check(`tab bar and action bar come back after typing at ${w}`, back, { back }); await ctx.close();
}
// 5. the join form's own Take Seat button stays on screen while the name is typed
for (const w of [375, 390]) {
  const room = table({ phase: 'lobby' }); const { page, ctx } = await open(browser, { w, hash: `#/play/${CODE}` });
  await page.focus('[data-i="joinName"]'); await page.keyboard.type('Zed');
  const vis = await page.evaluate(() => { const b = document.querySelector('[data-a="join"]'); const s = getComputedStyle(b.closest('.sticky-act') || b); return s.display !== 'none' && b.getBoundingClientRect().height > 0; });
  check(`Take Seat stays visible while typing at ${w}`, vis, { vis }); await ctx.close();
}
await browser.close();
const fail = results.filter((r) => !r.pass).length; console.log(`${results.length - fail} pass / ${fail} fail`); process.exit(fail ? 1 : 0);
