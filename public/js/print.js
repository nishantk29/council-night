// The printable card guide (one standard 52-card deck) and the Gilded Chamber card sheet, both built from the
// same data the app uses (rules.js, cards.js), so the paper and the app can never disagree.
import { TEAMS, POWERS, POWER_TEXT } from './rules.js';
import { roleCards, MAP } from './cards.js';
import { art } from './art.js';
import { cardArt, CARD_KINDS } from './card_art.js';
import { DESIGNED, designedFaces, sheetCount, PER_SHEET } from './print_data.js';

const part = new URLSearchParams(location.search).get('part');
const red = (c) => `<span class="${/[♥♦]/.test(c) || /Red/.test(c) ? 'red' : 'blk'}">${c}</span>`;
const span = (a) => (a.length > 1 ? `${red(a[0])}–${red(a.at(-1))}` : red(a[0]));

// The landing offers the two card sets side by side; each links to its section below.
const chooser = () => `<section class="sheet"><h1>The Gilded Chamber</h1><p>Print the cards for your table. Pick the set that matches how you play.</p>
  <nav class="choose" aria-label="Card sets"><a href="#designed"><b>Designed Cards</b><span>For Phones mode, or to print a custom deck.</span></a>
  <a href="#key"><b>Playing-Card Key</b><span>For a regular deck of cards, jokers included.</span></a></nav></section>`;

function guide() {
  const rows = [5, 6, 7, 8, 9, 10].map((n) => {
    const r = roleCards(n);
    const ref = r.roles.filter((c) => c.role === 'reformer').map((c) => c.card); const cab = r.roles.filter((c) => c.role === 'cabal').map((c) => c.card);
    return `<tr><td><b>${n}</b></td><td>${span(ref)} (${ref.length})</td><td>${span(cab)} (${cab.length}) + ${red(MAP.pretender)} Boss</td>
      <td>${span(r.party.filter((c) => /♦/.test(c)))} Loyalist<br>${span(r.party.filter((c) => /♣/.test(c)))} Syndicate</td><td>${POWERS[n].map((p) => (p ? POWER_TEXT[p][0] : '–')).join(' · ')}</td></tr>`;
  }).join('');
  return `<section class="sheet break" id="key"><h1>Playing-Card Key</h1><p>Play with one regular deck of cards, jokers included. Use this key in <b>Host-only mode</b>, or in <b>Hybrid</b> mode with the pieces you choose to handle at the table. The Host’s phone is the board and the tracker. Players without a phone need <b>Host-only mode</b>.</p>
  <h2>What Each Card Means</h2>
  <table><tr><th>Piece</th><th>Cards</th></tr>
    <tr><td>Role cards</td><td>Hearts ${span(MAP.reformRoles)} = <b>Loyalist</b> · clubs ${span(MAP.cabalRoles)} = <b>Syndicate</b> · ${red(MAP.pretender)} = <b>the Boss</b></td></tr>
    <tr><td>Party cards</td><td>Diamonds ${span(MAP.reformParty)} = Loyalist · clubs ${span(MAP.cabalParty)} = Syndicate (the Boss’s party is Syndicate). Shown only for an Inquiry.</td></tr>
    <tr><td>Policy pile</td><td>Hearts ${span(MAP.reformPolicy)} = <b>Reform</b> (6) · spades ${span(MAP.decreePolicy)} = <b>Decree</b> (11). 17 cards.</td></tr>
    <tr><td>Placards</td><td>${red(MAP.speaker)} = the Speaker (passes left) · ${red(MAP.chancellor)} = the Chancellor nominee</td></tr>
    <tr><td>Votes</td><td>Thumbs up = Aye, thumbs down = Nay, everyone on three. Or a red and a black card from a second deck for each player.</td></tr>
    <tr><td>Unrest and board</td><td>Track it on the Host’s phone, or with three coins. Lay enacted policies face up in two rows.</td></tr></table>
  <h2>What to Pull for Each Table</h2>
  <table><tr><th>Players</th><th>Loyalists</th><th>Syndicate</th><th>Party cards</th><th>Powers on Decrees 1–5</th></tr>${rows}</table>
  <p class="note">Rebalanced tables (house rule): at 6 players put one Decree face up on the board before you start; at 7 remove the J♠ from the pile; at 9 remove the J♠ and 10♠.</p>
  <h2>Setup</h2><ol><li>Pull the role cards for your table, shuffle them face down and deal one to each player. Look at your own card in secret.</li>
  <li>Each player takes the party card that matches their role (a diamond for a heart, a club for a club or the K♠) and keeps it face down in front of them. Do this one by one, eyes closed if you like, or let the Host hand them out without looking.</li>
  <li>Shuffle the 17 policy cards face down: this is the draw pile.</li>
  <li>Choose the first Speaker at random (the app’s coin or picker works) and give them the red joker.</li>
  <li>Read the eyes-closed script, then play: the Speaker hands the black joker to a nominee, everyone votes on three, and an elected government draws three, the Speaker discards one face down, the Chancellor discards one face down and lays the last face up.</li></ol>
  <h2>Eyes-Closed Script (Read Aloud)</h2>
  <h3>5 or 6 Players</h3><ol class="script">
   <li>Everyone, close your eyes and put your fist on the table.</li>
   <li>Syndicate and the Boss, open your eyes and look around. These are your allies.</li>
   <li>Boss, raise your thumb so the Syndicate know you. … Everyone, close your eyes. Thumbs down.</li>
   <li>Everyone, open your eyes.</li></ol>
  <h3>7 to 10 Players</h3><ol class="script">
   <li>Everyone, close your eyes and put your fist on the table.</li>
   <li>Syndicate, open your eyes. Boss, keep yours closed, and raise your thumb so the Syndicate know who you are.</li>
   <li>… Syndicate, close your eyes. Boss, thumb down.</li>
   <li>Everyone, open your eyes.</li></ol>
  <p class="note">The Gilded Chamber is an original game in the hidden-role policy family; names, wording and art are its own.</p></section>`;
}

const card = (cls, icon, name, side, blurb) => `<div class="c ${cls}"><div class="ci">${art('sun', 'crest')}<span class="side">${side}</span>${icon}<b>${name}</b><small>${blurb || ''}</small></div></div>`;
function cardsSheet() {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Loyalist', 'SECRET ROLE', 'Pass five Reforms, or remove the Boss.'));
  for (let i = 0; i < 3; i++) out.push(card('cabal', art('chain'), 'Syndicate', 'SECRET ROLE', 'Pass six Decrees, or seat the Boss as Chancellor.'));
  out.push(card('cabal', art('mask'), 'The Boss', 'SECRET ROLE', 'Lead the Syndicate from the shadows.'));
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Loyalist', 'PARTY', 'Shown only for an Inquiry.'));
  for (let i = 0; i < 4; i++) out.push(card('cabal', art('chain'), 'Syndicate', 'PARTY', 'Shown only for an Inquiry.'));
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Reform', 'POLICY', ''));
  for (let i = 0; i < 11; i++) out.push(card('cabal', art('chain'), 'Decree', 'POLICY', ''));
  for (let i = 0; i < 10; i++) out.push(card('paper', art('aye'), 'Aye', 'VOTE', 'Elect this government.'));
  for (let i = 0; i < 10; i++) out.push(card('ink', art('nay'), 'Nay', 'VOTE', 'Not this government.'));
  out.push(card('paper', art('speaker'), 'The Speaker', 'PLACARD', 'Nominates. Passes left.'));
  out.push(card('paper', art('seal'), 'The Chancellor', 'PLACARD', 'Enacts one of two.'));
  out.push(card('paper', art('table'), 'The Gilded Chamber', 'REFERENCE', '5 Reforms or the Boss removed · 6 Decrees or the Boss elected after 3'));
  const backs = Array.from({ length: 9 }, () => `<div class="c back"><div class="ci">${art('sun')}<b>The Gilded Chamber</b></div></div>`).join('');
  const pages = [];
  for (let i = 0; i < out.length; i += 9) pages.push(`<section class="sheet cardpage break"><div class="cards">${out.slice(i, i + 9).join('')}</div></section>`);
  pages.push(`<section class="sheet cardpage break"><div class="cards">${backs}</div></section>`);
  pages.unshift(`<section class="sheet" id="cards"><h1>Plain Text Cards</h1><p>Print the next pages on card stock and cut on the dashed lines (63 × 88 mm, poker size). Print the last page (backs) as many times as you need and glue or print double-sided. ${out.length} cards: 10 role cards, 10 party cards, 17 policies, 20 votes, the two placards and a reference card. All art is original to The Gilded Chamber.</p></section>`);
  return pages.join('');
}
// The designed set for Phones mode: a gallery (screen) and print sheets with the full deck's copies (print).
function designed() {
  const gal = DESIGNED.map(([k, name, n]) => `<figure class="dg">${cardArt(k)}<figcaption><b>${name}</b>${n ? ` · ${n} per deck` : ' · print one per card, on the reverse'}</figcaption></figure>`).join('');
  const cards = DESIGNED.filter((d) => d[2]).flatMap(([k, , n]) => Array.from({ length: n }, () => `<div class="c dprint">${cardArt(k)}</div>`));
  const pages = [];
  for (let i = 0; i < cards.length; i += PER_SHEET) pages.push(`<section class="sheet cardpage break dsheet"><div class="cards">${cards.slice(i, i + PER_SHEET).join('')}</div></section>`);
  const back = `<section class="sheet cardpage break dsheet"><div class="cards">${Array.from({ length: PER_SHEET }, () => `<div class="c dprint">${cardArt('back')}</div>`).join('')}</div></section>`;
  return `<section class="sheet" id="designed"><h1>Designed Cards</h1><p>The cards the app shows in Phones mode, as a custom deck to print. Print the sheets on card stock (63 × 88 mm) and cut on the dashed lines. Print the back page on the reverse of every card. ${designedFaces()} faces (${sheetCount(designedFaces())} sheets) and one back; for a regular deck, use the Playing-Card Key.</p><div class="dgal">${gal}</div></section>${pages.join('')}${back}`;
}
const SETS = { designed: ['designed cards', designed], guide: ['playing-card key', guide], cards: ['plain text cards', cardsSheet] };
const [title, body] = SETS[part] || ['card guide', () => chooser() + designed() + guide()];
document.getElementById('out').innerHTML = body();
document.title = `The Gilded Chamber: ${title}`;
