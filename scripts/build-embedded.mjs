// Builds dist-embedded/worker.js: the Worker with every file in public/ inlined except the print PDFs, for deploying
// through the Cloudflare API (used when wrangler has no token on this machine).
// `wrangler deploy` (npm run deploy) is still the normal path and uses real Workers Static Assets for all of public/.
// The ASSETS binding itself (security headers, cache lifetimes, ETag/304, the 404 page) is src/embedded-assets.js.
// The print PDFs (public/print/*.pdf) are not inlined: the API deploy attaches them to the Worker version as
// Workers Static Assets (metadata.assets.jwt; asset-first, not_found_handling none), see scripts/embed-files.mjs.
import fs from 'node:fs';
import { build } from 'esbuild';
import { embedMap, publicFiles, isPrintPdf } from './embed-files.mjs';

const map = embedMap('public');
const skipped = Object.keys(publicFiles('public')).filter(isPrintPdf);
const before = fs.existsSync('dist-embedded/worker.js') ? fs.statSync('dist-embedded/worker.js').size : null;
fs.mkdirSync('dist-embedded', { recursive: true });
fs.writeFileSync('dist-embedded/entry.js', `import worker, { Room } from '../src/worker.js';
import { makeAssets } from '../src/embedded-assets.js';
const ASSETS = makeAssets(${JSON.stringify(map)});
export default { fetch: (req, env, ctx) => worker.fetch(req, Object.assign(Object.create(env), { ROOM: env.ROOM, ASSETS }), ctx) };
export { Room };
`);
await build({ entryPoints: ['dist-embedded/entry.js'], bundle: true, format: 'esm', outfile: 'dist-embedded/worker.js', external: ['cloudflare:workers'], target: 'es2022', logLevel: 'warning' });
console.log('dist-embedded/worker.js', fs.statSync('dist-embedded/worker.js').size, 'bytes (was', before ?? 'not built', 'bytes),', Object.keys(map).length, 'files;',
  skipped.length, 'print PDFs left for Workers Static Assets:', skipped.join(', ') || 'none');
