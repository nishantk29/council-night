// The setup carousel and Presets page as rendered strings: one primary per screen, a reason and a fix on every blocked Next,
// accessibility hooks, no banned wording, no em dashes, and the Roles chip reads the same for every viewer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lintCopy } from './kit/copy-lint.mjs';
import { setupScreen, presetsPage, previewBody } from '../public/js/setup_ui.js';
import { PRESETS, SETUP_STEPS, recommendedFor, addSaved, seatingDefault } from '../public/js/presets.js';
import { ui } from '../public/js/ui_icons.js';
import { art } from '../public/js/art.js';
import { newRoom, reduce, viewForPlayer, viewForScreen } from '../public/js/room.js';
import { rolesChip, rolesSeats } from '../public/js/roles_sheet.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODE_NAMES = { phone: 'Phones mode', hybrid: 'Hybrid', physical: 'Host-only mode' };
const room = (n) => {
  const r = newRoom('UIT', 'hk'); const ids = [];
  for (let i = 0; i < n; i++) ids.push(reduce(r, {}, { type: 'join', name: `Zed${i}`, hostKey: i === 0 ? 'hk' : undefined }, Math.random, 0).data.playerId);
  return { r, ids };
};
const fakeView = (n) => ({ code: 'UIT', phase: 'lobby', me: { id: 'p0', host: true }, mode: { play: 'phone', roles: 'app', votes: 'app', cards: 'app' },
  house: { rebalance: false, exile: false, anonVotes: false, noClaims: false, sitOut: false, turnTimer: 0, revealDelay: 0, firstLeader: 'random' },
  players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Zed${i}`, host: i === 0, phoneless: false, online: true })) });
const ctxFor = (n, step, preset = recommendedFor(), over = {}) => {
  const v = fakeView(n);
  return { v, st: { code: 'UIT', step, presetId: preset.id, seating: null, adv: false, ...over.st }, n, preset, saved: [], seating: seatingDefault(v.players), modeIssue: '', modeNames: MODE_NAMES,
    esc, ui, art, link: 'http://x/#/play/UIT', draft: {}, ...over.ctx };
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '’').replace(/\s+/g, ' ');

test('every step, at every table size: one primary, 4 dots, heading focusable, and a blocked Next has its reason and a fix link', () => {
  for (let n = 1; n <= 12; n++) for (let step = 0; step < SETUP_STEPS.length; step++) {
    const html = setupScreen(ctxFor(n, step));
    assert.equal((html.match(/class="gs-pri"/g) || []).length, 1, `n=${n} step=${step}: one primary`);
    assert.equal((html.match(/class="gs-dot /g) || []).length, 4);
    assert.match(html, /<h1 class="gs-h" tabindex="-1">/);
    assert.ok(html.includes(`Step ${step + 1} of 4: ${SETUP_STEPS[step].label}`));
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    const blocked = /class="gs-pri"[^>]*aria-disabled="true"/.test(html);
    if (blocked) {
      assert.match(html, /aria-describedby="gs-why"/); assert.match(html, /id="gs-why" role="note"/); assert.match(html, /data-a="gsFix"/, `n=${n} step=${step}: a fix link`);
    } else assert.ok(!html.includes('gs-why'), 'no reason when open');
    if (step === 2) assert.ok(!blocked, 'Seating never blocks');
    if (n >= 5 && n <= 10) assert.ok(!blocked, `a valid table is never blocked (n=${n}, step=${step})`);
  }
});

test('step 1 has the room code, Show QR, one add field, and the 5-minimum reason; the Deal button names the count', () => {
  const s1 = setupScreen(ctxFor(3, 0));
  assert.match(text(s1), /Add 2 more members to start \(5 minimum\)\./);
  assert.match(s1, /data-a="qrFull"/); assert.match(s1, /data-i="seatName"/); assert.ok(s1.includes('UIT'));
  assert.ok(!/class="gs-x"/.test(setupScreen(ctxFor(5, 0)).split('Zed0')[1].split('</li>')[0]), 'the host has no remove button on their own chip');
  const s4 = setupScreen(ctxFor(8, 3)); assert.match(text(s4), /Deal 8 roles/);
  assert.match(s4, /aria-expanded="false"/); assert.ok(/id="gs-adv-body"[^>]*\bhidden\b/.test(s4), 'Advanced is collapsed');
  assert.equal((s4.match(/data-a="gsGo"[^>]*>Edit</g) || []).length, 3);
  const open = setupScreen(ctxFor(8, 3, recommendedFor(), { st: { adv: true } })); assert.match(open, /data-a="gsSave"/); assert.match(open, /data-a="shuffleSeats"/);
});

test('step 2 shows the preset and the read-only fixed mix; step 3 has three radio options', () => {
  const s2 = setupScreen(ctxFor(9, 1)); assert.match(text(s2), /Open Session/); assert.match(text(s2), /Recommended for 9\./);
  assert.equal((s2.match(/class="gs-role /g) || []).length, 3); assert.ok(!/stepper|data-a="plus"|<input/.test(s2), 'read-only');
  assert.match(s2, /data-a="gsPresets"/);
  const s3 = setupScreen(ctxFor(9, 2)); assert.equal((s3.match(/role="radio"/g) || []).length, 3); assert.match(s3, /role="radiogroup"/);
  assert.match(text(s3), /Own phones/); assert.match(text(s3), /One phone/); assert.match(text(s3), /Mixed/);
});

test('a blocked Deal because of seating names the engine rule and links to Seating', () => {
  const html = setupScreen(ctxFor(6, 3, recommendedFor(), { ctx: { modeIssue: 'Flo has no phone. Set roles, votes, cards to “at the table”, or remove the seat.' } }));
  assert.match(html, /aria-disabled="true"/); assert.match(text(html), /Flo has no phone/); assert.match(html, /data-go="2"/); assert.match(text(html), /Change seating/);
});

test('presets page: Recommended pinned, Built in, Saved only when there are some, one tap target per card, out of range stays in the list', () => {
  const c = ctxFor(8, 1);
  const page = presetsPage(c);
  assert.match(text(page), /Recommended for 8/); assert.match(text(page), /Built in/); assert.ok(!/Saved on this phone/.test(text(page).replace('Saved presets stay on this phone only.', '')), 'no Saved group without a saved preset');
  assert.equal((page.match(/data-a="gsPick"/g) || []).length, 6);
  assert.ok(!/gs-badge/.test(page), 'no saved badge without a saved preset');
  assert.match(page, /class="gs-sel"/);
  const saved = addSaved([], 'Friday table', { play: 'phone' }, { exile: true }, 1);
  const withSaved = presetsPage({ ...c, saved }); assert.match(text(withSaved), /Saved on this phone/); assert.match(withSaved, /class="gs-badge"/); assert.match(withSaved, /data-a="gsMenu"/);
  const few = presetsPage(ctxFor(4, 1)); assert.equal((few.match(/data-a="gsPick"/g) || []).length, 6, 'nothing is hidden'); assert.match(few, /class="gs-pre [^"]*off/); assert.match(text(few), /Needs 5\+ players\. You have 4\./);
  for (const p of PRESETS) assert.ok(page.includes(esc(p.name)), p.name);
});

test('preview: the mix for this table, the balance bar, what it sets; a preset that does not fit says why', () => {
  const body = previewBody(PRESETS[1], ctxFor(6, 1)); assert.match(text(body), /Roles for 6 players/); assert.match(text(body), /4 Loyalists against 2/); assert.match(text(body), /Rebalanced Tables: At 6 players 1 Decree starts on the board\./); assert.match(body, /class="gs-bar"/);
  assert.match(text(previewBody(PRESETS[0], ctxFor(4, 1))), /Needs 5\+ players\. You have 4\./);
});

test('all setup copy passes the copy lint, has no em dashes, and nothing is Limelight', () => {
  const pages = [];
  for (let step = 0; step < 4; step++) for (const n of [3, 6, 11]) pages.push(setupScreen(ctxFor(n, step)), setupScreen(ctxFor(n, step, PRESETS[5], { st: { adv: true } })));
  pages.push(presetsPage(ctxFor(4, 1)), presetsPage(ctxFor(8, 1)), ...PRESETS.map((p) => previewBody(p, ctxFor(7, 1))));
  for (const h of pages) { const t = text(h); assert.deepEqual(lintCopy(t), []); assert.ok(!/—/.test(t), 'no em dash'); }
  for (const f of ['public/setup.css', 'public/js/setup_ui.js', 'public/js/setup_flow.js', 'public/js/presets.js']) assert.ok(!/limelight/i.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), f);
});

test('CSS: 44px dots and targets, Big Shoulders for headings, 0 radius buttons, no loops, reduced motion honoured', () => {
  const css = fs.readFileSync(new URL('../public/setup.css', import.meta.url), 'utf8');
  assert.match(css, /\.gs-dot\{width:38px;height:44px/); assert.match(css, /--display-gilded/);
  assert.match(css, /\.gs-pri\{[^}]*border-radius:0/); assert.match(css, /\.gs-sec\{[^}]*border-radius:0/);
  assert.ok(!/animation[^;{]*infinite/.test(css)); assert.ok(!/font-size:\.[0-7]\d*rem/.test(css.replace(/\.8125rem/g, '')), 'nothing under 13px');
  const flow = fs.readFileSync(new URL('../public/js/setup_flow.js', import.meta.url), 'utf8');
  assert.match(flow, /reduced/); assert.ok(!/\bleft:|\btop:|\bwidth:/.test(flow.slice(flow.indexOf('slide.animate'))), 'slide animates transform and opacity only');
});

test('Roles chip: the same text for every viewer, in every phase, and never a name', () => {
  const { r, ids } = room(7);
  const chips = (r2) => JSON.stringify([rolesChip(viewForScreen(r2)), ...ids.map((id) => rolesChip(viewForPlayer(r2, id)))]);
  const lobby = chips(r); assert.equal(new Set(JSON.parse(lobby).map((c) => c.text)).size, 1); assert.equal(JSON.parse(lobby)[0].text, 'Roles · 7');
  assert.ok(reduce(r, { playerId: ids[0] }, { type: 'start' }, Math.random, 0).ok);
  assert.equal(chips(r), lobby, 'the dealt game reads the same');
  for (const phase of ['reveal', 'nominate', 'vote', 'legislate', 'over']) { r.phase = phase; assert.equal(chips(r), lobby, phase); }
  assert.ok(!/Zed/.test(lobby));
  assert.equal(rolesSeats(viewForPlayer(r, ids[1])), 7);
});
