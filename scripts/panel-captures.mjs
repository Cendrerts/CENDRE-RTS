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
  await mkdir('artifacts/issue-34', { recursive: true });
  for (const team of [0, 1])
    for (const mode of ['empty', 'units', 'production', 'base', 'bases']) {
      await page.evaluate(([mode, team]) => window.panelFixture(mode, team), [mode, team]);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `artifacts/issue-34/${team}-${mode}.png` });
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
      assert.equal(geometry.mode, mode === 'bases' ? 'base' : mode);
      assert.equal(geometry.rect.height, mode === 'empty' ? 52 : 130);
      assert.deepEqual(geometry.overflow, []);
      assert(geometry.buttons.every((button) => button.width >= 44 && button.height >= 44));
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
  assert.equal(await page.locator('#contextActions button:not(:disabled)').count(), 0);
  for (const mode of ['slot', 'base']) {
    await page.evaluate((mode) => window.panelFixture(mode), mode);
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
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    'artifacts/issue-34/PR.md',
    `Remplace les tiroirs et le deck par un panneau contextuel pleine largeur : barre de 52 px sans sélection, panneau de 130 px sinon. Les quatre groupes restent accessibles, avec filtrage des unités, construction directe ou fantôme, bases découvertes et production avec annulation remboursée. Les annulations utilisent un identifiant stable pour éviter de toucher le travail suivant après un délai réseau.

Vérifications : tests/panel.mjs couvre les quatre contextes et les deux factions, la capacité et la pureté du modèle, les mines découvertes sous brouillard, les files et le remboursement. scripts/panel-captures.mjs vérifie dans Chromium à 844×390 l’absence de débordement, les cibles de 44 px minimum et les clics de recrutement, annulation, construction directe et fantôme, filtrage par tap et appui long.

À vérifier sur téléphone : lisibilité des icônes, confort des pouces, appuis longs, zones sûres iOS/Android et duel réel avec latence.

Captures 844×390 (fichiers locaux non commités, à joindre à la PR) :

![Aucune sélection](0-empty.png)
![Unités](0-units.png)
![Production](0-production.png)
![Base et construction](0-base.png)
![Bases découvertes](0-bases.png)

![Rats sans sélection](1-empty.png)
![Unités Rats](1-units.png)
![Production Rats](1-production.png)
![Construction Rats](1-base.png)
![Bases Rats](1-bases.png)
`,
  );
} finally {
  await browser.close();
  server.close();
}
