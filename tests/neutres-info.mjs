import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { neutralInfoText, resolveTap } from '../public/game/tap.js';

function spawnHunter(state, monster) {
  Sim.spawn(state, 'knight', 0);
  const hunter = state.units.at(-1);
  hunter.x = monster.x;
  hunter.y = monster.y + 20;
  Sim.visibility(state);
  return hunter;
}

const rewards = {
  sanglier: { viande: 15, epices: 0, conserves: 0 },
  lezard: { viande: 0, epices: 8, conserves: 0 },
  goinfre: { viande: 30, epices: 0, conserves: 20 },
};

for (const [type, reward] of Object.entries(rewards)) {
  assert.deepEqual(Sim.neutralReward(type), reward, type);
  const state = Sim.create();
  const monster = state.monsters.find((candidate) => candidate.type === type);
  const hunter = spawnHunter(state, monster);
  const initialStock = { ...state.ingredients[0] };
  monster.hp = 1;
  Sim.order(state, [hunter.id], monster.x, monster.y, monster);
  Sim.tick(state, 0.05);
  assert(monster.hp <= 0, type);
  assert.deepEqual(state.ingredients[0], {
    viande: initialStock.viande + reward.viande,
    epices: initialStock.epices + reward.epices,
    conserves: initialStock.conserves + reward.conserves,
  }, type);
}

const state = Sim.create();
const goinfre = state.monsters.find((monster) => monster.type === 'goinfre');
const lizard = state.monsters.find((monster) => monster.type === 'lezard');
const point = { x: goinfre.x, y: goinfre.y - 22 };
assert.equal(Sim.canSee(state, 0, goinfre), false);
assert.notEqual(resolveTap(state, 0, new Set(), point).kind, 'neutral');

const hunter = spawnHunter(state, goinfre);
assert.equal(Sim.canSee(state, 0, goinfre), true);
assert.deepEqual(resolveTap(state, 0, new Set(), point), { kind: 'neutral', id: goinfre.id });
assert.deepEqual(resolveTap(state, 0, new Set([hunter.id]), point), { kind: 'attack', target: goinfre });

goinfre.hp = 639.6;
assert.equal(neutralInfoText(goinfre), 'Goinfre des Cendres · 640/900 PV · +30 Viande, +20 Conserves');
assert.equal(neutralInfoText(lizard), 'Lézard-Piment · 90/90 PV · +8 Épices');
console.log('PASS Neutres : butin au dernier coup, tap visible et texte du toast.');
