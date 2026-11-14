// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/ragout-capture.mjs
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
window.ragoutBuffCapture = () => {
  Sim.spawn(state, 'knight', 0);
  Sim.tick(state, 20);
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  const buffed = state.units.find((unit) => Sim.ragoutActive(state, unit));
  selected = new Set([buffed.id]);
  panelContext = {};
  cameraX = buffed.x;
  cameraY = buffed.y;
  layout();
  updateUI();
};
window.ragoutCapture = () => {
  state = Sim.create();
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  state.ingredients[0] = 80;
  selected.clear();
  panelContext = { baseId: 'main_0' };
  panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
  cameraX = state.bases[0].x;
  cameraY = state.bases[0].y;
  zoom = 2.6;
  toastTime = 0;
  layout();
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
  await page.waitForFunction(() => window.ragoutCapture);
  await page.locator('#start').click();
  await page.evaluate(() => window.ragoutCapture());
  await page.waitForTimeout(500);
  const size = await page.locator('#ingredients').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  assert(size >= 9);
  await mkdir('docs/issue-106', { recursive: true });
  await page.screenshot({ path: 'docs/issue-106/tour-ragout-844x390.png' });
  const target = page.locator('#ragoutAction');
  const box = await target.boundingBox();
  assert(box.width >= 44 && box.height >= 44);
  await target.click();
  await page.locator('#ragoutAction').click({ force: true });
  assert.match(await page.locator('#toast').textContent(), /cuisson/);
  await page.screenshot({ path: 'docs/issue-106/cuisson-844x390.png' });
  await page.evaluate(() => {
    // Invoke the same deterministic completion used by the simulation.
    window.ragoutBuffCapture();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/issue-106/unite-buffee-844x390.png' });
  assert.deepEqual(errors, []);
  console.log(`PASS : captures Ragoût 844×390, ingrédients à ${size}px, aucune erreur navigateur.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
