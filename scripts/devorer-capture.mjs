// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/devorer-capture.mjs
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
window.prepareDevour = () => {
  player = 1;
  state = Sim.create();
  state.monsters = [];
  Sim.spawn(state, 'knight', 1);
  const rat = state.units.at(-1);
  Object.assign(rat, { x: 2000, y: 1100, hp: 70, path: [], hold: true });
  Sim.spawn(state, 'knight', 0);
  const victim = state.units.at(-1);
  Object.assign(victim, { x: 2016, y: 1100, hp: 1, path: [], hold: true });
  Sim.visibility(state);
  Sim.order(state, [rat.id], victim.x, victim.y, victim);
  Sim.tick(state, 0.05);
  selected = new Set([rat.id]);
  cameraX = 2000;
  cameraY = 1100;
  soloAI = { update() {} };
  running = true;
  paused = false;
  zoom = 2.6;
  $('#veil').style.display = 'none';
  layout();
  updateUI();
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ox + victim.x * scale, y: rect.top + oy + victim.y * scale };
};
window.advanceDevour = (seconds) => {
  running = false;
  for (let index = 0; index < Math.round(seconds / 0.05); index++) Sim.tick(state, 0.05);
  return state.units.find((unit) => unit.devour)?.devour || null;
};`;
    }
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(path)] || 'application/octet-stream');
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/game/');
  await page.waitForFunction(() => Boolean(window.prepareDevour));
  await page.waitForTimeout(1000);
  const point = await page.evaluate(() => window.prepareDevour());
  await page.touchscreen.tap(point.x, point.y);
  const meal = await page.evaluate(() => window.advanceDevour(2));
  assert(meal?.startedAt != null, 'Le tap tactile lance le repas');
  await page.waitForTimeout(200);
  await mkdir('docs/issue-107', { recursive: true });
  await page.screenshot({ path: 'docs/issue-107/devorer-844x390.png' });
  assert.deepEqual(errors, []);
  console.log('PASS : tap tactile, repas en cours et capture 844×390');
} finally {
  await browser?.close();
  server.close();
}
