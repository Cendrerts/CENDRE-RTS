// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/heros-capture.mjs
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
window.herosCapture = () => {
  player = 0;
  state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  Sim.spawn(state, 'hero', 0);
  const hero = state.units[0];
  hero.x = 1200;
  hero.y = 1600;
  hero.hold = true;
  for (const [type, dx, dy] of [['knight', 140, 20], ['archer', -110, 70], ['mage', 70, -90]]) {
    Sim.spawn(state, type, 0);
    Object.assign(state.units.at(-1), { x: hero.x + dx, y: hero.y + dy, hold: true });
  }
  state.ingredients[0].viande = 40;
  Sim.cookDish(state, 0);
  Sim.tick(state, 20);
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  selected = new Set([hero.id]);
  panelContext = {};
  panelVisibilityState = panelVisibility(panelVisibilityState, 'collapse');
  cameraX = hero.x;
  cameraY = hero.y;
  zoom = 1;
  toastTime = 0;
  document.querySelector('#toast').textContent = '';
  layout();
  updateUI();
  return { buffed: state.units.every((unit) => Sim.ragoutActive(state, unit)) };
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
  await page.waitForFunction(() => window.herosCapture);
  await page.locator('#start').click();
  assert.deepEqual(await page.evaluate(() => window.herosCapture()), { buffed: true });
  await page.waitForTimeout(500);
  await mkdir('docs/issue-130', { recursive: true });
  await page.screenshot({ path: 'docs/issue-130/gouteur.png' });
  assert.deepEqual(errors, []);
  console.log('PASS : Grand Chef, anneau Goûteur et unités sous Ragoût en 844×390.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
