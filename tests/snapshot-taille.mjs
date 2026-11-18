import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { decodeSnapshotFog } from '../public/game/snapshot-fog.js';
import { loadedScenario } from '../scripts/render-scenario.mjs';

const scenarios = [
  { name: 'Début de partie', state: Sim.create(), limit: 15_000 },
  { name: 'Partie chargée', state: loadedScenario(Sim), limit: 40_000 },
];
const emptyGrid = new Array(Sim.COLS * Sim.ROWS).fill(0);
const bitsetLength = 4 * Math.ceil(Math.ceil(emptyGrid.length / 8) / 3);

for (const { name, state, limit } of scenarios) {
  for (const team of [0, 1]) {
    const label = `${name}, équipe ${team}`;
    const json = JSON.stringify(view(state, team));
    console.log(`${label} — ${json.length} caractères JSON (seuil ${limit})`);
    assert(json.length < limit, label);

    const snapshot = JSON.parse(json);
    for (const field of ['visible', 'explored']) {
      assert.equal(typeof snapshot[field], 'string', `${label}, ${field}`);
      assert.equal(snapshot[field].length, bitsetLength, `${label}, ${field}`);
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
