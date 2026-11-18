import assert from 'node:assert/strict';
import { command, pack, unpack } from '../lib/match.mjs';
import { CendreSim as S } from '../public/game/sim.js';

const initial = S.create();
for (let index = 0; index < 40; index++) {
  S.spawn(initial, 'knight', 1);
}
for (let index = 0; index < 4; index++) {
  S.spawn(initial, 'knight', 0);
}

const army = initial.units.filter((unit) => unit.team === 1 && unit.type === 'knight');
const armyIds = army.map((unit) => unit.id);
const enemyIds = initial.units
  .filter((unit) => unit.team === 0)
  .map((unit) => unit.id);
assert.equal(armyIds.length, 40);
assert.equal(enemyIds.length, 5);
assert(army.every((unit) => unit.path.length === 0));

const move = { kind: 'move', x: 3200, y: 800 };
const mixedIds = [...enemyIds, ...armyIds.flatMap((id) => [id, id, id])];
for (const ids of [armyIds, mixedIds]) {
  const state = unpack(pack(initial));
  const unselected = state.units.filter((unit) => !armyIds.includes(unit.id));
  const before = structuredClone(unselected);
  command(state, 1, { ...move, ids });
  const orderedIds = state.units
    .filter((unit) => armyIds.includes(unit.id) && unit.path.length > 0)
    .map((unit) => unit.id);
  assert.deepEqual(orderedIds, armyIds);
  assert.deepEqual(unselected, before);
}

console.log('OK — les 40 unités reçoivent l’ordre, même avec des doublons et des identifiants adverses.');
