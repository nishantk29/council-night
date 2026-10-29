// Arriving from the Game Night hub (Nishant, Oct 28 9:08 PM ET: "That logo moving on game night is kinda janky"):
// one opacity fade of the page, at most 300 ms, nothing moves, nothing loops, and nothing at all under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const css = rd('redesign.css').replace(/\/\*[\s\S]*?\*\//g, ''), html = rd('index.html');
const all = rd('styles.css') + rd('redesign.css');
const scale = 1; // no --dur-scale since 2026-10-29: durations are as written
const hubRules = [...css.matchAll(/([^{}]*\.handoff[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test('the arrival is a single opacity fade of the page, <= 300 ms', () => {
  const fades = hubRules.filter((r) => /animation:/.test(r.body) && !/animation:none/.test(r.body));
  assert.equal(fades.length, 1, JSON.stringify(fades));
  assert.equal(fades[0].sel, 'html.handoff #app,html.handoff .bg-art');
  const m = fades[0].body.match(/animation:gc-hub-fade (\d+)ms/);
  assert.ok(m && +m[1] * scale <= 300, fades[0].body);
  assert.match(css, /@keyframes gc-hub-fade\{from\{opacity:0\}to\{opacity:1\}\}/);
});
test('nothing moves on arrival: no logo overlay, no FLIP, no transform or transition, the entrance is skipped', () => {
  assert.doesNotMatch(html, /id="hand"|\.animate\(|classList\.add\('go'\)/);
  assert.doesNotMatch(css, /#hand\b|\.handoff\.go/);
  for (const r of hubRules) assert.doesNotMatch(r.body, /transform|transition|infinite/, r.sel);
  const off = hubRules.find((r) => /animation:none/.test(r.body));
  for (const s of ['.sun-rays', '.home-head', '.home-hero', '.home-paths > *', '.more-games', '.logo-mark .ico']) assert.ok(off.sel.includes(`html.handoff.boot ${s}`), s);
});
test('reduced motion never gets html.handoff, so nothing animates', () => {
  assert.match(html, /if\(r&&!matchMedia\('\(prefers-reduced-motion:reduce\)'\)\.matches\)d\.classList\.add\('handoff'\)/);
});
