// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/idle-workers-capture.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
      if (mode === 'idle') {
        Sim.spawn(state, 'commis', player, state.bases[player]);
        for (const unit of state.units.filter(unit => unit.team === player)) {
          Sim.order(state, [unit.id], unit.x, unit.y);
          unit.path = [];
        }
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
        ids: [...selected],
        camera: { x: cameraX, y: cameraY },
        workers: state.units.filter(unit => selected.has(unit.id)).map(unit => ({
          x: unit.x, y: unit.y, harvest: unit.harvest
        })),
        mine: { x: state.mines[0].x * scale + ox, y: state.mines[0].y * scale + oy },
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
  await page.evaluate(() => window.panelFixture('idle'));
  const button = page.locator('#idleWorkers');
  assert.match(await button.textContent(), /2$/);
  const rect = await button.boundingBox();
  assert(rect.width >= 44 && rect.height >= 44);
  for (const selector of ['#minimap', '#contextActions', '#controlGroups']) {
    const other = await page.locator(selector).boundingBox();
    if (!other) continue;
    assert(rect.x + rect.width <= other.x || other.x + other.width <= rect.x ||
      rect.y + rect.height <= other.y || other.y + other.height <= rect.y, selector);
  }
  for (const collapsed of ['true', 'false']) {
    await page.locator('#contextPanel').evaluate((panel, value) => {
      panel.dataset.collapsed = value;
    }, collapsed);
    const idleRect = await button.boundingBox();
    const groupButtons = page.locator('#controlGroups button');
    assert.equal(await groupButtons.count(), 4);
    const targets = [idleRect];
    for (const groupButton of await groupButtons.all()) {
      targets.push(await groupButton.boundingBox());
    }
    for (const [index, target] of targets.entries()) {
      assert(target.width >= 44 && target.height >= 44);
      assert(target.x >= 0 && target.y >= 0);
      assert(target.x + target.width <= 844 && target.y + target.height <= 390);
      for (const other of targets.slice(index + 1)) {
        assert(
          target.x + target.width <= other.x || other.x + other.width <= target.x ||
          target.y + target.height <= other.y || other.y + other.height <= target.y,
          `Touch targets overlap with collapsed=${collapsed}`,
        );
      }
    }
  }
  await button.click();
  assert.equal((await page.evaluate(() => window.panelProbe())).selected, 1);
  const first = await page.evaluate(() => window.panelProbe());
  assert.deepEqual(first.camera, { x: first.workers[0].x, y: first.workers[0].y });
  await button.click();
  const second = await page.evaluate(() => window.panelProbe());
  assert.notDeepEqual(second.ids, first.ids);
  await page.mouse.move(rect.x + 20, rect.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  assert.equal((await page.evaluate(() => window.panelProbe())).selected, 2);
  await mkdir('artifacts/issue-49', { recursive: true });
  await page.screenshot({ path: 'artifacts/issue-49/idle-workers-844x390.png' });
  const probe = await page.evaluate(() => window.panelProbe());
  await page.locator('#field').click({ position: probe.mine });
  const assigned = await page.evaluate(() => window.panelProbe());
  assert(assigned.workers.every(worker => worker.harvest?.mine === 0));
  assert.equal(await button.isVisible(), false);
  await page.evaluate(() => window.panelFixture('base'));
  assert.equal(await button.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS 844×390, count, visibility, target size, no overlap, tap and long press');
} finally {
  await browser.close();
  server.close();
}
