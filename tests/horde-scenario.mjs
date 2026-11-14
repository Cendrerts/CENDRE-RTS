import assert from 'node:assert/strict';
import { CendreSim as sim } from '../public/game/sim.js';
import { prepareDrawList } from '../public/game/render-cache.js';
import { hordeScenario } from '../scripts/render-scenario.mjs';

const state = hordeScenario(sim);
assert.equal(state.units.length, 91, '45 + 30 combatants and 16 workers');
for (const team of [0, 1]) {
  const army = state.units.filter((unit) => unit.team === team && unit.type !== 'commis');
  assert.equal(army.length, team === 1 ? 45 : 30);
  assert.equal(new Set(army.map((unit) => unit.type)).size, 3);
  assert.equal(state.units.filter((unit) => unit.team === team && unit.type === 'commis').length, 8);
}
const startingHealth = state.units.reduce((sum, unit) => sum + unit.hp, 0);
for (let frame = 0; frame < 600; frame++) {
  sim.tick(state, 1 / 60);
  assert.equal(state.units.length, 91, 'The full workload survives the battle');
  for (const team of [0, 1]) {
    assert.equal(prepareDrawList(state, team, sim.canSee).length, 91);
  }
  for (const unit of state.units) {
    assert(Number.isFinite(unit.x) && Number.isFinite(unit.y));
    assert(sim.walk[Math.floor(unit.y / sim.CELL) * sim.COLS + Math.floor(unit.x / sim.CELL)]);
    // Camera centered on the battle, including room for a 52 px sprite.
    assert(Math.abs(unit.x - sim.W / 2) < 844 / 2 - 26);
    assert(Math.abs(unit.y - sim.H / 2) < 390 / 2 - 30);
  }
  if (frame === 0) {
    assert(state.units.reduce((sum, unit) => sum + unit.hp, 0) < startingHealth, 'Combat starts on the first tick');
  }
}
for (const team of [0, 1]) {
  assert(state.units.some((unit) => unit.team === team && unit.hp < unit.max), 'Both sides take damage');
}
assert(state.units.reduce((sum, unit) => sum + unit.hp, 0) < startingHealth);
console.log('horde-scenario: 45 rats, 30 cooks, 16 workers, 600 ticks with damage passed');
