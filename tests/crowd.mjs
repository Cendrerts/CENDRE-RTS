import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';

const dt = 0.05;

function addGroup(state, count, x, y) {
  const units = [];
  for (let index = 0; index < count; index++) {
    S.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = x + index % 5 * 24;
    unit.y = y + Math.floor(index / 5) * 24;
    assert(S.walk[Math.floor(unit.y / S.CELL) * S.COLS + Math.floor(unit.x / S.CELL)]);
    units.push(unit);
  }
  return units;
}

function scenario(kind) {
  const state = S.create();
  state.units = [];
  // Cross the northern forest corridor in both directions, then approach a base.
  if (kind === 'building') {
    const group = addGroup(state, 30, 600, 1690);
    S.order(state, group.map((unit) => unit.id), state.bases[0].x + 20, state.bases[0].y);
  } else {
    const west = addGroup(state, kind === 'crossing' ? 20 : 40, 650, 360);
    const east = kind === 'crossing' ? addGroup(state, 20, 1350, 400) : [];
    S.order(state, west.map((unit) => unit.id), 1400, 450);
    if (east.length) S.order(state, east.map((unit) => unit.id), 650, 450);
  }
  const measurements = state.units.map((unit) => {
    const destination = { ...unit.path.at(-1) };
    const distance = Math.hypot(unit.x - destination.x, unit.y - destination.y);
    return {
      unit,
      destination,
      best: distance,
      lastProgress: 0,
      longestPause: 0,
      deadline: 2.5 * distance / S.stats(unit.type, unit.team).speed,
      arrival: null,
      crossed: false,
    };
  });
  const duration = Math.max(...measurements.map((item) => item.deadline)) + 3;
  for (let step = 1; step * dt <= duration; step++) {
    S.tick(state, dt);
    const time = step * dt;
    assert.equal(state.units.length, measurements.length, 'Aucune perte pendant le trajet');
    for (const item of measurements) {
      const { unit, destination } = item;
      assert(S.walk[Math.floor(unit.y / S.CELL) * S.COLS + Math.floor(unit.x / S.CELL)], 'Terrain marchable à chaque tick');
      const distance = Math.hypot(unit.x - destination.x, unit.y - destination.y);
      if (unit.x >= 990 && unit.x < 1010) item.crossed = true;
      if (item.arrival !== null) {
        if (distance < 40) continue;
        item.arrival = null;
        item.best = distance;
        item.lastProgress = time;
      }
      if (distance < item.best - 1) {
        item.best = distance;
        item.lastProgress = time;
      }
      item.longestPause = Math.max(item.longestPause, time - item.lastProgress);
      assert(item.longestPause <= 2 + 1e-8, `${kind}: ${unit.id} sans progrès ${item.longestPause.toFixed(2)} s`);
      if (distance < 40) item.arrival = time;
      assert(time < item.deadline || item.arrival !== null, `${kind}: ${unit.id} dépasse ${item.deadline.toFixed(2)} s`);
    }
  }
  for (const item of measurements) {
    assert(item.arrival !== null && item.arrival < item.deadline,
      `${kind}: ${item.unit.id} arrive avant 2,5 fois son temps en ligne droite`);
  }
  if (kind !== 'building') {
    assert(measurements.every((item) => item.crossed), 'Chaque unité traverse le goulet');
  }
  assert(state.units.every((unit) => unit.path.length === 0), 'Formation stabilisée après arrivée');
  return { state, measurements: measurements.map(({ unit, destination, ...item }) => item) };
}

for (const kind of ['passage', 'crossing', 'building']) {
  const first = scenario(kind);
  assert.deepEqual(scenario(kind), first, `${kind}: état et mesures déterministes`);
  console.log(`${kind}: ${first.state.units.length}/${first.state.units.length} arrivées ; maximum ${Math.max(...first.measurements.map((item) => item.arrival)).toFixed(2)} s ; pause maximale ${Math.max(...first.measurements.map((item) => item.longestPause)).toFixed(2)} s`);
}
