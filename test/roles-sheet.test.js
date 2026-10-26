// "Roles in this game": static, the same for every viewer, built from ROLES + roleList.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolesInGame, rolesSeats, rolesSheetBody } from '../public/js/roles_sheet.js';
import { newRoom, reduce, viewForPlayer, viewForScreen } from '../public/js/room.js';
import { roleList, ROLES, TEAMS, MIN_PLAYERS, MAX_PLAYERS } from '../public/js/rules.js';

const glyph = (n) => `<i>${n}</i>`; const esc = (s) => String(s);

test('counts sum to the seat count and match the deal, at every table size', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const info = rolesInGame(n, {}); const list = roleList(n);
    const dealt = {}; for (const id of list.roles) dealt[id] = (dealt[id] || 0) + 1;
    assert.deepEqual(info.groups.map((g) => g.side), ['reform', 'cabal']);
    assert.equal(info.groups.flatMap((g) => g.roles).reduce((a, r) => a + r.count, 0), n);
    assert.equal(info.groups[0].count, TEAMS[n][0]); assert.equal(info.groups[1].count, TEAMS[n][1] + 1);
    for (const g of info.groups) for (const r of g.roles) { assert.equal(r.count, dealt[r.id]); assert.equal(ROLES[r.id].side, g.side); assert.ok(r.blurb && r.name && r.icon && r.note); }
    assert.deepEqual(info.groups[1].roles.map((r) => r.id), ['cabal', 'pretender']);
  }
});

test('what each side knows: the Syndicate know each other and the Boss; the Boss knows them only at 5-6', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const info = rolesInGame(n); const boss = info.groups[1].roles.find((r) => r.id === 'pretender');
    assert.match(info.groups[1].roles[0].note, /other Syndicate members and the Boss/);
    if (n <= 6) assert.match(boss.note, /Boss knows the Syndicate/); else assert.match(boss.note, /does not know the Syndicate/);
    assert.ok(info.knows.some((k) => (n <= 6 ? /5 or 6 players the Boss knows/ : /From 7 players the Boss does not/).test(k)));
    assert.match(info.inquiry, /party card/); assert.match(info.inquiry, /Boss shows Syndicate/);
  }
  assert.match(rolesInGame(5).inquiry, /no Inquiry at 5/); assert.match(rolesInGame(9).inquiry, /has Inquiries/);
});

test('the lobby shows the planned setup even with too few or too many players', () => {
  assert.equal(rolesInGame(2).seats, MIN_PLAYERS); assert.equal(rolesInGame(2).groups.length, 2);
  assert.equal(rolesInGame(14).seats, MAX_PLAYERS); assert.equal(rolesInGame(undefined).seats, MIN_PLAYERS);
});

function started(n = 7) {
  const room = newRoom('ABCDEF', 'hk'); const ids = [];
  for (let i = 0; i < n; i++) ids.push(reduce(room, {}, { type: 'join', name: `Zed${i}`, hostKey: i === 0 ? 'hk' : undefined }).data.playerId);
  return { room, ids };
}

test('identical for every viewer and every phase; never names a player or an id; no alive/out markers', () => {
  const { room, ids } = started();
  const sheet = (v) => JSON.stringify(rolesInGame(rolesSeats(v), v.house));
  const lobby = sheet(viewForScreen(room));
  assert.equal(lobby, sheet(viewForPlayer(room, ids[1])));
  assert.ok(reduce(room, { playerId: ids[0] }, { type: 'start' }).ok);
  const first = sheet(viewForScreen(room));
  assert.equal(first, lobby, 'the dealt setup is the planned one');
  for (const phase of ['reveal', 'nominate', 'vote', 'legislate', 'power', 'check', 'chaos', 'over']) {
    room.phase = phase;
    for (const v of [viewForScreen(room), ...ids.map((id) => viewForPlayer(room, id))]) assert.equal(sheet(v), first, phase);
  }
  room.game.alive[ids[2]] = false; room.game.exiled[ids[3]] = true;
  for (const v of [viewForScreen(room), viewForPlayer(room, ids[2])]) assert.equal(sheet(v), first, 'executed or exiled players change nothing');
  const html = rolesSheetBody(rolesInGame(7), esc, glyph);
  for (const id of ids) assert.equal(html.includes(`"${id}"`), false);
  assert.equal(/Zed\d/.test(html + first), false);
  assert.equal(/alive|\bout\b|dead|eliminated|executed/i.test(html), false);
});

test('a watcher mid-game sees the same dealt setup', () => {
  const { room, ids } = started(6);
  reduce(room, { playerId: ids[0] }, { type: 'start' });
  const late = reduce(room, {}, { type: 'join', name: 'Late' }).data.playerId;
  const v = viewForPlayer(room, late);
  assert.equal(rolesSeats(v), 6);
  assert.deepEqual(rolesInGame(rolesSeats(v), v.house), rolesInGame(6));
});
