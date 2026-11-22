// The ASSETS binding for the embedded build (scripts/build-embedded.mjs): serves public/ from a map of
// { '/path': { t: content-type, b: base64 body, e: content hash } } baked into the Worker.
// Every response carries the security headers. A file whose hash matches If-None-Match answers 304 with no body.
// Cache: HTML and /sw.js are revalidated every time (no-cache); fonts get a new file name whenever their content
// changes, so they are immutable for a year; icons keep their names when redrawn, so a year but not immutable;
// everything else an hour (the service worker covers installed phones).
export const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "frame-ancestors 'none'",
};
export const TYPE_HTML = 'text/html; charset=utf-8';

export function cacheFor(p) {
  if (p === '/sw.js' || p.endsWith('.html')) return 'no-cache';
  if (p.startsWith('/fonts/')) return 'public, max-age=31536000, immutable';
  if (p.startsWith('/icons/')) return 'public, max-age=31536000';
  return 'public, max-age=3600';
}

// True when an If-None-Match header names this ETag (a list, weak validators and * all count).
export function matches(inm, etag) {
  if (!inm) return false;
  return inm.split(',').some((t) => { t = t.trim(); return t === '*' || t.replace(/^W\//, '') === etag; });
}

const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function makeAssets(FILES) {
  return { async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = FILES[p];
    if (!f) return new Response(bytes(FILES['/404.html'].b), { status: 404, headers: { ...SECURITY_HEADERS, 'content-type': TYPE_HTML, 'cache-control': 'no-store' } });
    const etag = `"${f.e}"`;
    const headers = { ...SECURITY_HEADERS, 'cache-control': cacheFor(p), etag };
    if (matches(req.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
    return new Response(bytes(f.b), { headers: { ...headers, 'content-type': f.t } });
  } };
}
