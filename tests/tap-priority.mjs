import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { resolveTap, isEmptyTap, unitHitbox, mineHitbox } from '../public/game/tap.js';

for (const player of [0, 1]) {
  const state = Sim.create();
  state.visible[player].fill(1);
  const soldier = { id: 100, team: player, type: 'knight', hp: 100, x: 600, y: 500 };
  const worker = { id: 101, team: player, type: 'commis', hp: 50, x: 640, y: 500 };
  const enemy = { id: 102, team: 1 - player, type: 'knight', hp: 100, x: 1000, y: 500 };
  state.units = [soldier, worker, enemy];
  const army = new Set([soldier.id]);
  const workers = new Set([worker.id]);
  const empty = new Set();
  const base = state.bases[player];
  const basePoint = { x: base.x, y: base.y - 35 };
  const slot = state.slots[player][0];
  const mine = state.mines[player];
  const before = JSON.stringify(state);

  assert.equal(resolveTap(state, player, army, basePoint).kind, 'radial');
  assert.equal(resolveTap(state, player, army, slot).kind, 'radial');
  assert.deepEqual(resolveTap(state, player, empty, slot), {
    kind: 'radial', context: { baseId: slot.baseId, slotId: slot.id },
  });
  assert.equal(resolveTap(state, player, empty, basePoint).kind, 'radial');
  assert.deepEqual(resolveTap(state, player, workers, mine), {
    kind: 'gather', ids: [worker.id], index: player,
  });
  assert.equal(resolveTap(state, player, army, enemy).kind, 'attack');
  assert.equal(resolveTap(state, player, army, state.bases[1 - player]).kind, 'attackMove');
  assert.deepEqual(resolveTap(state, player, army, worker), { kind: 'select', id: worker.id });
  const group = new Set([soldier.id, worker.id]);
  assert.deepEqual(resolveTap(state, player, group, soldier), { kind: 'select', id: soldier.id });
  assert.deepEqual(resolveTap(state, player, army, soldier), { kind: 'select', id: soldier.id });
  assert.equal(resolveTap(state, player, army, mine).kind, 'move');
  assert.equal(resolveTap(state, player, workers, state.mines[1 - player]).kind, 'move');
  assert.equal(isEmptyTap(state, player, { x: 1100, y: 500 }), true);
  assert.equal(isEmptyTap(state, player, enemy), false);
  assert.equal(isEmptyTap(state, player, worker), false);
  assert.equal(isEmptyTap(state, player, basePoint), false);
  assert.equal(isEmptyTap(state, player, slot), false);
  assert.equal(isEmptyTap(state, player, mine), false);
  assert.equal(JSON.stringify(state), before, 'Tap resolution must not mutate simulation state');
  assert.deepEqual([...army], [soldier.id]);

  slot.occupe = true;
  assert.equal(resolveTap(state, player, army, slot).kind, 'production');
  assert.deepEqual(resolveTap(state, player, empty, slot), { kind: 'production', id: slot.id });
  const site = state.mines[2].site;
  assert.equal(resolveTap(state, player, army, site).kind, 'radial');
  assert.equal(resolveTap(state, player, empty, site).kind, 'radial');

  // Without selection, an own unit wins even when the mine sprite is closer.
  worker.x = mine.x + 14;
  worker.y = mine.y;
  assert.deepEqual(resolveTap(state, player, empty, { x: mine.x + 7, y: mine.y }),
    { kind: 'select', id: worker.id });

  // Workers prioritize their mine when distances are equal.
  worker.x = mine.x;
  worker.y = mine.y;
  assert.equal(resolveTap(state, player, workers, mine).kind, 'gather');
  worker.x = 640;
  worker.y = 500;
  enemy.x = mine.x;
  enemy.y = mine.y;
  assert.equal(resolveTap(state, player, workers, mine).kind, 'gather');
  enemy.x = 1000;
  enemy.y = 500;
  state.visible[player].fill(0);
  assert.equal(resolveTap(state, player, army, enemy).kind, 'move');
  assert.equal(resolveTap(state, player, army, state.bases[1 - player]).kind, 'move');
}
console.log('PASS: tap priorities, both teams, fog, construction without selection, empty long-press targets and purity.');

const baseScale = Math.max(844 / 1680, 390 / 940);
for (const scale of [1, 2, 3.5, ...[1, 2.6, 3.5].map((zoom) => baseScale * zoom)]) {
  const state = Sim.create();
  state.visible[0].fill(1);
  const worker = { id: 100, team: 0, type: 'commis', hp: 50, x: 600, y: 500 };
  const soldier = { id: 101, team: 0, type: 'knight', hp: 100, x: 800, y: 500 };
  const neighbor = { ...soldier, id: 102, x: soldier.x + 20 / scale };
  const enemy = { ...soldier, id: 103, team: 1, x: 1000 };
  state.units = [worker, soldier, neighbor, enemy];
  const workers = new Set([worker.id]);
  const army = new Set([soldier.id]);
  const mine = state.mines[0];
  mine.x = 600;
  mine.y = 800;
  // Keep the radius and building-edge checks independent of neighboring slots.
  state.slots[0] = [];
  const workerBox = unitHitbox(worker);
  const workerCenterY = workerBox.y + workerBox.height / 2;
  const mineBox = mineHitbox(mine);
  const mineCenterY = mineBox.y + mineBox.height / 2;
  assert.deepEqual(resolveTap(state, 0, new Set(), { x: soldier.x, y: soldier.y - 36 }, scale),
    { kind: 'select', id: soldier.id });
  assert.deepEqual(resolveTap(state, 0, workers, { x: mine.x, y: mine.y - 28 }, scale),
    { kind: 'gather', ids: [worker.id], index: 0 });
  let feedback = null;
  assert.equal(resolveTap(state, 0, workers, { x: mine.x + 30 / scale, y: mineCenterY }, scale,
    (target) => { feedback = target; }).kind, 'gather');
  assert.equal(feedback.target, mine, 'feedback follows the resolved target');
  assert.equal(resolveTap(state, 0, new Set(), { x: worker.x, y: workerCenterY + 24 / scale }, scale).id, worker.id);
  assert.equal(resolveTap(state, 0, new Set(), { x: soldier.x + 17 / scale, y: soldier.y }, scale).id, neighbor.id);
  const base = state.bases[0];
  assert.deepEqual(resolveTap(state, 0, new Set(), { x: base.x, y: base.y - 117 }, scale),
    { kind: 'radial', context: { baseId: 'main_0' } });
  assert.equal(resolveTap(state, 0, army, { x: enemy.x + 25 / scale, y: unitHitbox(enemy).y + unitHitbox(enemy).height / 2 }, scale).kind, 'attack');
  assert.equal(resolveTap(state, 0, army, { x: 1200, y: 600 }, scale).kind, 'move');
  assert.equal(isEmptyTap(state, 0, { x: worker.x, y: workerCenterY + 24 / scale }, scale), false);
  // A distance advantage greater than 6 px beats the workers' mine priority.
  worker.x = mine.x + 20 / scale;
  worker.y = mineCenterY - (workerCenterY - 500);
  const workerPoint = { x: worker.x, y: mineCenterY };
  assert.equal(resolveTap(state, 0, workers, workerPoint, scale).kind, 'select');
  worker.x = mine.x + 5 / scale;
  workerPoint.x = worker.x;
  assert.equal(resolveTap(state, 0, workers, workerPoint, scale).kind, 'gather');
  mine.boost = true;
  assert.deepEqual(resolveTap(state, 0, workers, { x: mine.x, y: mine.y - 42 }, scale),
    { kind: 'gather', ids: [worker.id], index: 0 });
  state.visible[0].fill(0);
  assert.equal(resolveTap(state, 0, army, enemy, scale).kind, 'move');
}
console.log('PASS: screen pixel hit zones, nearest target, 6 px priorities and snapping at game zooms 1, 2.6 and 3.5.');
