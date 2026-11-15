// PLAYWRIGHT_MODULE and CHROME_PATH work exactly as in scripts/render-bench.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('.');
const baselineSource = execFileSync('git', ['show', 'origin/main:public/game/game.js'], { encoding: 'utf8' });
const baselineOverlays = execFileSync('git', ['show', 'origin/main:public/game/unit-overlays.js'], { encoding: 'utf8' });
const outputDirectory = process.env.RENDER_IDENTITY_OUTPUT || 'artifacts/issue-157/identity';
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const path = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!path.startsWith(root + '/')) {
    response.writeHead(403).end();
    return;
  }
  try {
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  await mkdir(outputDirectory, { recursive: true });
  const captures = [];
  const errors = [];
  for (const baseline of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      performance.now = () => 1000;
    });
    if (baseline) {
      await page.route('**/game/unit-overlays.js', (route) => route.fulfill({ contentType: 'text/javascript', body: baselineOverlays }));
    }
    await page.route('**/game/game.js', async (route) => {
      const source = baseline ? baselineSource : await readFile('public/game/game.js', 'utf8');
      const body = source
        .replace('Math.min((t - last) / 1000, 0.05)', '0')
        .replaceAll('requestAnimationFrame(frame);', '') + `
window.unitRenderReady = () => terrain.complete && terrain.naturalWidth > 0;
window.captureLoadedScenario = async () => {
  const { loadedScenario } = await import('/scripts/render-scenario.mjs');
  state = loadedScenario(Sim);
  for (let frame = 0; frame < 60; frame++) {
    Sim.tick(state, 1 / 60);
  }
  running = false;
  cameraX = Sim.W / 2;
  cameraY = Sim.H / 2;
  layout();
  await document.fonts.ready;
  await Promise.all([...Object.values(cookSprites), ...Object.values(ratSprites), terrain].map((image) => image.decode()));
  preparedUnits = prepareDrawList(state, player, Sim.canSee);
  draw();
  draw();
  return canvas.toDataURL('image/png');
};
`;
      await route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/public/game/?render-bench`);
    await page.waitForFunction(() => window.unitRenderReady?.());
    const capture = await page.evaluate(() => window.captureLoadedScenario());
    captures.push(capture);
    await writeFile(`${outputDirectory}/${baseline ? 'main' : 'nouveau'}.png`, Buffer.from(capture.split(',')[1], 'base64'));
    await page.close();
  }
  assert.deepEqual(errors, [], 'Aucune erreur navigateur');
  const page = await browser.newPage();
  const comparison = await page.evaluate(async (captures) => {
    const pixels = [];
    for (const capture of captures) {
      const image = new Image();
      image.src = capture;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      pixels.push(context.getImageData(0, 0, canvas.width, canvas.height));
    }
    const [before, after] = pixels;
    if (before.width !== 844 || before.height !== 390) throw new Error('Viewport attendu : 844×390');
    if (before.width !== after.width || before.height !== after.height) throw new Error('Dimensions différentes');
    let identical = 0;
    for (let index = 0; index < before.data.length; index += 4) {
      let matches = true;
      for (let channel = 0; channel < 4; channel++) {
        if (Math.abs(before.data[index + channel] - after.data[index + channel]) > 8) matches = false;
      }
      if (matches) identical++;
    }
    return { identical, total: before.width * before.height, ratio: identical / (before.width * before.height) };
  }, captures);
  await writeFile(`${outputDirectory}/comparison.json`, JSON.stringify(comparison, null, 2) + '\n');
  console.log(`Rendu loadedScenario 844×390 : ${(comparison.ratio * 100).toFixed(4)} % de pixels identiques (tolérance 8/canal)`);
  assert(comparison.ratio >= 0.995, 'Au moins 99,5 % des pixels doivent être identiques');
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
