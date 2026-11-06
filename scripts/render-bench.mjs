// npm install --no-save playwright (or set PLAYWRIGHT_MODULE to its index.mjs).
// CHROME_PATH=/usr/bin/chromium node scripts/render-bench.mjs
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('.');
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/render-bench') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>CENDRE render benchmark</title>');
    return;
  }
  const path = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!path.startsWith(root + '/')) {
    response.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(path);
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Freeze only simulation time for matching screenshots; production code stays intact.
  const baseline = process.argv.includes('--baseline');
  const baselineRef = process.env.BASELINE_REF || 'HEAD';
  await page.route('**/game/game.js', async (route) => {
    const source = baseline
      ? execFileSync('git', ['show', `${baselineRef}:public/game/game.js`], { encoding: 'utf8' })
      : await readFile('public/game/game.js', 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: source.replace('Math.min((t - last) / 1000, 0.05)', '0') });
  });
  await page.goto(origin + '/public/game/');
  await page.locator('#start').click();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(500);
  await mkdir('artifacts/issue-17', { recursive: true });
  await page.screenshot({ path: `artifacts/issue-17/${baseline ? 'before' : 'after'}.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  if (!baseline) {
    await page.goto(origin + '/public/game/?debug=1');
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('FPS'));
    await page.locator('#start').click();
    await page.locator('#zoomIn').click();
    await page.locator('#zoomOut').click();
    await page.setViewportSize({ width: 900, height: 420 });
    await page.waitForTimeout(100);
    if (errors.length) throw new Error(errors.join('\n'));
    // Isolate simulation/preparation from the game's independent animation loop.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(origin + '/render-bench');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const result = await page.evaluate(async () => {
      const { CendreSim: sim } = await import('/public/game/sim.js');
      const { combatScenario } = await import('/scripts/render-scenario.mjs');
      const { createRenderCache, prepareDrawList } = await import('/public/game/render-cache.js');
      const state = combatScenario(sim);
      const cache = createRenderCache(() => document.createElement('canvas'));
      const fog = document.createElement('canvas');
      fog.width = sim.COLS;
      fog.height = sim.ROWS;
      const context = fog.getContext('2d');
      const { cookSprites } = await import('/public/game/cooks.js');
      const { ratSprites } = await import('/public/game/rats.js');
      await Promise.all([...Object.values(cookSprites), ...Object.values(ratSprites)].map((image) => image.decode()));
      const terrain = new Image();
      terrain.src = '/public/game/assets/terres-brulees.png';
      await terrain.decode();
      const startingHealth = state.units.reduce((sum, unit) => sum + unit.hp, 0);
      const samples = [];
      let minUnits = 60;
      for (let frame = 0; frame < 1200; frame++) {
        await new Promise(requestAnimationFrame);
        const started = performance.now();
        sim.tick(state, 1 / 60);
        const units = prepareDrawList(state, 0, sim.canSee);
        cache.terrain(terrain, 844, 390, 0, 0, 1, sim.W, sim.H);
        cache.updateFog(context, state.visible[0], state.explored[0], sim.COLS);
        for (const unit of units) {
          const size = unit.type === 'archer' ? 52 : 46;
          cache.sprite((unit.team ? ratSprites : cookSprites)[unit.type], unit.type, unit.team, 1, size, size * 1.125);
        }
        const duration = performance.now() - started;
        if (frame >= 600) samples.push(duration);
        minUnits = Math.min(minUnits, units.length);
      }
      samples.sort((a, b) => a - b);
      return {
        damageDealt: startingHealth - state.units.reduce((sum, unit) => sum + unit.hp, 0),
        frames: samples.length,
        cpuThrottling: 4,
        viewport: '844x390',
        units: state.units.length,
        minVisibleUnits: minUnits,
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        p95Ms: samples[Math.floor(samples.length * 0.95)],
        p99Ms: samples[Math.floor(samples.length * 0.99)],
        maxMs: samples.at(-1),
        overBudgetFrames: samples.filter((duration) => duration >= 4).length,
        chrome: navigator.userAgent,
      };
    });
    console.log(JSON.stringify(result, null, 2));
    await writeFile('artifacts/issue-17/benchmark.json', JSON.stringify(result, null, 2) + '\n');
    if (result.units !== 60 || result.minVisibleUnits !== 60 || result.damageDealt <= 0 || result.maxMs >= 4) process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
