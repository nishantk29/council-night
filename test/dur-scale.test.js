// Every CSS transition/animation duration and delay goes through --dur-scale (slow-motion switch), :root default 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
// Drop @media (prefers-reduced-motion...) blocks (allowlisted) by brace matching, and .fx-off rules.
function dropReduced(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const j = css.indexOf('@media (prefers-reduced-motion', i);
    if (j < 0) { out += css.slice(i); break; }
    out += css.slice(i, j);
    let k = css.indexOf('{', j), depth = 1; k++;
    while (depth && k < css.length) { if (css[k] === '{') depth++; else if (css[k] === '}') depth--; k++; }
    i = k;
  }
  return out.split('\n').filter((l) => !/^\s*\.fx-off\b/.test(l)).join('\n');
}
const TIME = /(?<![\w.-])\d*\.?\d+m?s\b/g;
const decls = /(?:^|[;{\s])(?:transition|animation)(?:-duration|-delay)?\s*:([^;}]*)/g;
function offenders(css) {
  const bad = [];
  for (const m of css.matchAll(decls)) {
    const v = m[1].replace(/@keyframes/g, '');
    if (/^\s*none\b/.test(v)) continue;
    for (const part of v.split(/,(?![^(]*\))/)) {
      const lits = (part.match(TIME) || []).filter((t) => !/^0m?s$/.test(t));
      if (lits.length && !/var\(--dur-scale/.test(part)) bad.push(part.trim());
      // a ms/s literal must sit inside calc() that carries the scale
      else if (lits.length && !/calc\(/.test(part)) bad.push(part.trim());
    }
  }
  return bad;
}
const cssFiles = readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.css') && f !== 'print.css');
// ambient loops: the slow background drift keeps its period
const AMBIENT = ['gc-turn 120s linear infinite'];
const clean = (arr) => arr.filter((x) => !AMBIENT.includes(x));

test('no unscaled duration/delay in CSS files', () => {
  for (const f of cssFiles) assert.deepEqual(clean(offenders(dropReduced(strip(read(f))))), [], f);
});
test('no unscaled duration in index.html <style> or JS animation strings', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) assert.deepEqual(offenders(m[1]), []);
  assert.match(html, /duration:450\*\(/);
  for (const f of readdirSync(new URL('../public/js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const js = read(`js/${f}`);
    for (const m of js.matchAll(/(?:animation|transition)[\w-]*\s*:\s*[^;'"`}]*\d+m?s\b/g)) {
      assert.match(m[0], /dur-scale/, `${f}: ${m[0]}`);
    }
  }
});
test(':root sets --dur-scale: 2', () => {
  assert.match(strip(read('styles.css')), /:root\s*\{[^}]*--dur-scale:\s*2\s*;/);
});
test('pwa-install.js uses var(--dur-scale,1)', () => {
  const s = read('pwa-install.js');
  assert.ok(!/(?:transition|animation)[^;'"`]*\d+m?s\b/.test(s) || /dur-scale,\s*1/.test(s));
});
