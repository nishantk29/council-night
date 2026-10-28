// The Gilded Chamber client: routing, the live WebSocket, and every screen. The whole page re-renders on each
// update (same approach as Mafia Night and Quest Night); focus and typed text survive because inputs pause re-renders.
// Table things (chat, log, tools, host dashboard frame) come from table_ui.js.
import { ui } from './ui_icons.js';
import { art, ROLE_ART, POWER_ART } from './art.js';
import { cardArt, ROLE_CARD, PARTY_CARD, POLICY_CARD } from './card_art.js';
import { ROLES, TEAMS, POWERS, POWER_TEXT, roleList, MIN_PLAYERS, MAX_PLAYERS, REFORM_TO_WIN, DECREE_TO_WIN, VETO_AT, PRETENDER_DANGER, TRACKER_MAX, startingDeck } from './rules.js';
import { pruneClosedRooms } from './flair.js';
import { makeTable, askConfirm, faqPage, wireFaqSearch } from './table_ui.js';
import { makeFx } from './fx.js';
import { qrSvg } from './qr.js';
import { toggleFullscreen, revealAfterRelease, TAP_REVEAL_MS, wantsWake, screenKey, motionOk, makeWake, haptic } from './phone.js';
import { FAQ } from './faq.js';
import { rolesInGame, rolesSeats, rolesSheetBody } from './roles_sheet.js';
import { setupComposition, houseEffects } from './steppers.js';
import { openSheet, closeSheets } from './sheets.js';
import { hostNav } from './host-nav.js';
import { errorBody, errorButtons, crashHtml, FATAL, ENDED } from './error-screen.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $html = document.documentElement;
const KEY = 'council';

const S = { mode: 'home', code: null, view: null, fatal: null, conn: true, transport: null,
  ui: { open: {}, flip: false, draft: {}, fresh: {}, tab: 'game', side: 'chat', tally: {} } };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (n) => esc(([...String(n || '').trim()][0] || '?').toUpperCase());
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};
const send = (a) => S.transport?.send(a);
let toastT;
function toast(m) { $toast.textContent = String(m); $toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.remove('on'), 3200); }
// Low-light mode: the same palette on charcoal instead of cream, for dim rooms. Remembered on this device.
const applyDim = () => { $html.dataset.dim = store.get(`${KEY}.dim`) === '1' ? '1' : ''; };
applyDim();

// ---------------------------------------------------------------- render
let pending = false; let lastKey = null; let vtBusy = false;
const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
const wake = makeWake();
// A new screen or step (not every live update) fades in once (opacity only, class removed on animationend).
// Same-screen updates paint directly, so nothing animates twice. Honours reduced motion and the Animations switch.
// A repaint between a tap's pointerdown and the focus it causes would swallow the tap (a text box that "won't focus"),
// so repaints wait while a finger is down on a text field.
let fieldDown = false;
addEventListener('pointerdown', (e) => { if (e.target.closest?.('input,textarea,select,label.field')) fieldDown = true; }, true);
addEventListener('pointerup', () => { if (!fieldDown) return; setTimeout(() => { fieldDown = false; if (pending) render(); }, 350); }, true);
addEventListener('pointercancel', () => { fieldDown = false; }, true);
let toTop = false;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // hash routes must not restore an old offset
function render() {
  if (vtBusy) { pending = true; setTimeout(() => { if (pending) render(); }, 60); return; }
  if (fieldDown) { pending = true; return; }
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio') { pending = true; return; }
  pending = false;
  const key = screenKey(S.mode, S.view); const changed = lastKey !== null && key !== lastKey; lastKey = key;
  if (changed) toTop = true; // a new screen (the deal, a new phase) opens at the top, so a face-down card is in view
  const animate = changed && !document.hidden && motionOk(S.view, reducedMq.matches);
  // New screens slide in like Mafia Night's: the old one slips left, the new one glides in (transform and opacity only).
  if (animate && document.startViewTransition && !vtBusy) {
    vtBusy = true;
    try {
      const vt = document.startViewTransition(() => { paint(); });
      const done = () => { vtBusy = false; };
      vt.finished.then(done, done);
      for (const pr of [vt.ready, vt.updateCallbackDone]) pr.catch(() => {});
      return;
    } catch { vtBusy = false; }
  }
  paint();
  if (animate) {
    $app.classList.add('screen-in');
    $app.addEventListener('animationend', () => $app.classList.remove('screen-in'), { once: true });
  }
}
const TITLES = { home: 'The Gilded Chamber', rules: 'How to Play | The Gilded Chamber', faq: 'Rules & FAQ | The Gilded Chamber', screen: 'Table Screen | The Gilded Chamber' };
function paint() {
  document.title = S.ended ? 'Game ended | The Gilded Chamber' : S.mode === 'play' && S.code ? `Chamber ${S.code} | The Gilded Chamber` : TITLES[S.mode] || 'The Gilded Chamber';
  const y = window.scrollY;
  $html.dataset.phase = S.view?.phase || S.mode;
  $html.dataset.screen = S.mode === 'screen' ? '1' : '';
  $html.classList.toggle('fx-off', S.view?.anim === false); // the host's Animations switch: card flips are skipped too
  try { $app.innerHTML = screen(); } catch (e) { console.error(e); crash(); return; }
  S.ui.fresh = {};
  // Same screen: keep the reader's place. New screen: start at the top (Nishant 2026-10-28: "open to the top", card still hidden).
  window.scrollTo(0, toTop ? 0 : y); toTop = false;
  for (const el of $app.querySelectorAll('[data-scroll]')) el.scrollTop = el.scrollHeight;
  fx.after();
  wake(S.mode !== 'home' && wantsWake(S.view));
  if (S.mode === 'home' && !S.pruned) { S.pruned = true; pruneClosedRooms($app, (c) => { store.del(`${KEY}.player.${c}`); store.del(`${KEY}.host.${c}`); }); }
}
document.addEventListener('focusout', () => { if (pending) setTimeout(render, 50); });
const T = makeTable({ S, send, esc, ui, toast, render });
const fx = makeFx({ S, send, esc });

// The one client error screen: title + short line + the two home buttons. Fixed words only, never raw error text.
const errorScreen = ({ title, line, icon = 'warning' }) => errorBody({ title, line, icon: icon === 'sun' ? art('sun') : ui(icon, 'is-big') });
function crash() {
  try { $html.dataset.phase = 'home'; $app.innerHTML = crashHtml(); } catch { /* nothing more to do */ }
}
const nothingShown = () => !$app.querySelector('main,.layout,.appbar');
addEventListener('error', () => { if (nothingShown()) crash(); });
addEventListener('unhandledrejection', () => { if (nothingShown()) crash(); });

function screen() {
  if (S.ended) return errorScreen({ ...ENDED.host, icon: 'sun' });
  if (S.fatal) return errorScreen(S.fatal);
  if (S.mode === 'home') return home();
  if (S.mode === 'rules') return rulesPage() + siteFooter();
  if (S.mode === 'faq') return faqPage(FAQ, esc, ui, 'Rules & FAQ') + siteFooter();
  const banner = !S.conn ? `<div class="banner${S.connLong ? ' banner-lost' : ''}" role="status">${ui('wifi-off')} Reconnecting… Your seat and role are kept.${S.connLong ? errorButtons() : ''}</div>` : '';
  const v = S.view;
  if (!v) {
    if (S.mode === 'screen' || store.get(`${KEY}.player.${S.code}`) || S.pendingJoin) return banner + `<main class="wrap"><div class="empty">${art('table')}<p>Opening the chamber doors…</p></div></main>`;
    return banner + joinForm();
  }
  if (v.kind === 'screen') return banner + tableScreen(v);
  return banner + appbar(v) + layout(v);
}

// Swipeable scroll-snap row with a peek of the next slide and tappable dots (dots follow the scroll, see the scroll listener).
const carousel = (cls, label, slides) => `<div class="car" role="group" aria-roledescription="carousel" aria-label="${label}">
  <ol class="${cls} car-track" tabindex="0">${slides.map((x, i) => `<li class="car-slide" aria-label="${i + 1} of ${slides.length}">${x}</li>`).join('')}</ol>
  <div class="car-dots">${slides.map((_, i) => `<button type="button" class="car-dot${i ? '' : ' on'}" data-a="slide" data-i="${i}" aria-label="Go to ${i + 1} of ${slides.length}"></button>`).join('')}</div></div>`;
const dimBtn = (label = '') => `<button type="button" class="icon-btn dim-btn${label ? ' has-label' : ''}" data-a="dim" aria-pressed="${$html.dataset.dim === '1'}" aria-label="Low-light mode" title="Low-light mode"><svg class="dim-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path class="moon" d="M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5z"/><g class="lamp"><circle cx="12" cy="12" r="5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" fill="none"/></g></svg>${label}</button>`;

const HUB = 'https://gamenight.hatethespurs.com/';
const hubLink = `<a class="hub-link" href="${HUB}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>All Games</a>`;
const MORE_GAMES = [
  { cls: 'more-mafia', name: 'Mafia Night', href: 'https://mafia.hatethespurs.com', blurb: 'Secret roles for Mafia and Werewolf, dealt to every phone.',
    logo: '<svg viewBox="0 0 48 48"><path d="M8 20c4-8 11-10 16-6 5-4 12-2 16 6-3 12-9 19-16 19S11 32 8 20z" fill="currentColor"/><ellipse cx="17" cy="22" rx="4.4" ry="2.6" fill="#1B1410"/><ellipse cx="31" cy="22" rx="4.4" ry="2.6" fill="#1B1410"/></svg>' },
  { cls: 'more-quest', name: 'Quest Night', href: 'https://avalon.hatethespurs.com', blurb: 'Send parties on quests. Find who sabotaged them.',
    logo: '<svg viewBox="0 0 48 48"><path d="M8 38l4-20 8 8 4-12 4 12 8-8 4 20z" fill="currentColor"/><rect x="8" y="39" width="32" height="4" rx="1.5" fill="currentColor"/></svg>' },
];
const HUB_LOGO = '<svg viewBox="0 0 48 48"><rect x="7" y="7" width="15" height="15" rx="4" fill="currentColor"/><rect x="26" y="7" width="15" height="15" rx="4" fill="currentColor"/><rect x="7" y="26" width="15" height="15" rx="4" fill="currentColor"/><rect x="26" y="26" width="15" height="15" rx="4" fill="currentColor" opacity=".5"/></svg>';

// One footer for every page: the game links, the low-light switch, then the licences tucked behind "Credits".
function siteFooter() {
  return `<footer class="site-foot"><nav aria-label="Game Night games"><a href="${HUB}">All Games</a><a href="https://mafia.hatethespurs.com">Mafia Night</a><a href="https://secrethitler.hatethespurs.com" aria-current="page">The Gilded Chamber</a><a href="https://avalon.hatethespurs.com">Quest Night</a></nav>
    <div class="foot-row">${dimBtn('Low Light')}<details class="credits-box"><summary>Credits</summary><p>Torch, chain, mask, dagger and every board icon drawn for The Gilded Chamber. Interface icons from <a href="https://phosphoricons.com" target="_blank" rel="noopener">Phosphor</a> (MIT). Fonts Rubik and Big Shoulders Display (SIL OFL 1.1).</p></details></div></footer>`;
}
function home() {
  const mine = Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}.player.`)).map((k) => k.slice(KEY.length + 8));
  return `<main class="wrap home">
    <nav class="home-nav" aria-label="Game Night">${hubLink}</nav>
    <header class="home-head"><div class="home-brand"><span class="logo-mark" aria-hidden="true">${art('sun')}</span>
      <div><p class="home-meta">5–10 players · One phone each</p><h1 class="wordmark">The Gilded Chamber</h1></div></div></header>
    <section class="home-hero"><p class="lede">The Loyalists hold the majority, but the Syndicate sits among them, and one of them is the Boss.</p>
      <p class="lede-sub">Elect governments, pass policies, and unmask the Boss before they take power.</p>
      <div class="pile" role="img" aria-label="The policy pile holds 6 Reforms and 11 Decrees"><span class="pile-r"><b>6</b>Reforms</span><span class="pile-d"><b>11</b>Decrees</span></div>
    </section>
    <div class="home-paths">
      <section class="path"><h2 class="path-title">Host</h2>
        <p class="muted">You can play too, or just run the table. Everyone else joins with a 6-letter code.</p>
        <label class="field"><span>Your name</span><input data-i="hostName" maxlength="20" autocomplete="nickname" enterkeyhint="go" value="${esc(S.ui.draft.hostName || store.get(`${KEY}.name`) || '')}"></label>
        <button type="button" class="btn big" data-a="host">Open Chamber</button>
        ${mine.map((c) => `<p class="resume-row" data-room="${esc(c)}"><a class="resume" href="#/play/${esc(c)}">Back to Chamber <b class="code">${esc(c)}</b></a><button type="button" class="resume-x" data-a="forgetRoom" data-v="${esc(c)}" aria-label="Forget chamber ${esc(c)} on this phone">${ui('x')}</button></p>`).join('')}</section>
      <section class="path c-blue"><h2 class="path-title">Join</h2>
        <div class="join-row"><label class="field"><span>Room code</span><input class="code-input" data-i="joinCode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="ABCDEF" value="${esc(S.ui.draft.joinCode || '')}"></label>
        <button type="button" class="btn ghost" data-a="goJoin">Join Room</button></div></section>
      <a class="side" href="#/faq"><span><b>Rules &amp; FAQ</b><small>Roles, powers, house rules and edge cases.</small></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg></a>
      <h2 class="path-title how-title">How to Play</h2>
      <ol class="how" aria-label="How to Play, 4 steps">${[
        '<h3>Roles</h3><p>Everyone gets a secret role. Most are Loyalists; the rest are the Syndicate, and one of them is the Boss.</p>',
        '<h3>Vote</h3><p>Each round the Speaker nominates a Chancellor. A strict majority of Aye votes elects them; a tie fails.</p>',
        '<h3>Pass</h3><p>The Speaker passes two policies to the Chancellor, who enacts one. Some Decrees give a power.</p>',
        '<h3>Win</h3><p>Loyalists win with five Reforms or by executing the Boss. The Syndicate win with six Decrees, or by electing the Boss after three Decrees.</p>'].map((x) => `<li>${x}</li>`).join('')}</ol>
    </div>
    <section class="more-games" aria-labelledby="more-h"><h2 class="block-title" id="more-h">More from Game Night</h2>
      <div class="more-grid">${MORE_GAMES.map((g) => `<a class="more-card ${g.cls}" data-card href="${g.href}"><span class="more-logo" aria-hidden="true">${g.logo}</span><span class="more-text"><b>${g.name}</b><small>${g.blurb}</small></span></a>`).join('')}
        <a class="more-card more-hub" data-card href="${HUB}"><span class="more-logo" aria-hidden="true">${HUB_LOGO}</span><span class="more-text"><b>Game Library</b><small>Every game in one place.</small></span></a></div></section>
    ${siteFooter()}
  </main>`;
}

const powerRow = (n) => POWERS[n].map((p) => (p ? POWER_TEXT[p][0] : '–')).join(' · ');
const CARD_GALLERY = [['loyalistRole', 'Loyalist', 'Most of the table. Knows nothing.'], ['syndicateRole', 'Syndicate', 'Knows the team and the Boss.'], ['bossRole', 'The Boss', 'Wins if elected after three Decrees.'],
  ['reform', 'Reform', 'Five win it for the Loyalists.'], ['decree', 'Decree', 'Six win it for the Syndicate.'], ['loyalistParty', 'Loyalist Party', 'What an Inquiry shows.'], ['syndicateParty', 'Syndicate Party', 'The Boss shows this too.']];
function rulesPage() {
  const rows = Object.keys(TEAMS).map((n) => `<tr><td>${n}</td><td>${TEAMS[n][0]}</td><td>${TEAMS[n][1]} + the Boss</td><td>${powerRow(n)}</td></tr>`).join('');
  return `<main class="wrap game rules">
    <p><a class="link" href="#/">${ui('back')} Home</a> · <a class="link" href="#/faq">FAQ</a></p>
    <section class="stage"><h1 class="phase-title">How to Play</h1>
      <p>Everyone gets a secret role. Most of you are <b class="t-reform">Loyalists</b>. The rest are <b class="t-cabal">the Syndicate</b>, and one of them is <b class="t-cabal">the Boss</b>. The Syndicate know each other and who the Boss is; the Boss only knows the Syndicate in 5–6 player games.</p>
      <p><b>Each round</b> the Speaker role moves one seat left. The Speaker nominates a Chancellor, and everyone still in the game votes <b>Aye</b> or <b>Nay</b>. A strict majority elects them; a tie fails.</p>
      <p><b>Term limits:</b> the last elected Chancellor can’t be nominated, and neither can the last elected Speaker unless only five players are left.</p>
      <p><b>Unrest:</b> each failed election moves the Unrest marker. On the third, the top policy is enacted at once, with no power, and term limits are forgotten. Unrest resets whenever any policy is enacted.</p>
      <p><b>Passing a law:</b> the Speaker draws three policies, secretly discards one and passes two to the Chancellor, who discards one and enacts the other. The policy pile holds 6 Reforms and 11 Decrees. When fewer than three remain, the discards are shuffled back in.</p>
      <p><b>Powers:</b> some Decrees give the Speaker a power (below). After five Decrees, the Chancellor may propose a <b>veto</b>: if the Speaker agrees, both policies are discarded and Unrest moves on.</p>
      <p><b>Winning:</b> the Loyalists win with five Reforms, or by executing the Boss. The Syndicate win with six Decrees, or if the Boss is elected Chancellor once three Decrees are on the board.</p>
    </section>
    <section class="stage cards-gallery"><h2 class="block-title">The Cards</h2>
      <p class="muted">Swipe to see every card used in Phones mode.</p>
      ${carousel('cards', 'The cards, swipe to browse', CARD_GALLERY.map(([k, t, d]) => `<figure class="gal-card">${cardArt(k)}<figcaption><b>${t}</b>${d}</figcaption></figure>`))}</section>
    <section class="stage"><h2 class="block-title">Table Sizes and Powers</h2>
      <div class="table-scroll"><table class="sizes"><thead><tr><th>Players</th><th>Loyalists</th><th>Syndicate</th><th>Decrees 1–5</th></tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="tips">${Object.entries(POWER_TEXT).map(([k, [t, d]]) => `<li>${art(POWER_ART[k])} <b>${t}.</b> ${esc(d)}</li>`).join('')}</ul></section>
  </main>`;
}

function joinForm() {
  return `<main class="wrap join"><h1 class="phase-title">Join Chamber <span class="code">${esc(S.code)}</span></h1>
    <label class="field"><span>Your name</span><input data-i="joinName" maxlength="20" autocomplete="nickname" enterkeyhint="go" value="${esc(S.ui.draft.joinName || store.get(`${KEY}.name`) || '')}"></label>
    <div class="sticky-act"><button type="button" class="btn big" data-a="join">Take Seat</button></div>
    <p class="muted" style="margin-top:var(--s4)">If the game has started you’ll watch, unless the host opened a seat for you. <a href="#/">Back</a></p></main>`;
}

const PHASE = { lobby: ['Gathering', 'table'], reveal: ['Secret Roles', 'cards'], nominate: ['Nomination', 'gavel'], vote: ['Election', 'hand'],
  check: ['A Question', 'question'], legislate: ['Session', 'rules'], chaos: ['Unrest', 'warning'], power: ['Power', 'sparkle'], over: ['Game Over', 'trophy'] };
function appbar(v) {
  const [label, icon] = PHASE[v.phase] || ['', 'game'];
  return `<header class="appbar"><a class="appbar-mark" href="#/" aria-label="Home">${art('torch')}</a>
    <div class="appbar-title"><span class="ab-word">Chamber </span><span class="code">${esc(v.code)}</span></div>
    ${T.timerChip(v)}${dimBtn()}<span class="phase-badge">${ui(icon)}${label}</span></header>`;
}

const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name || '?';
const names = (v, ids) => ids.map((id) => esc(nameOf(v, id))).join(', ');
const isPhys = (v, id) => v.mode.play === 'physical' || !!v.players.find((p) => p.id === id)?.phoneless;

function layout(v) {
  const tab = S.ui.tab;
  const main = v.phase === 'lobby' ? lobby(v) : gameMain(v);
  const sideTabs = [['chat', 'Chat'], ['tools', 'Tools'], ...(v.me?.host ? [['host', 'Host']] : [])];
  const sideKey = ['chat', 'tools', 'host'].includes(tab) ? tab : S.ui.side;
  const side = sideKey === 'tools' ? T.toolsPane(v) : sideKey === 'host' ? hostPane(v) : T.chatPane(v);
  return `<div class="layout" data-tab="${tab}">
    <main class="col col-main wrap game" data-pane="game">${v.paused ? `<p class="note is-warn">${ui('pause')} The host paused the game.</p>` : ''}${main}</main>
    <aside class="col col-log" data-pane="log">${T.logPane(v, v.game ? chronicle(v) : '')}</aside>
    <aside class="col col-side" data-pane="side"><div class="seg side-seg" role="tablist">${sideTabs.map(([k, l]) => `<button type="button" role="tab" data-a="side" data-v="${k}" aria-selected="${sideKey === k}">${l}</button>`).join('')}</div>${side}</aside>
  </div>${T.tabbar(v)}`;
}

function gameMain(v) {
  if (v.me?.watch && !v.me.host) return [board(v), roundTable(v), `<section class="stage"><p class="say">You are watching this game. You’ll see what the whole table sees.</p></section>`, lastReveals(v)].join('');
  // When it's this player's move, the action comes first so it's on screen without scrolling (phones).
  const stg = stage(v) + dock(v);
  return (myMove(v) ? [stg, board(v), roundTable(v), lastReveals(v), myCardBlock(v)] : [board(v), roundTable(v), stg, lastReveals(v), myCardBlock(v)]).join('');
}
function myMove(v) {
  const g = v.game; const me = v.me; if (!g || !me) return false;
  if (v.phase === 'reveal') return !!me.role && !g.ready.includes(me.id);
  if (v.phase === 'vote') return v.mode.votes === 'app' && !('vote' in me) && (g.alive.includes(me.id) || g.exiled.includes(me.id));
  if (v.phase === 'legislate') return !!me.hand || (g.leg === 'veto' && g.speaker === me.id) || (!g.cardsApp && me.host);
  if (v.phase === 'power') return g.power === 'peek' && g.speaker === me.id;
  return ['check', 'chaos'].includes(v.phase) && me.host;
}

// ---------------------------------------------------------------- lobby (the setup part of the host dashboard)
const MODES = [['phone', 'Phones mode', 'Every player uses their own phone. Works for online play too.'],
  ['hybrid', 'Hybrid', 'Choose below, for each piece, whether the table handles it out loud or the app does.'],
  ['physical', 'Host-only mode', 'The table handles everything out loud. This phone is the board, the tracker and the Host.']];
const PIECE_TEXT = { roles: ['Secret Roles', 'role'], votes: ['Aye/Nay Votes', 'vote'], cards: ['Policy Tiles', 'policy'] };
const HOUSE = [
  ['rebalance', 'Rebalanced Tables', 'Community variant: at 6 players one Decree starts on the board; at 7 one Decree, and at 9 two Decrees, are left out of the policy pile.'],
  ['exile', 'Exile Instead of Execution', 'Removed players stay at the table and still vote, but can’t hold office or be nominated. Exiling the Boss still wins for the Loyalists.'],
  ['anonVotes', 'Anonymous Votes', 'Show only the count of Ayes and Nays, not who voted how.'],
  ['noClaims', 'No-Claims Mode', 'Turns off posting claims in the chat. Claims are made out loud.'],
  ['sitOut', 'Host Sits Out', 'The host doesn’t get a role and sees the whole deal on their own phone.'],
];
function lobby(v) {
  const me = v.me; const seatedP = v.players.filter((p) => !p.watch); const n = seatedP.length; const host = me.host;
  const link = `${location.origin}/#/play/${v.code}`;
  const comp = setupComposition(n);
  const status = comp.error ? `<p class="note is-warn" role="alert">${ui(n > MAX_PLAYERS ? 'warning' : 'info')} ${esc(comp.error)}</p>` : `<p class="note">${ui('check')} ${esc(comp.summary)}.</p>`;
  const seats = v.players.map((p, i) => `<li><span class="n">${p.watch ? '–' : i + 1}</span><span class="dot ${p.online || p.phoneless ? 'on' : ''}" title="${p.phoneless ? 'No phone' : p.online ? 'Connected' : 'Not connected'}"></span>
      <span class="who">${esc(p.name)}${p.host ? ' <small class="muted">Host</small>' : ''}${p.watch ? ' <small class="muted">Sitting Out</small>' : ''}${p.phoneless ? ' <small class="muted">No Phone</small>' : ''}${p.id === me.id ? ' <small class="muted">You</small>' : ''}</span>
      ${host ? `<button class="icon-btn" data-a="move" data-id="${p.id}" data-dir="up" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}>${ui('caret-down', 'flip-up')}</button>
      <button class="icon-btn" data-a="move" data-id="${p.id}" data-dir="down" aria-label="Move ${esc(p.name)} down" ${i === v.players.length - 1 ? 'disabled' : ''}>${ui('caret-down')}</button>
      ${p.host ? '' : `<button class="icon-btn" data-a="kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ui('x')}</button>`}` : ''}</li>`).join('');
  const m = v.mode;
  const modes = MODES.map(([k, t, d]) => `<label class="toggle radio ${m.play === k ? 'is-on' : ''}"><input type="radio" name="play" data-a="modeSet" data-k="play" value="${k}" ${m.play === k ? 'checked' : ''} ${host ? '' : 'disabled'}><span><b>${t}</b><span class="muted">${d}</span></span></label>`).join('');
  const pieces = m.play === 'hybrid' ? `<div class="pieces">${Object.entries(PIECE_TEXT).map(([k, [t]]) => `<div class="piece"><span>${t}</span><span class="seg mini">${['app', 'physical'].map((x) => `<button type="button" data-a="piece" data-k="${k}" data-v="${x}" aria-pressed="${m[k] === x}" ${host ? '' : 'disabled'}>${x === 'app' ? 'In the app' : 'At the table'}</button>`).join('')}</span></div>`).join('')}</div>` : '';
  const fx = Object.fromEntries(houseEffects(n, v.house).map((h) => [h.key, h.effect]));
  const house = HOUSE.map(([k, t, d]) => `<label class="toggle ${v.house[k] ? 'is-on' : ''}"><input type="checkbox" data-a="houseSet" data-k="${k}" ${v.house[k] ? 'checked' : ''} ${host ? '' : 'disabled'}><span><b>${t}</b><span class="muted">${fx[k] ? esc(fx[k]) : d}</span></span></label>`).join('');
  const sel = (k, opts2) => `<select data-a="houseSel" data-k="${k}" ${host ? '' : 'disabled'}>${opts2.map(([val, l]) => `<option value="${val}" ${String(v.house[k]) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<section class="join-code"><p class="muted">Room code</p><p class="room-code">${esc(v.code)}</p>
      <button type="button" class="qr-tap" data-a="qrFull" data-link="${esc(link)}" data-code="${esc(v.code)}" aria-label="Show the join QR code full screen">${qrSvg(link, `QR code to join room ${v.code}`)}<span>Scan to join. Tap for full screen.</span></button>
      <p class="muted join-link">${esc(link)}</p>
      <div class="btn-row"><button class="btn ghost" data-a="copy" data-link="${esc(link)}">${ui('copy')} Copy Invite Link</button>
      ${navigator.share ? `<button class="btn ghost" data-a="share" data-link="${esc(link)}">Share</button>` : ''}</div>
      <p class="muted"><a href="#/rules">How to Play</a> · <a href="#/faq">FAQ</a></p></section>
    <section class="stage"><h2 class="block-title">At the Table (${n})</h2>
      <p class="muted">Seat order is the order the Speaker role travels. ${host ? 'Match it to how you are sitting.' : ''}</p>
      <ul class="seat-list">${seats}</ul>${status}
      ${host ? `<div class="add-seat"><label class="field"><span>Add a seat without a phone</span><input data-i="seatName" maxlength="20" placeholder="Name" enterkeyhint="done" value="${esc(S.ui.draft.seatName || '')}"></label><button class="btn ghost" data-a="addSeat">Add</button></div>
      <div class="btn-row"><button class="btn ghost" data-a="shuffleSeats">${ui('shuffle')} Shuffle Seats</button></div>` : ''}</section>
    <section class="stage"><h2 class="block-title">The Setup</h2>${compositionHtml(comp)}${n >= 5 && n <= 10 ? balanceTips(n, v.house) : ''}
      <div class="btn-row"><button type="button" class="btn ghost" data-a="roles">Roles in this game</button></div></section>
    <section class="stage"><h2 class="block-title">How You’re Playing</h2><div class="settings">${modes}</div>${pieces}
      ${m.play !== 'phone' ? `<p class="muted">Anything handled at the table is entered by the host, who never sees a secret.</p>` : ''}</section>
    <section class="stage"><h2 class="block-title">House Rules</h2><p class="muted">All off unless the host turns them on. Otherwise the rules are exactly the classic game.</p>
      <div class="settings">${house}
      <label class="toggle"><span><b>Phase Timer</b><span class="muted">A countdown starts each phase. Nothing happens at zero; the host decides.</span></span>${sel('turnTimer', [[0, 'Off'], [60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min'], [300, '5 min']])}</label>
      <label class="toggle"><span><b>Vote Reveal Delay</b><span class="muted">A short drumroll before the votes are shown.</span></span>${sel('revealDelay', [[0, 'Off'], [3, '3 sec'], [5, '5 sec']])}</label>
      <label class="toggle"><span><b>First Speaker</b><span class="muted">Who holds the gavel first.</span></span>${sel('firstLeader', [['random', 'Random'], ['host', 'The host']])}</label></div></section>
    ${host ? `<div class="sticky-act">${comp.error ? `<p class="note is-warn start-why">${esc(comp.error)}</p>` : ''}<button class="btn big ${comp.ok ? '' : 'disabled'}" data-a="start" ${comp.ok ? '' : `aria-disabled="true" data-why="${esc(comp.error)}"`}>${m.roles === 'app' ? 'Deal Roles' : 'Start Game'}</button></div>`
    : '<div class="empty">Waiting for the host to start…</div>'}`;
}

// The composition, in the stepper look but read-only: Gilded's teams are fixed by table size.
function compositionHtml(c) {
  const row = (r) => `<div class="step-row is-fill a-${r.side}"><span class="rs-ico">${art(r.icon)}</span><span class="step-text"><b>${esc(r.label)}</b><small>${esc(r.blurb)}</small></span>
      <span class="step-ctl"><button type="button" class="icon-btn" disabled aria-label="${esc(r.label)}: ${esc(c.reason)}">${ui('minus')}</button><b data-roll="comp-${r.id}">${r.count}</b><button type="button" class="icon-btn" disabled aria-label="${esc(r.label)}: ${esc(c.reason)}">${ui('plus')}</button></span></div>`;
  return `<p class="muted">${esc(c.summary)}.</p><div class="steppers">${c.rows.map(row).join('')}</div>
    <p class="step-why" role="note">Powers when a Decree passes: ${c.powers.map((p) => `<span class="pw-chip">${p.slot} ${esc(p.label)}</span>`).join(' ')}</p>`;
}

function balanceTips(n, house) {
  const tips = [];
  if ([6, 7, 9].includes(n) && !house.rebalance) tips.push(`At ${n} players the classic game leans towards the Syndicate. The Rebalanced Tables house rule evens it out.`);
  if (n <= 6) tips.push('At 5 or 6 the Boss knows the Syndicate, and the third Decree lets the Speaker peek at the docket.');
  if (n >= 9) tips.push('At 9 or 10 the very first Decree gives an Inquiry: the Loyalists get information early.');
  if (house.exile) tips.push('Exile keeps everyone voting: good for groups where nobody likes to sit out.');
  return tips.length ? `<ul class="tips">${tips.map((t) => `<li>${ui('info')} ${esc(t)}</li>`).join('')}</ul>` : '';
}

// ---------------------------------------------------------------- the board
function board(v) {
  const g = v.game;
  const rs = Array.from({ length: REFORM_TO_WIN }, (_, i) => `<div class="slot ${i < g.reform ? 'is-reform' : ''}" aria-label="Reform ${i + 1}${i < g.reform ? ', passed' : ''}">${i < g.reform ? art('torch') : i === REFORM_TO_WIN - 1 ? `<small>Win</small>` : ''}</div>`).join('');
  const ds = Array.from({ length: DECREE_TO_WIN }, (_, i) => {
    const p = g.powers[i]; const on = i < g.decree;
    const mark = on ? art('chain') : i === DECREE_TO_WIN - 1 ? '<small>Win</small>' : p ? `<span class="slot-power" title="${esc(POWER_TEXT[p][0])}">${art(POWER_ART[p])}<small>${esc(POWER_TEXT[p][0])}</small></span>` : '';
    return `<div class="slot ${on ? 'is-decree' : ''} ${i === PRETENDER_DANGER - 1 && !on ? 'is-danger' : ''}" aria-label="Decree ${i + 1}${on ? ', passed' : p ? `, ${POWER_TEXT[p][0]}` : ''}">${mark}</div>`;
  }).join('');
  const pips = Array.from({ length: TRACKER_MAX }, (_, i) => `<i class="${i < g.tracker ? 'on' : ''} ${i === TRACKER_MAX - 1 ? 'last' : ''}"></i>`).join('');
  return `<section class="boards" aria-label="The board">
    <div class="board a-reform"><h2 class="board-h">${art('torch')} Reforms <b data-roll="reform">${g.reform}/${REFORM_TO_WIN}</b></h2><div class="slots five">${rs}</div></div>
    <div class="board a-cabal"><h2 class="board-h">${art('chain')} Decrees <b data-roll="decree">${g.decree}/${DECREE_TO_WIN}</b></h2><div class="slots six">${ds}</div>
      <p class="board-note">${g.decree >= PRETENDER_DANGER ? 'Three Decrees: electing the Boss as Chancellor wins for the Syndicate.' : 'From the third Decree, the Boss must not be elected Chancellor.'}${g.vetoOn ? ' Veto is unlocked.' : ''}</p></div>
    <div class="board-foot"><div class="stat"><span class="lbl" title="Unrest">${art('unrest')} Unrest</span><b class="num" data-roll="tracker">${g.tracker}/${TRACKER_MAX}</b><span class="rejects">${pips}</span></div>
      <div class="stat"><span class="lbl">Draw Pile</span><b class="num" data-roll="pile">${g.pile}</b></div>
      <div class="stat"><span class="lbl">Discards</span><b class="num" data-roll="discards">${g.discards}</b></div></div>
    ${g.reshuffleNow && !g.cardsApp ? `<p class="note is-warn">${ui('shuffle')} Fewer than three policies left: shuffle the discards into the draw pile.</p>` : ''}
  </section>`;
}

function marksFor(v) {
  const g = v.game; const m = {};
  const looking = isOpen('role'); // what you know shows only while the role card is open, like the role itself
  for (const k of looking ? v.me?.sees || [] : []) m[k.id] = k.tag === 'pretender' ? ['is-cabal', art('mask'), 'The Boss'] : ['is-cabal', art('chain'), 'Syndicate'];
  for (const k of looking ? v.me?.inquiries || [] : []) m[k.id] = k.party === 'cabal' ? ['is-cabal', art('lens'), 'Inquiry: Syndicate'] : ['is-reform', art('lens'), 'Inquiry: Loyalist'];
  if (v.moderator) for (const [id, r] of Object.entries(v.moderator.roles)) m[id] = [r.side === 'cabal' ? 'is-cabal' : 'is-reform', art(ROLE_ART[r.id]), r.name];
  for (const id of g.confirmedNot) if (!m[id]) m[id] = ['is-done', ui('check'), 'Not the Boss'];
  if (v.phase === 'vote') for (const id of g.voted) m[id] = ['is-done', ui('check'), 'Has voted'];
  if (v.phase === 'reveal') for (const id of g.ready) m[id] = ['is-done', ui('check'), 'Ready'];
  if (v.phase === 'over' && g.roles) for (const [id, r] of Object.entries(g.roles)) m[id] = [r.side === 'cabal' ? 'is-cabal' : 'is-reform', art(ROLE_ART[r.id]), r.name];
  return m;
}

function targeting(v) {
  const g = v.game; const me = v.me; if (!me) return null;
  const host = me.host;
  const forSpeaker = g.speaker === me.id || (host && isPhys(v, g.speaker));
  if (v.phase === 'nominate' && forSpeaker) return { act: 'nominate', ok: (id) => g.alive.includes(id) && id !== g.speaker && !g.ineligible.includes(id) };
  if (v.phase === 'power' && forSpeaker && g.power !== 'peek') return { act: 'power', ok: (id) => g.alive.includes(id) && id !== g.speaker && !(g.power === 'investigate' && g.investigated.includes(id)) && !(g.power === 'special' && g.exiled.includes(id)) };
  if (v.phase === 'vote' && v.mode.votes === 'physical' && host) return { act: 'tallyToggle', ok: (id) => g.alive.includes(id) || g.exiled.includes(id) };
  return null;
}

function roundTable(v) {
  const g = v.game; const seats = v.players.filter((p) => g.order.includes(p.id)); const n = seats.length;
  const meIdx = Math.max(0, seats.findIndex((p) => p.id === v.me?.id));
  const marks = marksFor(v); const tgt = targeting(v);
  const seatEls = seats.map((p, i) => {
    const ang = Math.PI / 2 + ((i - meIdx) * 2 * Math.PI) / n;
    const x = 50 + 41 * Math.cos(ang); const y = 50 + 41 * Math.sin(ang);
    const out = g.dead.includes(p.id); const exiled = g.exiled.includes(p.id);
    const can = tgt && tgt.ok(p.id);
    const yes = tgt?.act === 'tallyToggle' && S.ui.tally[p.id];
    const picked = (tgt?.act === 'nominate' && S.ui.nominee === p.id) || (tgt?.act === 'power' && S.ui.target === p.id);
    const mk = tgt?.act === 'tallyToggle' && can ? (yes ? ['is-reform', art('aye'), 'Aye'] : ['is-cabal', art('nay'), 'Nay']) : marks[p.id];
    const sp = g.speaker === p.id && v.phase !== 'over'; const ch = g.nominee === p.id && ['vote', 'legislate', 'check'].includes(v.phase);
    const limited = g.ineligible.includes(p.id) && p.id !== g.speaker && !out;
    const tag = can ? 'button' : 'div';
    const label = `${p.name}${sp ? ', Speaker' : ''}${ch ? ', Chancellor nominee' : ''}${out ? (exiled ? ', exiled' : ', executed') : ''}${limited ? ', term-limited' : ''}${mk ? `, ${mk[2]}` : ''}`;
    return `<${tag} class="knight ${p.id === v.me?.id ? 'is-me' : ''} ${ch ? 'on-team' : ''} ${can ? 'can-pick' : ''} ${picked ? 'is-picked' : ''} ${out ? 'is-out' : ''} ${p.online || p.phoneless ? '' : 'is-off'}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%"
      ${can ? `type="button" data-a="${tgt.act}" data-id="${p.id}" aria-pressed="${!!(yes || picked)}"` : ''} aria-label="${esc(label)}">
      <span class="knight-disc">${out ? art(exiled ? 'nay' : 'dagger') : initial(p.name)}${sp ? `<span class="knight-crown" title="Speaker">${art('speaker')}</span>` : ''}${ch ? `<span class="knight-lantern" title="Chancellor">${art('seal')}</span>` : ''}${mk ? `<span class="knight-mark ${mk[0]}" title="${esc(mk[2])}">${mk[1]}</span>` : ''}</span>
      <span class="knight-name">${esc(p.name)}${limited ? ' <small class="term">term limit</small>' : ''}</span></${tag}>`;
  }).join('');
  let felt = '';
  if (v.phase === 'nominate') felt = `<b>${esc(nameOf(v, g.speaker))}</b> holds the gavel${g.special ? ' (snap election)' : ''}.<br>Nominate a Chancellor.`;
  else if (v.phase === 'vote') felt = `<b>${esc(nameOf(v, g.speaker))}</b> and <b>${esc(nameOf(v, g.nominee))}</b>?<br>${v.mode.votes === 'app' ? `${g.voted.length} of ${g.alive.length + g.exiled.length} have voted` : 'Vote at the table'}`;
  else if (v.phase === 'legislate') felt = g.leg === 'speaker' ? `The Speaker reads three policies…` : g.leg === 'veto' ? 'A veto is proposed.' : 'The Chancellor chooses…';
  else if (v.phase === 'reveal') felt = g.appRoles ? `${g.ready.length} of ${n} have read their role` : 'Look at your role';
  else if (v.phase === 'power') felt = `<b>${esc(nameOf(v, g.speaker))}</b>: ${esc(POWER_TEXT[g.power][0])}`;
  else if (v.phase === 'check') felt = 'The chamber holds its breath.';
  else if (v.phase === 'chaos') felt = 'Unrest. Turn over the top policy.';
  else if (v.phase === 'over') felt = g.winner === 'reform' ? 'The Loyalists hold the chamber.' : 'The Syndicate takes the chamber.';
  return `<section class="round" aria-label="The table"><div class="round-felt">${art('table')}<p>${felt}</p></div>${seatEls}</section>`;
}

// ---- Phones mode privacy: a secret (role, hand, docket) is drawn only while it is open. Closed, every player sees the
// same blurred card back, so a glance at someone's phone shows nothing. Press and hold to look; a quick tap peeks for a few seconds.
const isOpen = (k) => !!S.ui.open[k];
const holdChip = '<span class="hold-chip">Hold to Reveal</span>';
const hiddenCards = (n) => Array.from({ length: n }, () => `<span class="dc">${cardArt('back')}</span>`).join('');
// Policy cards the player may choose from: real cards while open, blurred backs while closed.
const secretTiles = (k, items, build) => isOpen(k)
  ? `<div class="tiles">${items.map(build).join('')}</div><button type="button" class="btn ghost sm hold" data-a="reveal" data-k="${k}">Hide Cards</button>`
  : `<button type="button" class="tiles hold is-hidden" data-a="reveal" data-k="${k}" aria-label="Reveal your cards. Press and hold, or tap to peek.">${hiddenCards(items.length)}${holdChip}</button><p class="muted center">Hold to look. A quick tap shows them for ${TAP_REVEAL_MS / 1000} seconds.</p>`;
const holdState = { key: null, t0: 0 }; const hideT = {};
function setOpen(k, on) {
  if (isOpen(k) === on) return;
  S.ui.open[k] = on; clearTimeout(hideT[k]); render();
}
function closeAll() { for (const k of Object.keys(S.ui.open)) { clearTimeout(hideT[k]); S.ui.open[k] = false; } if (S.view) render(); }
function holdEnd(cancelled) {
  const k = holdState.key; if (!k) return;
  holdState.key = null; S.ui.noClickUntil = Date.now() + 450;
  const ms = cancelled ? 0 : revealAfterRelease(performance.now() - holdState.t0);
  if (ms === 0) setOpen(k, false); else hideT[k] = setTimeout(() => setOpen(k, false), ms);
}
addEventListener('pointerup', () => holdEnd(false)); addEventListener('pointercancel', () => holdEnd(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) closeAll(); });
addEventListener('pagehide', () => { for (const k of Object.keys(S.ui.open)) S.ui.open[k] = false; });
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.hold')) e.preventDefault(); });

// Designed policy card (app mode). `extra` 'flip' gives the short 3D turn-over (off for reduced motion / the fx-off switch); only given to cards that are public, never to a secret hand.
const tile = (p, extra = '') => `<span class="dc ${extra}">${cardArt(POLICY_CARD[p])}</span>`;
const mini = (kind, extra = '') => `<span class="mini ${extra}">${cardArt(kind)}</span>`;
const placards = (sp, ch) => `<div class="placards"><figure>${mini('speaker')}<figcaption>${sp}</figcaption></figure><figure>${mini('chancellor')}<figcaption>${ch}</figcaption></figure></div>`;
// The big button at the bottom of a phone that has to choose for the table: greyed while a choice is missing (the label
// names it), and for the Host a skip chip that takes the neutral way on. All of it comes from host-nav.js.
const pickUi = () => ({ nominee: S.ui.nominee, target: S.ui.target, tally: S.ui.tally, card: S.ui.card, policy: S.ui.policy, answer: S.ui.answer, veto: S.ui.veto });
const clearPicks = () => { for (const k of ['nominee', 'target', 'card', 'policy', 'answer', 'veto']) S.ui[k] = null; S.ui.tally = {}; };
function dock(v) {
  if (v.phase === 'reveal' || !v.game || !v.me) return '';
  const nav = hostNav(v, pickUi()); if (!nav) return '';
  return `<div class="sticky-act dock"><button type="button" class="btn big" data-a="dockSend" ${nav.disabled ? 'aria-disabled="true"' : ''}>${esc(nav.label)}</button>
    ${nav.skip ? `<button type="button" class="btn ghost dock-skip" data-a="dockSkip">${esc(nav.skip.label)}</button>` : ''}</div>`;
}
function stage(v) {
  const g = v.game; const me = v.me; const host = me.host;
  const say = (t) => `<p class="say">${t}</p>`;
  const S2 = esc(nameOf(v, g.speaker)); const C2 = esc(nameOf(v, g.nominee));
  const unrestWarn = g.tracker === TRACKER_MAX - 1 ? `<p class="note is-out">${ui('warning')} Two failed governments in a row. If this one fails too, the top policy is enacted.</p>` : '';
  if (v.phase === 'reveal') {
    if (!g.appRoles || !me.role) return `<section class="stage"><h1 class="phase-title">Secret Roles</h1>${say(g.appRoles ? 'The players are reading their roles.' : 'Everyone checks their own role. The host reads the eyes-closed script from the Host tab.')}</section>
      ${host ? '<div class="sticky-act"><button class="btn big" data-a="skipReveal">Begin Game</button></div>' : ''}`;
    const ready = g.ready.includes(me.id);
    return `<section class="stage reveal-stage"><h1 class="phase-title">Your Secret Role</h1>
      ${say('Shield your screen. Hold the card to look, then let go to hide it again.')}
      ${cardView(v)}
      ${ready ? '<p class="muted center">Waiting for the others…</p>' : ''}
      ${host && ready ? '<button class="btn ghost" data-a="skipReveal">Begin Now</button>' : ''}</section>
      ${ready ? '' : '<div class="sticky-act"><button class="btn big" data-a="ready">I’m Ready</button></div>'}`;
  }
  if (v.phase === 'nominate') {
    const mine = g.speaker === me.id; const forS = !mine && host && isPhys(v, g.speaker);
    if (!mine && !forS) return `<section class="stage"><h1 class="phase-title">${S2} Is Nominating</h1>${say('Make your case out loud. Term-limited players are marked at the table.')}${unrestWarn}</section>`;
    return `<section class="stage"><h1 class="phase-title">${forS ? `Enter ${S2}’s Nominee` : 'You Hold the Gavel'}</h1>
      ${say(forS ? `Tap the player ${S2} nominates as Chancellor.` : 'Tap a player at the table to nominate them as Chancellor. Term-limited players can’t be chosen.')}${unrestWarn}
      ${g.decree >= PRETENDER_DANGER ? `<p class="note is-out">${art('mask')} Three Decrees are down: if the Boss is elected Chancellor, the Syndicate wins.</p>` : ''}</section>`;
  }
  if (v.phase === 'vote') {
    const head = `<h1 class="phase-title">Elect This Government?</h1>${say(`Speaker <b>${S2}</b>, Chancellor <b>${C2}</b>.`)}${placards(S2, C2)}${unrestWarn}`;
    const nVoters = g.alive.length + g.exiled.length;
    if (v.mode.votes === 'physical') {
      if (!host) return `<section class="stage">${head}<p class="note">${ui('hand')} Vote at the table. On three, everyone shows Aye or Nay.</p></section>`;
      return `<section class="stage">${head}<p class="note">${ui('hand')} Tap everyone who voted <b>Aye</b> at the table above, then confirm.</p></section>`;
    }
    if (me.watch || me.out && !g.exiled.includes(me.id)) return `<section class="stage">${head}</section>`;
    const voted = 'vote' in me;
    return `<section class="stage">${head}
      ${voted ? `<p class="note">${ui('check')} You voted ${me.vote ? 'Aye' : 'Nay'}. Votes are shown when everyone is in.</p>`
    : `<div class="choice-pair"><button class="choice ballot yes" data-a="vote" data-v="1" aria-label="Vote Aye">${cardArt('aye')}</button><button class="choice ballot no" data-a="vote" data-v="0" aria-label="Vote Nay">${cardArt('nay')}</button></div>`}</section>`;
  }
  if (v.phase === 'check') {
    const c = g.check;
    const q = c.kind === 'chancellor' ? `Three Decrees are down. ${esc(nameOf(v, c.id))}, are you the Boss? Answer truthfully: say “Yes” only if you are; otherwise say “No”.` : `${esc(nameOf(v, c.id))} is ${v.house.exile ? 'exiled' : 'executed'}. Were they the Boss? Only say whether they were.`;
    return `<section class="stage"><h1 class="phase-title">The Question</h1>${say(q)}
      ${host ? `<div class="choice-pair"><button class="choice no ${S.ui.answer === true ? 'is-picked' : ''}" data-a="pickAnswer" data-v="1" aria-pressed="${S.ui.answer === true}">Yes, the Boss</button><button class="choice yes ${S.ui.answer === false ? 'is-picked' : ''}" data-a="pickAnswer" data-v="0" aria-pressed="${S.ui.answer === false}">No</button></div>` : ''}</section>`;
  }
  if (v.phase === 'legislate') {
    if (!g.cardsApp) {
      const head = `<h1 class="phase-title">The Session</h1>${say(`${S2} draws the top three policies, discards one face down and passes two to ${C2}, who enacts one. No talking.`)}`;
      if (!host) return `<section class="stage">${head}</section>`;
      return `<section class="stage">${head}<p class="note">Which policy did ${C2} turn face up?</p>
        <div class="choice-pair"><button class="choice ballot reform ${S.ui.policy === 'R' ? 'is-picked' : ''}" data-a="pickPolicy" data-v="R" aria-pressed="${S.ui.policy === 'R'}" aria-label="Reform">${cardArt('reform')}</button><button class="choice ballot decree ${S.ui.policy === 'D' ? 'is-picked' : ''}" data-a="pickPolicy" data-v="D" aria-pressed="${S.ui.policy === 'D'}" aria-label="Decree">${cardArt('decree')}</button></div>
        ${g.vetoOn ? '<button class="btn ghost" data-a="hostVeto">Confirm Veto</button>' : ''}</section>`;
    }
    const hand = me.hand || [];
    if (g.leg === 'speaker' && g.speaker === me.id) return `<section class="stage"><h1 class="phase-title">Discard One</h1>${say(`Tap the policy to <b>discard</b>. The other two go to ${C2}. Nobody else sees these.`)}
      ${secretTiles('hand', hand, (p, i) => `<button type="button" class="tile-btn ${S.ui.card === i ? 'is-picked' : ''}" data-a="pickCard" data-v="${i}" aria-pressed="${S.ui.card === i}" aria-label="Discard this ${p === 'R' ? 'Reform' : 'Decree'}">${tile(p)}</button>`)}</section>`;
    if (g.leg === 'chancellor' && g.nominee === me.id) return `<section class="stage"><h1 class="phase-title">Enact One</h1>${say('Tap the policy to <b>enact</b>. The other is discarded face down.')}
      ${secretTiles('hand', hand, (p, i) => `<button type="button" class="tile-btn ${S.ui.card === i ? 'is-picked' : ''}" data-a="pickCard" data-v="${i}" aria-pressed="${S.ui.card === i}" aria-label="Enact this ${p === 'R' ? 'Reform' : 'Decree'}">${tile(p)}</button>`)}
      ${g.vetoOn && !g.vetoRefused ? '<button class="btn ghost" data-a="veto">Propose Veto</button>' : g.vetoRefused ? '<p class="muted">The Speaker refused the veto. You must enact one.</p>' : ''}</section>`;
    if (g.leg === 'veto' && g.speaker === me.id) return `<section class="stage"><h1 class="phase-title">Veto?</h1>${say(`${C2} wants to veto this agenda. If you agree, both policies are discarded and Unrest moves one step.`)}
      <div class="choice-pair"><button class="choice yes ${S.ui.veto === true ? 'is-picked' : ''}" data-a="pickVeto" data-v="1" aria-pressed="${S.ui.veto === true}">${art('aye')}Agree</button><button class="choice no ${S.ui.veto === false ? 'is-picked' : ''}" data-a="pickVeto" data-v="0" aria-pressed="${S.ui.veto === false}">${art('nay')}Refuse</button></div></section>`;
    return `<section class="stage"><h1 class="phase-title">In Session</h1>${say(g.leg === 'speaker' ? `${S2} is choosing a policy to discard.` : g.leg === 'veto' ? `${C2} proposed a veto. ${S2} decides.` : `${C2} is choosing a policy to enact.`)}</section>`;
  }
  if (v.phase === 'chaos') return `<section class="stage"><h1 class="phase-title">Unrest</h1>${say('Three failed governments. Turn over the top policy of the draw pile and place it on the board. It gives no power.')}
    ${host ? `<div class="choice-pair"><button class="choice ballot reform ${S.ui.policy === 'R' ? 'is-picked' : ''}" data-a="pickPolicy" data-v="R" aria-pressed="${S.ui.policy === 'R'}" aria-label="Reform">${cardArt('reform')}</button><button class="choice ballot decree ${S.ui.policy === 'D' ? 'is-picked' : ''}" data-a="pickPolicy" data-v="D" aria-pressed="${S.ui.policy === 'D'}" aria-label="Decree">${cardArt('decree')}</button></div>` : ''}</section>`;
  if (v.phase === 'power') {
    const pw = g.power; const [t, d] = POWER_TEXT[pw];
    const mine = g.speaker === me.id; const forS = !mine && host && isPhys(v, g.speaker);
    if (pw === 'peek') {
      if (mine && me.docket) return `<section class="stage"><h1 class="phase-title">${art('eye')} The Docket</h1>${say('The top three policies, in order. Only you see this. Tell the table whatever you like.')}${secretTiles('docket', me.docket, (p) => tile(p))}</section>`;
      if (mine || forS) return `<section class="stage"><h1 class="phase-title">${art('eye')} The Docket</h1>${say(`${mine ? 'Look' : `${S2}, look`} at the top three policies of the draw pile without changing their order, then put them back.`)}</section>`;
      return `<section class="stage"><h1 class="phase-title">${art('eye')} The Docket</h1>${say(`${S2} looks at the top three policies.`)}</section>`;
    }
    if (mine || forS) return `<section class="stage"><h1 class="phase-title">${art(POWER_ART[pw])} ${esc(t)}</h1>${say(`${esc(d)} Tap a player at the table.${pw === 'investigate' && !g.appRoles ? ' They hand you their party card face down.' : ''}`)}</section>`;
    return `<section class="stage"><h1 class="phase-title">${art(POWER_ART[pw])} ${esc(t)}</h1>${say(`${S2}: ${esc(d)}`)}</section>`;
  }
  if (v.phase === 'over') return over(v);
  return '';
}

function over(v) {
  const g = v.game; const me = v.me; const side = g.winner;
  const pre = g.roles ? Object.keys(g.roles).find((id) => g.roles[id].id === 'pretender') : null;
  const why = { reforms: 'Five Reforms passed.', decrees: 'Six Decrees passed.', pretender: `The Boss${pre ? `, ${esc(nameOf(v, pre))},` : ''} was elected Chancellor after three Decrees.`, executed: `The Boss${pre ? `, ${esc(nameOf(v, pre))},` : ''} was removed.` }[g.reason];
  const won = me?.role ? (me.role.side === side ? '<p><b>You won.</b></p>' : '<p><b>You lost.</b></p>') : '';
  const roles = g.roles ? v.players.filter((p) => g.roles[p.id]).map((p) => { const r = g.roles[p.id]; return `<li class="a-${r.side}">${art(ROLE_ART[r.id])}<span><b>${esc(p.name)}</b><small>${esc(r.name)}</small></span></li>`; }).join('') : '';
  return `<section class="winner a-${side}">${art(side === 'reform' ? 'torch' : g.reason === 'pretender' ? 'mask' : 'chain')}<h1>${side === 'reform' ? 'The Loyalists Win' : 'The Syndicate Wins'}</h1>
      <p class="say">${why}</p>${won}</section>
    ${roles ? `<section class="stage"><h2 class="block-title">Who Was Who</h2><ul class="roles-list">${roles}</ul></section>` : '<section class="stage"><p class="say">Everyone, reveal your roles.</p></section>'}
    ${me?.host ? '<div class="sticky-act"><button class="btn big" data-a="restart">Restart</button><button class="btn ghost" data-a="again">Change setup first</button></div>' : v.kind === 'screen' ? '' : '<p class="muted center">Waiting for the host to start another game.</p>'}`;
}

function lastReveals(v) {
  const g = v.game; const out = [];
  const lv = g.lastVote; const lp = g.lastPolicy;
  if (lp && ['nominate', 'power', 'over'].includes(v.phase) && !(lv && !lv.passed && g.history.length && g.history.at(-1) === lv && v.phase === 'nominate' && g.tracker)) {
    out.push(`<section class="reveal ${lp.policy === 'R' ? 'a-reform' : 'a-cabal'} ${S.ui.fresh.policy ? 'is-new' : ''}"><h2 class="reveal-h ${lp.policy === 'R' ? 'ok' : 'bad'}">${lp.policy === 'R' ? 'A Reform' : 'A Decree'} is enacted</h2>
      <div class="flips">${tile(lp.policy, S.ui.fresh.policy ? 'flip' : '')}</div><p class="muted center">${lp.byGov ? `By ${esc(nameOf(v, lp.speaker))} and ${esc(nameOf(v, lp.chancellor))}.` : 'Turned over by the Unrest.'}</p></section>`);
  }
  if (lv && ['nominate', 'legislate', 'check', 'over', 'chaos'].includes(v.phase) && (v.phase !== 'nominate' || !lv.passed)) {
    const delay = v.house.revealDelay && S.ui.fresh.vote ? v.house.revealDelay : 0;
    if (delay) { S.ui.holdVote = Date.now() + delay * 1000; setTimeout(render, delay * 1000 + 30); }
    if (S.ui.holdVote && Date.now() < S.ui.holdVote) out.unshift(`<section class="reveal"><h2 class="reveal-h">The votes are in…</h2><p class="say center">Revealing in a moment.</p></section>`);
    else out.unshift(`<section class="reveal ${S.ui.fresh.vote || S.ui.holdVote ? 'is-new' : ''}"><h2 class="reveal-h ${lv.passed ? 'ok' : 'bad'}">Government ${lv.passed ? 'elected' : 'turned down'} ${lv.yes}–${lv.no}</h2>
      <p class="muted">Speaker ${esc(nameOf(v, lv.speaker))}, Chancellor ${esc(nameOf(v, lv.chancellor))}.</p>
      ${v.house.anonVotes ? '<p class="muted">Anonymous votes: only the count is shown.</p>' : `<div class="vote-cols"><div class="yes"><h4>Aye</h4><ul>${lv.ayes.map((id) => `<li>${esc(nameOf(v, id))}</li>`).join('') || '<li>nobody</li>'}</ul></div>
      <div class="no"><h4>Nay</h4><ul>${lv.nays.map((id) => `<li>${esc(nameOf(v, id))}</li>`).join('') || '<li>nobody</li>'}</ul></div></div>`}</section>`);
    if (S.ui.holdVote && Date.now() >= S.ui.holdVote) S.ui.holdVote = 0;
  }
  return out.join('');
}

function cardView(v) {
  const r = v.me.role; const open = isOpen('role');
  const sees = (v.me.sees || []).map((k) => `<li class="is-cabal">${mini(k.tag === 'pretender' ? 'bossRole' : 'syndicateRole')}<span><b>${esc(nameOf(v, k.id))}</b> ${k.tag === 'pretender' ? 'is the Boss' : 'is in the Syndicate'}</span></li>`).join('');
  const inq = (v.me.inquiries || []).map((k) => `<li class="${k.party === 'cabal' ? 'is-cabal' : 'is-reform'}">${mini(PARTY_CARD[k.party === 'cabal' ? 'cabal' : 'reform'])}<span>Inquiry: <b>${esc(nameOf(v, k.id))}</b> is ${k.party === 'cabal' ? 'Syndicate' : 'a Loyalist'}</span></li>`).join('');
  const peek = v.me.peeked ? `<li>${art('eye')}<span>You saw the docket: ${v.me.peeked.map((p) => (p === 'R' ? 'Reform' : 'Decree')).join(', ')}</span></li>` : '';
  const hint = { pretender: v.game.n <= 6 ? '' : 'You don’t know who the Syndicate are. They know you.', reformer: 'You know nothing. Watch the votes and the policies.' }[r.id] || '';
  // Closed: no role-specific markup at all (same neutral class, same back face), so the screen is identical for every player.
  const card = `<button type="button" class="rcard-tap hold ${open ? '' : 'is-hidden'}" data-a="reveal" data-k="role" aria-pressed="${open}" aria-label="${open ? 'Hide your role' : 'Reveal your role. Press and hold, or tap to peek.'}">
    <div class="rcard ${open ? `a-${r.side}` : 'a-hidden'}" data-face="${open ? 'front' : 'back'}"><div class="rcard-inner">
      <div class="rcard-face rcard-front dface">${cardArt(open ? ROLE_CARD[r.id] : 'back')}</div>
      <div class="rcard-face rcard-back dface">${cardArt('back')}</div></div></div>${open ? '' : holdChip}</button>`;
  return `<div class="hand">${card}${open ? `<p class="rcard-blurb center">${esc(r.blurb)}</p>` : ''}${open && (sees || hint || inq || peek) ? `<ul class="sees">${sees}${inq}${peek}</ul>${hint ? `<p class="muted">${hint}</p>` : ''}` : ''}${open ? '' : `<p class="muted center">Hold to look. A quick tap shows it for ${TAP_REVEAL_MS / 1000} seconds.</p>`}</div>`;
}

function myCardBlock(v) {
  if (v.phase === 'reveal' || v.phase === 'over' || !v.me?.role) return '';
  return `<section class="stage"><h2 class="block-title">Your Role${v.me.out ? ' (you are out)' : ''}</h2>${cardView(v)}</section>`;
}

function chronicle(v) {
  const g = v.game;
  if (!g.history.length) return '';
  const items = [...g.history].reverse().map((h) => `<li class="${h.passed ? 'ok' : 'bad'}"><b>${esc(nameOf(v, h.speaker))}</b> → <b>${esc(nameOf(v, h.chancellor))}</b>: ${h.passed ? 'elected' : 'turned down'} ${h.yes}–${h.no}${h.nays.length ? ` (Nay: ${names(v, h.nays)})` : ''}.</li>`).join('');
  return `<h3 class="sub">Governments</h3><ul class="history">${items}</ul>`;
}

// ---------------------------------------------------------------- host script (read aloud)
function openingScript(n, physRoles) {
  const L = [];
  if (physRoles) L.push('Everyone, look at your role and keep it hidden.');
  L.push('Everyone, close your eyes and put your fist on the table.');
  if (n <= 6) L.push('Syndicate and the Boss, open your eyes and look around. These are your allies.', 'Boss, raise your thumb so the Syndicate know you.', '(Pause.) Everyone, close your eyes. Thumbs down.');
  else L.push('Syndicate, open your eyes. Do not open them, Boss.', 'Boss, keep your eyes closed and raise your thumb, so the Syndicate know who you are.', '(Pause.) Syndicate, close your eyes. Boss, thumb down.');
  L.push('Everyone, open your eyes.');
  return L;
}
function phaseScript(v) {
  const g = v.game; if (!g) return [];
  const sp = nameOf(v, g.speaker); const ch = nameOf(v, g.nominee);
  switch (v.phase) {
    case 'reveal': return openingScript(g.n, !g.appRoles);
    case 'nominate': return [`${sp}, you are the Speaker${g.special ? ' by snap election' : ''}.`, `${sp}, nominate a Chancellor.`, ...(g.tracker === 2 ? ['Two governments have failed. If this one fails, the top policy is enacted.'] : []), ...(g.decree >= 3 ? ['Remember: if the Boss becomes Chancellor now, the Syndicate wins.'] : [])];
    case 'vote': return [`Speaker ${sp}, Chancellor ${ch}.`, v.mode.votes === 'physical' ? 'Everyone, decide. On three, show your vote. One, two, three.' : 'Vote Aye or Nay on your phones. The votes appear together.'];
    case 'check': return g.check.kind === 'chancellor' ? [`${ch}, are you the Boss?`] : [`${nameOf(v, g.check.id)}, were you the Boss? Say only yes or no.`];
    case 'legislate': return g.cardsApp ? [`${sp}, discard one policy. ${ch}, enact one of the two you receive.`, 'No talking during the session.'] : [`${sp}, draw three policies, discard one face down, and pass two to ${ch}.`, `${ch}, discard one face down and enact the other face up.`, 'No talking during the session.'];
    case 'chaos': return ['Unrest. Turn over the top policy and place it on the board. Its power is ignored.'];
    case 'power': return [`${sp}, you have a power: ${POWER_TEXT[g.power][0]}.`, POWER_TEXT[g.power][1]];
    case 'over': return ['The game is over. Everyone, reveal your roles.'];
    default: return [];
  }
}
const scriptHtml = (lines) => `<ol class="narration">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`;

function hostControls(v) {
  const g = v.game; if (!g || v.phase === 'over') return '';
  const seats = v.players.filter((p) => g.order.includes(p.id));
  let idle = [];
  if (v.phase === 'reveal') idle = seats.filter((p) => !g.ready.includes(p.id) && !p.phoneless);
  if (v.phase === 'vote' && v.mode.votes === 'app') idle = seats.filter((p) => (g.alive.includes(p.id) || g.exiled.includes(p.id)) && !g.voted.includes(p.id));
  const skipText = { reveal: 'Mark Ready', vote: 'Skip Vote' }[v.phase];
  const who = v.phase === 'legislate' ? (g.leg === 'chancellor' ? g.nominee : g.speaker) : g.speaker;
  const phaseSkip = { nominate: 'Pass Gavel', legislate: g.cardsApp ? (g.leg === 'veto' ? 'Refuse Veto' : g.leg === 'speaker' ? 'Random Discard' : 'Random Enact') : '', power: 'Skip Power' }[v.phase];
  return `<h3 class="sub">This Phase</h3>
    ${idle.length ? `<ul class="dash-list">${idle.map((p) => `<li><span class="who">${esc(p.name)} <small class="muted">waiting</small></span><span class="btn-row"><button class="btn ghost sm" data-a="nudge" data-id="${p.id}">Nudge</button><button class="btn ghost sm" data-a="skip" data-id="${p.id}">${skipText}</button></span></li>`).join('')}</ul>` : ''}
    <div class="btn-row wrap">${v.phase === 'reveal' ? '<button class="btn ghost" data-a="skipReveal">Skip to Nomination</button>' : ''}
    ${['nominate', 'legislate', 'power'].includes(v.phase) && phaseSkip ? `<button class="btn ghost sm" data-a="nudge" data-id="${who}">Nudge ${esc(nameOf(v, who))}</button><button class="btn ghost" data-a="skip">${phaseSkip}</button>` : ''}</div>
    <p class="muted">Skips and undos are written in the log for everyone. A random skip is drawn by the server; nobody, including you, sees the policies.</p>
    ${v.moderator ? `<h3 class="sub">The Deal (Host Only)</h3><ul class="roles-list">${seats.map((p) => { const r = v.moderator.roles[p.id]; return r ? `<li class="a-${r.side}">${art(ROLE_ART[r.id])}<span><b>${esc(p.name)}</b><small>${esc(r.name)}</small></span></li>` : ''; }).join('')}</ul>` : ''}`;
}

function hostPane(v) {
  const g = v.game;
  const script = g ? `${scriptHtml(phaseScript(v))}<details class="faq-q"><summary>Opening Script (Eyes Closed)</summary>${scriptHtml(openingScript(g.n, !g.appRoles))}</details>`
    : `<p class="muted">Once you start, the lines to read aloud for each phase appear here.</p>`;
  const animOn = v.anim !== false;
  const animToggle = `<label class="toggle ${animOn ? 'is-on' : ''}"><input type="checkbox" data-a="anim" ${animOn ? 'checked' : ''}><span><b>Animations</b><span class="muted">Pop-out effects on every phone and the table screen. Anyone whose device asks for reduced motion never sees them.</span></span></label>`;
  return T.hostPane(v, hostControls(v) + animToggle, script);
}

// ---------------------------------------------------------------- shared table screen (TV / laptop)
function tableScreen(v) {
  const g = v.game;
  const head = `<header class="appbar"><span class="appbar-mark">${art('torch')}</span><div class="appbar-title">The Gilded Chamber · <span class="code">${esc(v.code)}</span></div>${T.timerChip(v)}${dimBtn()}<span class="phase-badge">${ui(PHASE[v.phase]?.[1] || 'game')}${PHASE[v.phase]?.[0] || ''}</span></header>`;
  if (!g) return `${head}<main class="wrap screen-lobby"><h1 class="phase-title">Join at ${esc(location.host)}</h1><p class="room-code">${esc(v.code)}</p><div class="qr-tap is-static">${qrSvg(`${location.origin}/#/play/${v.code}`, `QR code to join room ${v.code}`)}</div><p class="say">${v.players.filter((p) => !p.watch).map((p) => esc(p.name)).join(' · ') || 'Nobody yet.'}</p></main>`;
  const lines = phaseScript(v).slice(0, 2);
  return `${head}<div class="layout is-screen"><main class="col col-main wrap game">${board(v)}${roundTable({ ...v, me: null })}${v.phase === 'over' ? over(v) : `<section class="stage"><p class="say">${esc(lines.join(' '))}</p><div class="btn-row"><button type="button" class="btn ghost" data-a="roles">Roles in this game</button></div></section>`}${lastReveals(v)}</main>
    <aside class="col col-log">${T.logPane(v, chronicle(v))}</aside><aside class="col col-side">${T.chatPane(v, true)}</aside></div>`;
}

// The full-screen QR lives outside #app so a live update (someone joins) can't tear it down and exit fullscreen.
function showQr(link, code) {
  let el = document.getElementById('qrfs');
  if (!el) {
    el = Object.assign(document.createElement('div'), { id: 'qrfs', role: 'dialog', tabIndex: 0 });
    el.setAttribute('aria-label', 'Join QR code. Tap to close.');
    el.addEventListener('click', () => { toggleFullscreen(el); el.classList.remove('is-full'); if (document.fullscreenElement !== el) el.hidden = true; });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) el.hidden = true; });
    document.body.append(el);
  }
  el.innerHTML = `${qrSvg(link, `QR code to join room ${code}`)}<p class="qr-code">${esc(code)}</p><p class="qr-hint">Tap to close</p>`;
  el.hidden = false; el.classList.remove('is-full'); toggleFullscreen(el);
}

// ---------------------------------------------------------------- transport
function wsTransport(code, asScreen) {
  let ws; let closed = false; let tries = 0; let timer; let longTimer;
  const creds = () => { try { return JSON.parse(store.get(`${KEY}.player.${code}`) || 'null'); } catch { return null; } };
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
    ws.onopen = () => { tries = 0; S.conn = true; S.connLong = false; clearTimeout(longTimer); longTimer = null; const c = creds();
      if (asScreen) ws.send(JSON.stringify({ type: 'hello', screen: true }));
      else if (c) ws.send(JSON.stringify({ type: 'hello', ...c }));
      else if (S.pendingJoin) { ws.send(JSON.stringify({ type: 'hello', join: S.pendingJoin, hostKey: store.get(`${KEY}.host.${code}`) || undefined })); S.pendingJoin = null; }
      render(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'view') onView(m.view);
      else if (m.type === 'gameover') fx.gameOver(m);
      else if (m.type === 'error') toast(m.error);
      else if (m.type === 'joined') store.set(`${KEY}.player.${code}`, JSON.stringify({ playerId: m.playerId, token: m.token }));
      else if (m.type === 'closed') { closed = true; store.del(`${KEY}.player.${code}`); store.del(`${KEY}.host.${code}`); S.ended = true; S.view = null; render(); }
      else if (m.type === 'fatal') { if (m.clear) { store.del(`${KEY}.player.${code}`); S.view = null; toast(m.error); render(); } else { closed = true; S.fatal = /expired/i.test(m.error) ? FATAL.gone : FATAL.closed; render(); } }
    };
    ws.onclose = () => { if (closed) return; S.conn = false; if (!longTimer) longTimer = setTimeout(() => { if (!S.conn && !closed) { S.connLong = true; render(); } }, 20000); render(); timer = setTimeout(open, Math.min(8000, 400 * 2 ** tries++)); };
  };
  open();
  return {
    send: (a) => { if (ws?.readyState === 1) ws.send(JSON.stringify(a)); else toast('Not connected to the room yet. Wait a moment and try again.'); },
    close: () => { closed = true; clearTimeout(timer); clearTimeout(longTimer); ws?.close(); },
  };
}

// A restarted game (same code, new gameNo): drop everything tied to the old one. The stored player token still works.
function newGameReset() {
  closeSheets(); fx.reset(); S.ui.overShown = null;
  Object.assign(S.ui, { open: {}, flip: false, fresh: {}, tab: 'game', side: 'chat', tally: {}, enactIdx: null, draft: { ...S.ui.draft, chat: '' } });
}

function showRoles() {
  const v = S.view; if (!v) return;
  const info = rolesInGame(rolesSeats(v), v.house);
  openSheet({ title: 'Roles in this game', cls: 'roles-sheet',
    bodyHtml: `<p class="muted">${v.game ? 'The roles dealt this game' : 'The roles planned for this table'}, ${info.seats} players. Who holds which is secret.</p>${rolesSheetBody(info, esc, art)}`,
    buttons: [{ label: 'Close', cls: 'ghost' }] });
}
function restartAsk() {
  openSheet({ title: 'Restart the game?', cls: 'restart-sheet',
    bodyHtml: '<p>Everyone stays seated and gets a fresh deal with the same setup, straight to the secret cards. The chat, log, board and policies so far are cleared.</p>',
    buttons: [{ label: 'Keep playing', cls: 'ghost' }, { label: 'Change setup first', cls: 'ghost', onClick: () => send({ type: 'again' }) }, { label: 'Restart now', onClick: () => send({ type: 'restart' }) }] });
}

function onView(v) {
  const p = S.view;
  if (p && v.code === p.code && (p.gameNo || 1) !== (v.gameNo || 1)) newGameReset();
  if (p?.game && v.game) {
    if (v.game.reform + v.game.decree > p.game.reform + p.game.decree) S.ui.fresh.policy = true;
    if (v.game.history.length > p.game.history.length) S.ui.fresh.vote = true;
  }
  if (v.phase !== p?.phase) { S.ui.open = {}; S.ui.enactIdx = null; clearPicks(); }
  else if (v.game && p?.game && [v.game.speaker, v.game.leg, v.game.power, v.game.nominee].join() !== [p.game.speaker, p.game.leg, p.game.power, p.game.nominee].join()) clearPicks();
  else if (JSON.stringify(p?.me?.hand) !== JSON.stringify(v.me?.hand) || JSON.stringify(p?.me?.docket) !== JSON.stringify(v.me?.docket)) { S.ui.open.hand = false; S.ui.open.docket = false; S.ui.enactIdx = null; }
  if (p?.phase !== v.phase && v.anim !== false && ['vote', 'legislate', 'power', 'over'].includes(v.phase)) haptic(30);
  T.onView(p, v);
  fx.onView(p, v);
  S.view = v; render();
}

// ---------------------------------------------------------------- routing
async function route() {
  fx.reset();
  S.transport?.close(); S.transport = null; S.view = null; S.fatal = null; S.ended = false; S.pruned = false; S.conn = true; S.connLong = false; S.ui.open = {};
  const [kind, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if ((kind === 'play' || kind === 'join' || kind === 'screen') && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = kind === 'screen' ? 'screen' : 'play'; S.code = arg.toUpperCase();
    const ex = await fetch(`/api/room/${S.code}`).then((r) => r.ok).catch(() => false);
    if (!ex) { store.del(`${KEY}.player.${S.code}`); S.fatal = FATAL.noRoom(S.code); }
    else {
      S.pendingJoin = sessionStorage.getItem(`${KEY}.pendingJoin`);
      sessionStorage.removeItem(`${KEY}.pendingJoin`);
      S.transport = wsTransport(S.code, S.mode === 'screen');
    }
  } else if (kind === 'rules') S.mode = 'rules';
  else if (kind === 'faq') S.mode = 'faq';
  else S.mode = 'home';
  render();
  if (S.mode === 'faq' || S.mode === 'rules') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
const rawSend = (msg) => S.transport?.send(msg);

// ---------------------------------------------------------------- events
wireFaqSearch($app);
$app.addEventListener('input', (e) => { const k = e.target.dataset.i; if (k) S.ui.draft[k] = e.target.value; });
$app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const k = e.target.dataset.i;
  if (k === 'hostName') act('host'); else if (k === 'joinCode') act('goJoin'); else if (k === 'joinName') act('join');
  else if (k === 'chat') { e.preventDefault(); T.handle('chat'); } else if (k === 'seatName') act('addSeat');
});
$app.addEventListener('submit', (e) => e.preventDefault());
$app.addEventListener('change', (e) => {
  const el = e.target; const k = el.dataset.k;
  if (el.dataset.a === 'set') send({ type: 'settings', settings: { [k]: el.checked } });
  else if (el.dataset.a === 'houseSet') send({ type: 'house', house: { [k]: el.checked } });
  else if (el.dataset.a === 'houseSel') { send({ type: 'house', house: { [k]: el.value } }); el.blur(); }
  else if (el.dataset.a === 'modeSet') send({ type: 'mode', mode: { play: el.value } });
  else if (el.dataset.a === 'anim') send({ type: 'anim', on: el.checked });
});
$app.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-a="reveal"]'); if (!el || e.button > 0) return;
  const k = el.dataset.k; clearTimeout(hideT[k]);
  if (isOpen(k)) { setOpen(k, false); return; } // a press on an open secret hides it
  holdState.key = k; holdState.t0 = performance.now(); setOpen(k, true);
});
$app.addEventListener('scroll', (e) => {
  const t = e.target; if (!t.classList?.contains('car-track')) return;
  const slide = t.firstElementChild; if (!slide) return;
  const i = Math.round(t.scrollLeft / (slide.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0)));
  t.parentElement.querySelectorAll('.car-dot').forEach((d, n) => d.classList.toggle('on', n === i));
}, { capture: true, passive: true });
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (el?.dataset.a === 'reveal') { // pointer presses are handled above; a click with no pointer is the keyboard
    if (e.detail === 0) { const k = el.dataset.k; clearTimeout(hideT[k]); const on = !isOpen(k); setOpen(k, on); if (on) hideT[k] = setTimeout(() => setOpen(k, false), TAP_REVEAL_MS * 2); }
    return;
  }
  if (S.ui.noClickUntil > Date.now() && el?.classList.contains('tile-btn')) return; // the finger that lifted off a hold is not a choice
  if (!el || ['set', 'houseSet', 'houseSel', 'modeSet', 'anim'].includes(el.dataset.a)) return;
  if (el.getAttribute('aria-disabled') === 'true') return;
  if (T.handle(el.dataset.a, el)) return;
  act(el.dataset.a, el);
});

async function act(a, el) {
  const d = el?.dataset || {};
  switch (a) {
    case 'host': {
      const name = (S.ui.draft.hostName ?? store.get(`${KEY}.name`) ?? '').trim();
      if (!name) { toast('Type your name first.'); return; }
      store.set(`${KEY}.name`, name);
      const r = await fetch('/api/create', { method: 'POST' }).then((x) => x.json()).catch(() => ({ error: 'Couldn’t reach the server. Check your connection and try again.' }));
      if (r.error) { toast(r.error); return; }
      store.set(`${KEY}.host.${r.code}`, r.hostKey);
      sessionStorage.setItem(`${KEY}.pendingJoin`, name);
      location.hash = `#/play/${r.code}`;
      return;
    }
    case 'forgetRoom': store.del(`${KEY}.player.${d.v}`); store.del(`${KEY}.host.${d.v}`); el.closest('.resume-row')?.remove(); return;
    case 'goJoin': {
      const c = (S.ui.draft.joinCode || '').trim().toUpperCase();
      if (!/^[A-Z]{6}$/.test(c)) { toast('Room codes are 6 letters.'); return; }
      location.hash = `#/play/${c}`; return;
    }
    case 'join': {
      const name = (S.ui.draft.joinName ?? store.get(`${KEY}.name`) ?? '').trim();
      if (!name) { toast('Type your name first.'); return; }
      store.set(`${KEY}.name`, name);
      rawSend({ type: 'hello', join: name, hostKey: store.get(`${KEY}.host.${S.code}`) || undefined }); return;
    }
    case 'addSeat': { const n = (S.ui.draft.seatName || '').trim(); if (!n) { toast('Type a name for the seat.'); return; } send({ type: 'addSeat', name: n }); S.ui.draft.seatName = ''; document.activeElement?.blur?.(); return; }
    case 'copy': try { await navigator.clipboard.writeText(d.link); toast('Invite link copied.'); } catch { toast(d.link); } return;
    case 'share': try { await navigator.share({ title: 'The Gilded Chamber', text: 'Join my game of The Gilded Chamber', url: d.link }); } catch { /* cancelled */ } return;
    case 'slide': { const t = el.closest('.car').querySelector('.car-track'); const sl = t.children[+d.i]; if (sl) t.scrollTo({ left: sl.offsetLeft - t.firstElementChild.offsetLeft, behavior: reducedMq.matches ? 'auto' : 'smooth' }); return; }
    case 'qrFull': showQr(d.link, d.code); return;
    case 'dim': store.set(`${KEY}.dim`, $html.dataset.dim === '1' ? '0' : '1'); applyDim(); render(); return;
    case 'start': if (el.classList.contains('disabled')) { toast(d.why || 'Not ready to start yet.'); return; } send({ type: 'start' }); return;
    case 'nominate': S.ui.nominee = d.id; render(); return;
    case 'pickCard': S.ui.card = +d.v; render(); return;
    case 'pickPolicy': S.ui.policy = d.v; render(); return;
    case 'pickAnswer': S.ui.answer = d.v === '1'; render(); return;
    case 'pickVeto': S.ui.veto = d.v === '1'; render(); return;
    case 'dockSend': {
      const nav = hostNav(S.view, pickUi()); if (!nav || nav.disabled) return;
      if (nav.send.type === 'discard') haptic(20);
      if (nav.send.type === 'enact') { S.ui.enactIdx = nav.send.i; haptic([20, 40, 20]); }
      const m = nav.send; clearPicks(); send(m); return;
    }
    case 'dockSkip': { const nav = hostNav(S.view, pickUi()); const sk = nav?.skip; if (!sk) return; clearPicks(); for (const m of sk.msgs) send(m); return; }
    case 'vote': haptic(20); send({ type: 'vote', aye: d.v === '1' }); return;
    case 'veto': send({ type: 'veto' }); return;
    case 'hostVeto': if (await askConfirm('Both policies are discarded and Unrest moves one step. Confirm the veto?')) send({ type: 'hostVeto' }); return;
    case 'power': S.ui.target = d.id; render(); return;
    case 'piece': send({ type: 'mode', mode: { play: 'hybrid', [d.k]: d.v } }); return;
    case 'tallyToggle': S.ui.tally[d.id] = !S.ui.tally[d.id]; render(); return;
    case 'skip': send({ type: 'skip', id: d.id }); return;
    case 'roles': showRoles(); return;
    case 'restart': send({ type: 'restart' }); return;
    case 'restartAsk': restartAsk(); return;
    case 'move': case 'ready': case 'skipReveal': case 'again': case 'shuffleSeats':
      send({ type: a, id: d.id, dir: d.dir }); return;
    default:
  }
}

route();
// The service worker is registered by the pwa block in index.html (updateViaCache 'none', one reload on update).
