// E2E (browser, Chromium): Undo and Redo on five phones in a real chamber (wrangler dev, real workerd + local DO).
// Part A, policy tiles at the table (every step public): the host's Undo names the step; every phone follows; players
// get "The host went back a step"; Redo shows only when there is something to redo; five Reforms end the game; Undo
// from the end screen asks first, hides the roles again on every phone, and Redo ends it again.
// Part B, everything on phones: once the Speaker has seen the hand and discarded, Undo is greyed, says why, and a tap
// changes nothing. No console errors.
// Run: node test/e2e/undo.e2e.mjs   Shots: SHOTS=<dir>. Exit 1 on any failure.
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const NAMES = ['E2E Ben', 'E2E Cal', 'E2E Dee', 'E2E Eve'];
const L = ledger('gilded undo e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toastOf = (p) => p.page.evaluate(() => document.getElementById('toast')?.textContent || '');
const phaseOf = (p) => p.page.evaluate(() => document.querySelector('.phase-badge')?.textContent || '');
const undoTitle = (p) => p.page.locator('[data-a="undo"]').getAttribute('title');
const waitTitle = (p, re) => p.page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-a="undo"]')?.getAttribute('title') || ''), re.source, { timeout: 8000 }).catch(() => {});
try {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-i="hostName"]').fill('E2E Ana');
  await host.page.locator('[data-a="host"]').click();
  await host.page.waitForFunction(() => /#\/play\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  const players = [];
  for (const n of NAMES) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/play/' + code);
    const input = p.page.locator('[data-i="joinName"]');
    await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) {
      await input.fill(n).catch(() => {}); await p.page.locator('[data-a="join"]').click({ timeout: 3000 }).catch(() => {});
      await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
    }
  }
  await host.page.waitForFunction((ns) => ns.every((n) => document.body.innerText.includes(n)), NAMES, { timeout: 15000 }).catch(() => {});

  // Setup: Members, Table rules, Seating (mixed: policy tiles at the table), Deal.
  const deal = async (seating) => {
    const step = () => host.page.evaluate(() => +(document.querySelector('.gs')?.dataset.step ?? -1));
    for (let k = 0; k < 4 && (await step()) < 2; k++) { const at = await step(); await host.page.locator('.gs-pri').click({ timeout: 10000 }); await host.page.waitForSelector(`.gs[data-step="${at + 1}"]`, { timeout: 5000 }); }
    for (let k = 0; k < 4 && (await step()) > 2; k++) { await host.page.locator('[data-a="gsBack"], .gs-back').first().click({ timeout: 5000 }); await sleep(300); }
    await host.page.locator(`[data-a="gsSeat"][data-v="${seating}"]`).click();
    if (seating === 'mixed') {
      for (const [k, v] of [['roles', 'app'], ['votes', 'app'], ['cards', 'physical']]) { await host.page.locator(`[data-a="piece"][data-k="${k}"][data-v="${v}"]`).click(); await sleep(300); }
    }
    await host.page.locator('.gs-pri').click({ timeout: 10000 }); await host.page.waitForSelector('.gs[data-step="3"]', { timeout: 5000 });
    await host.page.locator('.gs-pri').click({ timeout: 10000 });
    for (const p of all) await p.page.locator('[data-a="rolesSeen"]').click({ timeout: 15000 }).catch(() => {});
  };
  const hostTab = async () => { await host.page.locator('[data-a="tab"][data-v="host"]').click(); await host.page.locator('[data-a="undo"]').waitFor({ timeout: 5000 }); };
  const gameTab = () => host.page.locator('[data-a="tab"][data-v="game"]').click();
  const speaker = async () => {
    for (let k = 0; k < 40; k++) { for (const p of all) if (await p.page.locator('[data-a="nominate"]').count()) return p; await sleep(250); }
    throw new Error('no phone holds the gavel');
  };
  const nominate = async () => { const s = await speaker(); await s.page.locator('[data-a="nominate"]').first().click(); await s.page.locator('[data-a="dockSend"]:not([aria-disabled])').click({ timeout: 5000 }); return s; };
  const voteAll = async () => { for (const p of all) await p.page.locator('[data-a="vote"][data-v="1"]').click({ timeout: 8000 }).catch(() => {}); await sleep(500); };

  // ---------- Part A ----------
  await deal('mixed');
  await hostTab();
  await host.page.locator('[data-a="skipReveal"]').first().click({ timeout: 10000 });
  await waitTitle(host, /^Undo: Skipping the reveal$/);
  L.check('Undo names the step: “Undo: Skipping the reveal”', (await undoTitle(host)) === 'Undo: Skipping the reveal', await undoTitle(host));
  L.check('no Redo button while there is nothing to redo', (await host.page.locator('[data-a="redo"]').count()) === 0);
  await gameTab();
  await nominate();
  await hostTab(); await waitTitle(host, /nominated$/);
  const label = (await undoTitle(host)).replace(/^Undo: /, '');
  L.check('Undo names the nomination', / nominated$/.test(label), label);
  if (SHOTS) await host.shot(SHOTS, 'engine-gilded-host-undo');
  await host.page.locator('[data-a="undo"]').click();
  await host.page.locator('[data-a="redo"]').waitFor({ timeout: 8000 }).catch(() => {});
  L.check('the host is told what was undone', (await toastOf(host)) === `Undone: ${label}`, await toastOf(host));
  const told = await Promise.all(players.map(toastOf));
  L.check('every player phone says “The host went back a step.”', told.every((t) => t === 'The host went back a step.'), told.join(' | '));
  L.check('Redo appears and names the step', (await host.page.locator('[data-a="redo"]').getAttribute('title')) === `Redo: ${label}`);
  if (SHOTS) await host.shot(SHOTS, 'engine-gilded-host-redo');
  const back = await Promise.all(all.map(phaseOf));
  L.check('every phone is back at the nomination', back.every((x) => /nominat/i.test(x)), back.join(','));
  await host.page.locator('[data-a="redo"]').click();
  await host.page.locator('[data-a="redo"]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  L.check('Redo brings the step back and the Redo button goes', (await host.page.locator('[data-a="redo"]').count()) === 0 && (await toastOf(host)) === `Redone: ${label}`, await toastOf(host));
  L.check('players are told the host redid a step', (await Promise.all(players.map(toastOf))).every((t) => t === 'The host redid a step.'));

  // Five elected governments, the host enters a Reform each time: the Loyalists win.
  await gameTab();
  for (let round = 0; round < 5; round++) {
    if (round) await nominate();
    await voteAll();
    await host.page.locator('[data-a="pickPolicy"][data-v="R"]').click({ timeout: 8000 });
    await host.page.locator('[data-a="dockSend"]:not([aria-disabled])').click({ timeout: 5000 });
    await sleep(700);
  }
  await host.page.waitForFunction(() => /5 Reforms passed/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
  const overText = await Promise.all(all.map((p) => p.page.evaluate(() => document.body.innerText)));
  L.check('five Reforms end the game on every phone', overText.every((t) => /5 Reforms passed/.test(t)), await phaseOf(host));
  for (const p of all) await p.page.keyboard.press('Escape').catch(() => {});
  await sleep(400);

  // Undo from the end screen asks first; going back hides the roles again everywhere.
  await hostTab();
  await host.page.locator('[data-a="undo"]').click();
  const sheet = host.page.locator('dialog.confirm-sheet');
  await sheet.waitFor({ timeout: 5000 }).catch(() => {});
  L.check('Undo on the end screen asks first, in plain words', /Every phone hides the roles again/.test(await sheet.innerText().catch(() => '')), await sheet.innerText().catch(() => 'no sheet'));
  if (SHOTS) await host.shot(SHOTS, 'engine-gilded-host-undo-over-confirm');
  await host.page.locator('dialog.confirm-sheet [data-a="confirmYes"]').click();
  await host.page.locator('[data-a="redo"]').waitFor({ timeout: 8000 }).catch(() => {});
  await sleep(500);
  const phases = await Promise.all(all.map(phaseOf));
  L.check('every phone is back in the game', phases.every((x) => !/over/i.test(x)), phases.join(','));
  const still = await Promise.all(players.map((p) => p.page.evaluate(() => /5 Reforms passed|Waiting for the host/.test(document.body.innerText))));
  L.check('no phone still shows the end screen', still.every((x) => !x));
  await host.page.locator('[data-a="redo"]').click();
  await host.page.waitForFunction(() => /over/i.test(document.querySelector('.phase-badge')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const again = await Promise.all(all.map(phaseOf));
  L.check('Redo ends the game again', again.every((x) => /over/i.test(x)), again.join(','));
  await checkPhones(L, all, 'after undo and redo');

  // ---------- Part B ----------
  for (const p of all) await p.page.keyboard.press('Escape').catch(() => {});
  await gameTab();
  await host.page.locator('[data-a="again"]').first().click({ timeout: 5000 }); // Change setup first: back to the lobby
  await host.page.locator('.gs').waitFor({ timeout: 8000 });
  await deal('own');
  await hostTab();
  await host.page.locator('[data-a="skipReveal"]').first().click({ timeout: 10000 });
  await gameTab();
  const s = await nominate();
  await voteAll();
  await s.page.locator('[data-a="reveal"]').first().click({ timeout: 8000 }); // a quick tap shows the hand for 4 s
  await sleep(700); // the lift that ends a hold is not a choice (noClickUntil)
  await s.page.locator('[data-a="pickCard"]').first().click({ timeout: 8000 });
  await s.page.locator('[data-a="dockSend"]:not([aria-disabled])').click({ timeout: 5000 });
  await sleep(600);
  await hostTab();
  await host.page.waitForFunction(() => document.querySelector('[data-a="undo"]')?.classList.contains('disabled'), null, { timeout: 8000 }).catch(() => {});
  const why = await undoTitle(host);
  L.check('after the discard Undo is greyed and says why', /secret policies/.test(why) && (await host.page.locator('[data-a="undo"].disabled').count()) === 1, why);
  const before = await Promise.all(all.map(phaseOf));
  await host.page.locator('[data-a="undo"]').click();
  await sleep(400);
  L.check('a tap shows the reason', /secret policies/.test(await toastOf(host)), await toastOf(host));
  L.check('and changes nothing', (await Promise.all(all.map(phaseOf))).join() === before.join());
  if (SHOTS) await host.shot(SHOTS, 'engine-gilded-host-undo-secret');
  await checkPhones(L, all, 'after a refused undo');
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
  if (SHOTS) for (const [i, p] of all.entries()) await p.shot(SHOTS, `undo-e2e-fail-${i}`).catch(() => {});
  console.log(String(e?.stack || e).split('\n').slice(0, 4).join('\n'));
} finally {
  await browser.close(); srv.stop(); L.done();
}
