// Family alignment: the footer links every Game Night game, and the Tools pill matches the other games
// (48px tall, weight 700, press scale switched off under reduced motion and with Animations off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('siteFooter links the hub and all five games, Gilded marked as the current page', () => {
  const nav = read('js/app.js').match(/function siteFooter\(\) \{[\s\S]*?<nav aria-label="Game Night games">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'siteFooter nav not found');
  const links = [...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(links.map(([, t]) => t), ['All games', 'Mafia Night', 'The Gilded Chamber', 'Quest Night', 'Brass Wallet', 'The Odd Card']);
  assert.ok(links.some(([h]) => h === 'https://brass.hatethespurs.com'));
  assert.ok(links.some(([h]) => h === 'https://oddcard.hatethespurs.com'));
  assert.match(nav, /<a href="https:\/\/gilded\.hatethespurs\.com" aria-current="page">/);
});

test('Tools pill: min-height 48px, font-weight 700, no press transform under reduced motion or Animations off', () => {
  const css = read('redesign.css');
  const rule = css.match(/\.tabbar \.more-pill\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /min-height:48px/);
  assert.match(rule, /font-weight:700/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.tabbar \.more-pill\{transform:none!important\}\}/);
  assert.match(css, /html\.fx-off \.tabbar \.more-pill\{transform:none!important\}/);
});
