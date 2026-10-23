// Checks every text/background colour pair of the theme in both normal and low-light modes (WCAG 2 contrast).
// Usage: node scripts/contrast.mjs   (exits 1 if any text pair is under 4.5:1, or any large-text/icon pair under 3:1)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const theme = css.slice(css.lastIndexOf('The Gilded Chamber theme'));
const block = (sel) => { const i = theme.indexOf(sel + '{'); const j = theme.indexOf('}', i); return Object.fromEntries([...theme.slice(i, j).matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{6}|\.\d+)/g)].map((m) => [m[1], m[2]])); };
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
// Page text sits on the dark page; card text (dark ink on orange, or light ink on deep orange in low light) uses the ink tokens.
const TEXT = [['candle', 'room'], ['smoke', 'room'], ['faint', 'room'], ['candle', 'panel'], ['smoke', 'panel'], ['candle', 'panel-2'], ['smoke', 'panel-2'], ['town', 'room'], ['mafia', 'room'], ['warn', 'room'], ['accent', 'room'], ['brass', 'room'],
  ['on-brass', 'brass'], ['on-btn', 'btn'], ['on-go', 'go'], ['ink', 'orange'], ['ink-2', 'orange'], ['ink-3', 'orange'], ['ink', 'card-in'], ['ink-2', 'card-in'], ['ink-3', 'card-in'], ['ink', 'card-in-2'], ['ink-2', 'card-in-2'], ['ink-3', 'card-in-2'],
  ['card-town', 'orange'], ['card-mafia', 'orange'], ['card-warn', 'orange'], ['card-accent', 'orange'], ['card-gold-ink', 'orange'], ['card-town', 'card-in-2'], ['card-mafia', 'card-in-2'], ['on-card-btn', 'card-btn'], ['card-ink', 'card'], ['ink', 'orange-2'],
  ['felt-muted', 'baize'], ['on-fill', 'reform-fill'], ['on-fill', 'cabal-fill'], ['candle', 'head'], ['smoke', 'head'], ['gold-ink', 'room'], ['ink', 'orange'], ['on-brass', 'mafia']];
const FIXED = [['#E8DCC0', '#1A1410', 'card blurb on card front'], ['#FFF4DC', '#2E4C69', 'card name on Reform art'], ['#FFF1E6', '#6E100C', 'card name on Syndicate art'], ['#A8361A', '#FFF4DC', 'red card index'], ['#FFF8EC', '#3A1F0E', 'felt names'], ['#FFF8EC', '#244B78', 'Join card inputs'], ['#FFE9C7', '#2A0606', 'the bottom pill'], ['#2A0606', '#FFE9C7', 'the bottom pill (dark on cream)']];
let bad = 0;
const light = block(':root'); const dim = { ...light, ...block('html[data-dim="1"]') };
for (const [name, t] of [['light', light], ['low light', dim]]) {
  for (const [f, b] of TEXT) { const r = ratio(t[f], t[b]); const ok = r >= 4.5; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} ${f.padEnd(11)} on ${b.padEnd(11)} ${r.toFixed(2)}`); }
}
// Liquid Glass is translucent: the worst case is the tint over pure black or pure white behind it.
for (const [name, t] of [['light', light], ['low light', dim]]) {
  for (const behind of ['#000000', '#FFFFFF']) { const r = ratio(t['on-glass'], mix(t.glass, behind, +t['glass-a'])); const ok = r >= 4.5; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} glass text over ${behind} ${r.toFixed(2)}`); }
}
for (const [f, b, what, min = 4.5] of FIXED) { const r = ratio(f, b); const ok = r >= min; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} fixed     ${what.padEnd(26)} ${r.toFixed(2)}`); }
console.log(bad ? `${bad} pairs below 4.5:1` : 'All text pairs pass 4.5:1 (WCAG AA).');
process.exit(bad ? 1 : 0);
