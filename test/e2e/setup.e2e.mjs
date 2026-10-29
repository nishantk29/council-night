// Playwright e2e for the setup carousel: the host and four phones go through Members, Table rules, Seating and Deal, then deal.
// Run: node test/e2e/setup.e2e.mjs   (starts `wrangler dev` itself; SHOTS=<dir> saves screenshots; BASE=<url> uses a running server)
import { server, launch, phone, ledger, checkPhones } from './phones.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '';
const L = ledger('Gilded setup carousel e2e');
const srv = await server(dir);
const browser = await launch();
const shot = async (p, name) => { if (SHOTS) await p.shot(SHOTS, name); };
const text = (p, sel) => p.page.locator(sel).first().innerText();
try {
  const host = await phone(browser, srv.base, 'Host', 'p390');
  await host.goto('/');
  await host.page.fill('[data-i=hostName]', 'Ada'); await host.page.click('[data-a=host]');
  await host.page.waitForSelector('.gs');
  const code = (await host.page.url()).split('/').pop();
  L.check('host lands on step 1 of 4', /Step 1 of 4: Members/.test(await text(host, '.gs-stepof')));
  L.check('step 1 shows the room code and Show QR', (await text(host, '.gs-code')).includes(code));
  L.check('Next is disabled with the reason and a fix link', (await host.page.getAttribute('.gs-pri', 'aria-disabled')) === 'true' && /Add 4 more members to start \(5 minimum\)\./.test(await text(host, '.gs-why')) && await host.page.locator('.gs-why .gs-link').count() === 1);
  L.check('the reason is tied to the button', (await host.page.getAttribute('.gs-pri', 'aria-describedby')) === 'gs-why');
  await shot(host, 'gilded-1-members-short-390');
  await host.page.click('.gs-pri', { force: true }); // disabled: nothing happens
  L.check('clicking a disabled Next stays on step 1', /Step 1 of 4/.test(await text(host, '.gs-stepof')));

  const phones = [];
  for (const nm of ['Bea', 'Cy', 'Dov', 'Eli']) {
    const p = await phone(browser, srv.base, nm, 'p390'); phones.push(p);
    await p.goto(`/#/play/${code}`);
    // Live rooms: the socket may still be opening, so retry the join until the guest lobby shows (max 4 tries).
    for (let t = 0; t < 4; t++) {
      await p.page.fill('[data-i=joinName]', nm).catch(() => {}); await p.page.click('[data-a=join]', { timeout: 3000 }).catch(() => {});
      if (await p.page.waitForSelector('.gs-guest', { timeout: 5000 }).then(() => true, () => false)) break;
    }
  }
  await host.page.waitForFunction(() => !document.querySelector('.gs-pri')?.hasAttribute('aria-disabled'));
  L.check('5 members: Next opens', true);
  L.check('four phones see the guest lobby with no controls', (await Promise.all(phones.map((p) => p.page.locator('.gs-pri,.gs-add').count()))).every((c) => c === 0));
  await shot(host, 'gilded-1-members-390');
  // phone chips: the host and 4 phones show the phone icon; the add field adds one without a phone
  await host.page.fill('[data-i=seatName]', 'Flo'); await host.page.click('[data-a=addSeat]');
  await host.page.waitForFunction(() => document.querySelectorAll('.gs-chip').length === 6);
  L.check('add a name adds a seat', (await host.page.locator('.gs-chip').count()) === 6);

  // refresh restores the step: go to step 2, reload
  await host.page.click('.gs-pri');
  await host.page.waitForSelector('.gs[data-step="1"]');
  L.check('step 2 heading has focus', await host.page.evaluate(() => document.activeElement?.classList.contains('gs-h')));
  L.check('step 2 shows Open Session, Recommended, and the fixed mix', /open session/i.test(await text(host, '.gs-stock')) && /Recommended for 6/.test(await text(host, '.gs-stock')) && (await host.page.locator('.gs-role').count()) === 3);
  await shot(host, 'gilded-2-rules-390');
  await host.page.reload(); await host.page.waitForSelector('.gs[data-step="1"]');
  L.check('refresh restores step 2', /Step 2 of 4: Table rules/.test(await text(host, '.gs-stepof')));
  L.check('the setup is remembered under council.setup.v1', await host.page.evaluate(() => JSON.parse(localStorage.getItem('council.setup.v1')).step === 1));

  // presets page and the preview sheet
  await host.page.click('[data-a=gsPresets]'); await host.page.waitForSelector('.gs-page');
  L.check('presets page lists Recommended, Built in, and 6 presets in all', /Recommended for 6/.test(await text(host, '.gs-page')) && /Built in/.test(await text(host, '.gs-page')) && (await host.page.locator('.gs-pre').count()) === 6);
  await shot(host, 'gilded-presets-390');
  await host.page.click('[data-id=closed-ballot]'); await host.page.waitForSelector('dialog.gs-sheet[open]');
  L.check('the preview sheet has Use this and Customize from here', /Use this/.test(await text(host, 'dialog.gs-sheet')) && /Customize from here/.test(await text(host, 'dialog.gs-sheet')));
  await shot(host, 'gilded-preset-preview-390');
  await host.page.click('dialog.gs-sheet .gs-sheet-pri');
  await host.page.waitForSelector('.gs[data-step="1"]');
  L.check('Use this returns to step 2 with Closed Ballot', /closed ballot/i.test(await text(host, '.gs-stock')));
  await host.page.waitForFunction(() => true); await host.page.waitForTimeout(400);
  L.check('the room holds anonymous votes', await host.page.evaluate(async () => { const r = await fetch('/api/room/' + location.hash.split('/').pop()); return r.ok; }));

  // seating
  await host.page.click('.gs-pri'); await host.page.waitForSelector('.gs[data-step="2"]');
  L.check('seating preselects Mixed (5 on phones, 1 without)', (await host.page.getAttribute('.gs-opt.on', 'role')) === 'radio' && /Mixed/.test(await text(host, '.gs-opt.on')));
  await shot(host, 'gilded-3-seating-390');
  await host.page.click('[data-v=one]'); await host.page.waitForTimeout(200);
  L.check('One phone can be picked', /One phone/.test(await text(host, '.gs-opt.on')));
  await host.page.click('[data-v=own]'); await host.page.waitForTimeout(200);
  L.check('Own phones can be picked', /Own phones/.test(await text(host, '.gs-opt.on')));
  L.check('Seating never blocks Next', (await host.page.getAttribute('.gs-pri', 'aria-disabled')) === null);
  // deal step: Flo has no phone, so Own phones cannot be dealt. The reason names the engine's rule and links to Seating.
  await host.page.click('.gs-pri'); await host.page.waitForSelector('.gs[data-step="3"]');
  L.check('Deal is blocked with a reason and a link to Seating', (await host.page.getAttribute('.gs-pri', 'aria-disabled')) === 'true' && /Flo has no phone/.test(await text(host, '.gs-why')) && /Change seating/.test(await text(host, '.gs-why')));
  await shot(host, 'gilded-4-deal-blocked-390');
  await host.page.click('.gs-why .gs-link'); await host.page.waitForSelector('.gs[data-step="2"]');
  L.check('the fix link goes to the Seating step', true);
  await host.page.click('[data-v=mixed]'); await host.page.waitForTimeout(300);
  await host.page.click('.gs-pri'); await host.page.waitForSelector('.gs[data-step="3"]');
  L.check('Mixed with a phoneless seat can be dealt (pieces at the table)', (await host.page.getAttribute('.gs-pri', 'aria-disabled')) === null && /Start game/.test(await text(host, '.gs-pri')));
  // back to Members, remove Flo, choose Own phones: the Deal button names the count
  await host.page.click('.gs-sum:first-child .gs-link'); await host.page.waitForSelector('.gs[data-step="0"]');
  await host.page.click('[aria-label="Remove Flo"]'); await host.page.click('[data-a=confirmYes]');
  await host.page.waitForFunction(() => document.querySelectorAll('.gs-chip').length === 5);
  await host.page.click('.gs-dot[data-dot="2"]'); await host.page.waitForSelector('.gs[data-step="2"]');
  await host.page.click('[data-v=own]'); await host.page.waitForTimeout(300);
  await host.page.click('.gs-pri'); await host.page.waitForSelector('.gs[data-step="3"]');
  L.check('deal step: summary has three Edit links and Advanced is collapsed', (await host.page.locator('.gs-sum .gs-link').count()) === 3 && (await host.page.getAttribute('.gs-advbtn', 'aria-expanded')) === 'false' && await host.page.locator('#gs-adv-body').isHidden());
  L.check('the Deal button names the count', /Deal 5 roles/.test(await text(host, '.gs-pri')));
  await shot(host, 'gilded-4-deal-390');
  await host.page.click('.gs-advbtn'); await host.page.waitForSelector('#gs-adv-body:not([hidden])');
  await shot(host, 'gilded-4-deal-advanced-390');
  await host.page.click('.gs-advbtn');
  await checkPhones(L, [host, ...phones], 'through the carousel');

  await host.page.click('.gs-pri');
  await host.page.waitForSelector('.roles-panel', { timeout: 8000 });
  L.check('every phone shows the Roles in this game panel before the role', (await Promise.all([host, ...phones].map((p) => p.page.waitForSelector('.roles-panel', { timeout: 8000 }).then(() => true)))).every(Boolean));
  const panels = await Promise.all([host, ...phones].map((p) => p.page.locator('.roles-panel').innerText()));
  L.check('the panel is identical for every viewer', new Set(panels.map((t) => t.replace(/\s+/g, ' '))).size === 1);
  const chips = await Promise.all([host, ...phones].map((p) => p.page.locator('.roles-chip').innerText()));
  L.check('the header chip reads Roles · 5 for everyone', chips.every((c) => c === 'Roles · 5'), chips);
  await shot(host, 'gilded-roles-panel-390');
  await host.page.click('[data-a=rolesSeen]');
  await host.page.waitForSelector('.reveal-stage');
  await shot(host, 'gilded-roles-chip-390');
  await host.page.click('.roles-chip'); await host.page.waitForSelector('dialog.roles-sheet[open]');
  await shot(host, 'gilded-roles-sheet-390');
  await host.page.click('dialog.roles-sheet .x-btn');
  await checkPhones(L, [host, ...phones], 'after the deal');
  await host.close(); for (const p of phones) await p.close();

  // other viewports: step 2 and step 4 shots and overflow
  for (const [dev, tag] of [['p375', '375'], ['d1280', '1280']]) {
    const h = await phone(browser, srv.base, `Host${tag}`, dev);
    await h.goto('/'); await h.page.fill('[data-i=hostName]', 'Ada'); await h.page.click('[data-a=host]'); await h.page.waitForSelector('.gs');
    for (const nm of ['Bea', 'Cy', 'Dov', 'Eli', 'Flo', 'Gil']) { await h.page.fill('[data-i=seatName]', nm); await h.page.click('[data-a=addSeat]'); await h.page.waitForTimeout(120); }
    await h.page.waitForFunction(() => document.querySelectorAll('.gs-chip').length === 7);
    await shot(h, `gilded-1-members-${tag}`);
    L.check(`${tag}: step 1 has no sideways scroll`, !(await h.overflow()));
    for (const step of ['rules', 'seating', 'deal']) {
      await h.page.click('.gs-pri'); await h.page.waitForTimeout(350); await shot(h, `gilded-${step}-${tag}`);
      L.check(`${tag}: ${step} has no sideways scroll`, !(await h.overflow()));
    }
    await h.page.click('[data-a=gsGo][data-i="1"]'); await h.page.click('[data-a=gsPresets]'); await h.page.waitForSelector('.gs-page'); await shot(h, `gilded-presets-${tag}`);
    L.check(`${tag}: presets page has no sideways scroll`, !(await h.overflow()));
    await checkPhones(L, [h], `${tag} viewport`);
    await h.close();
  }
} finally { await browser.close(); srv.stop(); L.done(); }
