// The printable card guide (one standard 52-card deck) and the Council Night card sheet, both built from the
// same data the app uses (rules.js, cards.js), so the paper and the app can never disagree.
import { TEAMS, POWERS, POWER_TEXT } from './rules.js';
import { roleCards, MAP } from './cards.js';
import { art } from './art.js';

const part = new URLSearchParams(location.search).get('part');
const red = (c) => `<span class="${/[♥♦]/.test(c) || /Red/.test(c) ? 'red' : 'blk'}">${c}</span>`;
const span = (a) => (a.length > 1 ? `${red(a[0])}–${red(a.at(-1))}` : red(a[0]));

function guide() {
  const rows = [5, 6, 7, 8, 9, 10].map((n) => {
    const r = roleCards(n);
    const ref = r.roles.filter((c) => c.role === 'reformer').map((c) => c.card); const cab = r.roles.filter((c) => c.role === 'cabal').map((c) => c.card);
    return `<tr><td><b>${n}</b></td><td>${span(ref)} (${ref.length})</td><td>${span(cab)} (${cab.length}) + ${red(MAP.pretender)} Pretender</td>
      <td>${span(r.party.filter((c) => /♦/.test(c)))} Reform<br>${span(r.party.filter((c) => /♣/.test(c)))} Cabal</td><td>${POWERS[n].map((p) => (p ? POWER_TEXT[p][0] : '–')).join(' · ')}</td></tr>`;
  }).join('');
  return `<section class="sheet"><h1>Council Night</h1><p><b>Card guide: play with one regular deck of cards (jokers included).</b> Use it with the app in “All physical” or “Hybrid” mode (the host’s phone keeps the board, Unrest, the draw pile and the narration), or with no phone at all.</p>
  <h2>The key</h2>
  <table><tr><th>Piece</th><th>Cards</th></tr>
    <tr><td>Role cards</td><td>Hearts ${span(MAP.reformRoles)} = <b>Reformer</b> · clubs ${span(MAP.cabalRoles)} = <b>Cabal</b> · ${red(MAP.pretender)} = <b>the Pretender</b></td></tr>
    <tr><td>Party cards</td><td>Diamonds ${span(MAP.reformParty)} = Reform · clubs ${span(MAP.cabalParty)} = Cabal (the Pretender’s party is Cabal). Shown only for an Inquiry.</td></tr>
    <tr><td>Policy pile</td><td>Hearts ${span(MAP.reformPolicy)} = <b>Reform</b> (6) · spades ${span(MAP.decreePolicy)} = <b>Decree</b> (11). 17 cards.</td></tr>
    <tr><td>Placards</td><td>${red(MAP.speaker)} = the Speaker (passes left) · ${red(MAP.chancellor)} = the Chancellor nominee</td></tr>
    <tr><td>Votes</td><td>Thumbs up = Aye, thumbs down = Nay, everyone on three. Or a red and a black card from a second deck for each player.</td></tr>
    <tr><td>Unrest and board</td><td>Track it on the app, or with three coins. Lay enacted policies face up in two rows.</td></tr></table>
  <h2>What to pull for each table</h2>
  <table><tr><th>Players</th><th>Reformers</th><th>Cabal</th><th>Party cards</th><th>Powers on Decrees 1–5</th></tr>${rows}</table>
  <p class="note">Rebalanced house rule: at 6 players put one Decree face up on the board before you start; at 7 remove the J♠ from the pile; at 9 remove the J♠ and 10♠.</p>
  <h2>Setup</h2><ol><li>Pull the role cards for your table, shuffle them face down and deal one to each player. Look at your own card in secret.</li>
  <li>Each player takes the party card that matches their role (a diamond for a heart, a club for a club or the K♠) and keeps it face down in front of them. Do this one by one, eyes closed if you like, or let the host hand them out without looking.</li>
  <li>Shuffle the 17 policy cards face down: this is the draw pile.</li>
  <li>Choose the first Speaker at random (the app’s coin or picker works) and give them the red joker.</li>
  <li>Read the eyes-closed script, then play: the Speaker hands the black joker to a nominee, everyone votes on three, and an elected government draws three, the Speaker discards one face down, the Chancellor discards one face down and lays the last face up.</li></ol>
  <h2>Eyes-closed script (read aloud)</h2>
  <h3>5 or 6 players</h3><ol class="script">
   <li>Everyone, close your eyes and put your fist on the table.</li>
   <li>Cabal and the Pretender, open your eyes and look around. These are your allies.</li>
   <li>Pretender, raise your thumb so the Cabal know you. … Everyone, close your eyes. Thumbs down.</li>
   <li>Everyone, open your eyes.</li></ol>
  <h3>7 to 10 players</h3><ol class="script">
   <li>Everyone, close your eyes and put your fist on the table.</li>
   <li>Cabal, open your eyes. Pretender, keep yours closed, and raise your thumb so the Cabal know who you are.</li>
   <li>… Cabal, close your eyes. Pretender, thumb down.</li>
   <li>Everyone, open your eyes.</li></ol>
  <p class="note">Council Night is an original game in the hidden-role policy family; names, wording and art are its own.</p></section>`;
}

const card = (cls, icon, name, side, blurb) => `<div class="c ${cls}"><div class="ci">${art('sun', 'crest')}<span class="side">${side}</span>${icon}<b>${name}</b><small>${blurb || ''}</small></div></div>`;
function cardsSheet() {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Reformer', 'SECRET ROLE', 'Pass five Reforms, or remove the Pretender.'));
  for (let i = 0; i < 3; i++) out.push(card('cabal', art('chain'), 'Cabal', 'SECRET ROLE', 'Pass six Decrees, or seat the Pretender as Chancellor.'));
  out.push(card('cabal', art('mask'), 'The Pretender', 'SECRET ROLE', 'Lead the Cabal from the shadows.'));
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Reform', 'PARTY', 'Shown only for an Inquiry.'));
  for (let i = 0; i < 4; i++) out.push(card('cabal', art('chain'), 'Cabal', 'PARTY', 'Shown only for an Inquiry.'));
  for (let i = 0; i < 6; i++) out.push(card('reform', art('torch'), 'Reform', 'POLICY', ''));
  for (let i = 0; i < 11; i++) out.push(card('cabal', art('chain'), 'Decree', 'POLICY', ''));
  for (let i = 0; i < 10; i++) out.push(card('paper', art('aye'), 'Aye', 'VOTE', 'Elect this government.'));
  for (let i = 0; i < 10; i++) out.push(card('ink', art('nay'), 'Nay', 'VOTE', 'Not this government.'));
  out.push(card('paper', art('speaker'), 'The Speaker', 'PLACARD', 'Nominates. Passes left.'));
  out.push(card('paper', art('seal'), 'The Chancellor', 'PLACARD', 'Enacts one of two.'));
  out.push(card('paper', art('table'), 'Council Night', 'REFERENCE', '5 Reforms or the Pretender removed · 6 Decrees or the Pretender elected after 3'));
  const backs = Array.from({ length: 9 }, () => `<div class="c back"><div class="ci">${art('sun')}<b>Council Night</b></div></div>`).join('');
  const pages = [];
  for (let i = 0; i < out.length; i += 9) pages.push(`<section class="sheet cardpage break"><div class="cards">${out.slice(i, i + 9).join('')}</div></section>`);
  pages.push(`<section class="sheet cardpage break"><div class="cards">${backs}</div></section>`);
  pages.unshift(`<section class="sheet ${part !== 'cards' ? 'break' : ''}" id="cards"><h2>Printable cards</h2><p>Print the next pages on card stock and cut on the dashed lines (63 × 88 mm, poker size). Print the last page (backs) as many times as you need and glue or print double-sided. ${out.length} cards: 10 role cards, 10 party cards, 17 policies, 20 votes, the two placards and a reference card. All art is original to Council Night.</p></section>`);
  return pages.join('');
}
document.getElementById('out').innerHTML = (part === 'cards' ? '' : guide()) + (part === 'guide' ? '' : cardsSheet());
document.title = part === 'cards' ? 'Council Night: printable cards' : part === 'guide' ? 'Council Night: card guide' : document.title;
