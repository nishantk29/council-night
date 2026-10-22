// Plays whole Council Night games against a running server with scripted players (no LLM).
// Usage: BASE=http://127.0.0.1:8862 GAMES=30 SEED=1 node scripts/sim-games.mjs   (Node 22+, global WebSocket)
// Checks every view for leaks (other roles, hands, the docket, deck order), that the rules hold, and that games finish.
import { POWERS, startingDeck } from '../public/js/rules.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8862';
const GAMES = +(process.env.GAMES || 30);
let seed = +(process.env.SEED || 1);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WS = BASE.replace(/^http/, 'ws');
const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fran', 'Gus', 'Hal', 'Ivy', 'Jo', "O'Neil", 'Zoë <b>', 'Ann-Marie', '李'];

class Seat {
  constructor(code, name, hostKey) { this.code = code; this.name = name; this.hostKey = hostKey; this.view = null; this.errors = []; }
  open(extra = {}) {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${WS}/ws/${this.code}`);
      this.ws.onopen = () => this.ws.send(JSON.stringify({ type: 'hello', join: this.name, hostKey: this.hostKey, ...extra }));
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'joined') { this.id = m.playerId; this.token = m.token; res(); }
        else if (m.type === 'view') { this.view = m.view; if (extra.screen) res(); }
        else if (m.type === 'error') this.errors.push(m.error);
        else if (m.type === 'fatal') rej(new Error(m.error));
      };
      this.ws.onerror = () => rej(new Error('ws error'));
    });
  }
  async reconnect() {
    this.ws.close(); await sleep(30);
    await new Promise((res) => {
      this.ws = new WebSocket(`${WS}/ws/${this.code}`);
      this.ws.onopen = () => this.ws.send(JSON.stringify({ type: 'hello', playerId: this.id, token: this.token }));
      this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'view') { this.view = m.view; res(); } else if (m.type === 'error') this.errors.push(m.error); };
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* */ } }
}
async function until(fn, what, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(8); }
  throw new Error(`timeout waiting for ${what}`);
}
const sig = (v) => JSON.stringify([v.phase, v.game?.speaker, v.game?.nominee, v.game?.reform, v.game?.decree, v.game?.tracker, v.game?.leg, v.game?.power, v.game?.voted?.length, v.game?.history?.length, v.log?.at(-1)?.n]);

const stats = { reform: 0, cabal: 0, reasons: {}, powers: {}, vetoes: 0, chaos: 0, reshuffles: 0, steps: 0 };
async function game(g) {
  const n = 5 + (g % 6);
  const hybrid = g % 5 === 4; // votes at the table, host tallies
  const exile = g % 7 === 6; const rebalance = g % 4 === 1;
  const r = await fetch(`${BASE}/api/create`, { method: 'POST' }).then((x) => x.json());
  const seats = []; const used = new Set();
  for (let i = 0; i < n; i++) {
    let nm; do nm = pick(NAMES) + (rnd() < 0.3 ? ` ${i}` : ''); while (used.has(nm.toLowerCase()));
    used.add(nm.toLowerCase());
    const s = new Seat(r.code, nm, i === 0 ? r.hostKey : undefined); await s.open(); seats.push(s);
  }
  const screen = new Seat(r.code); await screen.open({ screen: true, join: undefined });
  const host = seats[0]; const by = (id) => seats.find((s) => s.id === id);
  const fail = (m) => { throw new Error(`game ${g} (${n}p ${r.code}): ${m}`); };
  await until(() => seats.every((s) => s.view?.players.length === n), 'lobby');
  host.send({ type: 'house', house: { exile, rebalance, anonVotes: g % 9 === 8 } });
  if (hybrid) host.send({ type: 'mode', mode: { play: 'hybrid', roles: 'app', votes: 'physical', cards: 'app' } });
  await sleep(40); host.send({ type: 'start' });
  await until(() => seats.every((s) => s.view?.phase === 'reveal'), 'reveal');
  const mine = Object.fromEntries(seats.map((s) => [s.id, s.view.me.role.id]));
  const pre = Object.keys(mine).find((id) => mine[id] === 'pretender');
  for (const s of seats) s.send({ type: 'ready' });
  await until(() => host.view.phase === 'nominate', 'nominate');
  if (rnd() < 0.4) await pick(seats.slice(1)).reconnect();
  const total = startingDeck(n, rebalance);
  const deckSize = total.deck.length + total.decree;

  const check = () => {
    for (const s of [...seats, screen]) {
      const v = s.view; const txt = JSON.stringify(v);
      if (/token|hostKey/.test(txt)) fail('secret field in a view');
      if (v.phase !== 'over' && /"roles":\{/.test(txt)) fail(`${s.name || 'screen'}: full deal leaked`);
      if (/"deck":\[|"discard":\[/.test(txt)) fail('deck order leaked');
      if (s === screen && /"role":\{|"hand":|"docket":|"sees":|"inquiries":/.test(txt)) fail('table screen leak');
      if (s !== screen && v.me?.hand) { const ok = (v.game.leg === 'speaker' && s.id === v.game.speaker) || (v.game.leg !== 'speaker' && s.id === v.game.nominee); if (!ok) fail(`${s.name} holds a hand they should not`); }
      if (s !== screen && v.me?.docket && s.id !== v.game.speaker) fail('docket leaked');
      if (s !== screen && v.me?.sees) for (const k of v.me.sees) if (mine[k.id] === 'reformer') fail('knowledge wrong');
    }
    const G = host.view.game;
    if (G && host.view.phase !== 'over' && G.pile + G.discards + G.reform + G.decree + (host.view.me.hand?.length || 0) + (by(G.nominee)?.view.me.hand?.length || 0) * (G.leg !== 'speaker' ? 1 : 0) !== deckSize) {
      if (host.view.phase !== 'legislate') fail(`tile count ${G.pile}+${G.discards}+${G.reform}+${G.decree} != ${deckSize}`);
    }
  };

  let last = ''; let lastDecree = 0;
  for (let step = 0; step < 400; step++) {
    const v = host.view; check(); stats.steps++;
    if (v.phase === 'over') break;
    const G = v.game; const S = by(G.speaker);
    const cab = (id) => mine[id] !== 'reformer';
    if (v.phase === 'nominate') {
      const opts = G.alive.filter((id) => id !== G.speaker && !G.ineligible.includes(id));
      if (!opts.length) fail('no eligible Chancellor');
      let ch = pick(opts);
      if (cab(G.speaker) && G.decree >= 3 && opts.includes(pre) && rnd() < 0.6) ch = pre;
      if (rnd() < 0.08) { host.send({ type: 'skip' }); } else S.send({ type: 'nominate', id: ch });
    } else if (v.phase === 'vote') {
      const vs = seats.filter((s) => !G.dead.includes(s.id) || G.exiled.includes(s.id));
      const aye = (s) => (cab(s.id) ? cab(G.nominee) || rnd() < 0.5 : (G.tracker === 2 ? rnd() < 0.8 : rnd() < 0.55));
      if (hybrid) host.send({ type: 'tally', ayes: vs.filter(aye).map((s) => s.id) });
      else for (const s of vs) if (!G.voted.includes(s.id)) { if (rnd() < 0.03) host.send({ type: 'skip', id: s.id }); else s.send({ type: 'vote', aye: aye(s) }); }
    } else if (v.phase === 'legislate') {
      if (G.leg === 'speaker') { const h = S.view.me.hand; if (!h || h.length !== 3) { await sleep(10); continue; } const want = cab(S.id) ? 'R' : 'D'; const i = Math.max(0, h.indexOf(want)); S.send({ type: 'discard', i }); }
      else if (G.leg === 'chancellor') {
        const C = by(G.nominee); const h = C.view.me.hand; if (!h || h.length !== 2) { await sleep(10); continue; }
        if (G.vetoOn && !G.vetoRefused && rnd() < 0.4) { C.send({ type: 'veto' }); }
        else { const want = cab(C.id) ? 'D' : 'R'; C.send({ type: 'enact', i: Math.max(0, h.indexOf(want)) }); }
      } else if (G.leg === 'veto') { const acc = rnd() < 0.5; if (acc) stats.vetoes++; S.send({ type: 'vetoReply', accept: acc }); }
    } else if (v.phase === 'power') {
      stats.powers[G.power] = (stats.powers[G.power] || 0) + 1;
      if (POWERS[n][G.decree - 1] !== G.power) fail(`power ${G.power} on Decree ${G.decree}`);
      if (G.power === 'peek') { await until(() => S.view.me.docket, 'docket'); S.send({ type: 'peekDone' }); }
      else {
        const opts = G.alive.filter((id) => id !== G.speaker && !(G.power === 'investigate' && G.investigated.includes(id)) && !(G.power === 'special' && G.exiled.includes(id)));
        S.send({ type: 'power', id: pick(opts) });
      }
    } else fail(`unexpected phase ${v.phase}`);
    if (G.decree !== lastDecree) lastDecree = G.decree;
    const before = sig(v);
    try { await until(() => sig(host.view) !== before, `progress from ${v.phase}/${G.leg || ''}`, 4000); } catch (e) {
      const H = host.view.game; fail(`${e.message}; errors: ${seats.flatMap((s) => s.errors).slice(-3).join(' | ')}; speaker ${H.speaker} alive ${H.alive.length} inel ${H.ineligible.join(',')} seats ${seats.map((s) => `${s.id}:${s.ws.readyState}`).join(',')} last ${JSON.stringify(host.view.log.slice(-3).map((l) => l.text))}`);
    }
    await sleep(15);
    last = before;
  }
  await until(() => seats.every((s) => s.view.phase === 'over') && screen.view.phase === 'over', 'everyone sees the end');
  check();
  const G = host.view.game;
  if (!G.winner) fail('no winner');
  if (Object.keys(G.roles).length !== n) fail('roles not revealed at the end');
  for (const id of Object.keys(mine)) if (G.roles[id].id !== mine[id]) fail('end reveal disagrees with the deal');
  const okWin = G.winner === 'reform' ? (G.reason === 'reforms' ? G.reform === 5 : G.dead.includes(pre))
    : (G.reason === 'decrees' ? G.decree === 6 : G.lastGov?.chancellor === pre && G.decree >= 3);
  if (!okWin) fail(`win does not follow the rules: ${G.winner}/${G.reason}`);
  stats[G.winner]++; stats.reasons[G.reason] = (stats.reasons[G.reason] || 0) + 1;
  stats.reshuffles += G.reshuffles; stats.chaos += host.view.log.filter((l) => /^Unrest: the top/.test(l.text)).length;
  if (rnd() < 0.5) { host.send({ type: 'again' }); await until(() => host.view.phase === 'lobby', 'back to lobby'); }
  for (const s of [...seats, screen]) s.close();
}

const t0 = Date.now(); let failed = 0;
for (let g = 0; g < GAMES; g++) { try { await game(g); } catch (e) { failed++; console.error('FAIL', e.message); } }
console.log(JSON.stringify({ base: BASE, games: GAMES, failed, ...stats, secs: Math.round((Date.now() - t0) / 1000) }));
process.exit(failed ? 1 : 0);
