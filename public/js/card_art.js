// Designed card art for app / Phones mode (no physical deck): every card is inline SVG in the game's own palette
// (CSS variables with the same values as fallbacks, so it also prints and works standalone), Rubik 900 headers,
// the 63:88 card shape and its radii. Motifs come from art.js (torch, chain, mask) plus a gavel drawn here.
// No ids are used inside the SVGs, so any number can sit on one page. Playing-card mapping stays in cards.js.
import { artInner } from './art.js';

const FONT = 'Rubik,system-ui,-apple-system,"Segoe UI",sans-serif';
const C = {
  blue: 'var(--reform-fill,#2F5A8A)', red: 'var(--cabal-fill,#8A1913)', orange: 'var(--orange,#F07A22)',
  cream: 'var(--on-fill,#FFF8EC)', gold: 'var(--gold,#E2B04A)', ink: '#2A0606', night: '#1B1410',
};
const GAVEL = '<g transform="rotate(-38 32 30)"><rect x="12" y="8" width="40" height="18" rx="4"/><rect x="29" y="26" width="6" height="34" rx="2.5"/></g><rect x="6" y="56" width="32" height="6" rx="2.5"/>';
const motifs = { gavel: GAVEL };
const inner = (m) => motifs[m] || artInner(m);
const glyph = (m, x, y, size, color, rot = 0) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" fill="${color}" color="${color}"${rot ? ` transform="rotate(${rot} ${x + size / 2} ${y + size / 2})"` : ''}>${inner(m)}</svg>`;
const rays = (color, op) => Array.from({ length: 16 }, (_, i) => {
  const a1 = (i * 2 * Math.PI) / 16; const a2 = a1 + Math.PI / 16; const R = 300;
  return `<path d="M126 170L${(126 + R * Math.cos(a1)).toFixed(1)} ${(170 + R * Math.sin(a1)).toFixed(1)}L${(126 + R * Math.cos(a2)).toFixed(1)} ${(170 + R * Math.sin(a2)).toFixed(1)}z"/>`;
}).join('').replace(/^/, `<g fill="${color}" fill-opacity="${op}">`) + '</g>';
// Rubik 900 caps run about .72em wide: fit long lines to `max` units with textLength so nothing leaves the card.
const text = (t, x, y, size, fill, extra = '', max = 0) => {
  const est = t.length * size * (extra.includes('letter-spacing') ? 0.8 : 0.72);
  const fit = max && est > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" text-anchor="middle"${fit} font-family='${FONT}' font-weight="900" font-size="${size}" fill="${fill}" ${extra}>${t}</text>`;
};

// One card: field colour, ink colour, centre motif, kicker (small, top) and title (big, bottom).
function face({ bg, ink, accent, motif, kicker, title, sub, label, kind, motifBg }) {
  const disc = motifBg ? `<circle cx="126" cy="168" r="70" fill="${motifBg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dcard dcard-${kind}" viewBox="0 0 252 352" role="img" aria-label="${label}">`
    + `<rect width="252" height="352" rx="16" ry="15" fill="${bg}"/>${rays(ink, 0.09)}`
    + `<rect x="10" y="10" width="232" height="332" rx="10" fill="none" stroke="${accent}" stroke-width="3"/>`
    + `<rect x="17" y="17" width="218" height="318" rx="6" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="1.5"/>`
    + glyph(motif, 24, 24, 30, accent) + glyph(motif, 206, 314, 22, accent, 180)
    + text(kicker, 126, 52, 15, accent, 'letter-spacing="3"') + disc
    + glyph(motif, 66, 108, 120, ink)
    + `<path d="M40 262h172" stroke="${accent}" stroke-width="3"/><path d="M40 270h172" stroke="${ink}" stroke-opacity=".4" stroke-width="1.5"/>`
    + text(title, 126, 306, 36, ink, '', 190) + (sub ? text(sub, 126, 328, 11, accent, 'letter-spacing="2"', 150) : '') + '</svg>';
}

const KINDS = {
  reform: () => face({ kind: 'reform', bg: C.blue, ink: C.cream, accent: C.gold, motif: 'torch', kicker: 'POLICY', title: 'REFORM', label: 'Reform policy' }),
  decree: () => face({ kind: 'decree', bg: C.red, ink: C.cream, accent: C.gold, motif: 'chain', kicker: 'POLICY', title: 'DECREE', label: 'Decree policy' }),
  loyalistRole: () => face({ kind: 'loyalist-role', bg: C.blue, ink: C.cream, accent: C.gold, motif: 'torch', kicker: 'SECRET ROLE', title: 'LOYALIST', sub: 'PARTY: LOYALIST', label: 'Loyalist role card' }),
  syndicateRole: () => face({ kind: 'syndicate-role', bg: C.red, ink: C.cream, accent: C.gold, motif: 'chain', kicker: 'SECRET ROLE', title: 'SYNDICATE', sub: 'PARTY: SYNDICATE', label: 'Syndicate role card' }),
  bossRole: () => face({ kind: 'boss-role', bg: C.night, ink: C.orange, accent: C.gold, motif: 'mask', kicker: 'SECRET ROLE', title: 'THE BOSS', sub: 'PARTY: SYNDICATE', label: 'The Boss role card' }),
  loyalistParty: () => face({ kind: 'loyalist-party', bg: C.cream, ink: C.blue, accent: C.orange, motif: 'torch', kicker: 'PARTY', title: 'LOYALIST', sub: 'MEMBERSHIP', label: 'Loyalist party card' }),
  syndicateParty: () => face({ kind: 'syndicate-party', bg: C.cream, ink: C.red, accent: C.orange, motif: 'chain', kicker: 'PARTY', title: 'SYNDICATE', sub: 'MEMBERSHIP', label: 'Syndicate party card' }),
  aye: () => face({ kind: 'aye', bg: C.orange, ink: C.ink, accent: C.cream, motif: 'aye', kicker: 'BALLOT', title: 'AYE', sub: 'ELECT THIS GOVERNMENT', label: 'Aye ballot' }),
  nay: () => face({ kind: 'nay', bg: C.night, ink: C.orange, accent: C.gold, motif: 'nay', kicker: 'BALLOT', title: 'NAY', sub: 'NOT THIS GOVERNMENT', label: 'Nay ballot' }),
  speaker: () => face({ kind: 'speaker', bg: C.orange, ink: C.ink, accent: C.cream, motif: 'gavel', kicker: 'PLACARD', title: 'THE SPEAKER', sub: 'NOMINATES. PASSES LEFT.', label: 'Speaker placard' }),
  chancellor: () => face({ kind: 'chancellor', bg: C.cream, ink: C.ink, accent: C.orange, motif: 'seal', kicker: 'PLACARD', title: 'CHANCELLOR', sub: 'ENACTS ONE OF TWO', label: 'Chancellor placard' }),
  back: () => `<svg xmlns="http://www.w3.org/2000/svg" class="dcard dcard-back" viewBox="0 0 252 352" role="img" aria-label="Card back">`
    + `<rect width="252" height="352" rx="16" ry="15" fill="${C.orange}"/>${rays(C.ink, 0.12)}`
    + `<rect x="10" y="10" width="232" height="332" rx="10" fill="none" stroke="${C.ink}" stroke-width="4"/><rect x="18" y="18" width="216" height="316" rx="6" fill="none" stroke="${C.cream}" stroke-width="2"/>`
    + `<circle cx="126" cy="170" r="74" fill="${C.ink}"/><circle cx="126" cy="170" r="74" fill="none" stroke="${C.gold}" stroke-width="3"/>`
    + glyph('sun', 66, 110, 120, C.gold) + text('THE GILDED', 126, 292, 22, C.ink, 'letter-spacing="2"') + text('CHAMBER', 126, 320, 22, C.ink, 'letter-spacing="2"')
    + glyph('torch', 24, 24, 30, C.ink) + glyph('chain', 206, 314, 22, C.ink) + '</svg>',
};

export const CARD_KINDS = Object.keys(KINDS);
export const cardArt = (kind) => (KINDS[kind] ? KINDS[kind]() : '');
export const reformPolicy = KINDS.reform;
export const decreePolicy = KINDS.decree;
export const cardBack = KINDS.back;
export const loyalistRole = KINDS.loyalistRole;
export const syndicateRole = KINDS.syndicateRole;
export const bossRole = KINDS.bossRole;
export const loyalistParty = KINDS.loyalistParty;
export const syndicateParty = KINDS.syndicateParty;
export const ayeBallot = KINDS.aye;
export const nayBallot = KINDS.nay;
export const speakerPlacard = KINDS.speaker;
export const chancellorPlacard = KINDS.chancellor;
// Game ids (rules.js role ids, policy letters, party names) to card kinds.
export const ROLE_CARD = { reformer: 'loyalistRole', cabal: 'syndicateRole', pretender: 'bossRole' };
export const PARTY_CARD = { reform: 'loyalistParty', cabal: 'syndicateParty' };
export const POLICY_CARD = { R: 'reform', D: 'decree' };
