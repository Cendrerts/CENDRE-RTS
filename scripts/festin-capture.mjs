// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/festin-capture.mjs
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
window.festinCapture = () => {
  player = 1;
  state = Sim.create();
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  state.ingredients[1] = 80;
  selected.clear();
  panelContext = { baseId: 'main_1' };
  panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
  cameraX = state.bases[1].x;
  cameraY = state.bases[1].y;
  zoom = 2.6;
  toastTime = 0;
  layout();
  updateUI();
};
window.advanceFestinCapture = () => {
  Sim.tick(state, 6);
  toastTime = 0;
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
  await page.waitForFunction(() => window.festinCapture);
  await page.locator('#start').click();
  await page.evaluate(() => window.festinCapture());
  await page.waitForTimeout(500);
  const size = await page.locator('#ingredients').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  assert(size >= 9);
  await mkdir('docs/issue-123', { recursive: true });
  await page.screenshot({ path: 'docs/issue-123/grande-decharge-844x390.png' });
  const target = page.locator('#festinAction');
  const box = await target.boundingBox();
  assert(box.width >= 44 && box.height >= 44);
  await target.click();
  await page.locator('#festinAction').click({ force: true });
  assert.match(await page.locator('#toast').textContent(), /préparation/);
  await page.evaluate(() => window.advanceFestinCapture());
  await page.waitForTimeout(100);
  assert.match(await page.locator('#ingredients').textContent(), /Festin 9 s/);
  await page.screenshot({ path: 'docs/issue-123/festin-preparation-844x390.png' });
  assert.deepEqual(errors, []);
  console.log(`PASS : captures Festin 844×390, ingrédients à ${size}px, aucune erreur navigateur.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
