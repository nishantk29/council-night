// Nishant, Oct 28 11:09 PM ET: the looping decorations play ONCE and stop on their final frame; with reduced motion the
// final frame shows with no motion. Nothing in the Gilded Chamber's CSS, HTML or JS loops forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const pub = new URL('../public/', import.meta.url);
const rd = (f) => readFileSync(new URL(f, pub), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const all = [...readdirSync(pub).filter((f) => /\.(css|js|html)$/.test(f)).map((f) => [f, f.endsWith('.css') ? strip(rd(f)) : rd(f)]),
  ...readdirSync(new URL('js/', pub)).filter((f) => f.endsWith('.js')).map((f) => [`js/${f}`, rd(`js/${f}`)])];

test('no infinite or repeating animation anywhere (CSS, inline styles, JS)', () => {
  for (const [f, src] of all) {
    assert.doesNotMatch(src, /\binfinite\b/, f);
    assert.doesNotMatch(src, /animation-iteration-count\s*:\s*(?!1\b)/, f);
    assert.doesNotMatch(src, /iterations\s*:\s*(Infinity|[2-9]|\d{2,})/, f);
  }
});
test('the sun holds its resting pose (a two-minute turn does not fit the 400ms budget, 2026-10-29)', () => {
  const css = strip(rd('redesign.css'));
  assert.match(css, /\.sun-spin\{transform-origin:400px 400px;animation:none\}/);
  assert.match(css, /@keyframes gc-turn\{to\{transform:rotate\(360deg\)\}\}/); // 360deg = the resting pose, so no jump at the end
});
test('reduced motion and effects off show that final frame with no motion', () => {
  const css = strip(rd('redesign.css'));
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^@]*\.sun-spin,[^{]*\{animation:none!important\}/);
  assert.match(css, /\.fx-off \.sun-spin,[^{]*\{animation:none!important\}/);
});
test('the setup look (html[data-gs]) only applies in the lobby: off screens the attribute is removed, not set to ""', () => {
  const app = rd('js/app.js');
  assert.match(app, /if \(S\.mode === 'play' && S\.view\?\.phase === 'lobby' && S\.view\.kind !== 'screen'\) \$html\.dataset\.gs = '1'; else delete \$html\.dataset\.gs;/);
  assert.doesNotMatch(app, /dataset\.gs = [^;]*\? '1' : ''/);
});
