// Shared by tools/drift-check.mjs and tools/anim-check.mjs: a local stand-in for the Worker (public/ + the room reducer over
// WebSockets), the headless Chrome helpers and the iPhone profile.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { newRoom, reduce, broadcastPlan, endedNow } from '../public/js/room.js';

// puppeteer-core and ws are optional dev tools, not dependencies: `npm i --no-save puppeteer-core ws`.
const require = createRequire(import.meta.url);
export const puppeteer = require('puppeteer-core');
const { WebSocketServer } = require('ws');
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png', webmanifest: 'application/json', pdf: 'application/pdf' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// ---- local server: static files, /api, and /ws/<code> using the same reducer as src/worker.js
const rooms = new Map(); const socks = new Map();
export const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/create' && req.method === 'POST') {
    const code = [...Array(6)].map(() => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); const hostKey = Math.random().toString(16).slice(2);
    rooms.set(code, newRoom(code, hostKey)); socks.set(code, new Set()); return json({ code, hostKey });
  }
  const ex = u.pathname.match(/^\/api\/room\/([A-Z]{6})$/); if (ex) return rooms.has(ex[1]) ? json({ exists: true }) : json({ exists: false }, 404);
  const f = path.join(PUB, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
});
export const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  const m = req.url.match(/^\/ws\/([A-Za-z]{6})$/); const code = m?.[1].toUpperCase();
  if (!code || !rooms.has(code)) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => {
    const room = rooms.get(code); const set = socks.get(code); ws.att = { who: null }; set.add(ws);
    const send = (o) => { try { ws.send(JSON.stringify(o)); } catch { /* gone */ } };
    const broadcast = (gameOver = false) => {
      const list = [...set].map((w) => ({ ws: w, ...w.att })); const connected = new Set(list.map((s) => s.playerId).filter(Boolean));
      for (const { ws: w, msgs } of broadcastPlan(room, list, connected, { gameOver })) for (const x of msgs) w.send(JSON.stringify(x));
    };
    ws.on('close', () => { set.delete(ws); broadcast(); });
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === 'hello') {
        if (msg.playerId) { const p = room.players.find((x) => x.id === msg.playerId); if (!p || p.token !== msg.token) return send({ type: 'fatal', error: 'Could not rejoin.', clear: true }); ws.att = { who: 'player', playerId: p.id }; }
        else if (msg.join) { const r = reduce(room, { anon: true }, { type: 'join', name: msg.join, hostKey: msg.hostKey }); if (r.error) return send({ type: 'error', error: r.error }); ws.att = { who: 'player', playerId: r.data.playerId }; send({ type: 'joined', ...r.data }); }
        else if (msg.screen) ws.att = { who: 'screen' };
        else return send({ type: 'lobby', phase: room.phase, count: room.players.length });
        return broadcast();
      }
      if (ws.att.who !== 'player') return;
      const before = room.phase; const r = reduce(room, { playerId: ws.att.playerId }, msg);
      if (r.error) return send({ type: 'error', error: r.error });
      broadcast(endedNow(before, room));
    });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
export const BASE = `http://127.0.0.1:${server.address().port}`;
