import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack } from '../lib/match.mjs';

function combat() {
  const state = S.create();
  state.units = [];
  for (const [type, team, x] of [['knight', 0, 790], ['commis', 1, 815], ['knight', 1, 765]]) {
    S.spawn(state, type, team);
    const unit = state.units.at(-1);
    Object.assign(unit, { x, y: 570, hp: 10000, max: 10000, harvest: null, path: [], hold: true });
  }
  S.visibility(state);
  return { state, guard: state.units[0], worker: state.units[1], soldier: state.units[2] };
}
function advance(state, ticks) {
  for (let index = 0; index < ticks; index++) S.tick(state, 0.05);
}

{
  const { state, guard, worker, soldier } = combat();
  advance(state, 1);
  assert.equal(guard.autoTargetId, soldier.id, 'Combatants take priority over equally distant workers');
  assert(soldier.hp < soldier.max);
  assert.equal(worker.hp, worker.max);
}
{
  const { state, guard, worker, soldier } = combat();
  soldier.x = 1100;
  S.visibility(state);
  advance(state, 1);
  assert.equal(guard.autoTargetId, worker.id);
  soldier.x = 765;
  S.visibility(state);
  advance(state, 2);
  assert.equal(guard.autoTargetId, soldier.id, 'Retaliate against a soldier actually attacking at contact');
  const switchedAt = guard.lastRetargetAt;
  soldier.x = 860;
  S.spawn(state, 'knight', 1);
  const other = state.units.at(-1);
  Object.assign(other, { x: 765, y: 570, hp: 10000, harvest: null, path: [], hold: true });
  S.visibility(state);
  advance(state, 8);
  assert.equal(guard.autoTargetId, soldier.id, 'Keep the target for at least 0.5 seconds');
  assert(state.time - switchedAt < 0.5);
  advance(state, 3);
  assert.equal(guard.autoTargetId, other.id, 'Retaliate again once the cooldown expires');
}
{
  const { state, guard, worker, soldier } = combat();
  worker.type = 'knight';
  worker.x = 815;
  soldier.x = 755;
  soldier.hp = 100;
  S.visibility(state);
  advance(state, 1);
  assert.equal(guard.autoTargetId, soldier.id, 'Within 10 px of the closest soldier, finish the wounded');
}
{
  const { state, guard, worker } = combat();
  S.order(state, [guard.id], worker.x, worker.y, worker);
  advance(state, 20);
  assert.equal(guard.target, worker, 'A player target survives incoming attacks');
  assert(worker.hp < worker.max);
}
{
  const { state, guard, worker, soldier } = combat();
  worker.type = 'knight';
  soldier.hp = 100;
  soldier.x = 750;
  advance(state, 1);
  assert.equal(guard.autoTargetId, worker.id, 'A wounded enemy outside the 10 px band does not win');
}
{
  const { state, guard, worker, soldier } = combat();
  soldier.x = 1100;
  worker.x = 890;
  state.bases[1].x = 800;
  state.bases[1].y = 570;
  S.visibility(state);
  advance(state, 1);
  assert.equal(guard.autoTargetId, worker.id, 'Workers take priority over a closer base');
  worker.hp = 0;
  advance(state, 1);
  assert.equal(guard.autoTargetId, 'base1', 'A dead automatic target is released');
}
{
  const { state, guard, worker, soldier } = combat();
  guard.hold = false;
  worker.hp = 0;
  const range = S.stats(guard.type, guard.team).range;
  soldier.x = guard.x + range + 40;
  S.visibility(state);
  advance(state, 1);
  assert.equal(guard.autoTargetId, soldier.id);
  assert(guard.path.length > 0, 'The guard starts pursuing the automatic target');
  soldier.x = guard.x + range + 76;
  S.visibility(state);
  const position = { x: guard.x, y: guard.y };
  advance(state, 1);
  assert.equal(guard.autoTargetId, null, 'Release an automatic target beyond the acquisition range');
  assert.deepEqual({ x: guard.x, y: guard.y }, position, 'Stop following the abandoned target');
  assert.equal(guard.path.length, 0);
}
{
  const { state, guard, worker, soldier } = combat();
  worker.hp = 0;
  soldier.x = 1100;
  state.bases[1].x = 800;
  state.bases[1].y = 570;
  S.visibility(state);
  advance(state, 1);
  assert.equal(guard.autoTargetId, 'base1');
  assert(state.bases[1].hp < state.bases[1].max, 'The guard attacks the enemy base');
  S.spawn(state, 'knight', 0);
  const ally = state.units.at(-1);
  const range = S.stats(guard.type, guard.team).range;
  soldier.x = guard.x + range + 40;
  Object.assign(ally, { x: soldier.x + 25, y: soldier.y, hp: 10000, harvest: null, path: [], hold: true });
  soldier.cool = 0;
  soldier.target = ally;
  guard.lastRetargetAt = state.time;
  S.visibility(state);
  advance(state, 9);
  assert.equal(soldier.lastAttackTargetId, ally.id, 'The incoming soldier attacks an ally, not the guard');
  assert.equal(guard.autoTargetId, 'base1', 'Priority changes respect the 0.5 second cooldown');
  advance(state, 2);
  assert.equal(guard.autoTargetId, soldier.id, 'Switch from the base to a soldier within acquisition range');
  const switchedAt = guard.lastRetargetAt;
  S.spawn(state, 'knight', 1);
  const attacker = state.units.at(-1);
  Object.assign(attacker, { x: guard.x - 25, y: guard.y, hp: 10000, harvest: null, path: [], hold: true });
  S.visibility(state);
  advance(state, 9);
  assert(state.time - switchedAt < 0.5);
  assert.equal(guard.autoTargetId, soldier.id, 'Do not switch again before 0.5 seconds');
  advance(state, 2);
  assert.equal(guard.autoTargetId, attacker.id, 'Contact retaliation remains available after the cooldown');
}
{
  const first = combat().state;
  const second = combat().state;
  for (let index = 0; index < 600; index++) {
    S.tick(first, 0.05);
    S.tick(second, 0.05);
  }
  assert.deepEqual(first, second, 'Identical simulations stay identical after 30 seconds');
  let restored = unpack(pack(combat().state));
  const continuous = unpack(pack(restored));
  for (let index = 0; index < 600; index++) {
    S.tick(continuous, 0.05);
    S.tick(restored, 0.05);
    restored = unpack(pack(restored));
  }
  assert.equal(pack(restored), pack(continuous), 'Automatic targeting survives server persistence');
}
console.log('Targeting: priorities, retaliation cooldown, wounded enemies, player orders and determinism passed');
