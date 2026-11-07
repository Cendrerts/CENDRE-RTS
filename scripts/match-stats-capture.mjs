// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/match-stats-capture.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
    const path = resolve('public', '.' + pathname);
    let content = await readFile(path);
    if (path.endsWith('/game.js')) {
      content = content.toString() + `
window.showMatchEnd = (team, online = false) => {
  if (online) {
    net = { finished: true, code: 'TEST', token: 'test' };
    lobbyControls(true);
  }
  player = team;
  state = Sim.create();
  state.time = 754;
  state.winner = 0;
  state.matchCounters = [
    {rubiesCollected: 12480, unitsProduced: 87, unitsLost: 42, unitsKilled: 56, buildingsDestroyed: 1},
    {rubiesCollected: 10320, unitsProduced: 76, unitsLost: 56, unitsKilled: 42, buildingsDestroyed: 0},
  ];
  finish();
};`;
    }
    response.setHeader('Content-Type', {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
    }[extname(path)] || 'application/octet-stream');
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:' + server.address().port + '/game/');
  await page.waitForFunction(() => Boolean(window.showMatchEnd));
  await mkdir('artifacts', { recursive: true });
  for (const team of [0, 1]) {
    await page.evaluate((team) => window.showMatchEnd(team), team);
    assert.equal(await page.locator('#matchStats caption').textContent(), 'Durée : 12:34');
    assert.equal(await page.locator('#matchStats tbody tr').first().locator('td').first().textContent(), team === 0 ? '12480' : '10320');
    const layout = await page.evaluate(() => {
      const table = document.querySelector('#matchStats');
      const button = document.querySelector('#start');
      const menu = document.querySelector('#matchMenu');
      const intro = document.querySelector('#veil .intro');
      return {
        table: table.getBoundingClientRect().toJSON(),
        button: button.getBoundingClientRect().toJSON(),
        menu: menu.getBoundingClientRect().toJSON(),
        scrollHeight: intro.scrollHeight,
        clientHeight: intro.clientHeight,
        fontSizes: [...table.querySelectorAll('th,td,caption')].map((cell) => parseFloat(getComputedStyle(cell).fontSize)),
      };
    });
    assert(layout.table.top >= 0 && layout.table.bottom <= 390);
    assert(layout.button.top >= layout.table.bottom && layout.button.bottom <= 390);
    assert(layout.button.height >= 44);
    assert(await page.locator('#start').isVisible());
    assert(await page.locator('#matchMenu').isVisible());
    assert(layout.menu.height >= 44);
    assert(layout.menu.top >= layout.table.bottom && layout.menu.bottom <= 390);
    assert(layout.menu.left >= 0 && layout.menu.right <= layout.button.left);
    assert(layout.button.right <= 844);
    assert.equal(layout.menu.top, layout.button.top);
    assert.equal(layout.scrollHeight, layout.clientHeight);
    assert(layout.fontSizes.every((size) => size >= 13));
    await page.screenshot({ path: 'artifacts/match-stats-' + team + '-844x390.png' });
    await page.tap('#matchMenu');
    assert.equal(await page.locator('#veil').evaluate((veil) => veil.classList.contains('match-ended')), false);
    for (const selector of ['#chooseHuman', '#aiDifficulty', '#createRoom']) {
      assert(await page.locator(selector).isVisible());
    }
    assert.equal(await page.locator('#matchStats').count(), 0);
  }
  let leftRoom = false;
  await page.route('**/api/match', async (route) => {
    assert.equal(route.request().postDataJSON().action, 'leave');
    leftRoom = true;
    await route.fulfill({ json: {} });
  });
  await page.evaluate(() => window.showMatchEnd(0, true));
  await page.tap('#matchMenu');
  await page.waitForFunction(() => document.querySelector('#matchStats') === null);
  assert(leftRoom);
  for (const selector of ['#chooseHuman', '#aiDifficulty', '#createRoom']) {
    assert(await page.locator(selector).isVisible());
    assert(await page.locator(selector).isEnabled());
  }
  await page.evaluate(() => window.showMatchEnd(1));
  await page.tap('#start');
  assert.equal(await page.locator('#veil').evaluate((veil) => veil.classList.contains('match-ended')), false);
  console.log('PASS: victory/defeat at 844×390, complete table, text >=13px, menu/restart >=44px, no scrolling, menu choices restored.');
} finally {
  await browser?.close();
  server.close();
}
