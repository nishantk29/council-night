// Host dashboard: Undo and Redo always show their text labels and sit together in one two-column row (hist-pair),
// never icon-only and never split across the wrapping control row.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
const js = fs.readFileSync(new URL('../public/js/table_ui.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('Undo and Redo render inside one hist-pair row', () => {
  const fn = js.slice(js.indexOf('function undoButtons'), js.indexOf('function hostPane'));
  assert.match(fn, /class="hist-pair">\$\{undo\}\$\{redo\}<\/div>/);
  assert.match(fn, /\$\{ui\('undo'\)\} Undo<\/button>/, 'Undo keeps its visible label');
  assert.match(fn, /\$\{ui\('redo'\)\} Redo<\/button>/, 'Redo keeps its visible label');
});

test('the pair is not inside the wrapping control row', () => {
  const pane = js.slice(js.indexOf('function hostPane'), js.indexOf('// ---------------', js.indexOf('function hostPane')));
  assert.match(pane, /\$\{undoButtons\(v\)\}<div class="btn-row wrap">/);
});

test('hist-pair is two equal columns and labels do not wrap', () => {
  assert.match(css, /\.hist-pair\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.hist-pair \.btn\{min-width:0;white-space:nowrap\}/);
});
