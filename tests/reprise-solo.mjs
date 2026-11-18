import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { clearSoloSave, readSoloSave, restoreSoloSave, writeSoloSave } from '../public/game/solo-save.js';

const key = 'cendre-solo-v1';
const storage = new Map();
globalThis.localStorage = {
  getItem: (name) => storage.get(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => storage.delete(name),
};

const state = Sim.create();
const player = 0;
const opponent = 1 - player;
const difficulty = 'brutal';
const playerController = createAI(player, difficulty, state);
const opponentController = createAI(opponent, difficulty, state);
function play(current, enemy, seconds) {
  const timestep = 0.05;
  for (let step = 0; step < seconds / timestep; step++) {
    playerController.update(current);
    enemy.update(current);
    Sim.tick(current, timestep);
    assert.equal(current.winner, null, 'Le scénario doit rester jouable pendant toute la durée du test.');
  }
}

play(state, opponentController, 240);
assert(Math.abs(state.time - 240) < 1e-8);
state.controlGroups[3] = [state.units.find((unit) => unit.team === player).id];
const camera = { cameraX: 620, cameraY: 700, zoom: 2.8 };
const original = Sim.serialize(state);
writeSoloSave({ state, player, difficulty, ...camera });
assert(storage.has(key));
const save = readSoloSave();
assert(save);
const { state: restored, ...metadata } = save;
assert.deepEqual(metadata, { player, difficulty, ...camera });
assert.deepEqual(restored.controlGroups, state.controlGroups);
const restoredAI = createAI(opponent, save.difficulty, restored);
assert.equal(Sim.serialize(restored), original);
const producedBefore = restored.matchCounters[opponent].unitsProduced;
play(restored, restoredAI, 180);
assert(Math.abs(restored.time - 420) < 1e-8);
assert(restored.matchCounters[opponent].unitsProduced > producedBefore);

assert.equal(restoreSoloSave('{'), null);
storage.set(key, '{');
assert.equal(readSoloSave(), null);
writeSoloSave({ state, player, difficulty, ...camera });

const source = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const discard = source.slice(source.indexOf('function discardSoloSave()'), source.indexOf('resumeSoloButton.onclick'));
const finish = source.slice(source.indexOf('function finish()'), source.indexOf("  if (net)\n", source.indexOf('function finish()')));
const quit = source.slice(source.indexOf("$('#quitGame').onclick"), source.indexOf("window.addEventListener(\n  'keydown'"));
const element = { style: {} };
const context = {
  $: () => element,
  net: null,
  running: true,
  savedSolo: save,
  resumeSoloButton: { hidden: false },
  clearSoloSave,
  closePauseMenu() {},
  selected: new Set(),
  updateAmbience() {},
  updateUI() {},
};
for (const ending of ['finish();', '$(\'#quitGame\').onclick();']) {
  writeSoloSave({ state, player, difficulty, ...camera });
  assert(storage.has(key));
  runInNewContext(discard + finish + '}\n' + quit + ending, context);
  assert.equal(storage.has(key), false);
  assert.equal(context.resumeSoloButton.hidden, true);
}

Object.defineProperty(globalThis, 'localStorage', {
  get() {
    throw new Error('Stockage bloqué');
  },
});
assert.equal(readSoloSave(), null);
assert.doesNotThrow(() => writeSoloSave({ state, player, difficulty, ...camera }));
assert.doesNotThrow(clearSoloSave);
console.log('PASS : reprise Brutal à 4 min, 3 min rejouées avec production, sauvegarde invalide et effacement.');
