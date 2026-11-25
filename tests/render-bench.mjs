import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createRenderCache, prepareDrawList } from '../public/game/render-cache.js';
import { combatScenario, loadedScenario } from '../scripts/render-scenario.mjs';

let draws = 0;
const context = {
  fillRect() {
    draws++;
  },
  clearRect() {
    draws++;
  },
  translate() {},
  scale() {},
  drawImage() {
    draws++;
  },
};
const cache = createRenderCache(() => ({ getContext: () => context }));
const image = { complete: true, naturalWidth: 100, src: 'terrain' };
cache.terrain(image, 844, 390, 0, 0, 1, Sim.W, Sim.H);
const initial = draws;
cache.terrain(image, 844, 390, 0, 0, 1, Sim.W, Sim.H);
assert.equal(draws, initial, 'Stationary terrain is reused');
cache.terrain(image, 844, 390, 1, 0, 1, Sim.W, Sim.H);
assert(draws > initial, 'Camera movement invalidates terrain');
const sprite = cache.sprite(image, 'knight', 0, 1, 46, 52);
assert.equal(cache.sprite(image, 'knight', 0, 1, 46, 52), sprite);
assert.notEqual(cache.sprite(image, 'knight', 1, 1, 46, 52), sprite);
assert.notEqual(cache.sprite(image, 'knight', 0, 2, 46, 52), sprite);
assert.equal(cache.sprite({ complete: false }, 'mage', 0, 2, 49, 55), null);
const visible = new Uint8Array([0, 1]);
const explored = new Uint8Array([1, 1]);
assert(cache.updateFog(context, visible, explored, 2));
const fogDraws = draws;
assert.equal(cache.updateFog(context, visible, explored, 2), false);
assert.equal(draws, fogDraws, 'Unchanged visibility never redraws fog');
visible[0] = 1;
assert(cache.updateFog(context, visible, explored, 2));
explored[1] = 0;
visible[1] = 0;
assert(cache.updateFog(context, visible, explored, 2));

const state = combatScenario(Sim);
const health = state.units.reduce((sum, unit) => sum + unit.hp, 0);
for (let frame = 0; frame < 120; frame++) Sim.tick(state, 1 / 60);
const start = performance.now();
for (let frame = 0; frame < 600; frame++) {
  Sim.tick(state, 1 / 60);
  const list = prepareDrawList(state, 0, Sim.canSee);
  assert.equal(list.length, 60);
  assert(list.every((unit, index) => !index || list[index - 1].y <= unit.y));
}
assert.equal(state.units.length, 60);
assert(state.units.reduce((sum, unit) => sum + unit.hp, 0) < health, 'Both armies actually fight');
console.log(`render-bench: sim + draw list ${((performance.now() - start) / 600).toFixed(3)} ms/frame (Node, no CPU throttling)`);

// Compare every cell with the previous exhaustive visibility rule, including
// watchtower radii, both teams, fractional positions and explored memory.
for (let sample = 0; sample < 8; sample++) {
  const scenario = combatScenario(Sim);
  scenario.watchtowers[sample % 2].owner = sample % 3 - 1;
  scenario.mines[sample % scenario.mines.length].owner = sample % 2;
  for (const [index, unit] of scenario.units.entries()) {
    unit.x = (index * 137.3 + sample * 23.7) % Sim.W;
    unit.y = (index * 83.9 + sample * 41.1) % Sim.H;
  }
  const expected = [new Uint8Array(Sim.COLS * Sim.ROWS), new Uint8Array(Sim.COLS * Sim.ROWS)];
  for (let team = 0; team < 2; team++) {
    const sources = [
      ...Sim.baseSites(scenario, team).map((base) => ({ ...base, vision: 180 })),
      ...scenario.units.filter((unit) => unit.team === team).map((unit) => ({ ...unit, vision: Sim.stats(unit.type, team).vision })),
      ...scenario.mines.filter((mine) => mine.owner === team).map((mine) => ({ ...mine, vision: 105 })),
      ...scenario.watchtowers.filter((tower) => tower.owner === team).map((tower) => ({ ...tower, vision: 420 })),
    ];
    for (let index = 0; index < expected[team].length; index++) {
      const x = index % Sim.COLS * Sim.CELL + 10;
      const y = Math.floor(index / Sim.COLS) * Sim.CELL + 10;
      expected[team][index] = Number(sources.some((source) => (source.x - x) ** 2 + (source.y - y) ** 2 < source.vision ** 2));
    }
  }
  const exploredBefore = scenario.explored.map((cells) => cells.slice());
  Sim.visibility(scenario);
  assert.deepEqual(scenario.visible, expected);
  for (let team = 0; team < 2; team++) {
    assert.deepEqual(scenario.explored[team], expected[team].map((value, index) => value || exploredBefore[team][index]));
  }
}
console.log('render-bench: caches and cell-for-cell visibility equivalence passed');

// Resizes, zooms and late terrain loads rebuild only the affected cache.
for (const parameters of [
  [845, 390, 1, 0, 1],
  [845, 390, 1, 0, 2],
]) {
  const before = draws;
  cache.terrain(image, ...parameters, Sim.W, Sim.H);
  assert(draws > before);
}
const beforeLoad = draws;
image.naturalWidth = 200;
cache.terrain(image, 845, 390, 1, 0, 2, Sim.W, Sim.H);
assert(draws > beforeLoad);

// The allocation-free target search keeps stable ties and explicit orders.
{
  const scenario = Sim.create();
  Sim.spawn(scenario, 'archer', 1);
  const [attacker, first, second] = scenario.units;
  for (const unit of scenario.units) {
    unit.type = 'archer';
    unit.harvest = null;
    unit.path = [];
    unit.hold = true;
    unit.cool = 100;
    unit.hp = 10000;
  }
  attacker.x = 790;
  attacker.y = 570;
  first.x = 850;
  first.y = 570;
  second.x = 790;
  second.y = 630;
  attacker.cool = 0;
  Sim.visibility(scenario);
  Sim.tick(scenario, 0.01);
  assert(first.hp < 10000, 'Equal distances preserve unit order');
  assert.equal(second.hp, 10000);
  attacker.target = second;
  attacker.cool = 0;
  Sim.tick(scenario, 0.01);
  assert(second.hp < 10000, 'An explicit target still takes priority');
}

const loaded = loadedScenario(Sim);
assert.equal(loaded.units.length, 93);
assert.equal(loaded.units.filter((unit) => unit.type === 'hero').length, 2);
assert.equal(loaded.corpses.length, 12);
assert.equal(loaded.monsters.filter((monster) => monster.type === 'sanglier' && monster.hp > 0).length, 4);
assert.equal(loaded.braises.length, 2);
for (const foyer of loaded.braises) {
  assert.equal(foyer.lit, true);
  assert(loaded.units.some((unit) => Math.hypot(unit.x - foyer.x, unit.y - foyer.y) < 75));
}
assert.equal(loaded.watchtowers.length, 2);
assert(loaded.watchtowers.every((tower) => tower.owner >= 0));
assert(loaded.units.filter((unit) => unit.team === 0 && unit.type !== 'commis')
  .every((unit) => unit.ragoutUntil > loaded.time));
const loadedHealth = loaded.units.reduce((sum, unit) => sum + unit.hp, 0);
for (let frame = 0; frame < 60; frame++) {
  Sim.tick(loaded, 1 / 60);
}
assert(loaded.units.reduce((sum, unit) => sum + unit.hp, 0) < loadedHealth, 'Loaded armies actually fight');
