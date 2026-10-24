// Sideways-drift check: `node tools/drift-check.mjs`. Drives every screen at 390x844 (iPhone UA) against a local
// stand-in for the Worker (public/ + the room reducer over WebSockets), and fails if anything is wider than the
// viewport outside an intentional horizontal scroller, or if a sideways swipe moves the page or the visual viewport.
import { puppeteer, sleep, UA, BASE, server, wss } from './_harness.mjs';

// ---- local server (tools/_harness.mjs)

// ---- in-page audit
function pageAudit() {
  const iw = innerWidth;
  const clips = (el) => { for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true; } return false; };
  const off = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right <= iw + 0.5 && r.left >= -0.5) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || (el.closest('svg') && el.tagName !== 'svg')) continue;
    if (clips(el)) continue;
    off.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  const small = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]),select,textarea')].filter((e) => e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => `${e.tagName.toLowerCase()}[${e.dataset.i || e.dataset.k || e.type}] ${getComputedStyle(e).fontSize} (iOS zooms the page on focus)`);
  return { small, sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth, iw, off: off.slice(0, 6) };
}
const problems = []; let screens = 0;
async function audit(p, label) {
  screens++;
  for (const wait of [0, 450, 1300]) {
    if (wait) await sleep(wait === 450 ? 450 : 850);
    const a = await p.evaluate(pageAudit);
    for (const f of a.small) problems.push(`${label}: field ${f}`);
    if (a.sw > a.iw || a.bsw > a.iw || a.off.length) problems.push(`${label} @${wait}ms: scrollWidth ${a.sw}/${a.bsw} vs ${a.iw}; ${a.off.join(' | ') || 'no element found (pseudo-element/transform?)'}`);
  }
  // Chrome turns a sideways swipe into history navigation; that is not drift, so keep it out of the measurement.
  await p.evaluate(() => { if (!document.getElementById('dc-nohist')) document.head.insertAdjacentHTML('beforeend', '<style id="dc-nohist">html{overscroll-behavior-x:none}</style>'); });
  const url0 = p.url(); const c = await p.createCDPSession(); const y = 420;
  const t = (type, x) => c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  for (const [from, to] of [[330, 110], [60, 330]]) { await t('touchStart', from); for (let i = 1; i <= 8; i++) { await t('touchMove', from + (to - from) * i / 8); await sleep(16); } await t('touchEnd'); await sleep(120); }
  await sleep(300);
  if (p.url() !== url0) problems.push(`${label}: a sideways swipe navigated away (${url0} -> ${p.url()})`);
  const v = await p.evaluate(() => ({ x: scrollX, l: visualViewport.offsetLeft, s: visualViewport.scale }));
  if (v.x !== 0 || v.l !== 0 || v.s !== 1) problems.push(`${label}: after swipe scrollX=${v.x} offsetLeft=${v.l} scale=${v.s}`);
  await c.detach();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const errors = [];
async function newPage() {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setUserAgent(UA); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(e.message)); return p;
}
const click = (p, sel) => p.evaluate((s) => { document.activeElement?.blur?.(); document.querySelector(s)?.click(); }, sel); // a real tap blurs the field first
const typeIn = async (p, sel, v) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.click(sel, { clickCount: 3 }); await p.type(sel, v); };
const titleOf = (p) => p.evaluate(() => (document.querySelector('.phase-title, h1')?.innerText || '') + '|' + (document.querySelector('.phase-badge')?.innerText || ''));

try {
  const h = await newPage();
  await h.goto(BASE, { waitUntil: 'networkidle0' }); await audit(h, 'landing');
  if (await h.$('.car-track')) problems.push('landing: How to Play must be static (no carousel)');
  if ((await h.$$('.how li')).length !== 4) problems.push('landing: How to Play must show all four steps');
  await h.goto(`${BASE}/#/rules`, { waitUntil: 'networkidle0' });
  { // the card-gallery carousel must still pan sideways by touch (the page-level guard must not swallow it)
    await h.evaluate(() => document.querySelector('.car-track').scrollIntoView({ block: 'center' })); await sleep(400);
    const y = await h.evaluate(() => { const r = document.querySelector('.car-track').getBoundingClientRect(); return r.top + r.height / 2; });
    await h.touchscreen.touchStart(330, y); for (let i = 1; i <= 10; i++) { await h.touchscreen.touchMove(330 - i * 20, y); await sleep(16); } await h.touchscreen.touchEnd(); await sleep(600);
    const m = await h.evaluate(() => ({ l: document.querySelector('.car-track').scrollLeft, x: scrollX }));
    if (m.l <= 0 || m.x !== 0) problems.push(`carousel swipe: scrollLeft=${m.l} scrollX=${m.x}`);
  }
  await h.evaluate(() => document.querySelector('.car-track')?.scrollTo(9999, 0)); await audit(h, 'rules cards carousel (end)');
  await h.goto(`${BASE}/#/rules`, { waitUntil: 'networkidle0' }); await audit(h, 'rules');
  await h.evaluate(() => document.querySelector('.car-track')?.scrollTo(9999, 0)); await audit(h, 'rules carousel (end)');
  await h.goto(`${BASE}/#/faq`, { waitUntil: 'networkidle0' }); await audit(h, 'faq');
  await h.goto(`${BASE}/#/play/ZZZZZZ`, { waitUntil: 'networkidle0' }); await audit(h, 'unknown room');
  await h.goto(`${BASE}/print.html`, { waitUntil: 'networkidle0' }); await audit(h, 'print.html');
  await h.goto(BASE, { waitUntil: 'networkidle0' });
  await typeIn(h, '[data-i="hostName"]', 'Host'); await click(h, '[data-a="host"]');
  await h.waitForFunction(() => /#\/play\/[A-Z]{6}/.test(location.hash), { timeout: 15000 });
  const code = (await h.evaluate(() => location.hash)).split('/').pop();
  await h.waitForSelector('.layout', { timeout: 15000 });
  await sleep(600); await audit(h, 'host lobby');
  await click(h, '[data-a="qrFull"]'); await sleep(500); await audit(h, 'qr fullscreen'); await h.evaluate(() => document.querySelector('#qrfs')?.click()); await sleep(300);
  const N = 5; const pages = [h];
  for (let i = 1; i < N; i++) {
    const p = await newPage(); pages.push(p); await p.goto(`${BASE}/#/play/${code}`, { waitUntil: 'networkidle0' });
    if (i === 1) await audit(p, 'join form');
    await typeIn(p, '[data-i="joinName"]', `Pl${i}xx`); await click(p, '[data-a="join"]'); await sleep(400);
  }
  const screen = await newPage(); await screen.goto(`${BASE}/#/screen/${code}`, { waitUntil: 'networkidle0' }); await sleep(600); await audit(screen, 'table screen lobby');
  for (const m of ['hybrid', 'physical', 'phone']) { await h.evaluate((m) => { const i = document.querySelector(`input[data-a="modeSet"][value="${m}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, m); await sleep(500); await audit(h, `setup mode ${m}`); }

  const seen = new Set(); let steps = 0, idle = 0, over = false;
  const GO = /^(start|ready|skipReveal|nominate|vote|discard|enact|veto|vetoReply|check|power|peekDone)$/;
  const actsIn = (src) => { const re = new RegExp(src); const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('[data-a]')].filter((b) => vis(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && re.test(b.dataset.a)); };
  while (steps++ < 600 && !over && idle < 40) {
    let acted = false;
    for (let i = 0; i < pages.length && !over; i++) {
      const p = pages[i];
      const st = await p.evaluate((fn, src) => ({ n: new Function('src', `return (${fn})(src)`)(src).length, over: !!document.querySelector('.winner, .victory, [class*="victory"]') }), actsIn.toString(), GO.source);
      const key = `${i === 0 ? 'host' : 'player'}:${await titleOf(p)}`;
      if (!seen.has(key)) {
        seen.add(key); await audit(p, key);
        if (i === 0) for (const t of ['chat', 'log', 'tools', 'host', 'game']) { await click(p, `[data-a="tab"][data-v="${t}"]`); await sleep(350); if (t !== 'game') await audit(p, `${key} tab ${t}`); }
        const hold = await p.$('[data-a="reveal"]');
        if (hold) { await hold.evaluate((e) => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(300); await audit(p, `${key} (secret revealed)`); }
      }
      if (st.over) { over = true; await sleep(1500); await audit(p, `${key} (end screen)`); break; }
      if (!st.n) { // the hand or docket is behind hold-to-reveal: press and keep holding, then choose
        if (await p.$('[data-a="reveal"]')) { await p.evaluate(() => document.querySelector('[data-a="reveal"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(120); } else continue;
      }
      await p.evaluate((fn, src) => { const a = new Function('src', `return (${fn})(src)`)(src); (a.find((b) => b.dataset.a === 'start') || a[Math.random() * a.length | 0])?.click(); }, actsIn.toString(), GO.source);
      await sleep(250);
      if (!seen.has('confirm') && await p.$('dialog.confirm-sheet')) { seen.add('confirm'); await audit(p, 'confirm sheet'); }
      await p.evaluate(() => document.querySelector('dialog.confirm-sheet [data-a="confirmYes"]')?.click());
      acted = true; await sleep(100);
    }
    idle = acted ? 0 : idle + 1; await sleep(acted ? 40 : 300);
  }
  if (!over) problems.push(`game never reached the end screen (${seen.size} screens covered; last: ${[...seen].slice(-4).join(' / ')})`);
  await audit(screen, 'table screen at end');
} finally { await browser.close(); server.close(); wss.close(); }

if (errors.length) console.log('page errors:', errors.slice(0, 3));
const uniq = [...new Set(problems)];
console.log(`${screens} screen audits, ${uniq.length} problem(s)`); for (const x of uniq) console.log(' -', x);
process.exit(uniq.length ? 1 : 0);
