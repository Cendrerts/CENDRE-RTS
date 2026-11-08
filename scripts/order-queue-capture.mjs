// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/order-queue-capture.mjs
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
      selected.clear();
      panelContext = {};
      buildGhost = null;
      if (mode === 'units') {
        state.units = [state.units[player]];
        const unit = state.units[0];
        Object.assign(unit, { x: 650, y: 450, harvest: null, path: [] });
        selected = new Set([unit.id]);
      }
      if (mode === 'base') panelContext = {baseId: 'main_' + player};
      Sim.visibility(state);
      paused = false;
      toastTime = 0;
      $('#toast').style.opacity = '0';
      cameraX = 850;
      cameraY = 450;
      layout();
      updateUI();
    };
    window.queueProbe = () => state.units.find(unit => selected.has(unit.id)).orderQueue;
`;
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
  await mkdir('artifacts/issue-64', { recursive: true });
  await page.evaluate(() => window.panelFixture('units'));
  const bounds = await page.locator('#queueOrders').boundingBox();
  assert(bounds.width >= 44 && bounds.height >= 44);
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= 390);
  await page.locator('#queueOrders').click();
  assert.equal(await page.locator('#queueOrders').getAttribute('aria-pressed'), 'true');
  for (const point of [[300, 210], [420, 145], [540, 210]]) {
    await page.mouse.click(...point);
  }
  await page.waitForTimeout(100);
  const queue = await page.evaluate(() => window.queueProbe());
  assert.equal(queue.length, 3);
  await page.screenshot({ path: 'artifacts/issue-64/enchainer-844x390.png' });
  await page.evaluate(() => window.panelFixture('base'));
  await page.evaluate(() => window.panelFixture('units'));
  assert.equal(await page.locator('#queueOrders').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
