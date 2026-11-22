// The Gilded print PDFs are served as Workers Static Assets, not from the embedded Worker script, and are never part of
// the service worker's precache or VERSION hash (scripts/embed-files.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { embedMap, publicFiles, isPrintPdf, printPdfManifest, PRINT_PDF_CONTENT_TYPE } from '../scripts/embed-files.mjs';
import { computeVersion } from '../scripts/sw-version.mjs';
import { stripComments } from '../scripts/deploy-config.mjs';

const PUB = new URL('../public', import.meta.url).pathname;
const PDFS = ['/print/gilded-chamber-card-guide.pdf', '/print/gilded-chamber-cards.pdf', '/print/gilded-chamber-designed-cards.pdf'];

test('isPrintPdf: only PDFs directly under /print/', () => {
  for (const p of PDFS) assert.ok(isPrintPdf(p), p);
  for (const p of ['/print.html', '/print.css', '/print/readme.txt', '/docs/x.pdf', '/print/sub/x.pdf']) assert.ok(!isPrintPdf(p), p);
});

test('the embedded map leaves out every print PDF and keeps every other public file', () => {
  const map = embedMap(PUB);
  const all = Object.keys(publicFiles(PUB));
  for (const p of PDFS) assert.ok(all.includes(p), `${p} is missing from public/ (print.html links to it)`);
  assert.deepEqual(Object.keys(map).filter((k) => /\.pdf$/i.test(k)), [], 'a PDF is inlined in the embedded Worker');
  assert.deepEqual(Object.keys(map), all.filter((k) => !isPrintPdf(k)));
  for (const k of ['/index.html', '/print.html', '/404.html', '/sw.js']) assert.ok(map[k], `${k} is not embedded`);
});

test('leaving the PDFs out keeps the embedded script well under the 3 MB limit (saves their base64, ~2 MB)', () => {
  const size = JSON.stringify(embedMap(PUB)).length;
  const pdfB64 = PDFS.reduce((n, p) => n + Math.ceil(fs.statSync(path.join(PUB, p)).size / 3) * 4, 0);
  assert.ok(pdfB64 > 1.5e6, `the PDFs are ${pdfB64} bytes of base64`);
  assert.ok(size < 2e6, `embedded map is ${size} bytes`);
});

test('a built dist-embedded/worker.js (if present) carries no print PDF', { skip: !fs.existsSync(new URL('../dist-embedded/worker.js', import.meta.url)) }, () => {
  const js = fs.readFileSync(new URL('../dist-embedded/worker.js', import.meta.url), 'utf8');
  for (const p of PDFS) assert.ok(!js.includes(`"${p}"`), `${p} is inlined`);
  assert.ok(js.length < 2e6, `worker.js is ${js.length} bytes`);
});

test('printPdfManifest: the asset-upload manifest (first 32 hex of sha256, byte size) for exactly the print PDFs', () => {
  const m = printPdfManifest(PUB);
  assert.deepEqual(Object.keys(m), PDFS);
  for (const p of PDFS) {
    const buf = fs.readFileSync(path.join(PUB, p));
    assert.deepEqual(m[p], { hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32), size: buf.length });
  }
  assert.equal(PRINT_PDF_CONTENT_TYPE, 'application/pdf');
});

test('sw VERSION and stamp-sw ignore print PDFs of any size; the PRECACHE never lists them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-print-'));
  try {
    fs.mkdirSync(path.join(dir, 'print'));
    fs.writeFileSync(path.join(dir, 'a.html'), 'a');
    fs.writeFileSync(path.join(dir, 'sw.js'), "const VERSION = 'x';\nconst PRECACHE = [\n  '/',\n  '/a.html',\n];\n");
    const without = computeVersion(dir);
    fs.writeFileSync(path.join(dir, 'print', 'small.pdf'), '%PDF-1.4 tiny');
    assert.equal(computeVersion(dir), without, 'a small print PDF changed the sw VERSION');
    const r = spawnSync(process.execPath, [new URL('../scripts/stamp-sw.mjs', import.meta.url).pathname, dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), new RegExp(`const VERSION = '${without}';`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('local wrangler still serves all of public/, and no PDF path forces the Worker to run first', () => {
  const w = JSON.parse(stripComments(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')));
  assert.equal(w.assets.directory, './public');
  const rwf = w.assets.run_worker_first;
  assert.ok(rwf === undefined || rwf === false || (Array.isArray(rwf) && !rwf.some((r) => /print|pdf|^\/\*$/.test(r))), 'run_worker_first would bill PDF requests to the Worker');
});
