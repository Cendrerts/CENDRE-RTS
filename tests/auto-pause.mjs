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
const save = source.slice(source.indexOf('function saveActiveSolo()'), source.indexOf('function discardSoloSave()'));
const listenerStart = source.indexOf("window.addEventListener('pagehide', saveActiveSolo)");
const handlers = source.slice(
  source.lastIndexOf("document.addEventListener('visibilitychange'", listenerStart),
  source.indexOf("$('#closePause').onclick"),
);
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
    const addEventListener = (name, handler) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
    };
    const state = { time: 0, winner: null };
    const savedTimes = [];
    const context = vm.createContext({
      $, shouldAutoPause, running: true, paused: false,
      net: multiplayer ? {} : null,
      document: { visibilityState: 'hidden', addEventListener },
      window: { addEventListener },
      touchUI: null, radial: null, updateAmbience() {},
      debug: false, debugDisplay: null, last: 0, lastUI: 0, toastTime: 0, state,
      nextSoloSaveAt: 15, soloSaveInterval: 15,
      cameraX: 0, cameraY: 0, zoom: 2, soloDifficulty: 'normal',
      writeSoloSave({ state: saved }) { savedTimes.push(saved.time); },
      soloAI: { update() {} },
      Sim: { tick(current, dt) { current.time += dt; } },
      gestures: { tick() {} }, applyFieldGesture() {},
      updateUI() {}, updateAttackAlerts() {}, draw() {},
      preparedUnits: [], prepareDrawList() { return []; }, player: 0,
      requestAnimationFrame() {},
    });
    vm.runInContext(save + handlers + frame, context);
    for (const listener of listeners.get(eventName)) listener();
    assert.equal(context.paused, !multiplayer);
    assert.equal($('#pauseMenu').hidden, multiplayer);
    assert.deepEqual(savedTimes, multiplayer ? [] : [0]);
    context.document.visibilityState = 'visible';
    for (const listener of listeners.get('visibilitychange')) listener();
    vm.runInContext('frame(50); frame(100);', context);
    assert.equal(state.time, 0);
    assert.equal(context.paused, !multiplayer);
    assert.equal($('#pauseMenu').hidden, multiplayer);
    if (!multiplayer) {
      vm.runInContext('closePauseMenu(); frame(150);', context);
      assert(state.time > 0);
      state.time = 14.98;
      vm.runInContext('frame(160);', context);
      assert.deepEqual(savedTimes, [0]);
      vm.runInContext('frame(180); frame(200);', context);
      assert.equal(savedTimes.length, 2);
      assert(savedTimes[1] >= 15);
      assert.equal(context.nextSoloSaveAt, 30);
    }
  }
}
console.log('PASS: auto-pause decisions, background events, frozen solo time and explicit resume.');
