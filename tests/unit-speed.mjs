import assert from 'node:assert/strict';
import { BrigadeCuisine } from '../public/game/cooks-config.js';
import { RatsGout } from '../public/game/rats-config.js';
import { CendreSim as S } from '../public/game/sim.js';
import { command } from '../lib/match.mjs';

assert.deepEqual(Object.values(BrigadeCuisine.unites).map((unit) => unit.speed), [126, 84, 90, 70]);
assert.deepEqual(Object.values(RatsGout.unites).map((unit) => unit.speed), [126, 90, 101, 78]);

// Exercise both normal ticks and the maximum simulation timestep.
for (const dt of [1 / 60, 0.05]) {
  const state = S.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  S.spawn(state, 'knight', 0);
  const unit = state.units[0];
  unit.x = 1006;
  unit.y = 450;
  const destination = { x: 1850, y: 450 };
  for (let x = unit.x; x <= destination.x; x++) {
    assert(S.walk[Math.floor(unit.y / S.CELL) * S.COLS + Math.floor(x / S.CELL)], 'Ligne droite sur terrain libre');
  }
  command(state, 0, { kind: 'move', ids: [unit.id], ...destination });
  let steps = 0;
  let previousDistance = 844;
  while (unit.path.length && steps < Math.floor(10.5 / dt)) {
    S.tick(state, dt);
    steps++;
    const distance = Math.hypot(unit.x - destination.x, unit.y - destination.y);
    assert(distance <= previousDistance + 1e-8, 'Aucun éloignement du point d’ordre');
    assert.equal(unit.y, destination.y, 'Trajet en ligne droite');
    previousDistance = distance;
  }
  assert.equal(unit.path.length, 0, 'Arrivée en 10,5 secondes au plus');
  assert(previousDistance < 6, 'Arrêt à moins de 6 px du point d’ordre');
  const stopped = { x: unit.x, y: unit.y };
  for (let step = 0; step < Math.ceil(2 / dt); step++) {
    S.tick(state, dt);
    assert.deepEqual({ x: unit.x, y: unit.y }, stopped, 'Arrêt stable sans oscillation');
  }
  console.log(`PASS: Garde-Manger, 844 px en ${(steps * dt).toFixed(3)} s, dt=${dt}`);
}
