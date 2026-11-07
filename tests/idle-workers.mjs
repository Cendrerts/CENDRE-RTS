import assert from 'node:assert/strict';
import { CendreSim as S, idleWorkers } from '../public/game/sim.js';
import { command, pack, view } from '../lib/match.mjs';

function scenario() {
  const state = S.create();
  const worker = state.units[0];
  assert.deepEqual(idleWorkers(state, 0), []);
  command(state, 0, { kind: 'move', ids: [worker.id], x: worker.x + 50, y: worker.y });
  assert.deepEqual(idleWorkers(state, 0), []);
  assert.deepEqual(idleWorkers(view(state, 0), 0), [], 'Moving workers remain busy in multiplayer');
  for (let step = 0; step < 100; step++) S.tick(state, 0.05);
  assert.deepEqual(idleWorkers(state, 0).map((unit) => unit.id), [worker.id]);
  assert.deepEqual(idleWorkers(view(state, 0), 0).map((unit) => unit.id), [worker.id]);
  const before = pack(state);
  idleWorkers(state, 0);
  assert.equal(pack(state), before, 'Pure query');
  state.mines[2].owner = 0;
  state.mines[3].owner = 0;
  command(state, 0, { kind: 'gather', ids: [worker.id], index: 0 });
  state.mines[0].remaining = 0;
  S.tick(state, 0.05);
  const base = state.bases[0];
  const nearest = [2, 3].sort((a, b) =>
    Math.hypot(state.mines[a].x - base.x, state.mines[a].y - base.y) -
    Math.hypot(state.mines[b].x - base.x, state.mines[b].y - base.y),
  )[0];
  assert.equal(worker.harvest.mine, nearest);
  state.mines[nearest].hp = 0;
  S.tick(state, 0.05);
  assert.equal(worker.harvest.mine, nearest === 2 ? 3 : 2);
  for (const mine of state.mines) mine.remaining = 0;
  S.tick(state, 0.05);
  assert.equal(worker.harvest, null);
  assert.deepEqual(worker.path, []);
  const position = [worker.x, worker.y];
  for (let step = 0; step < 100; step++) S.tick(state, 0.05);
  assert.deepEqual([worker.x, worker.y], position);
  assert.deepEqual(idleWorkers(state, 0).map((unit) => unit.id), [worker.id]);
  return pack(state);
}
assert.equal(scenario(), scenario(), 'Identical commands yield identical states');
console.log('PASS idle workers, depletion, destruction, reassignment and determinism');

// The final partial bag consumes the reserve exactly once and is delivered.
{
  const state = S.create();
  const worker = state.units[0];
  state.mines[0].remaining = 3;
  for (let step = 0; worker.cargo === 0 && step < 2000; step++) S.tick(state, 0.01);
  assert.equal(worker.cargo, 3);
  assert.equal(state.mines[0].remaining, 0);
  for (let step = 0; worker.harvest && step < 2000; step++) S.tick(state, 0.01);
  assert.equal(worker.cargo, 0);
  assert.equal(state.rubies[0], 103);
  assert.equal(worker.harvest, null);
  assert.deepEqual(worker.path, []);
}

{
  const state = S.create();
  S.spawn(state, 'commis', 0);
  S.spawn(state, 'knight', 0);
  for (const worker of state.units.filter((unit) => unit.team === 0)) {
    S.order(state, [worker.id], worker.x, worker.y);
    worker.path = [];
  }
  const expected = state.units.filter((unit) => unit.team === 0 && unit.type === 'commis');
  const ids = expected.map((unit) => unit.id).sort((a, b) => a - b);
  state.units.reverse();
  assert.deepEqual(idleWorkers(state, 0).map((unit) => unit.id), ids);
  expected[0].hp = 0;
  assert(!idleWorkers(state, 0).includes(expected[0]));
  const saved = JSON.parse(pack(S.create()));
  delete saved.mines[0].remaining;
  saved.mines[1].remaining = 0;
  S.migrateState(saved);
  assert.equal(saved.mines[0].remaining, S.RULES.mineReserve);
  assert.equal(saved.mines[1].remaining, 0);
}
