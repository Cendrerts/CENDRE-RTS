import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { SNAPSHOT_UNIT_DEFAULTS } from '../public/game/snapshot-units.js';
import { loadedScenario } from '../scripts/render-scenario.mjs';

const spawnState = Sim.create();
// Disable automatic gathering so the worker still has its spawn values.
spawnState.mines = [];
for (const team of [0, 1]) {
  for (const type of ['commis', 'knight']) {
    Sim.spawn(spawnState, type, team);
    const spawnedId = spawnState.units.at(-1).id;
    const reference = view(spawnState, team, { compactUnits: false });
    const unit = reference.units.find((entry) => entry.id === spawnedId);
    assert.ok(unit, `${type}, équipe ${team}`);
    for (const [field, fallback] of Object.entries(SNAPSHOT_UNIT_DEFAULTS)) {
      assert.deepEqual(unit[field], fallback, `${type}, équipe ${team}, ${field}`);
    }
  }
}

class Socket {}

const clock = {
  setTimeout() {},
  clearTimeout() {},
};

const loaded = loadedScenario(Sim);
const reductions = [];
for (const team of [0, 1]) {
  for (const state of [Sim.create(), loaded]) {
    const snapshot = view(state, team);
    const reference = JSON.parse(JSON.stringify(view(state, team, { compactUnits: false })));
    const client = new RealtimeClient({ Socket, clock });
    const connected = client.connect({ code: 'ABCDEFG', token: 'test' });
    client.socket.onmessage({ data: JSON.stringify({ type: 'snapshot', team, state: snapshot }) });
    const { state: decoded } = await connected;
    assert.deepEqual(decoded.units, reference.units);
    for (const field of ['path', 'orderQueue']) {
      const arrays = decoded.units.map((unit) => unit[field]);
      assert.ok(arrays.every(Array.isArray), `${field}, équipe ${team}`);
      assert.equal(new Set(arrays).size, arrays.length, `${field}, équipe ${team}`);
    }

    if (state === loaded) {
      const before = JSON.stringify(reference.units).length;
      const after = JSON.stringify(snapshot.units).length;
      const reduction = 1 - after / before;
      console.log(`Équipe ${team} — ${before} → ${after} caractères (−${(reduction * 100).toFixed(1)} %)`);
      reductions.push(reduction);
    }
  }
}

assert(reductions.every((reduction) => reduction >= 0.30));
