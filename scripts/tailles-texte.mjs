// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/tailles-texte.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
        `\nwindow.panelFixture = (mode, team = 0) => {
      player = team;
      state = Sim.create();
      state.rubies[player] = 999;
      selected.clear();
      panelContext = {};
      buildGhost = null;
      if (mode === 'unite') {
        selected.add(state.units.find(unit => unit.team === player).id);
      }
      if (mode === 'groupe') {
        Sim.spawn(state, 'knight', player, state.bases[player]);
        selected = new Set(state.units.filter(unit => unit.team === player).map(unit => unit.id));
      }
      if (mode === 'batiment') {
        const slot = state.slots[player][0];
        Sim.construct(state, player, Sim.BUILDINGS[player][0].id, slot.baseId, slot.id);
        panelContext = { producerId: slot.id };
      }
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
const output = [];
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/game/`);
  await page.locator('#start').click();
  await mkdir('docs/issue-100', { recursive: true });
  const failures = [];
  for (const team of [0, 1]) {
    for (const mode of ['unite', 'batiment', 'groupe']) {
      await page.evaluate(([mode, team]) => window.panelFixture(mode, team), [mode, team]);
      if (await page.locator('#productionBar').isHidden()) {
        await page.locator('#productionToggle').click();
      }
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#contextPanel').getAttribute('data-mode'), mode === 'batiment' ? 'production' : 'units');
      const texts = await page.evaluate(() => {
        const results = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = node.textContent.trim();
          const element = node.parentElement;
          if (!text || element.closest('script, style, #veil')) {
            continue;
          }
          const style = getComputedStyle(element);
          if (style.visibility !== 'visible' || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            continue;
          }
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = [...range.getClientRects()];
          if (!rects.some((rect) => rect.width && rect.height && rect.right > 0 && rect.x < innerWidth && rect.bottom > 0 && rect.y < innerHeight)) {
            continue;
          }
          results.push({
            element: element.id ? '#' + element.id : element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).trim().replaceAll(' ', '.') : ''),
            text,
            size: parseFloat(style.fontSize),
          });
        }
        return results;
      });
      assert(texts.length > 0);
      const buttons = await page.locator('button:visible').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: element.id || element.textContent.trim(), width: rect.width, height: rect.height };
      }));
      for (const button of buttons) {
        assert(button.width >= 44 && button.height >= 44, `Cible tactile : ${JSON.stringify(button)}`);
      }
      const clipped = await page.locator('#contextPanel, #productionBar').evaluateAll((panels) => {
        const failures = [];
        for (const element of panels.flatMap((panel) => [...panel.querySelectorAll('*')])) {
          if (!element.checkVisibility() || ![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) {
            continue;
          }
          if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
            failures.push(element.textContent.trim());
          }
        }
        return failures;
      });
      assert.deepEqual(clipped, [], 'Libellés coupés');
      output.push(`Faction ${team} — ${mode} — Production ouverte — 844×390 tactile`);
      output.push(`Vérifié : ${buttons.length} cibles >= 44×44 px ; aucun débordement de libellé dans le panneau et la production.`);
      for (const item of texts) {
        output.push(`${item.size} px | ${item.element} | ${item.text}`);
        if (item.size < 9) {
          failures.push(item);
        }
      }
      if (mode !== 'groupe') {
        await page.screenshot({ path: `docs/issue-100/hud-${team}-${mode}-844x390.png` });
      }
    }
  }
  output.push(failures.length ? `ÉCHEC : ${failures.length} texte(s) sous 9 px.` : 'PASS : tous les textes visibles mesurés sont à 9 px minimum.');
  await writeFile('docs/issue-100/tailles.txt', output.join('\n') + '\n');
  console.log(output.join('\n'));
  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
