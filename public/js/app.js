// The Gilded Chamber client: routing, the live WebSocket, and every screen. The whole page re-renders on each
// update (same approach as Mafia Night and Quest Night); focus and typed text survive because inputs pause re-renders.
// Table things (chat, log, tools, host dashboard frame) come from table_ui.js.
import { ui } from './ui_icons.js';
import { art, ROLE_ART, POWER_ART } from './art.js';
import { ROLES, TEAMS, POWERS, POWER_TEXT, roleList, MIN_PLAYERS, MAX_PLAYERS, REFORM_TO_WIN, DECREE_TO_WIN, VETO_AT, PRETENDER_DANGER, TRACKER_MAX, startingDeck } from './rules.js';
import { makeTable, faqPage, wireFaqSearch } from './table_ui.js';
import { roleCards, MAP } from './cards.js';
import { FAQ } from './faq.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $html = document.documentElement;
const KEY = 'council';

const S = { mode: 'home', code: null, view: null, fatal: null, conn: true, transport: null,
  ui: { showCard: false, flip: false, draft: {}, fresh: {}, tab: 'game', side: 'chat', tally: {} } };

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
let pending = false;
function render() {
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio') { pending = true; return; }
  pending = false;
  const y = window.scrollY;
  $html.dataset.phase = S.view?.phase || S.mode;
  $html.dataset.screen = S.mode === 'screen' ? '1' : '';
  $app.innerHTML = screen();
  S.ui.fresh = {}; S.ui.flip = false;
  window.scrollTo(0, y);
  for (const el of $app.querySelectorAll('[data-scroll]')) el.scrollTop = el.scrollHeight;
}
document.addEventListener('focusout', () => { if (pending) setTimeout(render, 50); });
const T = makeTable({ S, send, esc, ui, toast, render });

function screen() {
  if (S.fatal) return `<main class="wrap"><div class="empty">${ui('warning')}<h1 class="phase-title">${esc(S.fatal)}</h1><a class="btn" href="#/">Go to the home page</a></div></main>`;
  if (S.mode === 'home') return home();
  if (S.mode === 'rules') return rulesPage();
  if (S.mode === 'faq') return faqPage(FAQ, esc, ui);
  const banner = !S.conn ? `<div class="banner" role="status">${ui('wifi-off')} Reconnecting to the chamber…</div>` : '';
  const v = S.view;
  if (!v) {
    if (S.mode === 'screen' || store.get(`${KEY}.player.${S.code}`) || S.pendingJoin) return banner + `<main class="wrap"><div class="empty">${art('table')}<p>Opening the chamber doors…</p></div></main>`;
    return banner + joinForm();
  }
  if (v.kind === 'screen') return banner + tableScreen(v);
  return banner + appbar(v) + layout(v);
}

const cardBack = () => `<span class="rcard-back"><span class="rcard-back-mark">${art('sun')}</span></span>`;
const dimBtn = () => `<button type="button" class="icon-btn dim-btn" data-a="dim" aria-pressed="${$html.dataset.dim === '1'}" aria-label="Low-light mode" title="Low-light mode">${ui($html.dataset.dim === '1' ? 'sun' : 'moon')}</button>`;

function home() {
  const mine = Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}.player.`)).map((k) => k.slice(KEY.length + 8));
  return `<main class="wrap home"><div class="home-dim">${dimBtn()}</div>
    <div class="home-hero">
      <div class="card-fan" aria-hidden="true">${cardBack().repeat(3)}</div>
      <h1 class="wordmark">The Gilded Chamber <span>Loyalty or ruin. Trust no one.</span></h1>
      <p class="lede">The Loyalists hold the majority, but the Syndicate sits among them, and one of them is the Boss. Elect governments, pass policies, and unmask the Boss before they take power. 5 to 10 players. Play on phones, with a deck of cards, or a mix.</p>
    </div>
    <div class="home-paths">
      <section class="path"><h2 class="path-title">Host a game</h2>
        <p class="muted">You can play too, or sit out as the moderator. Everyone else joins with a 6‑letter code.</p>
        <label class="field"><span>Your name</span><input data-i="hostName" maxlength="20" autocomplete="nickname" enterkeyhint="go" value="${esc(S.ui.draft.hostName || store.get(`${KEY}.name`) || '')}"></label>
        <button type="button" class="btn big" data-a="host">Open a chamber</button>
        ${mine.map((c) => `<p class="resume-row"><a class="resume" href="#/play/${esc(c)}">Back to chamber <b class="code">${esc(c)}</b></a></p>`).join('')}</section>
      <section class="path"><h2 class="path-title">Join a game</h2>
        <div class="join-row"><label class="field"><span>Room code</span><input class="code-input" data-i="joinCode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="ABCDEF" value="${esc(S.ui.draft.joinCode || '')}"></label>
        <button type="button" class="btn ghost" data-a="goJoin">Join</button></div></section>
      <p class="home-faq"><a class="path-link" href="#/rules">How to play</a> · <a class="path-link" href="#/faq">FAQ</a> · <a class="path-link" href="/print.html" target="_blank" rel="noopener">Print cards</a></p>
    </div>
    <p class="credits">Same table as <a href="https://mafia-app.hatethespurs.workers.dev">Mafia Night</a> and <a href="https://quest-night.hatethespurs.workers.dev">Quest Night</a>. Torch, chain, mask and every board icon drawn for The Gilded Chamber. Interface icons from <a href="https://phosphoricons.com" target="_blank" rel="noopener">Phosphor</a> (MIT). Fonts: Limelight, Big Shoulders Display and Alegreya (SIL OFL), Special Elite (Apache 2.0).</p>
  </main>`;
}

const powerRow = (n) => POWERS[n].map((p) => (p ? POWER_TEXT[p][0] : '–')).join(' · ');
function rulesPage() {
  const rows = Object.keys(TEAMS).map((n) => `<tr><td>${n}</td><td>${TEAMS[n][0]}</td><td>${TEAMS[n][1]} + the Boss</td><td>${powerRow(n)}</td></tr>`).join('');
  return `<main class="wrap game">
    <p><a class="link" href="#/">${ui('back')} Home</a> · <a class="link" href="#/faq">FAQ</a></p>
    <section class="stage"><h1 class="phase-title">How to play</h1>
      <p>Everyone gets a secret role. Most of you are <b class="t-reform">Loyalists</b>. The rest are <b class="t-cabal">the Syndicate</b>, and one of them is <b class="t-cabal">the Boss</b>. The Syndicate know each other and who the Boss is; the Boss only knows the Syndicate in 5 or 6 player games.</p>
      <p><b>Each round</b> the Speaker role moves one seat left. The Speaker nominates a Chancellor, and everyone still in the game votes <b>Aye</b> or <b>Nay</b>. A strict majority elects them; a tie fails.</p>
      <p><b>Term limits:</b> the last elected Chancellor can’t be nominated, and neither can the last elected Speaker unless only five players are left.</p>
      <p><b>Unrest:</b> each failed election moves the Unrest marker. On the third, the top policy is enacted at once, with no power, and term limits are forgotten. Unrest resets whenever any policy is enacted.</p>
      <p><b>Passing a law:</b> the Speaker draws three policies, secretly discards one and passes two to the Chancellor, who discards one and enacts the other. The deck holds 6 Reforms and 11 Decrees. When fewer than three remain, the discards are shuffled back in.</p>
      <p><b>Powers:</b> some Decrees give the Speaker a power (below). After five Decrees, the Chancellor may propose a <b>veto</b>: if the Speaker agrees, both policies are discarded and Unrest moves on.</p>
      <p><b>Winning:</b> the Loyalists win with five Reforms, or by executing the Boss. The Syndicate win with six Decrees, or if the Boss is elected Chancellor once three Decrees are on the board.</p>
    </section>
    <section class="stage"><h2 class="block-title">Table sizes and powers</h2>
      <div class="table-scroll"><table class="sizes"><thead><tr><th>Players</th><th>Loyalists</th><th>Syndicate</th><th>Decree 1 to 5</th></tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="tips">${Object.entries(POWER_TEXT).map(([k, [t, d]]) => `<li>${art(POWER_ART[k])} <b>${t}.</b> ${esc(d)}</li>`).join('')}</ul>
      <p class="muted">Playing with a regular deck? <a href="/print.html" target="_blank" rel="noopener">Print the card guide</a> (every table size, with the eyes-closed script) or the Gilded Chamber cards.</p></section>
  </main>`;
}

function joinForm() {
  return `<main class="wrap join"><h1 class="phase-title">Join chamber <span class="code">${esc(S.code)}</span></h1>
    <label class="field"><span>Your name</span><input data-i="joinName" maxlength="20" autocomplete="nickname" enterkeyhint="go" value="${esc(S.ui.draft.joinName || store.get(`${KEY}.name`) || '')}"></label>
    <button type="button" class="btn big" data-a="join">Take a seat</button>
    <p class="muted" style="margin-top:var(--s4)">If the game has started you’ll watch, unless the host opened a seat for you. <a href="#/">Back</a></p></main>`;
}

const PHASE = { lobby: ['Gathering', 'table'], reveal: ['Secret roles', 'cards'], nominate: ['Nomination', 'gavel'], vote: ['Election', 'hand'],
  check: ['A question', 'question'], legislate: ['Session', 'rules'], chaos: ['Unrest', 'warning'], power: ['Power', 'sparkle'], over: ['Game over', 'trophy'] };
function appbar(v) {
  const [label, icon] = PHASE[v.phase] || ['', 'game'];
  return `<header class="appbar"><a class="appbar-mark" href="#/" aria-label="Home">${art('torch')}</a>
    <div class="appbar-title">Chamber <span class="code">${esc(v.code)}</span></div>
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
  return (myMove(v) ? [stage(v), board(v), roundTable(v), lastReveals(v), myCardBlock(v)] : [board(v), roundTable(v), stage(v), lastReveals(v), myCardBlock(v)]).join('');
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
const MODES = [['phone', 'Phones only', 'Every player uses their phone. Works for online play too.'],
  ['hybrid', 'Hybrid', 'Mix real cards and phones. Choose each piece below.'],
  ['physical', 'All physical', 'A deck of cards on the table. This phone is the board, the tracker and the moderator.']];
const PIECE_TEXT = { roles: ['Secret roles', 'role'], votes: ['Aye / Nay votes', 'vote'], cards: ['Policy tiles', 'policy'] };
const HOUSE = [
  ['rebalance', 'Rebalanced tables', 'Community variant: at 6 players one Decree starts on the board; at 7 one Decree, and at 9 two Decrees, are left out of the deck.'],
  ['exile', 'Exile instead of execution', 'Removed players stay at the table and still vote, but can’t hold office or be nominated. Exiling the Boss still wins for the Loyalists.'],
  ['anonVotes', 'Anonymous votes', 'Show only the count of Ayes and Nays, not who voted how.'],
  ['noClaims', 'No-claims mode', 'Turns off posting claims in the chat. Claims are made out loud.'],
  ['sitOut', 'Moderator sits out', 'The host doesn’t get a role and sees the whole deal on their own phone.'],
];
function lobby(v) {
  const me = v.me; const seatedP = v.players.filter((p) => !p.watch); const n = seatedP.length; const host = me.host;
  const link = `${location.origin}/#/play/${v.code}`;
  const list = roleList(Math.max(5, Math.min(10, n)));
  const status = n < MIN_PLAYERS ? `<p class="note is-warn">${ui('info')} ${MIN_PLAYERS - n} more to start (5 to 10 players).</p>`
    : n > MAX_PLAYERS ? `<p class="note is-warn">${ui('warning')} At most ${MAX_PLAYERS} players.</p>`
      : `<p class="note">${ui('check')} ${TEAMS[n][0]} Loyalists, ${TEAMS[n][1]} Syndicate and the Boss. Powers: ${powerRow(n)}.</p>`;
  const seats = v.players.map((p, i) => `<li><span class="n">${p.watch ? '–' : i + 1}</span><span class="dot ${p.online || p.phoneless ? 'on' : ''}" title="${p.phoneless ? 'No phone' : p.online ? 'Connected' : 'Not connected'}"></span>
      <span class="who">${esc(p.name)}${p.host ? ' <small class="muted">host</small>' : ''}${p.watch ? ' <small class="muted">moderator</small>' : ''}${p.phoneless ? ' <small class="muted">no phone</small>' : ''}${p.id === me.id ? ' <small class="muted">you</small>' : ''}</span>
      ${host ? `<button class="icon-btn" data-a="move" data-id="${p.id}" data-dir="up" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}>${ui('caret-down', 'flip-up')}</button>
      <button class="icon-btn" data-a="move" data-id="${p.id}" data-dir="down" aria-label="Move ${esc(p.name)} down" ${i === v.players.length - 1 ? 'disabled' : ''}>${ui('caret-down')}</button>
      ${p.host ? '' : `<button class="icon-btn" data-a="kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ui('x')}</button>`}` : ''}</li>`).join('');
  const m = v.mode;
  const modes = MODES.map(([k, t, d]) => `<label class="toggle radio ${m.play === k ? 'is-on' : ''}"><input type="radio" name="play" data-a="modeSet" data-k="play" value="${k}" ${m.play === k ? 'checked' : ''} ${host ? '' : 'disabled'}><span><b>${t}</b><span class="muted">${d}</span></span></label>`).join('');
  const pieces = m.play === 'hybrid' ? `<div class="pieces">${Object.entries(PIECE_TEXT).map(([k, [t]]) => `<div class="piece"><span>${t}</span><span class="seg mini">${['app', 'physical'].map((x) => `<button type="button" data-a="piece" data-k="${k}" data-v="${x}" aria-pressed="${m[k] === x}" ${host ? '' : 'disabled'}>${x === 'app' ? 'In the app' : 'Physical'}</button>`).join('')}</span></div>`).join('')}</div>` : '';
  const house = HOUSE.map(([k, t, d]) => `<label class="toggle ${v.house[k] ? 'is-on' : ''}"><input type="checkbox" data-a="houseSet" data-k="${k}" ${v.house[k] ? 'checked' : ''} ${host ? '' : 'disabled'}><span><b>${t}</b><span class="muted">${d}</span></span></label>`).join('');
  const sel = (k, opts2) => `<select data-a="houseSel" data-k="${k}" ${host ? '' : 'disabled'}>${opts2.map(([val, l]) => `<option value="${val}" ${String(v.house[k]) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const physAny = m.roles === 'physical' || m.cards === 'physical' || m.votes === 'physical';
  const guide = physAny && n >= 5 && n <= 10 ? cardGuideBlock(n, v.house, m) : '';
  return `<section class="join-code"><p class="muted">Room code</p><p class="room-code">${esc(v.code)}</p>
      <p class="muted join-link">${esc(link)}</p>
      <div class="btn-row"><button class="btn ghost" data-a="copy" data-link="${esc(link)}">${ui('copy')} Copy invite link</button>
      ${navigator.share ? `<button class="btn ghost" data-a="share" data-link="${esc(link)}">Share</button>` : ''}</div>
      <p class="muted"><a href="#/rules">How to play</a> · <a href="#/faq">FAQ</a></p></section>
    <section class="stage"><h2 class="block-title">At the table (${n})</h2>
      <p class="muted">Seat order is the order the Speaker role travels. ${host ? 'Match it to how you are sitting.' : ''}</p>
      <ul class="seat-list">${seats}</ul>${status}${n >= 5 && n <= 10 ? balanceTips(n, v.house) : ''}
      ${host ? `<div class="add-seat"><label class="field"><span>Add a seat without a phone</span><input data-i="seatName" maxlength="20" placeholder="Name" enterkeyhint="done" value="${esc(S.ui.draft.seatName || '')}"></label><button class="btn ghost" data-a="addSeat">Add</button></div>
      <div class="btn-row"><button class="btn ghost" data-a="shuffleSeats">${ui('shuffle')} Shuffle seats</button></div>` : ''}</section>
    <section class="stage"><h2 class="block-title">How you’re playing</h2><div class="settings">${modes}</div>${pieces}
      ${m.play !== 'phone' ? `<p class="muted">Real cards: <a href="/print.html" target="_blank" rel="noopener">print the card guide or the Gilded Chamber cards</a>. Anything physical is entered by the host, who never sees a secret.</p>` : ''}</section>
    <section class="stage"><h2 class="block-title">House rules</h2><p class="muted">All off unless the host turns them on. Otherwise the rules are exactly the classic game.</p>
      <div class="settings">${house}
      <label class="toggle"><span><b>Phase timer</b><span class="muted">A countdown starts each phase. Nothing happens at zero; the host decides.</span></span>${sel('turnTimer', [[0, 'Off'], [60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min'], [300, '5 min']])}</label>
      <label class="toggle"><span><b>Vote reveal delay</b><span class="muted">A short drumroll before the votes are shown.</span></span>${sel('revealDelay', [[0, 'Off'], [3, '3 s'], [5, '5 s']])}</label>
      <label class="toggle"><span><b>First Speaker</b><span class="muted">Who holds the gavel first.</span></span>${sel('firstLeader', [['random', 'Random'], ['host', 'The host']])}</label></div></section>
    ${guide}
    ${host ? `<div class="sticky-act"><button class="btn big ${n < 5 || n > 10 || list.error ? 'disabled' : ''}" data-a="start">${m.roles === 'app' ? 'Deal the roles' : 'Start the game'}</button></div>`
    : '<div class="empty">Waiting for the host to start…</div>'}`;
}

function balanceTips(n, house) {
  const tips = [];
  if ([6, 7, 9].includes(n) && !house.rebalance) tips.push(`At ${n} players the classic game leans towards the Syndicate. The “Rebalanced tables” house rule evens it out.`);
  if (n <= 6) tips.push('At 5 or 6 the Boss knows the Syndicate, and the third Decree lets the Speaker peek at the docket.');
  if (n >= 9) tips.push('At 9 or 10 the very first Decree gives an Inquiry: the Loyalists get information early.');
  if (house.exile) tips.push('Exile keeps everyone voting: good for groups where nobody likes to sit out.');
  return tips.length ? `<ul class="tips">${tips.map((t) => `<li>${ui('info')} ${esc(t)}</li>`).join('')}</ul>` : '';
}

function cardGuideBlock(n, house, m) {
  const rc = roleCards(n, house.rebalance);
  const pc = (c) => `<b class="pc ${/[♥♦]/.test(c) || c === 'Red joker' ? 'is-red' : ''}">${esc(c)}</b>`;
  const span = (a) => (a.length > 1 ? `${a[0]}–${a.at(-1)}` : a[0]);
  return `<section class="stage"><h2 class="block-title">Playing-card setup for ${n}</h2>
    ${m.roles === 'physical' ? `<p class="muted">Roles: shuffle these ${n} cards and deal one face down to each player. Hearts are Loyalists; clubs are the Syndicate; the K♠ is the Boss.</p>
    <ul class="card-key">${rc.roles.map((c) => `<li class="a-${ROLES[c.role].side}">${pc(c.card)} ${esc(ROLES[c.role].name)}</li>`).join('')}</ul>
    <p class="muted">Party cards (for an Inquiry), kept face down in front of each player: ${pc(span(rc.party.filter((c) => /♦/.test(c))))} Loyalist, ${pc(span(rc.party.filter((c) => /♣/.test(c))))} Syndicate. Hand them out to match the roles at the start, eyes closed (see the script).</p>` : ''}
    ${m.cards === 'physical' ? `<p class="muted">Policy pile: ${pc(span(rc.reform))} are Reforms, ${pc(span(rc.decree))} are Decrees (${rc.reform.length + rc.decree.length} cards). Shuffle face down.${rc.startDecrees ? ' Put one Decree face up on the board before you start.' : ''}</p>` : ''}
    ${m.votes === 'physical' ? '<p class="muted">Votes: thumbs up for Aye, down for Nay, on three. Or give each player a red card (Aye) and a black card (Nay) from a second deck.</p>' : ''}
    <p class="muted">The ${pc(MAP.speaker)} is the Speaker’s placard; the ${pc(MAP.chancellor)} is the Chancellor’s.</p></section>`;
}

// ---------------------------------------------------------------- the board
function board(v) {
  const g = v.game;
  const rs = Array.from({ length: REFORM_TO_WIN }, (_, i) => `<div class="slot ${i < g.reform ? 'is-reform' : ''} ${S.ui.fresh.policy && i === g.reform - 1 && g.lastPolicy?.policy === 'R' ? 'is-pop' : ''}" aria-label="Reform ${i + 1}${i < g.reform ? ', passed' : ''}">${i < g.reform ? art('torch') : i === REFORM_TO_WIN - 1 ? `<small>Win</small>` : ''}</div>`).join('');
  const ds = Array.from({ length: DECREE_TO_WIN }, (_, i) => {
    const p = g.powers[i]; const on = i < g.decree;
    const mark = on ? art('chain') : i === DECREE_TO_WIN - 1 ? '<small>Win</small>' : p ? `<span class="slot-power" title="${esc(POWER_TEXT[p][0])}">${art(POWER_ART[p])}<small>${esc(POWER_TEXT[p][0])}</small></span>` : '';
    return `<div class="slot ${on ? 'is-decree' : ''} ${i === PRETENDER_DANGER - 1 && !on ? 'is-danger' : ''} ${S.ui.fresh.policy && i === g.decree - 1 && g.lastPolicy?.policy === 'D' ? 'is-pop' : ''}" aria-label="Decree ${i + 1}${on ? ', passed' : p ? `, ${POWER_TEXT[p][0]}` : ''}">${mark}</div>`;
  }).join('');
  const pips = Array.from({ length: TRACKER_MAX }, (_, i) => `<i class="${i < g.tracker ? 'on' : ''} ${i === TRACKER_MAX - 1 ? 'last' : ''}"></i>`).join('');
  return `<section class="boards" aria-label="The board">
    <div class="board a-reform"><h2 class="board-h">${art('torch')} Reforms <b>${g.reform}/${REFORM_TO_WIN}</b></h2><div class="slots five">${rs}</div></div>
    <div class="board a-cabal"><h2 class="board-h">${art('chain')} Decrees <b>${g.decree}/${DECREE_TO_WIN}</b></h2><div class="slots six">${ds}</div>
      <p class="board-note">${g.decree >= PRETENDER_DANGER ? 'Three Decrees: electing the Boss as Chancellor wins for the Syndicate.' : 'From the third Decree, the Boss must not be elected Chancellor.'}${g.vetoOn ? ' Veto is unlocked.' : ''}</p></div>
    <div class="board-foot"><span class="rejects" title="Unrest">${art('unrest')} Unrest ${pips}</span>
      <span>Draw pile <b>${g.pile}</b> · Discards <b>${g.discards}</b></span></div>
    ${g.reshuffleNow && !g.cardsApp ? `<p class="note is-warn">${ui('shuffle')} Fewer than three policies left: shuffle the discards into the draw pile.</p>` : ''}
  </section>`;
}

function marksFor(v) {
  const g = v.game; const m = {};
  for (const k of v.me?.sees || []) m[k.id] = k.tag === 'pretender' ? ['is-cabal', art('mask'), 'The Boss'] : ['is-cabal', art('chain'), 'Syndicate'];
  for (const k of v.me?.inquiries || []) m[k.id] = k.party === 'cabal' ? ['is-cabal', art('lens'), 'Inquiry: Syndicate'] : ['is-reform', art('lens'), 'Inquiry: Loyalist'];
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
    const mk = tgt?.act === 'tallyToggle' && can ? (yes ? ['is-reform', art('aye'), 'Aye'] : ['is-cabal', art('nay'), 'Nay']) : marks[p.id];
    const sp = g.speaker === p.id && v.phase !== 'over'; const ch = g.nominee === p.id && ['vote', 'legislate', 'check'].includes(v.phase);
    const limited = g.ineligible.includes(p.id) && p.id !== g.speaker && !out;
    const tag = can ? 'button' : 'div';
    const label = `${p.name}${sp ? ', Speaker' : ''}${ch ? ', Chancellor nominee' : ''}${out ? (exiled ? ', exiled' : ', executed') : ''}${limited ? ', term-limited' : ''}${mk ? `, ${mk[2]}` : ''}`;
    return `<${tag} class="knight ${p.id === v.me?.id ? 'is-me' : ''} ${ch ? 'on-team' : ''} ${can ? 'can-pick' : ''} ${out ? 'is-out' : ''} ${p.online || p.phoneless ? '' : 'is-off'}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%"
      ${can ? `type="button" data-a="${tgt.act}" data-id="${p.id}" aria-pressed="${!!yes}"` : ''} aria-label="${esc(label)}">
      <span class="knight-disc">${out ? art(exiled ? 'nay' : 'dagger') : initial(p.name)}${sp ? `<span class="knight-crown" title="Speaker">${art('speaker')}</span>` : ''}${ch ? `<span class="knight-lantern" title="Chancellor">${art('seal')}</span>` : ''}${mk ? `<span class="knight-mark ${mk[0]}" title="${esc(mk[2])}">${mk[1]}</span>` : ''}</span>
      <span class="knight-name">${esc(p.name)}${limited ? ' <small class="term">term limit</small>' : ''}</span></${tag}>`;
  }).join('');
  let felt = '';
  if (v.phase === 'nominate') felt = `<b>${esc(nameOf(v, g.speaker))}</b> holds the gavel${g.special ? ' (snap election)' : ''}.<br>Nominate a Chancellor.`;
  else if (v.phase === 'vote') felt = `<b>${esc(nameOf(v, g.speaker))}</b> and <b>${esc(nameOf(v, g.nominee))}</b>?<br>${v.mode.votes === 'app' ? `${g.voted.length} of ${g.alive.length + g.exiled.length} have voted` : 'Vote at the table'}`;
  else if (v.phase === 'legislate') felt = g.leg === 'speaker' ? `The Speaker reads three policies…` : g.leg === 'veto' ? 'A veto is proposed.' : 'The Chancellor chooses…';
  else if (v.phase === 'reveal') felt = g.appRoles ? `${g.ready.length} of ${n} have read their role` : 'Look at your card';
  else if (v.phase === 'power') felt = `<b>${esc(nameOf(v, g.speaker))}</b>: ${esc(POWER_TEXT[g.power][0])}`;
  else if (v.phase === 'check') felt = 'The chamber holds its breath.';
  else if (v.phase === 'chaos') felt = 'Unrest! Turn over the top policy.';
  else if (v.phase === 'over') felt = g.winner === 'reform' ? 'The Loyalists hold the chamber.' : 'The Syndicate takes the chamber.';
  return `<section class="round" aria-label="The table"><div class="round-felt">${art('table')}<p>${felt}</p></div>${seatEls}</section>`;
}

const tile = (p, extra = '') => `<span class="tile ${p === 'R' ? 'is-reform' : 'is-decree'} ${extra}">${art(p === 'R' ? 'torch' : 'chain')}<b>${p === 'R' ? 'Reform' : 'Decree'}</b></span>`;
function stage(v) {
  const g = v.game; const me = v.me; const host = me.host;
  const say = (t) => `<p class="say">${t}</p>`;
  const S2 = esc(nameOf(v, g.speaker)); const C2 = esc(nameOf(v, g.nominee));
  const unrestWarn = g.tracker === TRACKER_MAX - 1 ? `<p class="note is-out">${ui('warning')} Two failed governments in a row. If this one fails too, the top policy is enacted.</p>` : '';
  if (v.phase === 'reveal') {
    if (!g.appRoles || !me.role) return `<section class="stage"><h1 class="phase-title">Secret roles</h1>${say(g.appRoles ? 'The players are reading their roles.' : 'Everyone looks at their own card. The host reads the eyes-closed script from the Host tab.')}
      ${host ? '<button class="btn big" data-a="skipReveal">Everyone is ready: begin</button>' : ''}</section>`;
    const ready = g.ready.includes(me.id);
    return `<section class="stage"><h1 class="phase-title">Your secret role</h1>
      ${say('Shield your screen, tap the card to turn it over, and remember who you are.')}
      ${cardView(v)}
      ${ready ? '<p class="muted center">Waiting for the others…</p>' : '<button class="btn big" data-a="ready">I’ve read my role</button>'}
      ${host && ready ? '<button class="btn ghost" data-a="skipReveal">Begin without waiting</button>' : ''}</section>`;
  }
  if (v.phase === 'nominate') {
    const mine = g.speaker === me.id; const forS = !mine && host && isPhys(v, g.speaker);
    if (!mine && !forS) return `<section class="stage"><h1 class="phase-title">${S2} is nominating</h1>${say('Make your case out loud. Term-limited players are marked at the table.')}${unrestWarn}</section>`;
    return `<section class="stage"><h1 class="phase-title">${forS ? `Enter ${S2}’s nominee` : 'You hold the gavel'}</h1>
      ${say(forS ? `Tap the player ${S2} nominates as Chancellor.` : 'Tap a player at the table to nominate them as Chancellor. Term-limited players can’t be chosen.')}${unrestWarn}
      ${g.decree >= PRETENDER_DANGER ? `<p class="note is-out">${art('mask')} Three Decrees are down: if the Boss is elected Chancellor, the Syndicate wins.</p>` : ''}</section>`;
  }
  if (v.phase === 'vote') {
    const head = `<h1 class="phase-title">Elect this government?</h1>${say(`Speaker <b>${S2}</b>, Chancellor <b>${C2}</b>.`)}${unrestWarn}`;
    const nVoters = g.alive.length + g.exiled.length;
    if (v.mode.votes === 'physical') {
      if (!host) return `<section class="stage">${head}<p class="note">${ui('hand')} Vote at the table. On three, everyone shows Aye or Nay.</p></section>`;
      const yes = Object.values(S.ui.tally).filter(Boolean).length;
      return `<section class="stage">${head}<p class="note">${ui('hand')} Tap everyone who voted <b>Aye</b> at the table above, then confirm.</p>
        <div class="sticky-act"><button class="btn big" data-a="tallySend">Confirm: ${yes} Aye, ${nVoters - yes} Nay</button></div></section>`;
    }
    if (me.watch || me.out && !g.exiled.includes(me.id)) return `<section class="stage">${head}</section>`;
    const voted = 'vote' in me;
    return `<section class="stage">${head}
      ${voted ? `<p class="note">${ui('check')} You voted ${me.vote ? 'Aye' : 'Nay'}. Votes are shown when everyone is in.</p>`
    : `<div class="choice-pair"><button class="choice yes" data-a="vote" data-v="1">${art('aye')}Aye</button><button class="choice no" data-a="vote" data-v="0">${art('nay')}Nay</button></div>`}</section>`;
  }
  if (v.phase === 'check') {
    const c = g.check;
    const q = c.kind === 'chancellor' ? `Three Decrees are down. ${esc(nameOf(v, c.id))}, are you the Boss? Show your card to the table only if so; otherwise say “No”.` : `${esc(nameOf(v, c.id))} is ${v.house.exile ? 'exiled' : 'executed'}. Were they the Boss? Only say whether they were; don’t show the card.`;
    return `<section class="stage"><h1 class="phase-title">The question</h1>${say(q)}
      ${host ? `<div class="choice-pair"><button class="choice no" data-a="check" data-v="1">Yes, the Boss</button><button class="choice yes" data-a="check" data-v="0">No</button></div>` : ''}</section>`;
  }
  if (v.phase === 'legislate') {
    if (!g.cardsApp) {
      const head = `<h1 class="phase-title">The session</h1>${say(`${S2} draws the top three policies, discards one face down and passes two to ${C2}, who enacts one. No talking!`)}`;
      if (!host) return `<section class="stage">${head}</section>`;
      return `<section class="stage">${head}<p class="note">Which policy did ${C2} turn face up?</p>
        <div class="choice-pair"><button class="choice reform" data-a="hostEnact" data-v="R">${art('torch')}Reform</button><button class="choice decree" data-a="hostEnact" data-v="D">${art('chain')}Decree</button></div>
        ${g.vetoOn ? '<button class="btn ghost" data-a="hostVeto">The Speaker agreed to a veto</button>' : ''}</section>`;
    }
    const hand = me.hand || [];
    if (g.leg === 'speaker' && g.speaker === me.id) return `<section class="stage"><h1 class="phase-title">Discard one</h1>${say(`Tap the policy to <b>discard</b>. The other two go to ${C2}. Nobody else sees these.`)}
      <div class="tiles">${hand.map((p, i) => `<button type="button" class="tile-btn" data-a="discard" data-v="${i}" aria-label="Discard this ${p === 'R' ? 'Reform' : 'Decree'}">${tile(p)}</button>`).join('')}</div></section>`;
    if (g.leg === 'chancellor' && g.nominee === me.id) return `<section class="stage"><h1 class="phase-title">Enact one</h1>${say('Tap the policy to <b>enact</b>. The other is discarded face down.')}
      <div class="tiles">${hand.map((p, i) => `<button type="button" class="tile-btn" data-a="enact" data-v="${i}" aria-label="Enact this ${p === 'R' ? 'Reform' : 'Decree'}">${tile(p)}</button>`).join('')}</div>
      ${g.vetoOn && !g.vetoRefused ? '<button class="btn ghost" data-a="veto">Propose a veto (discard both)</button>' : g.vetoRefused ? '<p class="muted">The Speaker refused the veto. You must enact one.</p>' : ''}</section>`;
    if (g.leg === 'veto' && g.speaker === me.id) return `<section class="stage"><h1 class="phase-title">Veto?</h1>${say(`${C2} wants to veto this agenda. If you agree, both policies are discarded and Unrest moves one step.`)}
      <div class="choice-pair"><button class="choice yes" data-a="vetoReply" data-v="1">${art('aye')}Agree</button><button class="choice no" data-a="vetoReply" data-v="0">${art('nay')}Refuse</button></div></section>`;
    return `<section class="stage"><h1 class="phase-title">In session</h1>${say(g.leg === 'speaker' ? `${S2} is choosing a policy to discard.` : g.leg === 'veto' ? `${C2} proposed a veto. ${S2} decides.` : `${C2} is choosing a policy to enact.`)}</section>`;
  }
  if (v.phase === 'chaos') return `<section class="stage"><h1 class="phase-title">Unrest</h1>${say('Three failed governments. Turn over the top policy of the draw pile and place it on the board. It gives no power.')}
    ${host ? `<div class="choice-pair"><button class="choice reform" data-a="hostEnact" data-v="R">${art('torch')}Reform</button><button class="choice decree" data-a="hostEnact" data-v="D">${art('chain')}Decree</button></div>` : ''}</section>`;
  if (v.phase === 'power') {
    const pw = g.power; const [t, d] = POWER_TEXT[pw];
    const mine = g.speaker === me.id; const forS = !mine && host && isPhys(v, g.speaker);
    if (pw === 'peek') {
      if (mine && me.docket) return `<section class="stage"><h1 class="phase-title">${art('eye')} The docket</h1>${say('The top three policies, in order. Only you see this. Tell the table whatever you like.')}<div class="tiles">${me.docket.map((p) => tile(p)).join('')}</div><button class="btn big" data-a="peekDone">Done</button></section>`;
      if (mine || forS) return `<section class="stage"><h1 class="phase-title">${art('eye')} The docket</h1>${say(`${mine ? 'Look' : `${S2}, look`} at the top three policies of the draw pile without changing their order, then put them back.`)}<button class="btn big" data-a="peekDone">Done</button></section>`;
      return `<section class="stage"><h1 class="phase-title">${art('eye')} The docket</h1>${say(`${S2} looks at the top three policies.`)}</section>`;
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
  return `<section class="winner a-${side}">${art(side === 'reform' ? 'torch' : g.reason === 'pretender' ? 'mask' : 'chain')}<h1>${side === 'reform' ? 'The Loyalists win' : 'The Syndicate wins'}</h1>
      <p class="say">${why}</p>${won}</section>
    ${roles ? `<section class="stage"><h2 class="block-title">Who was who</h2><ul class="roles-list">${roles}</ul></section>` : '<section class="stage"><p class="say">Everyone, turn your cards over.</p></section>'}
    ${me?.host ? '<div class="sticky-act"><button class="btn big" data-a="again">Play again with this table</button></div>' : v.kind === 'screen' ? '' : '<p class="muted center">The host can start another game.</p>'}`;
}

function lastReveals(v) {
  const g = v.game; const out = [];
  const lv = g.lastVote; const lp = g.lastPolicy;
  if (lp && ['nominate', 'power', 'over'].includes(v.phase) && !(lv && !lv.passed && g.history.length && g.history.at(-1) === lv && v.phase === 'nominate' && g.tracker)) {
    out.push(`<section class="reveal ${S.ui.fresh.policy ? 'is-new' : ''}"><h2 class="reveal-h ${lp.policy === 'R' ? 'ok' : 'bad'}">${lp.policy === 'R' ? 'A Reform' : 'A Decree'} is enacted</h2>
      <div class="flips">${tile(lp.policy, 'flip')}</div><p class="muted center">${lp.byGov ? `By ${esc(nameOf(v, lp.speaker))} and ${esc(nameOf(v, lp.chancellor))}.` : 'Turned over by the Unrest.'}</p></section>`);
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
  const r = v.me.role; const shown = S.ui.showCard;
  const sees = (v.me.sees || []).map((k) => `<li class="is-cabal">${art(k.tag === 'pretender' ? 'mask' : 'chain')}<span><b>${esc(nameOf(v, k.id))}</b> ${k.tag === 'pretender' ? 'is the Boss' : 'is in the Syndicate'}</span></li>`).join('');
  const inq = (v.me.inquiries || []).map((k) => `<li class="${k.party === 'cabal' ? 'is-cabal' : 'is-reform'}">${art('lens')}<span>Inquiry: <b>${esc(nameOf(v, k.id))}</b> is ${k.party === 'cabal' ? 'Syndicate' : 'a Loyalist'}</span></li>`).join('');
  const peek = v.me.peeked ? `<li>${art('eye')}<span>You saw the docket: ${v.me.peeked.map((p) => (p === 'R' ? 'Reform' : 'Decree')).join(', ')}</span></li>` : '';
  const hint = { pretender: v.game.n <= 6 ? '' : 'You don’t know who the Syndicate are. They know you.', reformer: 'You know nothing. Watch the votes and the policies.' }[r.id] || '';
  const party = r.side === 'reform' ? 'Loyalist' : 'Syndicate';
  const card = `<button type="button" class="rcard-tap" data-a="flip" aria-label="${shown ? 'Hide your role' : 'Show your role'}">
    <div class="rcard a-${r.side} ${S.ui.flip ? (shown ? 'is-flipping' : 'is-unflipping') : ''}" data-face="${shown ? 'front' : 'back'}"><div class="rcard-inner">
      <div class="rcard-face rcard-front"><div class="cardart a-${r.side}">${art('sun', 'crest')}${art(ROLE_ART[r.id], 'big')}</div>
        <div class="rcard-body"><h2 class="rcard-name">${esc(r.name)}</h2><span class="side-tag a-${r.side}">Party: ${party}</span><p class="rcard-blurb">${esc(r.blurb)}</p></div></div>
      <div class="rcard-face rcard-back"><span class="rcard-back-mark">${art('sun')}</span></div></div></div></button>`;
  return `<div class="hand">${card}${shown && (sees || hint || inq || peek) ? `<ul class="sees">${sees}${inq}${peek}</ul>${hint ? `<p class="muted">${hint}</p>` : ''}` : ''}${shown ? '' : '<p class="muted">Tap to turn over</p>'}</div>`;
}

function myCardBlock(v) {
  if (v.phase === 'reveal' || v.phase === 'over' || !v.me?.role) return '';
  return `<section class="stage"><h2 class="block-title">Your role${v.me.out ? ' (you are out)' : ''}</h2>${cardView(v)}</section>`;
}

function chronicle(v) {
  const g = v.game;
  if (!g.history.length) return '';
  const items = [...g.history].reverse().map((h) => `<li class="${h.passed ? 'ok' : 'bad'}"><b>${esc(nameOf(v, h.speaker))}</b> → <b>${esc(nameOf(v, h.chancellor))}</b>: ${h.passed ? 'elected' : 'turned down'} ${h.yes}–${h.no}${h.nays.length ? ` (Nay: ${names(v, h.nays)})` : ''}.</li>`).join('');
  return `<h3 class="sub">Governments</h3><ul class="history">${items}</ul>`;
}

// ---------------------------------------------------------------- moderator script (read aloud)
function openingScript(n, physRoles) {
  const L = [];
  if (physRoles) L.push('Everyone, look at your role card and keep it hidden. Put your party card face down in front of you: diamond if your role card is a heart, club if it is a club or the king of spades.');
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
    case 'chaos': return ['Unrest! Turn over the top policy and place it on the board. Its power is ignored.'];
    case 'power': return [`${sp}, you have a power: ${POWER_TEXT[g.power][0]}.`, POWER_TEXT[g.power][1]];
    case 'over': return ['The game is over. Everyone, turn your cards over.'];
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
  const skipText = { reveal: 'Mark ready', vote: 'Skip (counts as Nay)' }[v.phase];
  const who = v.phase === 'legislate' ? (g.leg === 'chancellor' ? g.nominee : g.speaker) : g.speaker;
  const phaseSkip = { nominate: 'Pass the gavel on', legislate: g.cardsApp ? (g.leg === 'veto' ? 'Skip: refuse the veto' : g.leg === 'speaker' ? 'Skip: discard at random' : 'Skip: enact at random') : '', power: 'Skip the power' }[v.phase];
  return `<h3 class="sub">This phase</h3>
    ${idle.length ? `<ul class="dash-list">${idle.map((p) => `<li><span class="who">${esc(p.name)} <small class="muted">waiting</small></span><span class="btn-row"><button class="btn ghost sm" data-a="nudge" data-id="${p.id}">Nudge</button><button class="btn ghost sm" data-a="skip" data-id="${p.id}">${skipText}</button></span></li>`).join('')}</ul>` : ''}
    <div class="btn-row wrap">${v.phase === 'reveal' ? '<button class="btn ghost" data-a="skipReveal">Advance: first nomination</button>' : ''}
    ${['nominate', 'legislate', 'power'].includes(v.phase) && phaseSkip ? `<button class="btn ghost sm" data-a="nudge" data-id="${who}">Nudge ${esc(nameOf(v, who))}</button><button class="btn ghost" data-a="skip">${phaseSkip}</button>` : ''}</div>
    <p class="muted">Skips and undos are written in the log for everyone. A random skip is drawn by the server; nobody, including you, sees the policies.</p>
    ${v.moderator ? `<h3 class="sub">The deal (moderator only)</h3><ul class="roles-list">${seats.map((p) => { const r = v.moderator.roles[p.id]; return r ? `<li class="a-${r.side}">${art(ROLE_ART[r.id])}<span><b>${esc(p.name)}</b><small>${esc(r.name)}</small></span></li>` : ''; }).join('')}</ul>` : ''}`;
}

function hostPane(v) {
  const g = v.game;
  const script = g ? `${scriptHtml(phaseScript(v))}<details class="faq-q"><summary>Opening script (eyes closed)</summary>${scriptHtml(openingScript(g.n, !g.appRoles))}</details>`
    : `<p class="muted">Once you start, the lines to read aloud for each phase appear here.</p>`;
  return T.hostPane(v, hostControls(v), script);
}

// ---------------------------------------------------------------- shared table screen (TV / laptop)
function tableScreen(v) {
  const g = v.game;
  const head = `<header class="appbar"><span class="appbar-mark">${art('torch')}</span><div class="appbar-title">The Gilded Chamber · <span class="code">${esc(v.code)}</span></div>${T.timerChip(v)}${dimBtn()}<span class="phase-badge">${ui(PHASE[v.phase]?.[1] || 'game')}${PHASE[v.phase]?.[0] || ''}</span></header>`;
  if (!g) return `${head}<main class="wrap screen-lobby"><h1 class="phase-title">Join at ${esc(location.host)}</h1><p class="room-code">${esc(v.code)}</p><p class="say">${v.players.filter((p) => !p.watch).map((p) => esc(p.name)).join(' · ') || 'Nobody yet.'}</p></main>`;
  const lines = phaseScript(v).slice(0, 2);
  return `${head}<div class="layout is-screen"><main class="col col-main wrap game">${board(v)}${roundTable({ ...v, me: null })}${v.phase === 'over' ? over(v) : `<section class="stage"><p class="say">${esc(lines.join(' '))}</p></section>`}${lastReveals(v)}</main>
    <aside class="col col-log">${T.logPane(v, chronicle(v))}</aside><aside class="col col-side">${T.chatPane(v, true)}</aside></div>`;
}

// ---------------------------------------------------------------- transport
function wsTransport(code, asScreen) {
  let ws; let closed = false; let tries = 0; let timer;
  const creds = () => { try { return JSON.parse(store.get(`${KEY}.player.${code}`) || 'null'); } catch { return null; } };
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
    ws.onopen = () => { tries = 0; S.conn = true; const c = creds();
      if (asScreen) ws.send(JSON.stringify({ type: 'hello', screen: true }));
      else if (c) ws.send(JSON.stringify({ type: 'hello', ...c }));
      else if (S.pendingJoin) { ws.send(JSON.stringify({ type: 'hello', join: S.pendingJoin, hostKey: store.get(`${KEY}.host.${code}`) || undefined })); S.pendingJoin = null; }
      render(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'view') onView(m.view);
      else if (m.type === 'error') toast(m.error);
      else if (m.type === 'joined') store.set(`${KEY}.player.${code}`, JSON.stringify({ playerId: m.playerId, token: m.token }));
      else if (m.type === 'fatal') { if (m.clear) { store.del(`${KEY}.player.${code}`); S.view = null; toast(m.error); render(); } else { closed = true; S.fatal = m.error; render(); } }
    };
    ws.onclose = () => { if (closed) return; S.conn = false; render(); timer = setTimeout(open, Math.min(8000, 400 * 2 ** tries++)); };
  };
  open();
  return {
    send: (a) => { if (ws?.readyState === 1) ws.send(JSON.stringify(a)); else toast('Not connected to the room yet. Try again in a moment.'); },
    close: () => { closed = true; clearTimeout(timer); ws?.close(); },
  };
}

function onView(v) {
  const p = S.view;
  if (p?.game && v.game) {
    if (v.game.reform + v.game.decree > p.game.reform + p.game.decree) S.ui.fresh.policy = true;
    if (v.game.history.length > p.game.history.length) S.ui.fresh.vote = true;
  }
  if (v.phase !== p?.phase) { S.ui.showCard = false; S.ui.tally = {}; }
  if (p?.phase !== v.phase && navigator.vibrate && ['vote', 'legislate', 'power', 'over'].includes(v.phase)) try { navigator.vibrate(30); } catch { /* ignore */ }
  T.onView(p, v);
  S.view = v; render();
}

// ---------------------------------------------------------------- routing
async function route() {
  S.transport?.close(); S.transport = null; S.view = null; S.fatal = null; S.conn = true; S.ui.showCard = false;
  const [kind, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if ((kind === 'play' || kind === 'join' || kind === 'screen') && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = kind === 'screen' ? 'screen' : 'play'; S.code = arg.toUpperCase();
    const ex = await fetch(`/api/room/${S.code}`).then((r) => r.ok).catch(() => false);
    if (!ex) { store.del(`${KEY}.player.${S.code}`); S.fatal = `There’s no table with the code ${S.code}. Check the letters and try again.`; }
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
});
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || ['set', 'houseSet', 'houseSel', 'modeSet'].includes(el.dataset.a)) return;
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
      const r = await fetch('/api/create', { method: 'POST' }).then((x) => x.json()).catch(() => ({ error: 'Could not reach the server.' }));
      if (r.error) { toast(r.error); return; }
      store.set(`${KEY}.host.${r.code}`, r.hostKey);
      sessionStorage.setItem(`${KEY}.pendingJoin`, name);
      location.hash = `#/play/${r.code}`;
      return;
    }
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
    case 'flip': S.ui.showCard = !S.ui.showCard; S.ui.flip = true; render(); return;
    case 'dim': store.set(`${KEY}.dim`, $html.dataset.dim === '1' ? '0' : '1'); applyDim(); render(); return;
    case 'start': if (el.classList.contains('disabled')) { toast('Not ready to start yet.'); return; } send({ type: 'start' }); return;
    case 'nominate': if (confirm(`Nominate ${nameOf(S.view, d.id)} as Chancellor?`)) send({ type: 'nominate', id: d.id }); return;
    case 'vote': send({ type: 'vote', aye: d.v === '1' }); return;
    case 'discard': if (confirm('Discard this policy?')) send({ type: 'discard', i: +d.v }); return;
    case 'enact': if (confirm('Enact this policy?')) send({ type: 'enact', i: +d.v }); return;
    case 'veto': send({ type: 'veto' }); return;
    case 'vetoReply': send({ type: 'vetoReply', accept: d.v === '1' }); return;
    case 'hostEnact': if (confirm(`A ${d.v === 'R' ? 'Reform' : 'Decree'} was enacted?`)) send({ type: 'hostEnact', policy: d.v }); return;
    case 'hostVeto': if (confirm('Both policies are discarded and Unrest moves one step. Confirm the veto?')) send({ type: 'hostVeto' }); return;
    case 'check': send({ type: 'check', yes: d.v === '1' }); return;
    case 'power': { const pw = S.view.game.power; const verb = { investigate: 'Look into', special: 'Make the next Speaker:', execute: S.view.house.exile ? 'Exile' : 'Execute' }[pw]; if (confirm(`${verb} ${nameOf(S.view, d.id)}?`)) send({ type: 'power', id: d.id }); return; }
    case 'peekDone': send({ type: 'peekDone' }); return;
    case 'piece': send({ type: 'mode', mode: { play: 'hybrid', [d.k]: d.v } }); return;
    case 'tallyToggle': S.ui.tally[d.id] = !S.ui.tally[d.id]; render(); return;
    case 'tallySend': send({ type: 'tally', ayes: Object.keys(S.ui.tally).filter((k) => S.ui.tally[k]) }); return;
    case 'skip': send({ type: 'skip', id: d.id }); return;
    case 'move': case 'ready': case 'skipReveal': case 'again': case 'shuffleSeats':
      send({ type: a, id: d.id, dir: d.dir }); return;
    default:
  }
}

route();
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
