import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// Each team captures its own nearest expansion before any exposed site.
for (const team of [0, 1]) {
  const state = Sim.create();
  const natural = state.mines.map((mine, index) => ({ ...mine, index }))
    .filter((mine) => mine.index >= 2)
    .sort((a, b) => Math.hypot(a.x - state.bases[team].x, a.y - state.bases[team].y) - Math.hypot(b.x - state.bases[team].x, b.y - state.bases[team].y))[0];
  const worker = state.units.find((unit) => unit.team === team);
  worker.x = natural.x;
  worker.y = natural.y;
  worker.harvest = null;
  state.rubies[team] = 1000;
  state.time = 150;
  Sim.visibility(state);
  const controller = createAI(team, 'difficile');
  controller.update(state);
  assert.equal(state.mines[natural.index].owner, team);
  assert.equal(controller.metrics.expansions.length, 1);
}

// Visible resistance selects each of the three public approaches. Hidden
// troops must not affect the decision. Check both directions of travel.
for (const team of [0, 1]) {
  for (const expected of ['centre', 'nord', 'sud']) {
    const state = Sim.create();
    state.units = [];
    const base = state.bases[team];
    for (let index = 0; index < 24; index++) {
      Sim.spawn(state, 'knight', team);
      const unit = state.units.at(-1);
      unit.x = base.x + (team ? -110 : 110);
      unit.y = base.y + (team ? 65 : -65);
      unit.path = [];
    }
    for (const lane of Sim.lanes.filter((lane) => lane.name !== expected)) {
      const [x, y] = lane.points[3];
      for (let index = 0; index < 8; index++) {
        Sim.spawn(state, 'knight', 1 - team);
        const enemy = state.units.at(-1);
        enemy.x = x;
        enemy.y = y;
      }
    }
    state.rubies[team] = 0;
    state.time = 240;
    state.visible[team].fill(1);
    const controller = createAI(team, 'brutal');
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert.equal(controller.metrics.lanes[0], expected);
    const attackers = state.units.filter((unit) => unit.team === team).slice(2);
    if (expected !== 'centre') {
      assert(attackers.every((unit) => unit.orderQueue.length > 0));
    }
    // Ninety seconds is no longer a reason to recall troops still travelling.
    state.time = 331;
    state.visible[team].fill(0);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert(attackers.every((unit) => Math.hypot(unit.path.at(-1).x - base.x, unit.path.at(-1).y - base.y) > 400));
  }
}
// A losing army in the middle of the enlarged map retreats all the way
// to its own base, using traversable paths in both directions.
for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  Sim.spawn(state, 'knight', team);
  for (let index = 0; index < 8; index++) {
    Sim.spawn(state, 'knight', 1 - team);
  }
  for (const [index, unit] of state.units.entries()) {
    unit.x = 2000 + index * 10;
    unit.y = 1100;
    unit.path = [];
  }
  state.rubies[team] = 0;
  Sim.visibility(state);
  createAI(team, 'difficile').update(state);
  const unit = state.units[0];
  assert(unit.retreat);
  const destination = unit.path.at(-1);
  assert(Math.hypot(destination.x - state.bases[team].x, destination.y - state.bases[team].y) < 200);
}

// Mature waves must attack the enemy base even with nearer known depots.
{
  const state = Sim.create();
  state.units = [];
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.mines[2].owner = 1;
  state.mines[2].depot = true;
  state.rubies[0] = 0;
  state.time = 480;
  state.visible[0].fill(1);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  assert(state.units.every((unit) => Math.hypot(unit.attackDestination.x - state.bases[1].x, unit.attackDestination.y - state.bases[1].y) < 200));
}

// A raid on an expansion evacuates workers without cancelling a wave
// already on its way to the enemy base.
{
  const state = Sim.create();
  const worker = state.units.find((unit) => unit.team === 0);
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.rubies[0] = 0;
  state.time = 240;
  state.visible[0].fill(0);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  const army = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
  const destinations = army.map((unit) => ({ ...unit.attackDestination }));
  const mine = state.mines[2];
  mine.owner = 0;
  mine.depot = true;
  worker.x = mine.x;
  worker.y = mine.y;
  for (let index = 0; index < 5; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = mine.x + 60;
    enemy.y = mine.y;
  }
  state.time = 241;
  Sim.visibility(state);
  controller.update(state);
  assert(worker.retreat);
  assert.deepEqual(army.map((unit) => unit.attackDestination), destinations);
}

// A mature assault commits to the visible main instead of endlessly
// retargeting newly produced defenders and retreating without base damage.
for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  const enemyBase = state.bases[1 - team];
  for (let index = 0; index < 4; index++) {
    Sim.spawn(state, 'archer', team);
    const unit = state.units.at(-1);
    unit.x = enemyBase.x + (team ? 150 : -150);
    unit.y = enemyBase.y;
    unit.path = [];
  }
  for (let index = 0; index < 8; index++) {
    Sim.spawn(state, 'knight', 1 - team);
    const unit = state.units.at(-1);
    unit.x = enemyBase.x + (team ? 180 : -180);
    unit.y = enemyBase.y;
    unit.path = [];
  }
  state.time = 480;
  state.rubies[team] = 0;
  Sim.visibility(state);
  createAI(team, 'brutal').update(state);
  const attackers = state.units.filter((unit) => unit.team === team);
  assert(attackers.every((unit) => unit.target === enemyBase && !unit.retreat));
  const health = enemyBase.hp;
  Sim.tick(state, 0.01);
  assert(enemyBase.hp < health);
}

// An unseen blockade cannot make the AI choose a longer lane.
{
  const state = Sim.create();
  state.units = [];
  for (let index = 0; index < 24; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  for (let index = 0; index < 12; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = 2000;
    enemy.y = 1100;
  }
  state.rubies[0] = 0;
  state.time = 240;
  state.visible[0].fill(0);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.lanes[0], 'centre');
}
console.log('PASS: natural expansions, three attack lanes, fog and long-distance wave timing.');
