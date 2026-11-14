// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/watchtowers-capture.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (request, response) => {
  try {
    const path = resolve('public' + new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
    let content = await readFile(path);
    if (path.endsWith('/game.js')) {
      content = content.toString().replace('Math.min((t - last) / 1000, 0.05)', '0') + `
window.towerCapture = (stage) => {
  state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  const tower = state.watchtowers[0];
  Sim.spawn(state, 'knight', player);
  const unit = state.units.at(-1);
  Object.assign(unit, { x: tower.x - 50, y: tower.y + 30, hold: true, path: [], harvest: null });
  if (stage !== 'neutre') {
    for (let index = 0; index < (stage === 'capture' ? 40 : 80); index++) Sim.tick(state, 0.05);
  }
  Sim.visibility(state);
  cameraX = tower.x;
  cameraY = tower.y;
  zoom = 2.6;
  toastTime = 0;
  $('#toast').textContent = '';
  layout();
  updateUI();
};
window.loseTower = () => {
  state.units = [];
  const tower = state.watchtowers[0];
  Sim.spawn(state, 'knight', 1 - player);
  Object.assign(state.units.at(-1), { x: tower.x, y: tower.y, hold: true, path: [], harvest: null });
  for (let index = 0; index < 80; index++) Sim.tick(state, 0.05);
  updateUI();
};`;
    }
    response.setHeader('Content-Type', {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[extname(path)] || 'application/octet-stream');
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/game/`);
  await page.waitForFunction(() => window.towerCapture);
  await page.locator('#start').click();
  await mkdir('docs/issue-116', { recursive: true });
  for (const stage of ['neutre', 'capture', 'possedee']) {
    await page.evaluate((value) => window.towerCapture(value), stage);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `docs/issue-116/tour-${stage}-844x390.png` });
  }
  await page.evaluate(() => window.loseTower());
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Tour de guet perdue');
  assert.deepEqual(errors, []);
  console.log('PASS : trois captures 844×390, aucune erreur navigateur.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
