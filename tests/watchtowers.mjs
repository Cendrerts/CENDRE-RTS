import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view } from '../lib/match.mjs';

const state = S.create();
state.units = [];
state.monsters = [];
state.camps = [];
const [north, south] = state.watchtowers;
assert.deepEqual(state.watchtowers.map(({ name, x, y }) => ({ name, x, y })), [
  { name: 'tour-nord', x: 1800, y: 650 },
  { name: 'tour-sud', x: 2200, y: 1550 },
]);
assert.equal(north.x + south.x, S.W);
assert.equal(north.y + south.y, S.H);
for (const tower of state.watchtowers) {
  assert.equal(tower.owner, -1);
  assert(S.walk[Math.floor(tower.y / S.CELL) * S.COLS + Math.floor(tower.x / S.CELL)]);
  for (const base of state.bases) assert(S.route(base.x, base.y, tower.x, tower.y).length);
}
function add(type, team, x = north.x, y = north.y) {
  S.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, hold: true, cool: 999, harvest: null, path: [] });
  return unit;
}
function advance(seconds) {
  for (let step = 0; step < Math.round(seconds * 20); step++) S.tick(state, 0.05);
}
add('commis', 0);
advance(5);
assert.equal(north.progress, 0, 'Ouvrier seul sans capture');
state.units = [];
const military = add('knight', 0, north.x + 90, north.y);
advance(1);
assert.equal(north.progress, 0, 'Rayon strictement inférieur à 90 px');
military.x = north.x + 89;
advance(2);
state.units = [];
advance(0.05);
assert.equal(north.progress, 0, 'Absence : remise à zéro des secondes consécutives');
state.units = [military];
advance(3.95);
assert.equal(north.owner, -1);
advance(0.05);
assert.equal(north.owner, 0, 'Capture après quatre secondes');
state.units = [];
advance(1);
assert.equal(north.owner, 0, 'Possession conservée sans unité');
assert(S.visibleAt(state, 0, north.x + 400, north.y));
assert(!S.visibleAt(state, 0, north.x + 440, north.y));
const enemy = add('archer', 1);
advance(2);
assert(north.progress > 1.9);
add('knight', 0);
advance(1);
assert.equal(north.progress, 0, 'Présence des deux camps : interruption');
assert.equal(north.owner, 0);
state.units = [enemy];
advance(3.95);
assert.equal(north.owner, 0);
advance(0.05);
assert.equal(north.owner, 1, 'Reprise après quatre nouvelles secondes');
assert.equal(north.losses[0], 1);
state.units = [];
S.visibility(state);
assert(!S.visibleAt(state, 0, north.x + 400, north.y));
assert(S.visibleAt(state, 1, north.x + 400, north.y));
assert(state.explored[0][Math.floor(north.y / S.CELL) * S.COLS + Math.floor(north.x / S.CELL)]);
add('knight', 0, south.x, south.y);
advance(4);
assert.equal(south.owner, 0, 'Tours indépendantes');
assert.deepEqual(unpack(pack(state)).watchtowers, state.watchtowers);
for (const team of [0, 1]) {
  const snapshot = view(state, team);
  assert.deepEqual(snapshot.watchtowers.map((tower) => tower.owner), [1, 0]);
  assert.equal(snapshot.watchtowers[0].losses[0], 1, 'Perte synchronisée même hors vision');
}
console.log('PASS : tours praticables et accessibles, capture militaire, contestation, reprise, vision, persistance et synchronisation.');

const legacy = S.create();
delete legacy.watchtowers;
legacy.tower = { x: 1948, y: 976, owner: 0, progress: 4 };
S.migrateState(legacy);
assert.equal(legacy.watchtowers.length, 2);
assert(legacy.watchtowers.every((tower) => tower.owner === -1));
assert(!Object.hasOwn(legacy, 'tower'));

// Contestation also prevents a neutral tower from ever starting capture.
const contested = S.create();
contested.units = [];
contested.monsters = [];
contested.camps = [];
for (const team of [0, 1]) {
  S.spawn(contested, 'knight', team);
  Object.assign(contested.units.at(-1), {
    x: north.x + (team ? 50 : -50),
    y: north.y,
    hold: true,
    cool: 999,
    path: [],
  });
}
for (let step = 0; step < 100; step++) S.tick(contested, 0.05);
assert.equal(contested.watchtowers[0].owner, -1);
assert.equal(contested.watchtowers[0].progress, 0);
contested.units[1].type = 'commis';
for (let step = 0; step < 80; step++) S.tick(contested, 0.05);
assert.equal(contested.watchtowers[0].owner, 0, 'Un ouvrier ennemi ne conteste pas la capture');
