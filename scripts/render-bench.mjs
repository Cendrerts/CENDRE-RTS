// npm install --no-save playwright (or set PLAYWRIGHT_MODULE to its index.mjs).
// CHROME_PATH=/usr/bin/chromium node scripts/render-bench.mjs
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { instrumentDraw, validateDrawMetrics } from './render-bench-instrumentation.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('.');
const mapBaseline = process.argv.includes('--map-baseline');
const outputDirectory = process.env.BENCH_OUTPUT || 'artifacts/issue-17';
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
    const content = mapBaseline && path.endsWith('/public/game/sim.js')
      ? execFileSync('git', ['show', `${process.env.BASELINE_REF || 'HEAD'}:public/game/sim.js`])
      : await readFile(path);
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
  if (baseline) {
    await page.route('**/game/terrain.js', async (route) => {
      const body = execFileSync('git', ['show', `${baselineRef}:public/game/terrain.js`], { encoding: 'utf8' });
      await route.fulfill({ contentType: 'text/javascript', body });
    });
  }
  await page.route('**/game/game.js', async (route) => {
    const source = baseline
      ? execFileSync('git', ['show', `${baselineRef}:public/game/game.js`], { encoding: 'utf8' })
      : await readFile('public/game/game.js', 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: instrumentDraw(source)
      .replace('Math.min((t - last) / 1000, 0.05)', '0')
      .replaceAll('requestAnimationFrame(frame);', "if (!location.search.includes('render-bench')) requestAnimationFrame(frame);") + `
window.loadedRenderBench = {
  terrainReady: () => terrain.complete && terrain.naturalWidth === W,
  async setup(scenario) {
    await terrainReady;
    state = scenario;
    running = false;
    cameraX = Sim.W / 2;
    cameraY = Sim.H / 2;
    layout();
  },
  draw() {
    preparedUnits = prepareDrawList(state, player, Sim.canSee);
    const started = performance.now();
    const layers = draw();
    const drawMs = performance.now() - started;
    return { drawMs, layers };
  },
};
` });
  });
  await page.goto(origin + '/public/game/');
  await page.locator('#start').click();
  await page.waitForFunction(() => window.loadedRenderBench.terrainReady());
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(500);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: `${outputDirectory}/${baseline ? 'before' : 'after'}.png` });
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
    for (const scenarioName of ['combatScenario', 'hordeScenario', 'hordeFullDraw', 'loadedScenario']) {
      if (scenarioName === 'loadedScenario' || scenarioName === 'hordeFullDraw') {
        await page.goto(origin + '/public/game/?render-bench');
        await page.waitForFunction(() => window.loadedRenderBench);
        await page.evaluate(() => document.fonts.ready);
      }
      const result = await page.evaluate(async (scenarioName) => {
        const { CendreSim: sim } = await import('/public/game/sim.js');
        const scenarios = await import('/scripts/render-scenario.mjs');
        const { createRenderCache, prepareDrawList } = await import('/public/game/render-cache.js');
        const state = scenarios[scenarioName === 'hordeFullDraw' ? 'hordeScenario' : scenarioName](sim);
        const startingUnits = state.units.length;
        const fullDraw = scenarioName === 'loadedScenario' || scenarioName === 'hordeFullDraw';
        if (fullDraw) await window.loadedRenderBench.setup(state);
        const cache = createRenderCache(() => document.createElement('canvas'));
        const fog = document.createElement('canvas');
        fog.width = sim.COLS;
        fog.height = sim.ROWS;
        const context = fog.getContext('2d');
        const { cookSprites } = await import('/public/game/cooks.js');
        const { ratSprites } = await import('/public/game/rats.js');
        await Promise.all([...Object.values(cookSprites), ...Object.values(ratSprites)].map((image) => image.decode()));
        const terrain = new Image();
        const { loadSkirmishTerrain } = await import('/public/game/terrain.js');
        await loadSkirmishTerrain(sim, terrain);
        const startingHealth = state.units.reduce((sum, unit) => sum + unit.hp, 0);
        const samples = [];
        const drawSamples = [];
        let minUnits = startingUnits;
        for (let frame = 0; frame < 1200; frame++) {
          await new Promise(requestAnimationFrame);
          const started = performance.now();
          sim.tick(state, 1 / 60);
          const units = prepareDrawList(state, 0, sim.canSee);
          cache.terrain(terrain, 844, 390, 422 - sim.W / 2, 195 - sim.H / 2, 1, sim.W, sim.H);
          cache.updateFog(context, state.visible[0], state.explored[0], sim.COLS);
          for (const unit of units) {
            const size = unit.type === 'archer' ? 52 : 46;
            cache.sprite((unit.team ? ratSprites : cookSprites)[unit.type], unit.type, unit.team, 1, size, size * 1.125);
          }
          const drawMeasurement = fullDraw ? window.loadedRenderBench.draw() : null;
          const duration = performance.now() - started;
          if (frame >= 600) {
            samples.push(duration);
            if (drawMeasurement) drawSamples.push(drawMeasurement);
          }
          minUnits = Math.min(minUnits, units.length);
        }
        samples.sort((a, b) => a - b);
        const drawMetrics = {};
        if (fullDraw) {
          drawMetrics.drawMs = drawSamples.reduce((sum, sample) => sum + sample.drawMs, 0) / drawSamples.length;
          drawMetrics.layers = {};
          for (const layer of Object.keys(drawSamples[0].layers)) {
            drawMetrics.layers[layer] = drawSamples.reduce((sum, sample) => sum + sample.layers[layer], 0) / drawSamples.length;
          }
        }
        return {
          ...drawMetrics,
          startingUnits,
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
      }, scenarioName);
      console.log(scenarioName, JSON.stringify(result, null, 2));
      const loaded = scenarioName === 'loadedScenario';
      const horde = scenarioName === 'hordeScenario' || scenarioName === 'hordeFullDraw';
      if (result.layers) {
        validateDrawMetrics(result);
        console.table(result.layers);
      }
      const filename = scenarioName === 'hordeFullDraw' ? 'benchmark-horde-full.json' : loaded ? 'benchmark-loaded.json' : horde ? 'benchmark-horde.json' : 'benchmark.json';
      await writeFile(`${outputDirectory}/${filename}`, JSON.stringify(result, null, 2) + '\n');
      const expectedUnits = loaded ? 93 : horde ? 91 : 60;
      const maxBudget = horde || loaded ? 8 : 4;
      let regression = false;
      if (process.env.BENCH_COMPARE) {
        const reference = JSON.parse(await readFile(`${process.env.BENCH_COMPARE}/${filename}`, 'utf8'));
        const comparison = {
          meanRatio: result.meanMs / reference.meanMs,
          p95Ratio: result.p95Ms / reference.p95Ms,
        };
        await writeFile(`${outputDirectory}/comparison-${filename}`, JSON.stringify(comparison, null, 2) + '\n');
        console.log('Map comparison', comparison);
        regression = comparison.meanRatio > 1.1 || comparison.p95Ratio > 1.1;
      }
      const absoluteBudgetExceeded = !mapBaseline && !process.env.BENCH_COMPARE &&
        (result.p95Ms >= 4 || result.maxMs >= maxBudget);
      if (result.startingUnits !== expectedUnits || result.units !== expectedUnits ||
          result.minVisibleUnits !== expectedUnits || result.damageDealt <= 0 ||
          absoluteBudgetExceeded || regression) {
        process.exitCode = 1;
      }
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
