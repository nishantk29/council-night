import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DESIGNED, designedFaces, sheetCount, PER_SHEET } from '../public/js/print_data.js';
import { CARD_KINDS } from '../public/js/card_art.js';

const read = (rel) => readFileSync(new URL(`../public/${rel}`, import.meta.url), 'utf8');

test('the designed set has every face the card art draws, and a back', () => {
  assert.deepEqual(DESIGNED.map(([k]) => k).sort(), [...CARD_KINDS].sort());
  assert.equal(DESIGNED.find(([k]) => k === 'back')[2], 0, 'the back is printed on every card, not counted as a face');
});

test('a full designed deck is 59 faces, printed on 7 sheets of 9', () => {
  assert.equal(designedFaces(), 59);
  assert.equal(PER_SHEET, 9);
  assert.equal(sheetCount(designedFaces()), 7);
  assert.equal(sheetCount(9), 1);
  assert.equal(sheetCount(10), 2);
});

test('a 3 × 3 sheet of 63 × 88 mm cards fits Letter and A4 with the print margins (@page 6 mm / 10 mm)', () => {
  const width = 3 * 63; const height = 3 * 88;
  const letter = { w: 215.9 - 20, h: 279.4 - 12 }; const a4 = { w: 210 - 20, h: 297 - 12 };
  for (const paper of [letter, a4]) {
    assert.ok(width <= paper.w, `${width} mm wide on a ${paper.w} mm line`);
    assert.ok(height <= paper.h, `${height} mm tall on a ${paper.h} mm page`);
  }
});

test('the landing offers both card sets, and each link goes to a section that exists', () => {
  const js = read('js/print.js');
  assert.match(js, /href="#designed"/);
  assert.match(js, /href="#key"/);
  assert.match(js, /<section class="sheet" id="designed">/);
  assert.match(js, /<section class="sheet break" id="key">/);
  // the designed set is listed first on the landing
  assert.ok(js.indexOf('chooser() + designed() + guide()') > -1);
});

test('the card copy names the app’s play modes exactly as the lobby does', () => {
  const app = read('js/app.js');
  const printed = read('js/print.js');
  for (const mode of ['Phones mode', 'Hybrid', 'Host-only mode']) {
    assert.ok(app.includes(`'${mode}'`), `app.js has no mode called “${mode}”`);
    assert.ok(printed.includes(mode), `print.js does not mention “${mode}”`);
  }
});

test('print page links point at pages and files that exist', () => {
  const html = read('print.html');
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith('/print.html')) {
      const part = new URL(href, 'http://x').searchParams.get('part');
      assert.ok(part === null || ['designed', 'guide', 'cards'].includes(part), `unknown part ${part}`);
    } else if (href.startsWith('/print/')) {
      assert.ok(existsSync(new URL(`../public${href}`, import.meta.url)), `${href} is missing`);
    }
  }
});

test('the service worker precaches every print file, and VERSION is the content hash of public/', () => {
  const sw = read('sw.js');
  const precache = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  for (const f of ['/js/print.js', '/js/print_data.js', '/print.html', '/print.css', '/print/gilded-chamber-designed-cards.pdf', '/print/gilded-chamber-card-guide.pdf', '/print/gilded-chamber-cards.pdf']) {
    assert.ok(precache.includes(f), `${f} is not precached`);
  }
  for (const f of precache.filter((p) => p !== '/')) assert.ok(existsSync(new URL(`../public${f}`, import.meta.url)), `${f} is precached but missing`);
  // make-pwa.mjs: sha256 over every file's path and bytes (sorted; sw.js and big PDFs left out)
  const files = [];
  const walk = (d, rel) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`; const p = `${d}/${e.name}`;
    if (e.isDirectory()) walk(p, r);
    else if (r === '/sw.js' || e.name.startsWith('.')) continue;
    else if (/^\/print\/.*\.pdf$/i.test(r) && statSync(p).size > 2 * 1024 * 1024) continue;
    else files.push(r);
  } };
  walk(new URL('../public', import.meta.url).pathname, '');
  files.sort();
  const h = createHash('sha256');
  for (const r of files) h.update(r + '\0').update(readFileSync(new URL(`../public${r}`, import.meta.url)));
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], `council-${h.digest('hex').slice(0, 10)}`);
});

test('guide pages use the current mode names, never the old ones', () => {
  for (const f of ['js/print.js', 'print.html']) assert.doesNotMatch(read(f), /phones only|all at the table|all physical/i, `${f} uses an old mode name`);
});
