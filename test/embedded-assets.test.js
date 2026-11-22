// The embedded ASSETS binding (src/embedded-assets.js, used by scripts/build-embedded.mjs): security headers on every
// response, cache lifetimes per path, a content-hash ETag with If-None-Match -> 304, and the styled 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { makeAssets, cacheFor, matches, SECURITY_HEADERS } from '../src/embedded-assets.js';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { errorResponse } = await import('../src/error-page.js');

const b64 = (s) => Buffer.from(s).toString('base64');
const FILES = {
  '/index.html': { t: 'text/html; charset=utf-8', b: b64('<!doctype html>'), e: 'idx1' },
  '/sw.js': { t: 'application/javascript; charset=utf-8', b: b64('//sw'), e: 'sw1' },
  '/styles.css': { t: 'text/css; charset=utf-8', b: b64('body{}'), e: 'css1' },
  '/fonts/rubik-var.woff2': { t: 'font/woff2', b: b64('wOF2'), e: 'font1' },
  '/icons/icon-512.png': { t: 'image/png', b: b64('png'), e: 'icon1' },
  '/404.html': { t: 'text/html; charset=utf-8', b: b64('<h1>Page not found</h1>'), e: 'nf1' },
};
const A = makeAssets(FILES);
const get = (p, h = {}) => A.fetch(new Request('https://gilded.test' + p, { headers: h }));
const hasSecurity = (res) => { for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, k); };

test('security headers: HSTS, nosniff, referrer policy, frame-ancestors none', () => {
  assert.deepEqual(SECURITY_HEADERS, {
    'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin', 'content-security-policy': "frame-ancestors 'none'" });
});
test('every response carries them: HTML, assets, 304, the embedded 404 and the Worker error pages', async () => {
  for (const p of ['/', '/index.html', '/styles.css', '/fonts/rubik-var.woff2', '/icons/icon-512.png', '/sw.js']) hasSecurity(await get(p));
  hasSecurity(await get('/styles.css', { 'if-none-match': '"css1"' }));
  const nf = await get('/missing.js'); assert.equal(nf.status, 404); hasSecurity(nf);
  assert.equal(nf.headers.get('cache-control'), 'no-store'); assert.match(await nf.text(), /Page not found/);
  for (const s of [404, 426, 500]) hasSecurity(errorResponse(s));
});
test('cache: no-cache on HTML and /sw.js, fonts a year immutable, icons a year (renamed never), the rest an hour', async () => {
  assert.equal(cacheFor('/index.html'), 'no-cache'); assert.equal(cacheFor('/print.html'), 'no-cache'); assert.equal(cacheFor('/sw.js'), 'no-cache');
  assert.equal((await get('/')).headers.get('cache-control'), 'no-cache');
  assert.equal((await get('/fonts/rubik-var.woff2')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/icons/icon-512.png')).headers.get('cache-control'), 'public, max-age=31536000');
  assert.equal((await get('/styles.css')).headers.get('cache-control'), 'public, max-age=3600');
});
test('ETag from the content hash; a matching If-None-Match gets 304 with no body, a stale one the full file', async () => {
  const full = await get('/styles.css');
  assert.equal(full.status, 200); assert.equal(full.headers.get('etag'), '"css1"'); assert.equal(full.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal(await full.text(), 'body{}');
  for (const inm of ['"css1"', 'W/"css1"', '"old", "css1"', '*']) {
    const r = await get('/styles.css', { 'if-none-match': inm });
    assert.equal(r.status, 304, inm); assert.equal(await r.text(), ''); assert.equal(r.headers.get('etag'), '"css1"');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
  }
  const stale = await get('/styles.css', { 'if-none-match': '"old"' }); assert.equal(stale.status, 200); assert.equal(await stale.text(), 'body{}');
  const idx = await get('/', { 'if-none-match': '"idx1"' }); assert.equal(idx.status, 304); assert.equal(idx.headers.get('cache-control'), 'no-cache');
  assert.equal(matches(null, '"x"'), false); assert.equal(matches('"y"', '"x"'), false);
});
test('build-embedded stores a sha-256 content hash per file and serves through makeAssets', () => {
  const src = fs.readFileSync(new URL('../scripts/build-embedded.mjs', import.meta.url), 'utf8');
  assert.match(src, /e: crypto\.createHash\('sha256'\)\.update\(buf\)/);
  assert.match(src, /import \{ makeAssets \} from '\.\.\/src\/embedded-assets\.js'/);
});
