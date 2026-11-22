// First load: index.html preloads the whole static import graph of /js/app.js, so a cold phone fetches the modules
// in parallel instead of discovering them one level at a time. Head metadata: link previews and the status-bar style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const pub = new URL('../public/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, pub), 'utf8');

// Every module app.js reaches through static `import ... from './x.js'` / `export ... from` / bare `import './x.js'`.
export function importGraph(entry = 'js/app.js') {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return; seen.add(f);
    for (const m of read(f).matchAll(/^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(path.posix.join(path.posix.dirname(f), m[1]));
  };
  walk(entry);
  return [...seen].map((f) => '/' + f);
}

test('index.html has a modulepreload for every module in the app.js import graph, and nothing else', () => {
  const idx = read('index.html');
  const pre = [...idx.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  const graph = importGraph();
  assert.ok(graph.length > 20, `graph walk found only ${graph.length} modules`);
  assert.deepEqual([...pre].sort(), [...graph].sort(), 'modulepreload links do not match the import graph of /js/app.js');
  for (const u of pre) assert.ok(fs.existsSync(new URL('.' + u, pub)), `${u} does not exist`);
  assert.ok(idx.indexOf('rel="modulepreload"') < idx.indexOf('</head>'), 'modulepreload links belong in <head>');
});

test('every preloaded module is in the service worker PRECACHE', () => {
  const sw = read('sw.js');
  for (const u of importGraph()) assert.ok(sw.includes(`'${u}'`), `${u} missing from sw.js PRECACHE`);
});

test('head: og tags with the 512 icon, and black-translucent status bar like the other games', () => {
  const idx = read('index.html'); const head = idx.slice(0, idx.indexOf('</head>'));
  const og = (p) => head.match(new RegExp(`<meta property="og:${p}" content="([^"]+)">`))?.[1];
  assert.equal(og('title'), 'The Gilded Chamber');
  assert.ok(og('description')?.length > 20);
  assert.equal(og('type'), 'website');
  assert.match(og('image') || '', /^https:\/\/gilded\.hatethespurs\.com\/icons\/icon-512\.png$/);
  assert.ok(fs.existsSync(new URL('icons/icon-512.png', pub)), 'icon-512.png is missing');
  assert.match(head, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
});
