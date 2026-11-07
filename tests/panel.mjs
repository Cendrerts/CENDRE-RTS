import assert from 'node:assert/strict';
import { panelModel, panelCapacity, panelVisibility } from '../public/game/panel.js';
import { CendreSim as S } from '../public/game/sim.js';
import { command } from '../lib/match.mjs';

assert.deepEqual(panelCapacity(844), { columns: 7, rows: 2, capacity: 14 });
for (const player of [0, 1]) {
  const state = S.create();
  state.rubies[player] = 9999;
  const unit = state.units.find((item) => item.team === player);
  const selected = new Set([unit.id]);
  const empty = panelModel(state, player, new Set());
  assert.equal(empty.mode, 'empty');
  assert.deepEqual(empty.grid, []);
  const units = panelModel(state, player, selected);
  assert.equal(units.mode, 'units');
  assert.equal(units.left.count, 1);
  assert.deepEqual(units.actions, ['hold', 'patrol', 'ability', 'disengage']);
  assert.deepEqual(baseQueue(state, player), []);
  const base = panelModel(state, player, new Set(), { baseId: 'main_' + player });
  assert.equal(base.mode, 'base');
  assert.deepEqual(base.tabs, ['production', 'buildings', 'bases']);
  assert.equal(base.activeTab, 'production');
  assert.equal(base.grid[0][0].type, 'commis');
  assert.equal(base.grid[0][0].name, S.stats('commis', player).name);
  assert.equal(base.producerId, 'main_' + player);
  const buildings = panelModel(state, player, new Set(), { baseId: 'main_' + player, tab: 'buildings' });
  assert.deepEqual(
    buildings.grid.flat().map((item) => item.id),
    S.BUILDINGS[player].map((item) => item.id),
  );
  const slot = state.slots[player][0];
  const emplacement = panelModel(state, player, selected, { baseId: slot.baseId, slotId: slot.id });
  assert.equal(emplacement.mode, 'base');
  assert.equal(emplacement.activeTab, 'buildings');
  assert.equal(emplacement.slotId, slot.id);
  assert.equal(emplacement.left.status, 'Emplacement choisi');
  assert(S.recruit(state, 'commis', player, base.producerId));
  assert.equal(panelModel(state, player, new Set(), { baseId: base.producerId }).queue.length, 1);
  state.queues[player] = [];
  assert(S.construct(state, player, S.BUILDINGS[player][0].id, slot.baseId, slot.id));
  const production = panelModel(state, player, selected, { producerId: slot.id });
  assert.equal(production.mode, 'production');
  assert.equal(production.grid[0][0].type, 'knight');
  for (let index = 0; index < 8; index++) assert(S.recruit(state, 'knight', player, slot.id));
  assert.equal(panelModel(state, player, new Set(), { producerId: slot.id }).queue.length, 8);
  const before = state.rubies[player];
  const jobId = state.queues[player][0].id;
  assert(!S.cancelProduction(state, 1 - player, slot.id, jobId));
  command(state, player, { kind: 'cancelProduction', producerId: slot.id, jobId });
  assert(
    !S.cancelProduction(state, player, slot.id, jobId),
    'Une annulation retardée ne touche pas le travail suivant',
  );
  assert.equal(state.queues[player].length, 7);
  assert.equal(state.rubies[player], before + S.stats('knight', player).cost);
  state.visible[player].fill(0);
  state.explored[player].fill(1);
  const beforeModel = JSON.stringify(state);
  const bases = panelModel(state, player, new Set(), { bases: true });
  assert.equal(JSON.stringify(state), beforeModel, 'Le modèle ne modifie pas la simulation');
  assert.equal(bases.grid.flat().length, 6, 'Base principale et cinq mines découvertes');
  for (const model of [empty, units, base, emplacement, production, bases]) {
    assert(model.tabs.length <= 3);
    for (const page of model.grid) assert(page.length <= panelCapacity(844).capacity);
    assert(model.grid.length <= 1, 'Tout le contenu du contexte est visible');
  }
}
function baseQueue(state, player) {
  return panelModel(state, player, new Set(), { baseId: 'main_' + player }).queue;
}
const collapsed = panelVisibility({}, 'collapse');
assert.deepEqual(collapsed, { collapsed: true, manual: true });
const afterUnits = panelVisibility(collapsed, 'selection');
assert.deepEqual(afterUnits, { collapsed: true, manual: true });
assert.deepEqual(panelVisibility(collapsed, 'building'), { collapsed: false, manual: false });
const afterBuilding = panelVisibility(afterUnits, 'building');
assert.deepEqual(afterBuilding, { collapsed: false, manual: false });
for (const player of [0, 1]) {
  const state = S.create();
  const unit = state.units.find((item) => item.team === player);
  const selected = new Set([unit.id]);
  const units = panelModel(state, player, selected, { visibility: afterUnits });
  assert.equal(units.mode, 'units');
  assert.equal(units.collapsed, true);
  const base = panelModel(state, player, selected, {
    baseId: 'main_' + player,
    visibility: afterBuilding,
  });
  assert.equal(base.collapsed, false);
  assert.equal(base.activeTab, 'production');
  assert.equal(base.producerId, 'main_' + player);
  const slot = state.slots[player][0];
  const construction = panelModel(state, player, selected, {
    baseId: slot.baseId,
    slotId: slot.id,
    visibility: panelVisibility(collapsed, 'building'),
  });
  assert.equal(construction.collapsed, false);
  assert.equal(construction.activeTab, 'buildings');
  state.rubies[player] = 9999;
  assert(S.construct(state, player, S.BUILDINGS[player][0].id, slot.baseId, slot.id));
  const production = panelModel(state, player, selected, {
    producerId: slot.id,
    visibility: panelVisibility(collapsed, 'building'),
  });
  assert.equal(production.collapsed, false);
  assert.equal(production.mode, 'production');
  assert.equal(production.producerId, slot.id);
}
assert.equal(panelVisibility(collapsed, 'expand').collapsed, false);
assert.equal(panelModel(S.create(), 0, new Set(), { visibility: collapsed }).collapsed, true);

console.log('Panneau : quatre contextes, deux factions, capacité et annulation OK');
