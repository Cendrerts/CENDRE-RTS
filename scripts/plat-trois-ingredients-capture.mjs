// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/plat-trois-ingredients-capture.mjs
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
window.pesteCapture = () => {
  player = 1;
  state = Sim.create();
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  state.bases[1].niveau = 3;
  Object.assign(state.ingredients[1], { viande: 100, epices: 40, conserves: 14 });
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
window.stockPesteCapture = () => {
  state.ingredients[1].conserves = 15;
  toastTime = 0;
  document.querySelector('#toast').textContent = '';
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
  await page.waitForFunction(() => window.pesteCapture);
  await page.locator('#start').click();
  await page.evaluate(() => window.pesteCapture());
  await page.waitForTimeout(500);
  const panel = await page.locator('#contextPanel').boundingBox();
  const viewport = page.viewportSize();
  const buttons = page.locator('#contextActions > button, #contextTabs > button, #contextGrid > button');
  assert.equal(await page.locator('#contextActions > .dish-action').count(), 3);
  const boxes = [await page.locator('#panelChevron').boundingBox()];
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    assert(box.width >= 44 && box.height >= 44, JSON.stringify(box));
    assert(box.x >= panel.x && box.x + box.width <= Math.min(panel.x + panel.width, viewport.width), JSON.stringify({ box, panel }));
    assert(box.y >= panel.y && box.y + box.height <= Math.min(panel.y + panel.height, viewport.height), JSON.stringify({ box, panel }));
    for (const other of boxes) {
      assert(box.x + box.width <= other.x || other.x + other.width <= box.x ||
        box.y + box.height <= other.y || other.y + other.height <= box.y, JSON.stringify({ box, other }));
    }
    boxes.push(box);
  }
  const target = page.locator('#pesteAction');
  assert.deepEqual(await target.locator('.dish-cost use').evaluateAll((icons) =>
    icons.map((icon) => document.querySelector(icon.getAttribute('href'))?.id)),
  ['viande-icon', 'epices-icon', 'conserves-icon']);
  assert.equal(await target.getAttribute('aria-disabled'), 'true');
  const targetBox = await target.boundingBox();
  await page.touchscreen.tap(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  assert.match(await page.locator('#toast').textContent(), /Conserves insuffisantes : 15 nécessaires/);
  await page.evaluate(() => window.stockPesteCapture());
  assert.equal(await target.getAttribute('aria-disabled'), 'false');
  await mkdir('docs/issue-279', { recursive: true });
  await page.screenshot({ path: 'docs/issue-279/grande-decharge-844x390.png' });
  await target.tap();
  await page.locator('#festinAction').tap();
  await page.locator('#bouillonAction').tap();
  const countdown = await page.locator('#dishStatus').textContent();
  assert.match(countdown, /Festin 15 s/);
  assert.match(countdown, /Bouillon 15 s/);
  assert.match(await page.locator('#dishStatus').textContent(), /Marmite de la Peste 25 s/);
  assert.deepEqual(errors, []);
  console.log('PASS : panneau de la Grande Décharge au niveau 3, cibles tactiles, refus et compte à rebours.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
