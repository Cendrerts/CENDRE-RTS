import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { resolveTap, isEmptyTap } from '../public/game/tap.js';

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
  assert.equal(resolveTap(state, player, army, state.bases[1 - player]).kind, 'attack');
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

  // Friendly selection and enemy attacks beat harvesting when their hit areas overlap.
  worker.x = mine.x;
  worker.y = mine.y;
  assert.equal(resolveTap(state, player, workers, mine).kind, 'select');
  worker.x = 640;
  worker.y = 500;
  enemy.x = mine.x;
  enemy.y = mine.y;
  assert.equal(resolveTap(state, player, workers, mine).kind, 'attack');
  state.visible[player].fill(0);
  assert.equal(resolveTap(state, player, army, enemy).kind, 'move');
  assert.equal(resolveTap(state, player, army, state.bases[1 - player]).kind, 'move');
}
console.log('PASS: tap priorities, both teams, fog, construction without selection, empty long-press targets and purity.');
