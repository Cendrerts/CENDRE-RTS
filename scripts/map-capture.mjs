// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/map-capture.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const outputDirectory = process.env.MAP_CAPTURE_OUTPUT || 'docs/issue-115';
const stageUnits = process.argv.includes('--terrain-art');
const server = createServer(async (request, response) => {
  try {
    const path = resolve('public' + new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
    let content = await readFile(path);
    if (path.endsWith('/game.js')) {
      content = content.toString().replace('Math.min((t - last) / 1000, 0.05)', '0') + `
window.mapProbe = () => ({
  camera: { x: cameraX, y: cameraY },
  base: { x: state.bases[player].x, y: state.bases[player].y },
  terrainReady: terrain.complete && terrain.naturalWidth === W,
  scale,
});
window.mapStart = (team) => {
  player = team;
  state = Sim.create();
  if (${stageUnits}) {
    const base = state.bases[player];
    Sim.spawn(state, 'knight', player, { x: base.x - 85, y: base.y + 30 });
    Sim.spawn(state, 'archer', player, { x: base.x + 25, y: base.y + 65 });
    Sim.visibility(state);
  }
  selected.clear();
  cameraX = state.bases[player].x;
  cameraY = state.bases[player].y;
  zoom = 2.6;
  toastTime = 0;
  $('#toast').style.opacity = '0';
  layout();
  updateUI();
};
window.mapOverview = () => {
  state.visible[player].fill(1);
  state.explored[player].fill(1);
  zoom = Math.min(viewWidth / W, viewHeight / H) / Math.max(viewWidth / 1680, viewHeight / 940);
  cameraX = W / 2;
  cameraY = H / 2;
  layout();
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
  await page.waitForFunction(() => window.mapProbe?.().terrainReady);
  await page.locator('#start').click();
  await mkdir(outputDirectory, { recursive: true });
  for (const team of [0, 1]) {
    await page.evaluate((team) => window.mapStart(team), team);
    await page.waitForTimeout(100);
    const probe = await page.evaluate(() => window.mapProbe());
    assert.deepEqual(probe.camera, probe.base, 'Vue initiale centrée sur la base');
    assert(probe.scale > 1, 'Échelle tactile conservée');
    await page.screenshot({ path: `${outputDirectory}/depart-${team}-844x390.png` });
  }
  const mini = await page.locator('#minimap').boundingBox();
  assert(mini.width >= 44 && mini.height >= 44);
  await page.mouse.move(mini.x + mini.width * 0.2, mini.y + mini.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(mini.x + mini.width * 0.8, mini.y + mini.height * 0.2, { steps: 10 });
  const duringDrag = await page.evaluate(() => window.mapProbe().camera);
  assert(duringDrag.x > 3000 && duringDrag.y < 600, 'Glissement de mini-carte suivi avant relâchement');
  await page.mouse.up();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: mini.x + mini.width / 2, y: mini.y + mini.height / 2 }],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: mini.x + mini.width * 0.3, y: mini.y + mini.height * 0.7 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchCamera = await page.evaluate(() => window.mapProbe().camera);
  assert(touchCamera.x > 1100 && touchCamera.x < 1300);
  assert(touchCamera.y > 1450 && touchCamera.y < 1650);
  await page.setViewportSize({ width: 1600, height: 880 });
  await page.addStyleTag({ content: 'body > :not(#field) { visibility: hidden !important; }' });
  await page.evaluate(() => window.mapOverview());
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outputDirectory}/carte-entiere.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: départs 844×390, caméra, mini-carte glissable souris/tactile et vue entière 4000×2200.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
