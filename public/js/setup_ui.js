// The host's setup, drawn as four steps (Members, Table rules, Seating, Deal) and the Presets page. Pure string renderers:
// setup_flow.js owns the state and the events, the tests check the words. One step is rendered at a time, so nothing off
// screen can take focus. Every blocked Next shows its reason right above the button and a link that fixes it.
import { SETUP_STEPS, SEATINGS, SEATING_TEXT, SEATING_MODE, PRESETS, presetFits, presetRange, needsText, mixFor, setsLine, stepProblem, furthestStep,
  houseMatches, advancedSummary, playersLine, recommendedFor, DIFFICULTY } from './presets.js';
import { setupComposition, houseEffects } from './steppers.js';
import { ROLE_ART } from './art.js';

// The advanced switches (moved here from the old long setup screen). Same keys and words as before.
export const HOUSE_ROWS = [
  ['rebalance', 'Rebalanced Tables', 'Community variant: at 6 players one Decree starts on the board; at 7 one Decree, and at 9 two Decrees, are left out of the policy pile.'],
  ['exile', 'Exile Instead of Execution', 'Removed players stay at the table and still vote, but can’t hold office or be nominated. Exiling the Boss still wins for the Loyalists.'],
  ['anonVotes', 'Anonymous Votes', 'Show only the count of Ayes and Nays, not who voted how.'],
  ['noClaims', 'No-Claims Mode', 'Turns off posting claims in the chat. Claims are made out loud.'],
  ['sitOut', 'Host Sits Out', 'The host doesn’t get a role and sees the whole deal on their own phone.'],
];
export const PIECE_TEXT = { roles: 'Secret Roles', votes: 'Aye/Nay Votes', cards: 'Policy Tiles' };
const TIMER_OPTS = [[0, 'Off'], [60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min'], [300, '5 min']];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pips = (d) => `<span class="gs-pips" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= (DIFFICULTY[d] || 1) ? 'on' : ''}"></i>`).join('')}</span>`;

// Top row: Back (steps 2 to 4), the four dots, "Step n of 4: Name". Dots up to the furthest valid step jump; the rest are disabled.
function topBar(st, ctx) {
  const { ui } = ctx; const last = furthestStep(ctx.n, ctx.preset);
  const dots = SETUP_STEPS.map((s, i) => {
    const can = i <= Math.max(st.step, last);
    return `<li><button type="button" class="gs-dot ${i === st.step ? 'now' : i < st.step ? 'done' : ''}" data-a="gsGo" data-i="${i}" data-dot="${i}" ${i === st.step ? 'aria-current="step"' : ''} ${can ? '' : 'aria-disabled="true"'} aria-label="Step ${i + 1}, ${s.label}${i < st.step ? ', done' : ''}"><span aria-hidden="true">${i + 1}</span></button></li>`;
  }).join('');
  return `<div class="gs-top">${st.step > 0 ? `<button type="button" class="gs-back" data-a="gsBack">${ui('back')}Back</button>` : '<span class="gs-sp"></span>'}
    <ol class="gs-dots" role="group" aria-label="Setup steps">${dots}</ol><span class="gs-stepof">Step ${st.step + 1} of ${SETUP_STEPS.length}: ${SETUP_STEPS[st.step].label}</span></div>`;
}

function dock(st, ctx, dealLabel) {
  const prob = stepProblem(st.step, ctx.n, ctx.preset, ctx.modeIssue);
  const last = st.step === SETUP_STEPS.length - 1;
  const label = last ? dealLabel : `Next: ${SETUP_STEPS[st.step].next}`;
  const why = prob ? `<p class="gs-why" id="gs-why" role="note">${ctx.esc(prob.reason)} <button type="button" class="gs-link" data-a="gsFix" data-go="${prob.fix.go}">${ctx.esc(prob.fix.label)}</button></p>` : '';
  return `<div class="gs-dock">${why}<button type="button" class="gs-pri" data-a="${last ? 'start' : 'gsNext'}" ${prob ? 'aria-disabled="true" aria-describedby="gs-why"' : ''}>${ctx.esc(label)}</button></div>`;
}

function chips(ctx) {
  const { v, esc, ui } = ctx; const me = v.me; const host = me.host;
  return v.players.map((p) => {
    const mark = p.host ? 'Host' : p.id === me.id ? 'You' : '';
    return `<li class="gs-chip"><span class="gs-ini" aria-hidden="true">${esc(([...String(p.name).trim()][0] || '?').toUpperCase())}</span><span class="gs-nm">${esc(p.name)}${p.watch ? ' <small>sitting out</small>' : ''}${mark ? ` <small>${mark}</small>` : ''}</span>${p.phoneless ? '' : `<span class="gs-dev" title="On their own phone" role="img" aria-label="On their own phone">${ui('phone')}</span>`}${host && !p.host ? `<button type="button" class="gs-x" data-a="kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ui('x')}</button>` : ''}</li>`;
  }).join('');
}

function stepPlayers(st, ctx) {
  const { v, esc, ui, link, draft } = ctx; const n = ctx.n;
  return `<h1 class="gs-h" tabindex="-1">Who sits in the chamber?</h1>
    <p class="gs-code">${ui('phone')}<span>Members join with code <b>${esc(v.code)}</b></span><button type="button" class="gs-link" data-a="qrFull" data-link="${esc(link)}" data-code="${esc(v.code)}">Show QR</button></p>
    <section class="gs-block"><p class="gs-grp">${plural(n, 'member', 'members')}</p><ul class="gs-chips">${chips(ctx)}</ul></section>
    <div class="gs-add"><input data-i="seatName" maxlength="20" placeholder="Add a name" aria-label="Add a name" autocomplete="off" enterkeyhint="done" value="${esc(draft.seatName || '')}"><button type="button" class="gs-sec" data-a="addSeat">Add</button></div>
    <p class="gs-callout">${ui('info')}Names are only kept for this room.</p>`;
}

function stepRules(st, ctx) {
  const { esc, ui, art, preset, n } = ctx;
  const comp = setupComposition(n);
  const rec = recommendedFor(n).id === preset.id;
  const fits = presetFits(preset, n);
  const edited = !houseMatches(preset, ctx.v.house);
  const rows = comp.rows.map((r) => `<li class="gs-role a-${r.side}"><span class="gs-tok">${art(r.icon)}</span><span class="gs-rt"><b>${esc(r.label)}</b><small>${esc(r.blurb)}</small></span><b class="gs-ct">${r.count}</b></li>`).join('');
  return `<h1 class="gs-h" tabindex="-1">Choose the table rules</h1><p class="gs-sub">For ${plural(n, 'member', 'members')}.</p>
    <article class="gs-stock"><div class="gs-stock-top"><h2 class="gs-disp">${esc(preset.name)}</h2><span class="gs-diff">${esc(preset.difficulty)} ${pips(preset.difficulty)}</span></div>
      <p>${esc(preset.vibe)}</p><p class="gs-small">${rec ? `Recommended for ${n}. ` : ''}${esc(setsLine(preset))}${edited ? '. Edited on the next step.' : '.'}</p>${fits ? '' : `<p class="gs-small is-warn">${esc(needsText(preset, n))}</p>`}</article>
    <button type="button" class="gs-link" data-a="gsPresets">Change preset ${ui('caret-down', 'gs-caret')}</button>
    <section class="gs-block"><p class="gs-grp">Roles, fixed by table size</p><ul class="gs-roles">${rows}</ul></section>`;
}

function stepSeating(st, ctx) {
  const { esc, ui, v } = ctx; const cur = ctx.seating;
  const seated = v.players.filter((p) => !p.watch); const off = seated.filter((p) => p.phoneless).length;
  const dyn = { mixed: `${seated.length - off} on their phones, ${off} on this phone.` };
  const icon = { own: 'phone', one: 'hand', mixed: 'cards' };
  const opts = SEATINGS.map((k) => `<button type="button" class="gs-opt ${cur === k ? 'on' : ''}" role="radio" aria-checked="${cur === k}" data-a="gsSeat" data-v="${k}"><span class="gs-oico">${ui(icon[k])}</span><span class="gs-ot"><b>${SEATING_TEXT[k][0]}</b><span>${esc(k === 'mixed' && off ? dyn.mixed : SEATING_TEXT[k][1])}</span></span><i class="gs-radio" aria-hidden="true"></i></button>`).join('');
  const m = v.mode;
  const pieces = cur === 'mixed' ? `<div class="gs-pieces"><p class="gs-grp">For each piece, who handles it</p>${Object.entries(PIECE_TEXT).map(([k, t]) => `<div class="gs-piece"><span>${t}</span><span class="gs-seg" role="group" aria-label="${t}">${[['app', 'The app'], ['physical', 'The table']].map(([x, l]) => `<button type="button" data-a="piece" data-k="${k}" data-v="${x}" aria-pressed="${m[k] === x}">${l}</button>`).join('')}</span></div>`).join('')}</div>` : '';
  return `<h1 class="gs-h" tabindex="-1">How is everyone playing?</h1><p class="gs-sub">${plural(ctx.n, 'member', 'members')}</p>
    <div class="gs-opts" role="radiogroup" aria-label="Seating">${opts}</div>${pieces}
    <p class="gs-note">Picked from who joined in step 1. Change it any time before you deal.</p>`;
}

function stepDeal(st, ctx) {
  const { esc, ui, art, v, preset, n } = ctx;
  const edited = !houseMatches(preset, v.house);
  const sum = (k, val, go) => `<li class="gs-sum"><span class="gs-k">${k}</span><span class="gs-v">${val}</span><button type="button" class="gs-link" data-a="gsGo" data-i="${go}" aria-label="Edit ${k.toLowerCase()}">Edit</button></li>`;
  const tokens = mixFor(n).map((m) => `<span class="gs-mini a-${m.id === 'reformer' ? 'reform' : 'cabal'}"><span class="gs-tok s" title="${esc(m.label)}">${art(ROLE_ART[m.id])}</span><small>×${m.count}</small></span>`).join('');
  const seatingName = `${SEATING_TEXT[ctx.seating][0]}, ${ctx.modeNames[SEATING_MODE[ctx.seating]]}`;
  return `<h1 class="gs-h" tabindex="-1">Ready to deal?</h1><p class="gs-sub">Room ${esc(v.code)}</p>
    <ul class="gs-sums">${sum('Members', esc(playersLine(v.players)), 0)}${sum('Table rules', `${esc(preset.name)}${edited ? ' <small>edited</small>' : ''}`, 1)}${sum('Seating', esc(seatingName), 2)}</ul>
    <div class="gs-rolesrow"><p class="gs-grp">Roles in this game</p><div class="gs-minis">${tokens}</div><button type="button" class="gs-link" data-a="roles">See the roles</button></div>
    <section class="gs-adv"><button type="button" class="gs-advbtn" data-a="gsAdv" aria-expanded="${st.adv}" aria-controls="gs-adv-body">${ui('caret-down', `gs-caret ${st.adv ? 'open' : ''}`)}<b>Advanced</b><span>${esc(advancedSummary(v.house))}</span></button>
      <div id="gs-adv-body" class="gs-advbody" ${st.adv ? '' : 'hidden'}>${st.adv ? advanced(ctx) : ''}</div></section>`;
}

function advanced(ctx) {
  const { v, esc, ui } = ctx; const fx = Object.fromEntries(houseEffects(ctx.n, v.house).map((h) => [h.key, h.effect]));
  const sw = HOUSE_ROWS.map(([k, t, d]) => `<label class="gs-tg"><input type="checkbox" data-a="houseSet" data-k="${k}" ${v.house[k] ? 'checked' : ''}><span><b>${t}</b><span>${esc(fx[k] || d)}</span></span></label>`).join('');
  const sel = (k, opts) => `<select data-a="houseSel" data-k="${k}" aria-label="${k}">${opts.map(([val, l]) => `<option value="${val}" ${String(v.house[k]) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const seats = v.players.map((p, i) => `<li><span class="gs-nm">${i + 1}. ${esc(p.name)}</span><button type="button" class="gs-ib" data-a="move" data-id="${p.id}" data-dir="up" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}>${ui('caret-down', 'flip-up')}</button><button type="button" class="gs-ib" data-a="move" data-id="${p.id}" data-dir="down" aria-label="Move ${esc(p.name)} down" ${i === v.players.length - 1 ? 'disabled' : ''}>${ui('caret-down')}</button></li>`).join('');
  return `<div class="gs-tgs">${sw}
    <label class="gs-tg"><span><b>Phase Timer</b><span>A countdown starts each phase. Nothing happens at zero; the host decides.</span></span>${sel('turnTimer', TIMER_OPTS)}</label>
    <label class="gs-tg"><span><b>Vote Reveal Delay</b><span>A short drumroll before the votes are shown.</span></span>${sel('revealDelay', [[0, 'Off'], [3, '3 sec'], [5, '5 sec']])}</label>
    <label class="gs-tg"><span><b>First Speaker</b><span>Who holds the gavel first.</span></span>${sel('firstLeader', [['random', 'Random'], ['host', 'The host']])}</label></div>
    <p class="gs-grp">Seat order</p><p class="gs-note">The order the Speaker role travels. Match it to how you are sitting.</p><ul class="gs-seatord">${seats}</ul>
    <div class="gs-advact"><button type="button" class="gs-sec" data-a="shuffleSeats">${ui('shuffle')} Shuffle seats</button><button type="button" class="gs-sec" data-a="gsSave">${ui('save')} Save as a preset</button></div>`;
}

// The host's whole setup. ctx: { v, st, n, preset, seating, esc, ui, art, link, draft }.
export function setupScreen(ctx) {
  const { st, v } = ctx;
  const body = [stepPlayers, stepRules, stepSeating, stepDeal][st.step](st, ctx);
  const dealLabel = v.mode.roles === 'app' ? `Deal ${ctx.n} roles` : 'Start game';
  return `<section class="gs" data-step="${st.step}" aria-label="Setup">${topBar(st, ctx)}<div class="gs-slide" data-slide="${st.step}">${body}</div>${dock(st, ctx, dealLabel)}</section>`;
}

// A card on the Presets page: one tap target. Out-of-range cards stay in the list, dimmed.
function presetCard(p, ctx, { cur, rec }) {
  const { esc, ui, n } = ctx; const fits = presetFits(p, n);
  return `<li class="gs-pre ${cur ? 'cur' : ''} ${p.saved ? 'saved' : ''} ${fits ? '' : 'off'}"><button type="button" class="gs-prebtn" data-a="gsPick" data-id="${esc(p.id)}" aria-label="${esc(p.name)}. ${esc(p.vibe)} ${fits ? presetRange(p) : needsText(p, n)}${cur ? '. Picked' : ''}">
    <span class="gs-pre-top"><span class="gs-disp">${esc(p.name)}</span>${cur ? `<span class="gs-sel">${ui('check')}Picked</span>` : p.saved ? `<span class="gs-badge">${ui('check')}Saved</span>` : ''}</span>
    <span class="gs-vibe">${esc(p.vibe)}</span>
    <span class="gs-meta"><span>${fits ? presetRange(p) : needsText(p, n)}</span><span>${esc(p.difficulty)} ${pips(p.difficulty)}</span></span>
    <span class="gs-sets">${esc(setsLine(p))}${rec ? '. Recommended' : ''}</span></button>
    ${p.saved ? `<button type="button" class="gs-more" data-a="gsMenu" data-id="${esc(p.id)}" aria-label="More for ${esc(p.name)}">${ui('pencil')}</button>` : ''}</li>`;
}

export function presetsPage(ctx) {
  const { st, n, saved, preset } = ctx; const rec = recommendedFor(n); const builtIn = PRESETS.filter((p) => p.id !== rec.id);
  const group = (title, list, o = {}) => list.length ? `<section class="gs-block"><h2 class="gs-grp">${title}</h2><ul class="gs-prelist">${list.map((p) => presetCard(p, ctx, { cur: p.id === st.presetId, rec: o.rec && p.id === rec.id })).join('')}</ul></section>` : '';
  return `<section class="gs gs-page" aria-label="Presets"><div class="gs-top"><button type="button" class="gs-back" data-a="gsPresetsBack">${ctx.ui('back')}Back</button><span class="gs-sp"></span></div>
    <h1 class="gs-h" tabindex="-1">Presets</h1><p class="gs-sub">${plural(n, 'player', 'players')}. Tap one to see what it sets.</p>
    ${group(`Recommended for ${n}`, [rec], { rec: true })}${group('Built in', builtIn)}${group('Saved on this phone', saved)}
    <p class="gs-callout">${ctx.ui('info')}Saved presets stay on this phone only.</p>
    <div class="gs-dock"><button type="button" class="gs-pri" data-a="gsPresetsBack">Use ${ctx.esc(preset.name)}</button></div></section>`;
}

// The preview sheet body for one preset at n players.
export function previewBody(p, ctx) {
  const { esc, art, n } = ctx; const fits = presetFits(p, n); const mix = mixFor(n);
  const [r, c] = [mix[0].count, mix[1].count + mix[2].count];
  const rows = mix.map((m) => `<li class="gs-role a-${m.id === 'reformer' ? 'reform' : 'cabal'}"><span class="gs-tok">${art(ROLE_ART[m.id])}</span><span class="gs-rt"><b>${esc(m.label)}</b></span><b class="gs-ct">${m.count}</b></li>`).join('');
  const fx = houseEffects(n, {}).filter((h) => (h.key === 'rebalance' && p.settings.house.rebalance) || (h.key === 'exile' && p.settings.house.exile)).map((h) => `<li>${esc(h.label)}: ${esc(h.effect)}</li>`).join('');
  return `${p.saved ? '<p class="gs-badge inline">Saved on this phone</p>' : ''}<p>${esc(p.vibe)} ${esc(p.difficulty)}, for ${p.min} to ${p.max} players.</p>
    ${fits ? '' : `<p class="gs-small is-warn" role="note">${esc(needsText(p, n))}</p>`}
    <p class="gs-grp">Roles for ${plural(n, 'player', 'players')}, fixed by table size</p><ul class="gs-roles">${rows}</ul>
    <div class="gs-bar" role="img" aria-label="${r} Loyalists against ${c} Syndicate"><i class="a" style="flex:${r}"></i><i class="b" style="flex:${c}"></i></div>
    <p class="gs-small">${r} Loyalists against ${c} on the Syndicate side, the Boss included.</p>
    <p class="gs-grp">What it sets</p><p>${esc(setsLine(p))}</p>${fx ? `<ul class="gs-fx">${fx}</ul>` : ''}`;
}
