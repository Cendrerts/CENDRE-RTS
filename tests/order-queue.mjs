import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { RealtimeMotion } from '../public/game/realtime.js';
import { orderQueuePoints } from '../public/game/order-queue.js';
function fixture() {
  const state = S.create();
  state.units = [state.units[0]];
  const unit = state.units[0];
  Object.assign(unit, { x: 250, y: 750, harvest: null, path: [], type: 'knight' });
  return { state, unit };
}
const points = [{ x: 350, y: 750 }, { x: 350, y: 650 }, { x: 250, y: 650 }];
function enqueue(state, unit, point, attackMove = false) {
  command(state, unit.team, {
    kind: attackMove ? 'attackMove' : 'move',
    ids: [unit.id],
    ...point,
    queue: true,
  });
}
let { state, unit } = fixture();
for (const point of points) enqueue(state, unit, point);
assert.equal(unit.orderQueue.length, 3);
const destinations = structuredClone(unit.orderQueue);
let visited = 0;
for (let i = 0; i < 2000; i++) {
  S.tick(state, 0.025);
  if (visited < 3 && Math.hypot(unit.x - destinations[visited].x, unit.y - destinations[visited].y) < 2) visited++;
}
assert.equal(visited, 3, 'visits all three destinations in order');
assert.equal(unit.orderQueue.length, 0);
assert.equal(unit.path.length, 0);
assert(Math.hypot(unit.x - destinations[2].x, unit.y - destinations[2].y) < 2);
for (let i = 0; i < 9; i++) enqueue(state, unit, { x: 350 + i * 20, y: 750 });
assert.equal(unit.orderQueue.length, 8);
assert.equal(unit.orderQueue.at(-1).x, 490);
S.order(state, [unit.id], 250, 750);
assert.deepEqual(unit.orderQueue, []);
({ state, unit } = fixture());
S.spawn(state, 'commis', 1, { x: 350, y: 750 });
const opponent = state.units.find((candidate) => candidate.team === 1);
Object.assign(opponent, { x: 350, y: 750, harvest: null, path: [], hold: true, hp: 10 });
enqueue(state, unit, points[0], true);
enqueue(state, unit, points[1]);
S.visibility(state);
for (let i = 0; i < 2000; i++) S.tick(state, 0.025);
assert(opponent.hp <= 0, 'attack waypoint engages an enemy');
assert(unit.lastAttackAt > 0);
assert.equal(unit.orderQueue.length, 0);
assert(Math.hypot(unit.x - 350, unit.y - 650) < 2, 'resumes the queue after combat');

for (const kind of ['move', 'hold', 'retreat', 'patrol', 'gather']) {
  ({ state, unit } = fixture());
  enqueue(state, unit, points[0]);
  if (kind === 'gather') unit.type = 'commis';
  command(state, 0, { kind, ids: [unit.id], x: 350, y: 650, index: 0, queue: kind === 'gather' });
  assert.deepEqual(unit.orderQueue, [], `${kind} clears the queue`);
}
({ state, unit } = fixture());
for (const point of points) {
  command(state, 0, { kind: 'move', ids: [unit.id], ...point, queue: true });
}
state = unpack(pack(state));
unit = state.units[0];
assert.equal(unit.orderQueue.length, 3, 'server persistence keeps the queue');
assert.equal(view(state, 0).units[0].orderQueue.length, 3);
for (let i = 0; i < 2000; i++) S.tick(state, 0.025);
assert(Math.hypot(unit.x - 250, unit.y - 650) < 2);
// Appending to an ordinary move keeps its destination until it is reached.
({ state, unit } = fixture());
S.order(state, [unit.id], 350, 750);
enqueue(state, unit, { x: 350, y: 650 });
assert.equal(unit.queueActive, false);
let passedCurrentDestination = false;
for (let i = 0; i < 2000; i++) {
  S.tick(state, 0.025);
  if (Math.hypot(unit.x - 350, unit.y - 750) < 2) passedCurrentDestination = true;
}
assert(passedCurrentDestination);
assert(Math.hypot(unit.x - 350, unit.y - 650) < 2);
// Simple waypoints must not acquire an enemy between two queued moves.
({ state, unit } = fixture());
S.spawn(state, 'commis', 1, { x: 350, y: 750 });
const ignoredEnemy = state.units.find((candidate) => candidate.team === 1);
Object.assign(ignoredEnemy, { x: 350, y: 750, harvest: null, path: [], hold: true });
enqueue(state, unit, { x: 350, y: 750 });
enqueue(state, unit, { x: 350, y: 650 });
S.visibility(state);
for (let i = 0; i < 400 && unit.orderQueue.length; i++) S.tick(state, 0.025);
assert.equal(unit.lastAttackAt, undefined);
assert(Math.hypot(unit.x - 350, unit.y - 650) < 2);
const motion = new RealtimeMotion();
motion.receive([unit], 0, 0);
const authoritativeState = JSON.stringify(state);
motion.predict({ kind: 'move', ids: [unit.id], x: 500, y: 750, queue: true }, state, 0, 0);
assert.equal(motion.predictions.size, 0, 'queued orders never predict an immediate direction change');
assert.equal(JSON.stringify(state), authoritativeState);
// Targeted waypoints keep both surrounding moves, through both command paths.
for (const throughServer of [false, true]) {
  for (const outcome of ['kill', 'alreadyDead', 'invisible', 'escaped', 'base']) {
    ({ state, unit } = fixture());
    S.spawn(state, 'commis', 1, { x: 390, y: 750 });
    const enemy = outcome === 'base' ? state.bases[1] : state.units.find((candidate) => candidate.team === 1);
    Object.assign(enemy, { x: 390, y: 750, hp: outcome === 'base' ? 1000 : 10 });
    if (!enemy.base) Object.assign(enemy, { harvest: null, path: [], hold: true });
    else state.units = [unit];
    S.visibility(state);
    const issueOrder = (point, target = null) => {
      if (throughServer) {
        command(state, 0, {
          kind: 'move',
          ids: [unit.id],
          ...point,
          target: target ? (target.base ? { base: true } : { id: target.id }) : null,
          queue: true,
        });
      } else {
        S.order(state, [unit.id], point.x, point.y, target, !target, true);
      }
    };
    issueOrder(points[0]);
    issueOrder(enemy, enemy);
    issueOrder(points[1]);
    assert.equal(unit.orderQueue.length, 3);
    for (let index = 0; index < 6; index++) issueOrder(enemy, enemy);
    assert.equal(unit.orderQueue.length, 8, 'targeted waypoints share the eight-point limit');
    unit.orderQueue.splice(3);
    if (throughServer) {
      state = unpack(pack(state));
      unit = state.units[0];
    }
    const target = outcome === 'base' ? state.bases[1] : state.units.find((candidate) => candidate.team === 1);
    if (outcome === 'alreadyDead') target.hp = 0;
    if (outcome === 'invisible') target.x = 1400;
    let visitedFirst = false;
    let attacked = false;
    for (let i = 0; i < 2000; i++) {
      S.tick(state, 0.025);
      if (Math.hypot(unit.x - 350, unit.y - 750) < 2) visitedFirst = true;
      if (unit.lastAttackAt > 0) {
        assert(visitedFirst, 'the first move finishes before attacking');
        attacked = true;
        if (outcome === 'base') target.hp = 0;
      }
      if (outcome === 'escaped' && unit.target) target.x = 650;
    }
    assert(visitedFirst);
    assert.equal(attacked, outcome === 'kill' || outcome === 'base');
    if (outcome === 'kill') assert(target.hp <= 0);
    assert.equal(unit.orderQueue.length, 0);
    assert.equal(unit.path.length, 0, outcome);
    assert(Math.hypot(unit.x - 350, unit.y - 650) < 2, `${outcome}: reaches the final move`);
  }
}
// Queue rendering follows only visible targets, including enemy bases.
for (const base of [false, true]) {
  ({ state, unit } = fixture());
  S.spawn(state, 'commis', 1, { x: 350, y: 750 });
  const target = base ? state.bases[1] : state.units.find((candidate) => candidate.team === 1);
  Object.assign(target, { x: 350, y: 750 });
  const point = {
    x: 300,
    y: 750,
    target: base ? { base: true, team: 1 } : { id: target.id },
  };
  const queue = [point];
  const originalQueue = structuredClone(queue);
  S.visibility(state);
  assert(S.canSee(state, 0, target));
  assert.deepEqual(orderQueuePoints(state, 0, queue), [{ ...point, x: 350, y: 750 }]);
  target.x = 1400;
  S.visibility(state);
  assert.equal(S.canSee(state, 0, target), false);
  assert.deepEqual(orderQueuePoints(state, 0, queue), originalQueue, 'hidden target uses the recorded position');
  assert.deepEqual(queue, originalQueue, 'rendering never changes the queued orders');
  if (base) state.bases[1] = null;
  else state.units = [unit];
  assert.deepEqual(orderQueuePoints(state, 0, queue), originalQueue, 'missing target uses the recorded position');
}
console.log('order queue OK');
