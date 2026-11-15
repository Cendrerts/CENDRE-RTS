import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view } from '../lib/match.mjs';

function create(time = 240) {
  const state = S.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.time = time;
  return state;
}
function add(state, type, team, distance = 0) {
  S.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x: 950 + distance, y: 850, hold: true, cool: 999, harvest: null, path: [] });
  return unit;
}
function advance(state, seconds) {
  for (let step = 0; step < Math.round(seconds * 20); step++) S.tick(state, 0.05);
}
const schedule = create(0);
advance(schedule, 239);
assert(schedule.braises.every((foyer) => !foyer.lit));
advance(schedule, 1);
assert(schedule.braises.every((foyer) => foyer.lit));
assert.equal(schedule.braisesNextAt, 300);
advance(schedule, 60);
assert(schedule.braises.every((foyer) => !foyer.lit));
advance(schedule, 90);
assert(schedule.braises.every((foyer) => foyer.lit));
assert.equal(schedule.braisesNextAt, 450);

for (const [type, team, distance, damage] of [
  ['commis', 1, 0, 2],
  ['knight', 0, 0, 0],
  ['knight', 1, 160, 0],
]) {
  const state = create();
  const unit = add(state, type, team, distance);
  const hp = unit.hp;
  advance(state, 1);
  assert(Math.abs(unit.hp - (hp - damage)) < 1e-7);
}
for (const [teams, time, expected] of [
  [[0], 240, [6, 0]],
  [[1], 240, [0, 12]],
  [[0, 1], 240, [0, 0]],
  [[0], 310, [0, 0]],
]) {
  const state = create(time);
  for (const team of teams) add(state, 'knight', team, team ? 60 : -60);
  advance(state, 10);
  assert.deepEqual(state.ingredients, expected);
  const restored = unpack(pack(state));
  assert.deepEqual(restored.braises, state.braises);
  assert.equal(restored.braisesNextAt, state.braisesNextAt);
  for (const team of [0, 1]) assert.deepEqual(view(restored, team).braises, state.braises);
}
const boarState = create();
const camp = { name: 'camp-test', x: 950, y: 850, respawnAt: null };
boarState.camps = [camp];
boarState.monsters = [{
  id: 'boar-test', type: 'sanglier', team: -1, x: 950, y: 850,
  hp: 220, max: 220, camp: camp.name, cool: 999, path: [], returning: false,
}];
const base = boarState.bases[1];
Object.assign(base, { x: 950, y: 850 });
advance(boarState, 1);
assert(Math.abs(boarState.monsters[0].hp - 218) < 1e-7);
assert.equal(base.hp, base.max, 'Les bâtiments ne brûlent pas');
boarState.monsters[0].hp = 220;
boarState.monsters[0].returning = true;
camp.x = 1050;
boarState.monsters[0].path = [{ x: 1050, y: 850 }];
advance(boarState, 1);
assert(Math.abs(boarState.monsters[0].hp - 218) < 1e-7, 'Un Sanglier en retour brûle aussi');
const crossing = create(239);
const rat = add(crossing, 'knight', 1);
const before = rat.hp;
S.tick(crossing, 2);
assert(Math.abs(rat.hp - (before - 2)) < 1e-7, 'Seule la seconde allumée brûle');
const interrupted = create();
const guard = add(interrupted, 'hero', 0);
advance(interrupted, 4);
guard.x += 200;
advance(interrupted, 1);
guard.x -= 200;
advance(interrupted, 4);
assert.deepEqual(interrupted.ingredients, [0, 0]);
advance(interrupted, 1);
assert.deepEqual(interrupted.ingredients, [3, 0]);
const worker = create();
add(worker, 'commis', 0);
advance(worker, 10);
assert.deepEqual(worker.ingredients, [0, 0]);
const legacy = create(0);
delete legacy.braises;
delete legacy.braisesNextAt;
S.migrateState(legacy);
assert.equal(legacy.braises.length, 2);
assert.equal(legacy.braisesNextAt, 240);
console.log('PASS : braises, calendrier, brûlure, cuisson, interruption, migration et vues publiques.');
