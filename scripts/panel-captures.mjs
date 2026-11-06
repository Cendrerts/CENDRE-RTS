// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/panel-captures.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = process.cwd();
const server = createServer(async (request, response) => {
  try {
    const path = resolve(
      root,
      'public' + new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html'),
    );
    let content = await readFile(path);
    if (path.endsWith('/game.js'))
      content =
        content.toString().replace('Math.min((t - last) / 1000, 0.05)', '0') +
        `\nwindow.panelFixture = (mode, team = 0) => {
      player = team;
      state = Sim.create();
      state.rubies[player] = 999;
      selected.clear();
      panelContext = {};
      buildGhost = null;
      if (mode === 'units') {
        Sim.spawn(state, 'knight', player, state.bases[player]);
        selected = new Set(state.units.filter(unit => unit.team === player).map(unit => unit.id));
      }
      if (mode === 'bases') {
        state.explored[player].fill(1);
        panelContext = { baseId: 'main_' + player, bases: true };
      }
      if (mode === 'slot') {
        const slot = state.slots[player][0];
        panelContext = { baseId: slot.baseId, slotId: slot.id };
      }
      if (mode === 'base') panelContext = {baseId: 'main_' + player};
      if (mode === 'production') {
        const slot = state.slots[player][0];
        Sim.construct(state, player, Sim.BUILDINGS[player][0].id, slot.baseId, slot.id);
        for (let i = 0; i < 8; i++) Sim.recruit(state, 'knight', player, slot.id);
        panelContext = {producerId: slot.id};
      }
      paused = false;
      toastTime = 0;
      $('#toast').style.opacity = '0';
      cameraX = state.bases[player].x;
      cameraY = state.bases[player].y;
      layout();
      updateUI();
    };
    window.panelProbe = () => {
      const slot = state.slots[player][0];
      return {
        occupied: slot.occupe,
        selected: selected.size,
        point: {x: slot.x * scale + ox, y: slot.y * scale + oy}
      };
    };`;
    response.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }[extname(path)] || 'application/octet-stream',
    );
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/game/`);
  await page.locator('#start').click();
  await mkdir('artifacts/issue-40', { recursive: true });
  for (const team of [0, 1])
    for (const mode of ['empty', 'units', 'collapsed', 'production', 'base', 'slot', 'bases']) {
      await page.evaluate(([mode, team]) => window.panelFixture(mode, team), [mode, team]);
      if (mode === 'collapsed') {
        await page.evaluate(([team]) => window.panelFixture('units', team), [team]);
        await page.locator('#panelChevron').click();
        await page.evaluate(([team]) => window.panelFixture('units', team), [team]);
        assert.equal(await page.locator('#contextPanel').getAttribute('data-collapsed'), 'true');
      } else if ((await page.locator('#contextPanel').getAttribute('data-collapsed')) === 'true') {
        await page.locator('#panelTab').click();
      }
      await page.waitForTimeout(100);
      await page.screenshot({ path: `artifacts/issue-40/${team}-${mode}.png` });
      const geometry = await page.locator('#contextPanel').evaluate((panel) => ({
        mode: panel.dataset.mode,
        rect: panel.getBoundingClientRect().toJSON(),
        overflow: [...panel.querySelectorAll('*')]
          .filter(
            (el) =>
              el.clientWidth > 0 &&
              (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1),
          )
          .map((el) => ({
            element: el.id || el.className || el.tagName,
            text: el.textContent,
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
            height: el.clientHeight,
            scrollHeight: el.scrollHeight,
          })),
        buttons: [...panel.querySelectorAll('button')]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            text: el.textContent,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
      }));
      assert.equal(
        geometry.mode,
        mode === 'bases' || mode === 'slot' ? 'base' : mode === 'collapsed' ? 'units' : mode,
      );
      assert.equal(geometry.rect.height, mode === 'collapsed' || mode === 'empty' ? 24 : 112);
      assert.deepEqual(geometry.overflow, []);
      assert(
        geometry.buttons.every(
          (button) => button.width >= 44 && (button.height >= 44 || mode === 'collapsed'),
        ),
      );
      console.log(`PASS faction ${team}, ${mode}: no overflow, targets >= 44px`);
    }
  // Real pointer actions exercise recruitment, cancellation and direct slot construction.
  await page.evaluate(() => window.panelFixture('empty'));
  await page.locator('#baseAction').click();
  await page.getByRole('button', { name: 'Bases', exact: true }).click();
  await page.locator('#contextGrid button').first().click();
  await page.locator('#contextGrid button').first().click();
  await page.waitForTimeout(250);
  await page.locator('#contextActions button').first().click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#contextActions .queue-cell').count(), 0);
  for (const mode of ['slot', 'base']) {
    await page.evaluate((mode) => window.panelFixture(mode), mode);
    if (mode === 'base') await page.getByRole('button', { name: 'Bâtiments', exact: true }).click();
    await page.locator('#contextGrid button').first().click();
    if (mode === 'base') {
      const { point } = await page.evaluate(() => window.panelProbe());
      await page.locator('#field').click({ position: point });
    }
    assert.equal((await page.evaluate(() => window.panelProbe())).occupied, true);
  }
  await page.evaluate(() => window.panelFixture('units'));
  assert.equal(await page.locator('#contextGrid button').count(), 2);
  await page.locator('#contextGrid button').first().click();
  assert.equal((await page.evaluate(() => window.panelProbe())).selected, 1);
  await page.evaluate(() => window.panelFixture('units'));
  const portrait = await page.locator('#contextGrid button').first().boundingBox();
  await page.mouse.move(portrait.x + 20, portrait.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  assert.equal((await page.evaluate(() => window.panelProbe())).selected, 1);
  await page.evaluate(() => window.panelFixture('units'));
  const panelRect = await page.locator('#contextPanel').boundingBox();
  await page.mouse.move(panelRect.x + 80, panelRect.y + 10);
  await page.mouse.down();
  await page.mouse.move(panelRect.x + 80, panelRect.y + 60);
  await page.mouse.up();
  assert.equal(await page.locator('#contextPanel').getAttribute('data-collapsed'), 'true');
  await page.locator('#panelTab').click();
  assert.equal(await page.locator('#contextPanel').getAttribute('data-collapsed'), 'false');
  const attack = await page.locator('#attackAction').boundingBox();
  const selection = await page.locator('#selectionToggle').boundingBox();
  const base = await page.locator('#baseAction').boundingBox();
  assert.equal(attack.width, 84);
  assert.equal(selection.width, 56);
  assert(selection.y + selection.height <= attack.y);
  assert(base.y + base.height <= selection.y);
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    'artifacts/issue-40/PR.md',
    `Panneau compact avec portrait et vie, quatre actions, sélection au-dessus d’Attaquer et Base côté droit. Repli par chevron ou glissement, persistant lors des sélections, groupes visibles et onglet de réouverture. Les files affichent seulement les commandes en cours et leur compteur. Patrouille partagée solo/serveur avec validation des destinations et des unités autorisées.

Vérifié : tests Node, syntaxe JavaScript, captures Chromium 844×390 des unités, panneau rabattu, base, emplacement et production pour les deux factions ; recrutement, annulation, construction, filtrage par tap et appui long.

À tester sur téléphone : confort des pouces, glissement de repli, lisibilité, appuis longs et patrouille en duel avec latence.
`,
  );
} finally {
  await browser.close();
  server.close();
}
