import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { decodeSnapshotFog, encodeFogGrid } from '../public/game/snapshot-fog.js';
import { loadedScenario } from '../scripts/render-scenario.mjs';

const scenarios = [
  { name: 'Début de partie', state: Sim.create(), limit: 15_000 },
  { name: 'Partie chargée', state: loadedScenario(Sim), limit: 40_000 },
];
const emptyGrid = new Array(Sim.COLS * Sim.ROWS).fill(0);
const bitsetLength = 4 * Math.ceil(Math.ceil(emptyGrid.length / 8) / 3);

for (const grid of [
  emptyGrid,
  emptyGrid.map(() => 1),
  emptyGrid.map((_, index) => index % 2),
]) {
  const snapshot = { visible: encodeFogGrid(grid) };
  decodeSnapshotFog(snapshot, 0);
  assert.deepEqual(snapshot.visible, [grid, emptyGrid]);
}

for (const { name, state, limit } of scenarios) {
  for (const team of [0, 1]) {
    const label = `${name}, équipe ${team}`;
    const json = JSON.stringify(view(state, team));
    console.log(`${label} — ${json.length} caractères JSON (seuil ${limit})`);
    assert(json.length < limit, label);

    const snapshot = JSON.parse(json);
    for (const field of ['visible', 'explored']) {
      assert.equal(typeof snapshot[field], 'string', `${label}, ${field}`);
      assert(snapshot[field].length < bitsetLength, `${label}, ${field}`);
    }
    decodeSnapshotFog(snapshot, team);

    for (const field of ['visible', 'explored']) {
      const expected = [[], []];
      expected[team] = Array.from(state[field][team]);
      expected[1 - team] = emptyGrid;
      assert.deepEqual(snapshot[field], expected, `${label}, ${field}`);
    }
  }
}

const roundingState = Sim.create();
const worker = roundingState.units.find((unit) => unit.team === 0);
worker.hp = 49.96;
worker.harvest = { mine: 0, elapsed: 0.126 };
worker.orderQueue = [{ x: 123.456, y: 789, target: { id: 2 } }];
worker.target = worker;
const transmittedWorker = view(roundingState, 0).units.find((unit) => unit.id === worker.id);
assert.equal(transmittedWorker.hp, 50);
assert.deepEqual(transmittedWorker.harvest, { mine: 0, elapsed: 0.1 });
assert.deepEqual(transmittedWorker.orderQueue, [{ x: 123.5, y: 789, target: { id: 2 } }]);
assert(!Object.hasOwn(transmittedWorker, 'target'));
assert(!Object.hasOwn(transmittedWorker, 'cool'));
assert.equal(worker.hp, 49.96);
assert.equal(worker.harvest.elapsed, 0.126);
assert.equal(worker.orderQueue[0].x, 123.456);
assert.equal(worker.target, worker);

const mirror = Sim.create();
const controllers = [0, 1].map((team) => createAI(team, 'brutal', mirror));
const step = 0.05;
const duration = 8 * 60;
for (let tick = 0; tick < duration / step; tick++) {
  for (const controller of controllers) {
    controller.update(mirror);
  }
  Sim.tick(mirror, step);
}
assert(mirror.time >= duration);

for (const team of [0, 1]) {
  const snapshot = view(mirror, team);
  const total = JSON.stringify(snapshot).length;
  const unitCount = snapshot.units.length;
  assert(unitCount > 0);
  const average = JSON.stringify(snapshot.units).length / unitCount;
  const label = `Brutal miroir à 8 min, équipe ${team}`;
  console.log(`${label} — ${total} caractères JSON, ${average.toFixed(2)} par unité (${unitCount} unités)`);
  assert(average < 300, label);
}
