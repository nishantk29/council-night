// The Gilded Chamber's own icons, drawn for this app (original artwork; nothing taken from any published game).
// 64x64 viewBox, single colour (currentColor), flat poster shapes so they print and recolour cleanly.
const A = {
  // Reform: a raised torch
  torch: '<path d="M32 4c7 7 9 13 6 19-1-4-3-6-6-7 1 4-1 7-4 9-2-5 0-12 4-21z"/><path d="M22 26h20l-3 7H25z"/><path d="M26 35h12l-3 25h-6z"/><path d="M24 26h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // Decree: a shackle chain
  chain: '<g fill="none" stroke="currentColor" stroke-width="6"><rect x="6" y="22" width="22" height="14" rx="7" transform="rotate(-30 17 29)"/><rect x="21" y="25" width="22" height="14" rx="7" transform="rotate(-30 32 32)"/><rect x="36" y="28" width="22" height="14" rx="7" transform="rotate(-30 47 35)"/></g>',
  // The Boss: a half mask
  mask: '<path d="M6 20c8-5 18-6 26-2 8-4 18-3 26 2-1 15-8 25-17 25-4 0-7-3-9-7-2 4-5 7-9 7-9 0-16-10-17-25zm10 8c2 4 7 5 10 2-3-4-7-4-10-2zm32 0c-3-2-7-2-10 2 3 3 8 2 10-2z" fill-rule="evenodd"/><path d="M32 45v13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="58" r="3"/>',
  // Execution: a dagger
  dagger: '<path d="M32 3l5 9v26h-10V12z"/><path d="M18 38h28v5H18z"/><rect x="28.5" y="43" width="7" height="13" rx="2"/><circle cx="32" cy="59" r="3.5"/>',
  // Peek at the docket: an eye
  eye: '<path d="M2 32C10 18 21 12 32 12s22 6 30 20c-8 14-19 20-30 20S10 46 2 32zm30 13a13 13 0 1 0 0-26 13 13 0 0 0 0 26z" fill-rule="evenodd"/><circle cx="32" cy="32" r="6"/>',
  // Snap election: a ballot box
  ballot: '<path d="M10 30h44v26H10z"/><path d="M20 30V10h24v20" fill="none" stroke="currentColor" stroke-width="4"/><path d="m25 20 5 5 9-10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 37h16v3H24z" fill-opacity=".35"/>',
  // Inquiry: a magnifier
  lens: '<circle cx="26" cy="26" r="17" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="26" cy="26" r="11" fill-opacity=".2"/><path d="m39 39 18 18" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
  // The Speaker: a lectern with a gavel
  speaker: '<path d="M14 22h36l-5 8H19z"/><path d="M22 32h20l-2 24H24z"/><path d="M16 58h32v4H16z"/><path d="M36 6l12 7-3 5-12-7z"/><path d="M41 13l-9 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // The Chancellor: a seal ring
  seal: '<circle cx="32" cy="30" r="22" fill-opacity=".25"/><circle cx="32" cy="30" r="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 16l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/><path d="M24 52h16l-3 9h-10z"/>',
  aye: '<circle cx="32" cy="32" r="27" fill-opacity=".2"/><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="4"/><path d="m19 33 9 9 18-19" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  nay: '<circle cx="32" cy="32" r="27" fill-opacity=".2"/><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="4"/><path d="m21 21 22 22m0-22L21 43" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  // The chamber: a round table seen from above with a column
  table: '<circle cx="32" cy="32" r="20" fill-opacity=".25"/><circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="3"/><g>' + Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<rect x="${(32 + 27 * Math.cos(a) - 3.5).toFixed(1)}" y="${(32 + 27 * Math.sin(a) - 3.5).toFixed(1)}" width="7" height="7"/>`; }).join('') + '</g><path d="M26 24h12M27 27v12m5-12v12m5-12v12M25 41h14" stroke="currentColor" stroke-width="2.5"/>',
  // Unrest: a cracked column
  unrest: '<path d="M18 8h28v5H18zM18 51h28v5H18z"/><path d="M22 13h20v38H22zm9 4-4 9 6 3-5 9 4 9" fill-rule="evenodd"/><path d="M31 17l-4 9 6 3-5 9 4 9" fill="none" stroke="currentColor" stroke-width="2"/>',
  // Card back sunburst
  sun: '<circle cx="32" cy="32" r="9"/>' + Array.from({ length: 16 }, (_, i) => { const a = (i * Math.PI) / 8; const x1 = 32 + 13 * Math.cos(a); const y1 = 32 + 13 * Math.sin(a); const x2 = 32 + (i % 2 ? 22 : 29) * Math.cos(a); const y2 = 32 + (i % 2 ? 22 : 29) * Math.sin(a); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="currentColor" stroke-width="${i % 2 ? 2 : 3.5}" stroke-linecap="square"/>`; }).join(''),
};
export const art = (name, cls = '') => (A[name] ? `<svg class="ico art ${cls}" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" focusable="false">${A[name]}</svg>` : '');
export const artInner = (name) => A[name] || '';
export const ART_NAMES = Object.keys(A);
export const ROLE_ART = { reformer: 'torch', cabal: 'chain', pretender: 'mask' };
export const POWER_ART = { investigate: 'lens', special: 'ballot', peek: 'eye', execute: 'dagger' };
