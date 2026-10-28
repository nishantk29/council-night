// House-rule gate: one describe per house rule (RULES.md has the table). Rules already covered by a named test elsewhere
// are cited, and each citation is checked to still exist, so a renamed or deleted test fails here instead of rotting.
// A few rules with no single owner get a direct check below.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newRoom, reduce, viewForPlayer, LATEST_RULES_VERSION } from '../public/js/room.js';
import { computeVersion, swVersion } from '../scripts/sw-version.mjs';

const titles = {};
const has = (file, name) => (titles[file] ||= fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')).includes(name);
function cites(file, ...names) {
  test(`covered by ${file}`, () => { for (const n of names) assert.ok(has(file, n), `${file} has no test named "${n}"`); });
}

describe('house rule: team sizes 5 to 10, Syndicate a minority with the Boss', () => {
  cites('rules.test.js', 'team sizes for every table: 5 to 10');
  cites('audit-v2.test.js', 'audit: team sizes, deck and knowledge match the classic rules');
  cites('roles-sheet.test.js', 'counts sum to the seat count and match the deal');
});
describe('house rule: the Boss sees the Syndicate only at 5-6, and lists come in random order', () => {
  cites('rules.test.js', 'who knows whom: Syndicate see each other and the Boss; the Boss sees the Syndicate only at 5-6');
  cites('audit-v2.test.js', 'audit: team sizes, deck and knowledge match the classic rules', 'audit: nothing in the table order gives a role away');
  cites('roles-sheet.test.js', 'what each side knows: the Syndicate know each other and the Boss; the Boss knows them only at 5-6');
});
describe('house rule: term limits (last Chancellor never; last Speaker only above five alive)', () => {
  cites('rules.test.js', 'term limits: last Chancellor always barred');
  cites('room.test.js', 'term limits are enforced on nomination');
  cites('audit-v2.test.js', 'audit: term limits', 'audit: exiled players do not count toward the five-or-fewer term-limit exception');
});
describe('house rule: the third failed government enacts the top policy, no power, clears the limits', () => {
  cites('room.test.js', 'unrest: three failed governments enact the top tile, ignore its power, reset the tracker and the term limits', 'the tracker resets whenever a policy is enacted');
  cites('audit-v2.test.js', 'audit: third failure enacts the top policy without a power, clears term limits, resets the tracker', 'audit: chaos at five Decrees ends the game');
});
describe('house rule: the Boss elected Chancellor after three Decrees wins for the Syndicate', () => {
  cites('room.test.js', 'win: the Boss elected Chancellor after three Decrees (and not before)');
  cites('audit-v2.test.js', 'audit: the Boss elected at three Decrees wins before legislation; before three, not');
});
describe('house rule: executing the Boss wins for the Loyalists', () => {
  cites('room.test.js', 'win: executing the Boss; executed players cannot vote or hold office');
  cites('audit-v2.test.js', 'audit: six Decrees and five Reforms win; executing the Boss wins at once');
});
describe('house rule: veto only at five Decrees', () => {
  cites('room.test.js', 'veto unlocks at five Decrees; refusal forces an enactment');
  cites('audit-v2.test.js', 'audit: veto only at five Decrees, Speaker must agree, a veto advances the tracker');
});
describe('house rule: Inquiry shows the party, and the Boss shows as Syndicate', () => {
  cites('room.test.js', 'inquiry shows the party (the Boss shows as Syndicate) to the Speaker only, never twice');
  cites('audit-v2.test.js', 'audit: powers by table size; Inquiry shows party (Boss = Syndicate) and never twice');
});
describe('house rule: executive powers by table size', () => {
  cites('rules.test.js', 'the powers table matches the three classic boards');
  cites('room.test.js', 'powers by table size fire on the right Decree');
  cites('audit-v2.test.js', 'audit: powers by table size');
});
describe('house rule: the roles sheet is static and identical for everyone', () => {
  cites('roles-sheet.test.js', 'identical for every viewer and every phase', 'a watcher mid-game sees the same dealt setup');
});
describe('house rule: Restart keeps the room and re-deals on the latest rules', () => {
  cites('restart.test.js', 'restart keeps code, players, house, mode and host', 'a v1 room moves to the latest rules on restart');
  cites('audit-v2.test.js', 'audit: Restart works in every phase and brings everyone back at the latest rules');
});
describe('house rule: a room keeps the rulesVersion it was created with', () => {
  test('new rooms get the latest; a missing field reads as 1 and is never backfilled by joining, settings or viewing', () => {
    assert.equal(newRoom('ABCDEF', 'hk').rulesVersion, LATEST_RULES_VERSION);
    const room = newRoom('ABCDEF', 'hk'); delete room.rulesVersion;
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(reduce(room, { anon: true }, { type: 'join', name: `P${i}`, hostKey: i ? undefined : 'hk' }).data.playerId);
    viewForPlayer(room, ids[1]);
    assert.equal(room.rulesVersion, undefined, 'viewing and joining never backfill');
  });
  cites('restart.test.js', 'newRoom is on the latest rules; a room without rulesVersion is version 1 and is not backfilled', 'Play again from the end screen leaves a v1 room on v1 until the next start');
});
describe('house rule: every role gets the same reveal look and duration', () => {
  cites('phone.test.js', 'every role card has the same outer shape so a glance leaks nothing');
  cites('audit-v2.test.js', 'audit: reveal length is identical for every role');
});
describe('house rule: no leaks in any phase', () => {
  cites('table.test.js', 'secrecy: no view carries a token, the host key or the full deal');
  cites('room.test.js', 'every table size deals, and nobody sees what they should not');
  cites('audit-v2.test.js', 'audit: no view leaks another player’s role, hands, docket, Inquiry, deck, keys or tokens at any phase', 'audit: knowledge badges show only while the role card is open', 'audit: moderator roles only for a sit-out host');
  cites('restart.test.js', 'after a restart every view is the fresh reveal');
});
describe('house rule: reconnecting to a living game gives the same view', () => {
  cites('audit-v2.test.js', 'audit: pause freezes play, host can still restart; a kicked seat’s old token no longer acts');
  cites('room.test.js', 'every table size deals, and nobody sees what they should not');
});
describe('house rule: the host flow never dead-ends', () => {
  cites('audit-v2.test.js', 'audit: skip works on every phase it should', 'audit: physical table, third failure: no skip, the host enters the tile', 'audit: physical and hybrid steps');
});
describe('house rule: error pages are styled and leak nothing', () => {
  cites('error-pages.test.js', 'unknown path: styled 404', 'a thrown error becomes a styled 500 with no stack', 'client error screens:', 'crash handler output never includes the error message or stack');
});
describe('house rule: the FAQ matches the game', () => {
  cites('faq-drift.test.js', 'FAQ names every role, house rule and play mode the game has', 'the FAQ_GAME list matches the game data');
});
describe('house rule: the service worker version is fresh', () => {
  test('public/sw.js VERSION matches the content hash of public/', () => {
    assert.equal(swVersion(), computeVersion(), 'public/ changed since the last stamp: run make-pwa or `node scripts/stamp-sw.mjs public`');
  });
  cites('pwa-fresh.test.js', 'service worker: HTML fetched with no-cache');
});
describe('house rule: the deploy gate blocks on a red test and the worker identity comes from wrangler.jsonc', () => {
  cites('deploy-gate.test.js', 'deploy gate: a failing test file blocks', 'deploy gate: build-deploy has no bypass flag or env switch');
  cites('deploy-config.test.js', 'worker name is the live script name, not the repo name');
});
