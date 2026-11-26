// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/action-cards-capture.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const publicDirectory = new URL('../public/', import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
    const file = new URL('.' + path, publicDirectory);
    if (!file.href.startsWith(publicDirectory.href)) throw new Error('Chemin hors de public/');
    let content = await readFile(file);
    if (path === '/game/game.js') {
      content = content.toString() + `
window.prepareActionCardsCapture = () => {
  state.bases[player].niveau = 3;
  Object.assign(state.ingredients[player], { viande: 100, epices: 60, conserves: 0 });
  state.rubies[player] = 1000;
  toastTime = 0;
  $('#toast').textContent = '';
  updateUI();
};
window.actionCardsCaptureState = () => ({
  rubies: state.rubies[player],
  queued: state.queues[player].length,
  roti: state.roti.readyAt,
  banquet: state.banquet.readyAt,
});
window.creditActionCardsCapture = (amount = 15) => {
  state.ingredients[player].conserves += amount;
  updateUI();
};
`;
    }
    const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
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
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/game/`);
  await page.locator('#start').tap();
  await page.evaluate(() => window.prepareActionCardsCapture());
  await page.locator('#baseAction').tap();

  const device = await page.context().newCDPSession(page);
  async function touchStart(locator) {
    const box = await locator.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  }
  async function touchEnd() {
    await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  const card = page.locator('#actionCard');
  const banquet = page.locator('#banquetAction');
  await touchStart(banquet);
  await card.waitFor({ state: 'visible' });
  assert.match(await card.textContent(), /Conserves insuffisantes/);
  await touchEnd();
  await card.waitFor({ state: 'hidden' });

  await page.evaluate(() => window.creditActionCardsCapture());
  await touchStart(banquet);
  await card.waitFor({ state: 'visible' });

  // Keep the first finger on the card and check that a second tap closes it.
  const firstPoint = await banquet.boundingBox();
  const firstFinger = { x: firstPoint.x + firstPoint.width / 2, y: firstPoint.y + firstPoint.height / 2, id: 0 };
  const secondFinger = { x: 650, y: 140, id: 1 };
  await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [firstFinger, secondFinger] });
  await card.waitFor({ state: 'hidden' });
  await touchEnd();

  await touchStart(banquet);
  await card.waitFor({ state: 'visible' });
  assert.match(await card.textContent(), /Grand Banquet.*30 Viande.*20 Épices.*15 Conserves.*30 s de cuisson.*Soigne entièrement/);
  await touchEnd();
  await card.waitFor({ state: 'hidden' });
  assert.equal((await page.evaluate(() => window.actionCardsCaptureState())).banquet, null);

  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await touchStart(page.locator('#rotiAction'));
  await touchEnd();
  assert.notEqual((await page.evaluate(() => window.actionCardsCaptureState())).roti, null);
  await touchStart(banquet);
  await page.clock.runFor(420);
  assert.equal(await card.isVisible(), true);
  const debit = page.locator('.resource-change', { hasText: '−30 Viande' });
  assert.equal(await debit.count(), 1);
  assert.equal(await card.locator('p').first().isVisible(), true);
  const fontSizes = await page.locator('#actionCard strong, #actionCard p, .resource-change').evaluateAll((items) =>
    items.map((item) => parseFloat(getComputedStyle(item).fontSize)));
  assert(fontSizes.every((size) => size >= 9));
  // Freeze the existing CSS animation mid-flight for a reproducible still image.
  await page.locator('.resource-change').evaluateAll((numbers) => {
    for (const number of numbers) {
      for (const animation of number.getAnimations()) {
        animation.pause();
        animation.currentTime = 500;
      }
    }
  });
  const overlaps = await page.locator('.resource-change').evaluateAll((numbers) => numbers.some((number) => {
    const box = number.getBoundingClientRect();
    return [...document.querySelectorAll('button')].some((button) => {
      const target = button.getBoundingClientRect();
      return target.width && target.height && box.left < target.right && box.right > target.left &&
        box.top < target.bottom && box.bottom > target.top;
    });
  }));
  assert.equal(overlaps, false);
  await mkdir('docs/issue-294', { recursive: true });
  await page.screenshot({ path: 'docs/issue-294/depense-et-fiche-844x390.png' });
  await touchEnd();
  await page.clock.resume();

  await page.locator('#productionToggle').tap();
  const before = await page.evaluate(() => window.actionCardsCaptureState());
  await touchStart(page.locator('#productionBar [data-type="commis"]'));
  await page.waitForFunction((queued) => window.actionCardsCaptureState().queued === queued + 5, before.queued);
  await touchEnd();
  assert.equal((await page.evaluate(() => window.actionCardsCaptureState())).queued, before.queued + 5);
  assert.equal(await card.isVisible(), false);

  const conserves = page.locator('[data-resource="conserves"] .resource-change');
  await conserves.first().waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    for (const amount of [1, 2, 3, 4]) window.creditActionCardsCapture(amount);
  });
  assert.deepEqual(await conserves.allTextContents(), ['+1 Conserves', '+2 Conserves', '+7 Conserves']);
  assert.deepEqual(errors, []);
  console.log('PASS : fiche tactile, refus, dépenses, fermeture et production ×5 à 844×390.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
