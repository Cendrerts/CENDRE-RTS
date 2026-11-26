import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { resolveTap } from '../public/game/tap.js';
import { cellAt } from './helpers/map-path.mjs';

const step = 0.05;
const campName = 'camp-veine';
const expectedMembers = [
  ['goinfre', 2000, 1030, 900],
  ['sanglier', 1930, 1100, 220],
  ['sanglier', 2070, 1100, 220],
];
const campOf = (state) => state.camps.find((camp) => camp.name === campName);
const membersOf = (state) => state.monsters.filter((monster) => monster.camp === campName && monster.hp > 0);
const goinfreOf = (state) => membersOf(state).find((monster) => monster.type === 'goinfre');

function advance(state, seconds) {
  for (let tick = 0; tick < Math.round(seconds / step); tick++) Sim.tick(state, step);
}

function checkMembers(state) {
  const monsters = membersOf(state);
  assert.deepEqual(monsters.map(({ type, x, y, hp }) => [type, x, y, hp]), expectedMembers);
  assert(monsters.every(({ id, team, x, y }) => id < 0 && team === -1 && Sim.walk[cellAt(x, y)]));
}

{
  const state = Sim.create();
  const camp = campOf(state);
  assert(camp);
  assert.deepEqual([camp.x, camp.y], [2000, 1100]);
  checkMembers(state);
  const { damage, rate, range, speed, aggro } = Sim.stats('goinfre', -1);
  assert.deepEqual([damage, rate, range, speed, aggro], [28, 1.5, 30, Sim.stats('commis', 0).speed * 0.7, 110]);

  const worker = state.units[0];
  const veinIndex = state.mines.findIndex((mine) => mine.boost);
  const vein = state.mines[veinIndex];
  Object.assign(worker, { x: vein.x, y: vein.y });
  // Un ouvrier déjà affecté à la mine, comme après la réapparition du camp.
  vein.owner = worker.team;
  assert(Sim.gather(state, worker.team, [worker.id], veinIndex));
  const goinfre = goinfreOf(state);
  while (goinfre.lastAttackAt == null && state.time + step < 3) Sim.tick(state, step);
  assert(goinfre.lastAttackAt > 0 && goinfre.lastAttackAt < 3);
  assert.equal(goinfre.lastAttackTargetId, worker.id);
}

{
  const state = Sim.create();
  const goinfre = goinfreOf(state);
  Sim.spawn(state, 'knight', 0);
  const knight = state.units.at(-1);
  Object.assign(knight, { x: goinfre.x, y: goinfre.y - 20 });
  Sim.visibility(state);
  const tap = resolveTap(state, 0, new Set([knight.id]), { x: goinfre.x - 35, y: goinfre.y - 23 }, 1.3);
  assert.equal(tap.kind, 'attack');
  assert.equal(tap.target, goinfre);
  const before = structuredClone(state.ingredients);
  goinfre.hp = 1;
  Sim.order(state, [knight.id], goinfre.x, goinfre.y, goinfre);
  Sim.tick(state, step);
  assert.equal(state.ingredients[0].viande, before[0].viande + 30);
  assert.equal(state.ingredients[0].conserves, before[0].conserves + 20);
  assert.deepEqual(state.ingredients[1], before[1]);
  const corpse = state.corpses.find(({ id }) => id === goinfre.id);
  assert.equal(corpse?.type, 'goinfre');
  assert.equal(campOf(state).respawnAt, null);

  for (const monster of membersOf(state)) monster.hp = 0;
  Object.assign(knight, { x: state.bases[0].x, y: state.bases[0].y });
  Sim.spawn(state, 'knight', 1);
  const rat = state.units.at(-1);
  Object.assign(rat, { x: corpse.x, y: corpse.y });
  Sim.visibility(state);
  assert(Sim.devour(state, 1, [rat.id], corpse.id));
  advance(state, 4.1);
  assert.equal(state.ingredients[1].viande, before[1].viande + 10);
  assert(!state.corpses.includes(corpse));
}

{
  const state = Sim.create();
  const camp = campOf(state);
  for (const monster of membersOf(state)) monster.hp = 0;
  Sim.tick(state, step);
  assert.equal(camp.respawnAt, state.time + 240);
  const restored = Sim.restore(Sim.serialize(state));
  advance(restored, 240 - step);
  assert.equal(membersOf(restored).length, 0);
  Sim.tick(restored, step);
  if (restored.time < camp.respawnAt) Sim.tick(restored, step);
  assert(restored.time >= camp.respawnAt && restored.time <= camp.respawnAt + step + 1e-9);
  checkMembers(restored);
  assert.equal(campOf(restored).respawnAt, null);
}

{
  const state = Sim.create();
  const camp = campOf(state);
  const goinfre = goinfreOf(state);
  Object.assign(goinfre, { x: camp.x - 300, y: camp.y, hp: 100, targetId: state.units[0].id });
  assert(Sim.walk[cellAt(goinfre.x, goinfre.y)]);
  Sim.tick(state, step);
  assert(goinfre.returning);
  assert.equal(goinfre.targetId, null);
  advance(state, 10);
  assert(Math.hypot(goinfre.x - camp.x, goinfre.y - camp.y) < 2);
  assert.equal(goinfre.hp, 900);
  assert.equal(goinfre.returning, false);
}

for (const guarded of [true, false]) {
  const state = Sim.create();
  const vein = state.mines.find((mine) => mine.boost);
  // En faire l'extension naturelle pour que la règle soit décisive dès le premier choix.
  const base = state.bases[0];
  const distanceToBase = ({ x, y }) => Math.hypot(x - base.x, y - base.y);
  for (const mine of state.mines.slice(2)) {
    if (distanceToBase(mine) < distanceToBase(vein)) {
      mine.x = Sim.W - mine.x;
      mine.y = Sim.H - mine.y;
    }
  }
  if (!guarded) {
    for (const monster of membersOf(state)) monster.hp = 0;
    Sim.tick(state, step);
  }
  const ai = createAI(0, 'difficile', state);
  const order = Sim.order;
  let veinChosen = false;
  Sim.order = (match, ids, x, y, target, retreat, ...rest) => {
    if (x === vein.x && y === vein.y && retreat && ids.some((id) =>
      match.units.some((unit) => unit.id === id && unit.type === 'commis'))) veinChosen = true;
    return order(match, ids, x, y, target, retreat, ...rest);
  };
  try {
    for (let tick = 0; tick < 2400; tick++) {
      ai.update(state);
      Sim.tick(state, 0.1);
    }
  } finally {
    Sim.order = order;
  }
  assert(state.time >= 240 - 1e-8);
  if (guarded) assert(membersOf(state).length > 0);
  assert.equal(veinChosen, !guarded);
  assert.equal(vein.owner === 0, !guarded);
}

console.log('PASS : camp, aggro, butin, Dévorer, laisse, réapparition et extension IA.');
