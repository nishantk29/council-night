// Type rules (design review, 2026-10-28: "We should keep it [the art deco font] in Mafia only").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cmapCodepoints } from './woff2-lib.mjs';

const pub = path.resolve('public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const text = walk(pub).filter((f) => /\.(css|html|js|mjs)$/.test(f));

test('no art deco face (Limelight, Poiret One) anywhere in the site; it belongs to Mafia Night only', () => {
  const hits = text.filter((f) => /limelight|poiret/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(pub, f));
  assert.deepEqual(hits, []);
  assert.deepEqual(fs.readdirSync(path.join(pub, 'fonts')).filter((f) => /limelight|poiret/i.test(f)), []);
});

test('the display face is Big Shoulders Display, self-hosted, font-display swap, and preloaded', () => {
  const css = fs.readFileSync(path.join(pub, 'redesign.css'), 'utf8');
  assert.match(css, /@font-face\{font-family:"Big Shoulders Display";font-weight:100 900;[^}]*font-display:swap;src:url\(\/fonts\/big-shoulders-display-core\.woff2\)/);
  assert.match(css, /\.wordmark,\.phase-title,\.block-title,\.path-title\{font-family:var\(--display-gilded\)/);
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  assert.match(html, /<link rel="preload" href="\/fonts\/big-shoulders-display-core\.woff2" as="font" type="font\/woff2" crossorigin>/);
  // only the two fonts first paint needs are preloaded
  assert.equal((html.match(/rel="preload"[^>]+as="font"/g) || []).length, 2);
});

test('the preloaded Big Shoulders Display core file has a glyph for every printable ASCII character and the punctuation the titles use', () => {
  const cps = new Set(cmapCodepoints(path.join(pub, 'fonts/big-shoulders-display-core.woff2')));
  const need = [...Array(95)].map((_, i) => String.fromCharCode(32 + i)).join('') + '’‘“”–—…·';
  assert.deepEqual([...need].filter((c) => !cps.has(c.codePointAt(0))), []);
});
