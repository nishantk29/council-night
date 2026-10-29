// Motion budget (Nishant, 2026-10-29): presses are snappy (100-150ms, never scaled) and nothing runs over 400ms.
// Replaces the old "--dur-scale is 2" expectation: --dur-scale is removed, so what is written is what is seen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mb from './kit/motion-budget.mjs';
import { errorPage } from '../src/error-page.js';

const pub = fileURLToPath(new URL('../public', import.meta.url));
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('no animation or transition resolves above 400ms (duration, and delay + duration)', () => {
  assert.deepEqual(mb.overBudget(pub), []);
  assert.ok(mb.timings(mb.cssSources(pub)).rows.length > 60, 'the scan found the stylesheets');
});

test('per-element delays finish by 400ms: drawn cards, victory role chips, particles', () => {
  const fx = read('fx.css'); const js = read('js/fx.js');
  const draw = /animation:fx-draw (\d+)ms var\(--ease-out\) calc\(var\(--i\) \* (\d+)ms\)/.exec(fx);
  assert.ok(draw && +draw[1] + 2 * +draw[2] <= mb.CAP, 'three cards');
  const roles = /animation:fx-fade (\d+)ms var\(--ease-out\) calc\(\((\d+)ms \+ var\(--i\) \* (\d+)ms\)\)/.exec(fx);
  assert.ok(roles && +roles[1] + +roles[2] + 9 * +roles[3] <= mb.CAP, 'ten players');
  for (const m of js.matchAll(/--t:\$\{Math\.round\(rand\((\d+), (\d+)\)\)\}ms;--d:\$\{delay \+ Math\.round\(rand\(0, (\d+)\)\)\}ms/g)) assert.ok(+m[2] + +m[3] + 50 <= mb.CAP, m[0]);
  for (const m of js.matchAll(/return (\d+);/g)) assert.ok(+m[1] <= mb.CAP, m[0]);
  assert.match(js, /\|\| 400;/);
});

test('the error page fits the budget too', () => {
  const css = [...errorPage({ status: 404 }).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const rows = mb.timings([...mb.cssSources(pub), { file: 'error-page', css }]).rows.filter((r) => r.where.startsWith('error-page'));
  assert.ok(rows.length >= 3);
  assert.deepEqual(rows.filter((r) => r.ms > mb.CAP || r.end > mb.CAP).map((r) => r.where), []);
});

test('press feedback is 100-150ms, not scaled, scale .97 (tabs too)', () => {
  assert.deepEqual(mb.pressProblems(mb.cssSources(pub)), []);
  assert.match(read('styles.css'), /--t-press:var\(--f-release\)/);
  assert.match(read('transit.css'), /\.tabbar button:active\{transform:scale\(var\(--f-press-scale\)\)\}/);
});

test('JS motion stays within 400ms', () => {
  assert.deepEqual(mb.jsOverBudget(pub, 1), []);
  const cfg = read('js/config-defaults.js');
  for (const k of ['SLIDE_MS', 'REDUCED_FADE_MS']) assert.ok(+new RegExp(`export const ${k} = (\\d+)`).exec(cfg)[1] <= mb.CAP, k);
});

test('the scans catch violations (verified red)', () => {
  const src = (css) => [{ file: 'x.css', css }];
  assert.equal(mb.timings(src(':root{--s:2;--t:calc(300ms * var(--s))}.a{animation:x var(--t) ease 0s}')).rows[0].ms, 600);
  assert.equal(mb.timings(src('.a{animation:x 300ms ease 200ms}')).rows[0].end, 500);
  assert.ok(mb.pressProblems(src(':root{--s:2;--f-press:calc(120ms * var(--s));--f-press-scale:.97}.b:active{transition-duration:var(--f-press)}')).some((x) => /scaled/.test(x)));
  assert.ok(mb.pressProblems(src(':root{--f-press:120ms;--f-press-scale:.97}.b:active{transition-duration:var(--f-press);transform:scale(.92)}')).length);
});

test('--dur-scale is gone everywhere (public/, src/, sw.js, pwa-install.js)', () => {
  assert.deepEqual(mb.durScaleUses(fileURLToPath(new URL('..', import.meta.url))), []);
});

test('every animation plays once: no infinite or repeating animation in CSS or JS', () => {
  assert.deepEqual(mb.loops(mb.cssSources(pub), pub), []);
});

test('motion is transform and opacity only (keyframes and transitions)', () => {
  assert.deepEqual(mb.nonCompositor(mb.cssSources(pub)), []);
});

test('reduced motion is respected: there is a prefers-reduced-motion: reduce block', () => {
  assert.ok(mb.cssSources(pub).some(({ css }) => /prefers-reduced-motion:\s*reduce/.test(css)));
});

test('the new scans catch violations (verified red)', () => {
  const src = (css) => [{ file: 'x.css', css }];
  assert.equal(mb.loops(src('.a{animation:x 300ms infinite}'), pub).length, 1);
  assert.equal(mb.loops(src('.a{animation-iteration-count:3}'), pub).length, 1);
  assert.equal(mb.loops(src('.a{animation:x 300ms ease 1 both}'), pub).length, 0);
  assert.equal(mb.nonCompositor(src('@keyframes k{from{height:0}to{height:10px}}')).length, 1);
  assert.equal(mb.nonCompositor(src('.a{transition:background-color 120ms,transform 120ms}')).length, 1);
  assert.equal(mb.nonCompositor(src('.a{transition:all 120ms}')).length, 1);
  assert.equal(mb.nonCompositor(src('.a{transition:transform 120ms,opacity 120ms}')).length, 0);
  assert.equal(mb.timings(src('.a{transition:opacity 401ms}')).rows.filter((r) => r.ms > mb.CAP).length, 1);
});
