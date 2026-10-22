// Checks every text/background colour pair of the theme in both normal and low-light modes (WCAG 2 contrast).
// Usage: node scripts/contrast.mjs   (exits 1 if any text pair is under 4.5:1, or any large-text/icon pair under 3:1)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const theme = css.slice(css.lastIndexOf('Council Night theme'));
const block = (sel) => { const i = theme.indexOf(sel + '{'); const j = theme.indexOf('}', i); return Object.fromEntries([...theme.slice(i, j).matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]])); };
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const TEXT = [['candle', 'room'], ['candle', 'panel'], ['candle', 'panel-2'], ['smoke', 'room'], ['smoke', 'panel'], ['smoke', 'panel-2'], ['faint', 'room'],
  ['town', 'room'], ['town', 'panel'], ['mafia', 'room'], ['mafia', 'panel'], ['on-brass', 'brass'], ['accent', 'room'], ['warn', 'room'], ['warn', 'panel'],
  ['felt-muted', 'baize'], ['on-fill', 'reform-fill'], ['on-fill', 'cabal-fill'], ['room', 'candle']];
const FIXED = [['#D7CCB3', '#1F1B16', 'card blurb on card front'], ['#F6EFDD', '#2E4C69', 'card name on Reform art'], ['#FFF1E6', '#7E2710', 'card name on Cabal art'], ['#A8361A', '#FBF6EA', 'red card index'], ['#FFF8EC', '#34485D', 'felt names']];
let bad = 0;
const light = block(':root'); const dim = { ...light, ...block('html[data-dim="1"]') };
for (const [name, t] of [['light', light], ['low light', dim]]) {
  for (const [f, b] of TEXT) { const r = ratio(t[f], t[b]); const ok = r >= 4.5; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} ${f.padEnd(11)} on ${b.padEnd(11)} ${r.toFixed(2)}`); }
}
for (const [f, b, what, min = 4.5] of FIXED) { const r = ratio(f, b); const ok = r >= min; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} fixed     ${what.padEnd(26)} ${r.toFixed(2)}`); }
console.log(bad ? `${bad} pairs below 4.5:1` : 'All text pairs pass 4.5:1 (WCAG AA).');
process.exit(bad ? 1 : 0);
