// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/rally-capture.mjs
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
    window.rallyProbe = () => state.slots[player][0].rally;
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
  await mkdir('artifacts/issue-43', { recursive: true });
  await page.evaluate(() => window.panelFixture('production'));
  const bounds = await page.locator('#rallyAction').boundingBox();
  assert(bounds.width >= 44 && bounds.height >= 44);
  await page.locator('#rallyAction').click();
  await page.mouse.click(565, 165);
  assert.equal(await page.locator('#rallyAction').getAttribute('aria-pressed'), 'false');
  const rally = await page.evaluate(() => window.rallyProbe());
  assert(rally && Number.isFinite(rally.x));
  const queueBoxes = await page.locator('.queue-cell').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().toJSON()));
  assert.equal(queueBoxes.length, 8);
  assert(queueBoxes.every((box) => box.width >= 44 && box.height >= 44 && box.bottom <= 390));
  await page.screenshot({ path: 'artifacts/issue-43/ralliement-844x390.png' });
  // Long press on empty ground must replace the rally without arming the button.
  await page.mouse.move(585, 150);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const after = await page.evaluate(() => window.rallyProbe());
  assert(after && after.x !== rally.x);
  assert.deepEqual(errors, []);
  console.log('PASS: 844×390 rally button, map placement, long press and screenshot.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
