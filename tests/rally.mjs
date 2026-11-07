import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack } from '../lib/match.mjs';

function advance(state, seconds) {
  for (let time = 0; time < seconds - 1e-8; time += 0.05) S.tick(state, 0.05);
}
function fixture() {
  const state = S.create();
  state.rubies[0] = 9999;
  state.units = [];
  S.construct(state, 0, S.BUILDINGS[0][0].id);
  const slot = state.slots[0].find((slot) => slot.occupe);
  // An open lane isolates rally behaviour from the production building's map position.
  slot.x = 710;
  slot.y = 570;
  return { state, slot };
}
{
  const { state, slot } = fixture();
  command(state, 0, { kind: 'setRally', buildingId: slot.id, x: 1030, y: 590 });
  S.recruit(state, 'knight', 0, slot.id);
  advance(state, S.stats('knight', 0).production);
  const guard = state.units[0];
  assert.equal(guard.attackDestination.x, 1030);
  assert.equal(guard.attackDestination.y, 590);
  S.spawn(state, 'commis', 1);
  const enemy = state.units.at(-1);
  Object.assign(enemy, { x: 870, y: 590, hp: 1, harvest: null, hold: true, path: [] });
  S.visibility(state);
  advance(state, 20);
  assert.equal(guard.lastAttackTargetId, enemy.id, 'The produced guard attacks an enemy on its way');
  assert(Math.hypot(guard.x - 1030, guard.y - 590) < 25, 'The guard resumes and reaches its rally');
  assert.deepEqual(unpack(pack(state)).slots[0][0].rally, slot.rally);
}
{
  const state = S.create();
  state.rubies[0] = 9999;
  state.units = [];
  // Use the same open lane as the combat unit's rally test.
  Object.assign(state.bases[0], { x: 710, y: 570 });
  command(state, 0, { kind: 'setRally', buildingId: 'main_0', x: 1030, y: 590 });
  S.recruit(state, 'commis', 0, 'main_0');
  advance(state, S.stats('commis', 0).production);
  const worker = state.units[0];
  assert.equal(worker.attackDestination, null);
  assert(worker.path.length > 0, 'The produced worker has a path to its ground rally');
  assert.deepEqual(worker.path.at(-1), { x: 1030, y: 590 });
  S.spawn(state, 'commis', 1);
  const enemy = state.units.at(-1);
  Object.assign(enemy, { x: 870, y: 610, harvest: null, hold: true, retreat: true, path: [] });
  S.visibility(state);
  for (let tick = 0; tick < 400; tick++) {
    S.tick(state, 0.05);
    assert.equal(worker.target, null, 'The worker never targets the nearby enemy');
    assert.equal(worker.autoTargetId, null, 'The worker never acquires an automatic target');
    assert.equal(worker.lastAttackTargetId, undefined, 'The worker never attacks on its way');
  }
  assert(Math.hypot(worker.x - 1030, worker.y - 590) < 25, 'The worker reaches its ground rally');
}
{
  const state = S.create();
  state.rubies[0] = 9999;
  state.units = [];
  Object.assign(state.mines[2], { owner: 0, x: state.mines[0].x + 60, y: state.mines[0].y });
  command(state, 0, { kind: 'setRally', buildingId: 'main_0', mineIndex: 2 });
  S.recruit(state, 'commis', 0, 'main_0');
  advance(state, S.stats('commis', 0).production);
  const worker = state.units[0];
  assert.equal(worker.harvest.mine, 2);
  const before = state.rubies[0];
  advance(state, 30);
  assert(state.rubies[0] > before, 'The produced worker harvests and deposits without another order');
}
{
  const { state, slot } = fixture();
  assert.throws(() => command(state, 1, { kind: 'setRally', buildingId: slot.id, x: 10, y: 10 }));
  assert.throws(() => command(state, 0, { kind: 'setRally', buildingId: 'main_1', x: 10, y: 10 }));
  assert.throws(() => command(state, 0, { kind: 'setRally', buildingId: slot.id, x: NaN, y: 10 }));
  assert.throws(() => command(state, 0, { kind: 'setRally', buildingId: slot.id, mineIndex: 1 }));
  command(state, 0, { kind: 'setRally', buildingId: slot.id, x: -10, y: S.H + 10 });
  assert.deepEqual(slot.rally, { x: 0, y: S.H });
}
{
  const { state, slot } = fixture();
  S.recruit(state, 'knight', 0, slot.id);
  advance(state, S.stats('knight', 0).production + 5);
  const guard = state.units[0];
  assert(Math.hypot(guard.x - slot.x, guard.y - slot.y) < 60);
  assert.equal(guard.attackDestination, undefined);
  assert.equal(guard.path.length, 0);
  S.spawn(state, 'commis', 0);
  assert.equal(state.units.at(-1).harvest.mine, 0, 'Default worker harvesting remains unchanged');
}
{
  const { state, slot } = fixture();
  S.spawn(state, 'knight', 0);
  const leader = state.units[0];
  Object.assign(leader, { x: 970, y: 590, hold: true, path: [] });
  command(state, 0, { kind: 'setRally', buildingId: slot.id, unitId: leader.id });
  S.recruit(state, 'knight', 0, slot.id);
  advance(state, S.stats('knight', 0).production + 10);
  const follower = state.units[1];
  assert.equal(follower.followId, leader.id);
  assert(Math.hypot(follower.x - leader.x, follower.y - leader.y) < 65);
  leader.x = 1130;
  advance(state, 8);
  assert(Math.hypot(follower.x - leader.x, follower.y - leader.y) < 65);
  S.order(state, [follower.id], 750, 590, null, true);
  assert.equal(follower.followId, null, 'An explicit order cancels following');
}
{
  const state = S.create();
  state.rubies[0] = 9999;
  const mine = state.mines[2];
  const worker = state.units[0];
  worker.x = mine.x;
  worker.y = mine.y;
  assert(S.build(state, 0, 2));
  command(state, 0, { kind: 'setRally', buildingId: 'mine_2', x: mine.x + 100, y: mine.y });
  assert(S.rallyBuilding(state, 0, 'mine_2').rally);
  mine.owner = 1;
  assert.throws(() => command(state, 0, { kind: 'setRally', buildingId: 'mine_2', x: 10, y: 10 }));
  assert.throws(() => command(state, 0, { kind: 'setRally', buildingId: 'main_0', unitId: state.units[1].id }));
}
console.log('PASS: rally production, worker movement without combat, attack move, harvest, ownership, bounds, defaults and following.');
