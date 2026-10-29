// BASE=http://127.0.0.1:8787 node test/e2e/faq-readable.e2e.mjs  (or BASE=https://secrethitler.hatethespurs.com)
// Measures the Rules & FAQ page in Chromium at 390 and 1280: WCAG contrast of question and answer text against the real
// composited background, computed font sizes, line-height and characters per line. Exit code 1 on any failure.
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core';
const { chromium } = await import(`${PW}/index.mjs`);
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0; const check = (name, ok, detail) => { console.log(ok ? 'PASS' : 'FAIL', name, detail ?? ''); if (!ok) fails++; };
for (const [tag, w, h, mob] of [['390', 390, 844, true], ['1280', 1280, 800, false]]) for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, colorScheme: scheme, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + '/#/faq', { waitUntil: 'load' }); await p.waitForSelector('.faq-q'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    document.querySelectorAll('.faq-q').forEach((d) => { d.open = true; });
    const parse = (c) => { const x = c.match(/[\d.]+/g).map(Number); return { r: x[0], g: x[1], b: x[2], a: x[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { const st = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) { st.push(c); if (c.a >= 1) break; } }
      let base = { r: 0, g: 0, b: 0 }; for (const c of st.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
    const ratio = (el) => { const cs = getComputedStyle(el), bg = bgOf(el), f = parse(cs.color); const fg = { r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a) };
      const a = lum(fg), c = lum(bg); return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05); };
    const out = { q: [], a: [], bgImg: [] };
    for (const d of document.querySelectorAll('.faq-q')) {
      const s = d.querySelector('summary'), a = d.querySelector('.faq-a'); const cs = getComputedStyle(s), ca = getComputedStyle(a);
      out.q.push({ cr: ratio(s), fs: parseFloat(cs.fontSize), fw: +cs.fontWeight });
      for (const t of a.querySelectorAll('p, li, b, i, em, strong, h4')) out.a.push({ cr: ratio(t), fs: parseFloat(getComputedStyle(t).fontSize) });
      out.a.push({ cr: ratio(a), fs: parseFloat(ca.fontSize), lh: parseFloat(ca.lineHeight) / parseFloat(ca.fontSize), disp: ca.display });
    }
    for (const g of document.querySelectorAll('.faq-group')) out.bgImg.push(getComputedStyle(g).backgroundImage);
    return out;
  });
  const min = (xs, k) => Math.min(...xs.map((x) => x[k])); const tagx = `${tag} ${scheme}`;
  check(`${tagx}: question contrast >= 4.5`, min(r.q, 'cr') >= 4.5, min(r.q, 'cr').toFixed(2));
  check(`${tagx}: answer contrast >= 4.5`, min(r.a, 'cr') >= 4.5, min(r.a, 'cr').toFixed(2));
  check(`${tagx}: answer text >= 16px`, min(r.a, 'fs') >= 16, min(r.a, 'fs') + 'px');
  check(`${tagx}: questions bigger than answers and bold`, min(r.q, 'fs') > Math.max(...r.a.filter((x) => x.disp).map((x) => x.fs)) && min(r.q, 'fw') >= 700, `${min(r.q, 'fs')}px / ${min(r.q, 'fw')}`);
  check(`${tagx}: answer line-height 1.45-1.7 and not a grid`, r.a.filter((x) => x.disp).every((x) => x.lh >= 1.45 && x.lh <= 1.7 && x.disp === 'block'));
  check(`${tagx}: no rays behind the FAQ`, r.bgImg.every((x) => x === 'none'));
  check(`${tagx}: no console errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}
await b.close(); console.log(fails ? `faq-readable: ${fails} failed` : 'faq-readable: all passed'); process.exit(fails ? 1 : 0);
