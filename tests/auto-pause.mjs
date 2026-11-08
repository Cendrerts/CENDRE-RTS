import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { shouldAutoPause } from '../public/game/auto-pause.js';

const activeSolo = { multiplayer: false, hidden: true, running: true, paused: false };
assert.equal(shouldAutoPause(activeSolo), true);
for (const override of [
  { multiplayer: true },
  { paused: true },
  { running: false },
  { hidden: false },
]) {
  assert.equal(shouldAutoPause({ ...activeSolo, ...override }), false);
}

const source = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('function closePauseMenu()'), source.indexOf("$('#closePause').onclick"));
const frame = source.slice(source.indexOf('function frame(t)'), source.indexOf('// Player-filtered snapshots'));
for (const multiplayer of [false, true]) {
  for (const eventName of ['visibilitychange', 'pagehide']) {
    const elements = new Map();
    const $ = (selector) => {
      if (!elements.has(selector)) {
        elements.set(selector, { hidden: true, focus() {} });
      }
      return elements.get(selector);
    };
    const listeners = new Map();
    const addEventListener = (name, handler) => listeners.set(name, handler);
    const state = { time: 0, winner: null };
    const context = vm.createContext({
      $, shouldAutoPause, running: true, paused: false,
      net: multiplayer ? {} : null,
      document: { visibilityState: 'hidden', addEventListener },
      window: { addEventListener },
      touchUI: null, radial: null, updateAmbience() {},
      debug: false, debugDisplay: null, last: 0, lastUI: 0, toastTime: 0, state,
      soloAI: { update() {} },
      Sim: { tick(current, dt) { current.time += dt; } },
      gestures: { tick() {} }, applyFieldGesture() {},
      updateUI() {}, updateAttackAlerts() {}, draw() {},
      preparedUnits: [], prepareDrawList() { return []; }, player: 0,
      requestAnimationFrame() {},
    });
    vm.runInContext(handlers + frame, context);
    listeners.get(eventName)();
    assert.equal(context.paused, !multiplayer);
    assert.equal($('#pauseMenu').hidden, multiplayer);
    context.document.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    vm.runInContext('frame(50); frame(100);', context);
    assert.equal(state.time, 0);
    assert.equal(context.paused, !multiplayer);
    assert.equal($('#pauseMenu').hidden, multiplayer);
    if (!multiplayer) {
      vm.runInContext('closePauseMenu(); frame(150);', context);
      assert(state.time > 0);
    }
  }
}
console.log('PASS: auto-pause decisions, background events, frozen solo time and explicit resume.');
