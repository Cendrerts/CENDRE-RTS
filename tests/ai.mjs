import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { BUILD_ORDERS, DIFFICULTIES } from '../public/game/ai-config.js';

assert.deepEqual(Object.keys(DIFFICULTIES), ['facile', 'normal', 'difficile']);
assert.throws(() => createAI(0, 'unknown'));
for (const order of BUILD_ORDERS) {
  const available = new Set();
  for (const building of order) {
    assert(building.requires.every((id) => available.has(id)));
    available.add(building.id);
  }
}
// Identical visible observations produce identical decisions, even when hidden
// enemy health and ownership differ. No omniscient choice of attack targets.
{
  const a = S.create();
  const b = S.create();
  b.units[1].hp = 1;
  b.mines[2].owner = 1;
  createAI(0).update(a);
  createAI(0).update(b);
  assert.deepEqual(a.units.filter((unit) => unit.team === 0), b.units.filter((unit) => unit.team === 0));
  assert.deepEqual(a.queues[0], b.queues[0]);
  assert.equal(a.rubies[0], b.rubies[0]);
}
// Micro uses visible enemies only, focuses the weakest, and retreats under cover.
{
  const state = S.create();
  state.units = [];
  for (const team of [0, 0, 1, 1]) S.spawn(state, 'archer', team);
  state.units.forEach((unit, index) => {
    unit.x = 810 + index * 10;
    unit.y = 450;
    unit.path = [];
  });
  state.units[3].hp = 1;
  S.visibility(state);
  const ai = createAI(0);
  ai.update(state);
  assert.equal(state.units[0].target, state.units[3]);
  state.units[0].hp = state.units[0].max * 0.2;
  state.time = 2;
  ai.update(state);
  assert(state.units[0].retreat);
}

// An uncontested economy takes its first expansion around three minutes.
for (const team of [0, 1]) {
  const state = S.create();
  const ai = createAI(team);
  state.bases[1 - team].hp = 1000000;
  while (state.time < 300 && state.winner === null) {
    ai.update(state);
    S.tick(state, 0.1);
  }
  assert(state.mines.some((mine, index) => index >= 2 && mine.owner === team && mine.depot));
  assert(state.units.filter((unit) => unit.team === team && unit.type === 'commis').length >= 4);
}

// Fixed PRNG seed: reproducible legal initial worker positions, alternating
// factions and decision order to avoid giving normal a consistent first move.
let seed = 18;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
let wins = 0;
for (let game = 0; game < 20; game++) {
  const state = S.create();
  for (const unit of state.units) {
    const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
    unit.x = (cell % S.COLS) * S.CELL + 10;
    unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
  }
  S.visibility(state);
  const normal = game % 2;
  const controllers = [0, 1].map((team) => createAI(team, team === normal ? 'normal' : 'facile'));
  const inactive = [0, 0];
  const previous = [null, null];

  for (let step = 0; step < 9000 && state.winner === null; step++) {
    for (const team of game % 2 ? [1, 0] : [0, 1]) {
      controllers[team].update(state);
      // Harvest deliveries, production, movement and combat are also activity;
      // merely polling the controller is not.
      const progress = JSON.stringify({
        rubies: state.rubies[team],
        jobs: state.queues[team],
        units: state.units.filter((unit) => unit.team === team).map((unit) => [unit.id, unit.x, unit.y, unit.hp, unit.cargo, unit.harvest?.elapsed]),
        enemyBase: state.bases[1 - team].hp,
      });
      const active = progress !== previous[team];
      previous[team] = progress;
      inactive[team] = state.rubies[team] > 200 && !active ? inactive[team] + 0.1 : 0;
      assert(inactive[team] <= 30, `Inactive AI: game ${game}, team ${team}`);
    }
    S.tick(state, 0.1);
  }
  assert.notEqual(state.winner, null, `Game ${game} must finish`);
  assert(state.time < 900, `Game ${game} exceeds 15 minutes`);

  if (state.winner === normal) wins++;
  console.log(`Game ${game + 1}: ${state.time.toFixed(1)}s, winner ${state.winner === normal ? 'normal' : 'facile'}`);
}
assert(wins >= 14, `Normal won only ${wins}/20`);
console.log(`PASS: normal wins ${wins}/20, finite matches, economy, fog and micro.`);
