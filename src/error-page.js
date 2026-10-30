// Styled error pages for the Worker (404, 500, 426) and the static public/404.html (scripts/build-404.mjs).
// No error text ever reaches the page: only the fixed title and line passed in.
import { errorBody, CRASH } from '../public/js/error-screen.js';

const CSS = `.err-page{min-height:100svh;display:grid;align-content:center}
.err-mark{display:block;text-align:center;font-family:var(--display-gilded);font-weight:800;font-size:var(--fs-lg);letter-spacing:.01em;color:var(--gold-ink);padding-top:var(--s5);position:relative;z-index:1}
.err-page .empty{gap:var(--s4);justify-items:center;text-align:center}
@media (prefers-reduced-motion:no-preference){.err-page .empty>*{animation:err-rise 280ms var(--ease-out) both}.err-page .empty>:nth-child(2){animation-delay:40ms}.err-page .empty>:nth-child(3){animation-delay:80ms}}
@keyframes err-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`;

export const ERRORS = {
  404: { title: 'Page not found', line: 'The page you wanted isn’t here. Head back to the games.' },
  426: { title: 'Wrong door', line: 'That address is for the game itself. Open the game from the home page.' },
  500: CRASH,
};

export const errorPage = ({ status = 404, title, line } = {}) => {
  const d = ERRORS[status] || ERRORS[500];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title || d.title} | The Gilded Chamber</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0B0B0D">
<style>html{background:#0B0B0D;color-scheme:dark}</style>
<link rel="preload" href="/fonts/big-shoulders-display-core.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/redesign.css">
<style>${CSS}</style>
</head>
<body>
<div class="bg-art" aria-hidden="true"></div>
<div class="err-mark" aria-hidden="true">The Gilded Chamber</div>
<div id="app">${errorBody({ title: title || d.title, line: line || d.line })}</div>
</body>
</html>
`;
};

export const errorResponse = (status, headers = {}) => new Response(errorPage({ status }), {
  status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
