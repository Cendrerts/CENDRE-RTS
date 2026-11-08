// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/idle-workers-capture.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
        `\nwindow.panelFixture = (team = 0) => {
      player = team;
      state = Sim.create();
      state.rubies[player] = 999;
      selected.clear();
      panelContext = {};
      buildGhost = null;
      paused = false;
      toastTime = 0;
      $('#toast').style.opacity = '0';
      cameraX = state.bases[player].x;
      cameraY = state.bases[player].y;
      layout();
      updateUI();
    };
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
  for (const team of [0, 1]) {
    await page.evaluate((team) => window.panelFixture(team), team);
    if (await page.locator('#productionBar').isHidden()) {
      await page.locator('#productionToggle').click();
    }
    const bar = await page.locator('#productionBar').boundingBox();
    assert.equal(bar.x + bar.width, 832);
    for (const selector of ['#baseAction', '#selectionToggle', '#attackAction', '.camera', '#controlGroups', '#minimap']) {
      const other = await page.locator(selector).boundingBox();
      if (!other) continue;
      assert(bar.x + bar.width <= other.x || other.x + other.width <= bar.x ||
        bar.y + bar.height <= other.y || other.y + other.height <= bar.y, selector);
    }
    const names = await page.locator('#productionBar button').evaluateAll((buttons) => buttons.map((button) => {
      const name = button.querySelector('.productionName');
      const range = document.createRange();
      range.selectNodeContents(name);
      const lines = [...range.getClientRects()];
      const bounds = name.getBoundingClientRect();
      return {
        text: name.textContent,
        height: button.getBoundingClientRect().height,
        width: button.getBoundingClientRect().width,
        font: getComputedStyle(name).fontSize,
        lines: new Set(lines.map((line) => line.y)).size,
        fits: lines.every((line) => line.x >= bounds.x && line.right <= bounds.right + 1),
        ellipsis: getComputedStyle(name).textOverflow,
      };
    }));
    for (const name of names) {
      assert.equal(name.height, 52);
      assert(name.width >= 44);
      assert.equal(name.font, '11px');
      assert(name.lines <= 2 && name.fits, name.text);
      assert.notEqual(name.ellipsis, 'ellipsis');
    }
    await page.mouse.move(0, 0);
    await page.screenshot({ path: team === 0
      ? 'docs/screenshots/production-globale-844x390.png'
      : 'docs/screenshots/production-globale-rats-gout-844x390.png' });
    console.log({ team, bar, names });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: deux factions, noms complets sur deux lignes maximum, touches de 52 px, bord droit et aucun chevauchement.');
} finally {
  await browser.close();
  server.close();
}
