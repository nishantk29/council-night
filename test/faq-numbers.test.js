// The FAQ's numbers, team sizes and powers are read from rules.js, and its rule answers match what the room does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FAQ } from '../public/js/faq.js';
import { TEAMS, MIN_PLAYERS, MAX_PLAYERS, POWERS, POWER_TEXT, DECREE_TO_WIN, VETO_AT, PRETENDER_DANGER } from '../public/js/rules.js';

const qa = Object.fromEntries(FAQ.flatMap(([, qs]) => qs).map(([q, a]) => [q, a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')]));
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

test('FAQ team sizes come from TEAMS for every table size', () => {
  const a = qa['How many of each side are there?'];
  assert.ok(a.includes(`${MIN_PLAYERS} to ${MAX_PLAYERS} players`));
  for (const [n, [r, c]] of Object.entries(TEAMS)) assert.ok(a.includes(`${n} players : ${r} Loyalists, ${c} Syndicate`), `size ${n}`);
});

test('FAQ powers come from POWERS for every table size', () => {
  const a = qa['Which powers does each Decree give?'];
  for (const [n, list] of Object.entries(POWERS)) list.forEach((p, i) => { if (p) assert.match(a, new RegExp(`${n}[^:]*players : [^D]*(Decree \\d: [^,]+, )*Decree ${i + 1}: ${POWER_TEXT[p][0]}`), `size ${n} Decree ${i + 1}`); });
  assert.ok(a.includes(`Decree ${DECREE_TO_WIN} wins`));
});

test('FAQ thresholds match rules.js (veto, Boss danger zone)', () => {
  assert.ok(qa['How does the veto work?'].startsWith(`Only once ${WORD[VETO_AT]} Decrees`));
  assert.ok(qa['When does electing the Boss win?'].startsWith(`Once ${WORD[PRETENDER_DANGER]} or more Decrees`));
});

test('FAQ skip answer matches the room: facts at the table are never skipped (ruling 5)', () => {
  const a = qa['What happens when the host skips?'];
  assert.match(a, /never skipped/); assert.doesNotMatch(a, /random policy \(drawn by the server, weighted/);
  const room = fs.readFileSync(new URL('../public/js/room.js', import.meta.url), 'utf8');
  for (const ph of ['chaos', 'check']) assert.match(room, new RegExp(`room\\.phase === '${ph}'\\) return err\\('[^']*can’t be skipped`));
});
