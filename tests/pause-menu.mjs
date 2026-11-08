import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('function closePauseMenu()'), source.indexOf("$('#zoomIn').onclick"));
for (const multiplayer of [false, true]) {
  const elements = new Map();
  const $ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, focus() {} });
    return elements.get(selector);
  };
  let stops = 0;
  const context = vm.createContext({
    $, running: true, paused: false, net: multiplayer ? {} : null,
    touchUI: { stop() { stops++; } }, radial: { close() {} },
    updateAmbience() {}, window: { addEventListener() {} },
    document: { addEventListener() {} },
  });
  vm.runInContext(handlers, context);
  $('#pause').onclick();
  assert.equal($('#pauseMenu').hidden, false);
  assert.equal(context.paused, !multiplayer);
  assert.equal($('#pauseStatus').textContent, multiplayer ? 'Partie en cours' : 'Partie en pause');
  assert.equal(stops, 1);
  $('#openSettings').onclick();
  assert.equal($('#settingsPanel').hidden, false);
  $('#backPause').onclick();
  assert.equal($('#pauseActions').hidden, false);
  $('#pauseMenu').onclick({ target: $('#pauseActions') });
  assert.equal($('#pauseMenu').hidden, false);
  $('#pauseMenu').onclick({ target: $('#pauseMenu') });
  assert.equal($('#pauseMenu').hidden, true);
  assert.equal(context.paused, false);
  $('#pause').onclick();
  $('#closePause').onclick();
  assert.equal($('#pauseMenu').hidden, true);
  $('#pause').onclick();
  $('#resumeGame').onclick();
  assert.equal(context.paused, false);
}
const html = readFileSync(new URL('../public/game/index.html', import.meta.url), 'utf8');
const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
for (const id of ['rubies', 'population', 'clock', 'netBadge', 'pause']) {
  assert(header.includes(`id="${id}"`));
}
assert(!header.includes('Vibration'));
assert(!header.includes('Quitter'));
assert(!header.includes('brand'));
console.log('PASS: solo pause, live multiplayer menu, settings, resume, X, outside tap and minimal header.');
