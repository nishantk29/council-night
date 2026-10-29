// Rules & FAQ readability (Nishant, Oct 28 11:14 PM ET: "super hard to read"). Static half; the measured half (contrast
// ratio and computed font sizes in a real browser at 390 and 1280) is test/e2e/faq-readable.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const order = ['styles.css', 'transit.css', 'fx.css', 'motion.css', 'redesign.css', 'setup.css'];
// the last declaration of a property for an exact selector across the stylesheets, in load order
const last = (sel, prop) => { let v = null; for (const f of order) for (const m of rd(f).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (m[1].trim() === sel || m[1].split(/,(?![^(]*\))/).map((s) => s.trim()).includes(sel)) { const d = m[2].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)); if (d) v = d[1].trim(); } } return v; };
const rem = (v) => { const m = v.match(/^([\d.]+)rem$/); return m ? +m[1] * 16 : null; };
const fsMin = (v) => { if (v === 'var(--fs-md)') return rem(rd('styles.css').match(/--fs-md:clamp\(([\d.]+rem)/)[1]); return rem(v); };

test('answers are flowing text, not a grid (a grid split every <b> or <i> into its own row)', () => {
  assert.equal(last('.faq-a', 'display'), 'block');
});
test('answer text is at least 16px, line-height about 1.5, and paragraphs are spaced', () => {
  assert.ok(fsMin(last('.faq-a', 'font-size')) >= 16);
  const lh = +last('.faq-a', 'line-height'); assert.ok(lh >= 1.45 && lh <= 1.7, String(lh));
  assert.match(last('.faq-a > :is(p,ul,ol,h4,table)', 'margin'), /^var\(--s3\) 0 0$/);
});
test('each question stands apart from its answer: heavier and bigger, with a divider', () => {
  assert.ok(rem(last('.faq-q summary', 'font-size')) > fsMin(last('.faq-a', 'font-size')));
  assert.ok(+last('.faq-q summary', 'font-weight') >= 700);
  assert.match(last('.faq-q', 'border-bottom'), /solid/);
});
test('no decorative rays behind the FAQ text', () => {
  assert.equal(last('.faq .faq-group', 'background-image'), 'none');
});
