// "Roles in this game": a static explanation of the setup, the same for every viewer in every phase.
// Built from ROLES + roleList(). No names, no ids, nothing about who holds what or what has happened.
import { ROLES, SIDES, POWERS, roleList, MIN_PLAYERS, MAX_PLAYERS } from './rules.js';
import { ROLE_ART } from './art.js';

const TITLES = { reform: 'Loyalists', cabal: 'The Syndicate' };
const ORDER = ['reformer', 'cabal', 'pretender'];

// players: the seat count (in the lobby this is the planned table, clamped to 5-10 so the setup is always shown).
// House rules never change who is dealt, so they are accepted for symmetry and ignored.
export function rolesInGame(players, house = {}) { // eslint-disable-line no-unused-vars
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number.isInteger(players) ? players : MIN_PLAYERS));
  const list = roleList(n);
  if (list.error) return { seats: n, error: list.error, groups: [], knows: [], inquiry: '' };
  const counts = new Map();
  for (const id of list.roles) counts.set(id, (counts.get(id) || 0) + 1);
  const bossSees = n <= 6;
  const note = (id) => ({
    reformer: 'Knows nothing at the start. Has to judge who to trust.',
    cabal: 'Knows the other Syndicate members and the Boss.',
    pretender: bossSees ? `At ${n} players the Boss knows the Syndicate.` : `At ${n} players the Boss does not know the Syndicate. The Syndicate know the Boss.`,
  })[id];
  const groups = ['reform', 'cabal'].map((side) => ({
    side, title: TITLES[side], name: SIDES[side].name,
    count: [...counts].filter(([id]) => ROLES[id].side === side).reduce((a, [, c]) => a + c, 0),
    roles: ORDER.filter((id) => counts.has(id) && ROLES[id].side === side)
      .map((id) => ({ id, name: ROLES[id].name, count: counts.get(id), icon: ROLE_ART[id], blurb: ROLES[id].blurb, note: note(id) })),
  }));
  const knows = [
    'Loyalists start knowing nothing about anyone.',
    'The Syndicate know each other and the Boss.',
    bossSees ? 'At 5 or 6 players the Boss knows the Syndicate too.' : 'From 7 players the Boss does not know the Syndicate.',
  ];
  const hasInquiry = POWERS[n].includes('investigate');
  const inquiry = `An Inquiry shows a player’s party card: Loyalist, or Syndicate. The Boss shows Syndicate. ${hasInquiry ? 'This table has Inquiries.' : `There is no Inquiry at ${n} players.`}`;
  return { seats: n, groups, knows, inquiry };
}

// The seat count the sheet describes: the dealt game, or the seated players in the lobby.
export const rolesSeats = (v) => v.game?.n || v.players.filter((p) => !p.watch).length;

export function rolesSheetBody(info, esc, glyph) {
  if (info.error) return `<p class="note is-warn">${esc(info.error)}</p>`;
  const groups = info.groups.map((g) => `<section class="rs-group a-${g.side}" data-side="${g.side}"><h3 class="rs-side">${esc(g.title)} <small>${g.count}</small></h3><ul class="rs-list">${g.roles.map((r) => `<li class="rs-row" data-role="${r.id}"><span class="rs-ico">${glyph(r.icon)}</span><span class="rs-main"><b>${esc(r.name)}${r.count > 1 ? ` <span class="rs-n">×${r.count}</span>` : ''}</b><span class="rs-blurb">${esc(r.blurb)}</span>${r.note ? `<span class="rs-note">${esc(r.note)}</span>` : ''}</span></li>`).join('')}</ul></section>`).join('');
  return `${groups}<section class="rs-group rs-knows"><h3 class="rs-side">Who knows what</h3><ul class="rs-facts">${info.knows.map((k) => `<li>${esc(k)}</li>`).join('')}<li>${esc(info.inquiry)}</li></ul></section>`;
}
