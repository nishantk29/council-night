// Pure helpers shared by build-embedded, stamp-sw and sw-version. No network, no credentials.
// The Gilded print PDFs (public/print/*.pdf) are not inlined in dist-embedded/worker.js and not part of the sw.js
// VERSION hash: they stay on disk under public/print/ (wrangler dev serves them from ./public), and the API deploy
// attaches them to the Worker version as Workers Static Assets (asset-first, so a PDF request never runs the Worker).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const isPrintPdf = (rel) => /^\/print\/[^/]+\.pdf$/i.test(rel);

// Every file under pub as { '/rel/path': absolutePath }, sorted by path.
export function publicFiles(pub = 'public') {
  const files = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else files['/' + path.relative(pub, f).split(path.sep).join('/')] = f;
    }
  })(pub);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const TYPES = { js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', png: 'image/png',
  svg: 'image/svg+xml', woff2: 'font/woff2', webmanifest: 'application/manifest+json', pdf: 'application/pdf' };

// The map build-embedded inlines and makeAssets serves: { '/rel': { t: type, b: base64, e: ETag } }, print PDFs left out.
// e: a content hash of the file, sent as its ETag.
export function embedMap(pub = 'public') {
  return Object.fromEntries(Object.entries(publicFiles(pub)).filter(([u]) => !isPrintPdf(u)).map(([u, p]) => { const buf = fs.readFileSync(p);
    return [u, { t: TYPES[path.extname(p).slice(1)] || 'application/octet-stream', b: buf.toString('base64'), e: crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 22) }]; }));
}

// The Workers Static Assets manifest for the print PDFs, as the assets-upload-session expects it:
// { '/print/x.pdf': { hash, size } } with hash = first 32 hex of sha256(bytes) (same as wrangler), size in bytes.
export function printPdfManifest(pub = 'public') {
  const out = {};
  for (const [rel, f] of Object.entries(publicFiles(pub))) {
    if (!isPrintPdf(rel)) continue;
    const buf = fs.readFileSync(f);
    out[rel] = { hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32), size: buf.length };
  }
  return out;
}
export const PRINT_PDF_CONTENT_TYPE = 'application/pdf';
