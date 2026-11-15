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
  state.rubies[0] = 500;
  Sim.recruit(state, 'hero', 0, 'main_0');
  Sim.tick(state, 35);
  const hero = state.units[0];
  hero.x = 600;
  hero.y = 1700;
  hero.hold = true;
  for (let index = 0; index < 5; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = hero.x + 10;
    enemy.y = hero.y;
    enemy.hp = 1;
    enemy.cool = 10;
    hero.target = enemy;
    hero.cool = 0;
    state.visible[0].fill(1);
    Sim.tick(state, 0.01);
  }
  hero.target = null;
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  selected.clear();
  panelContext = { baseId: 'main_0' };
  panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
  cameraX = state.bases[0].x;
  cameraY = state.bases[0].y;
  zoom = 2.6;
  toastTime = 0;
  layout();
  updateUI();
  return { level: hero.level, xp: hero.xp };
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
  assert.deepEqual(await page.evaluate(() => window.herosCapture()), { level: 2, xp: 100 });
  await page.waitForTimeout(500);
  const button = page.locator('#heroAction');
  assert.equal(await button.textContent(), 'Grand Chef · 150');
  const box = await button.boundingBox();
  assert(box.width >= 44 && box.height >= 44);
  await button.click({ force: true });
  assert.match(await page.locator('#toast').textContent(), /Héros déjà en vie/);
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await mkdir('docs/issue-129', { recursive: true });
  await page.screenshot({ path: 'docs/issue-129/heros.png' });
  assert.deepEqual(errors, []);
  console.log('PASS : capture héros niveau 2, bouton 44 px et refus expliqué en 844×390.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
