import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { buildingsOfType, selectedRecruitCommand, selectedRallyCommands } from '../public/game/selection.js';
import { panelModel } from '../public/game/panel.js';
import { command } from '../lib/match.mjs';

for (const player of [0, 1]) {
  for (const config of Sim.BUILDINGS[player]) {
    const state = Sim.create();
    state.rubies[player] = 9999;
    for (let index = 0; index < 4; index++) {
      assert(Sim.construct(state, player, config.id));
    }
    const slots = state.slots[player].filter((slot) => slot.occupe);
    slots.forEach((slot, index) => {
      slot.x = 100 + index * 50;
      slot.y = 100;
    });
    const bounds = { minX: 100, maxX: 200, minY: 100, maxY: 200 };
    const before = structuredClone(state);
    const buildings = buildingsOfType(state, player, config.id, bounds);
    assert.deepEqual(buildings.map((building) => building.id), slots.slice(0, 3).map((slot) => slot.id));
    assert.deepEqual(state, before, 'La sélection est pure');
    assert.deepEqual(buildingsOfType(state, 1 - player, config.id, bounds), []);
    assert.deepEqual(buildingsOfType(state, player, 'commis', bounds), []);
    const ids = buildings.map((building) => building.id);
    const model = panelModel(state, player, new Set(), { producerIds: ids });
    assert.equal(model.left.count, 3);
    const singular = panelModel(state, player, new Set(), { producerIds: [ids[0]] });
    assert.equal(singular.left.count, 1);
    assert.equal(singular.left.name, config.name);
    assert.equal(model.grid[0][0].type, config.unit);
    for (let index = 0; index < 5; index++) {
      command(state, player, selectedRecruitCommand(state, player, config.unit, ids));
    }
    assert.deepEqual(ids.map((id) => state.queues[player].filter((job) => job.producerId === id).length), [2, 2, 1]);
    assert.equal(selectedRecruitCommand(state, player, config.unit, ids).producerId, ids[2]);
    state.queues[player] = [
      { producerId: ids[0], remaining: 1 },
      { producerId: ids[0], remaining: 1 },
      { producerId: ids[1], remaining: 10 },
      { producerId: ids[2], remaining: 20 },
    ];
    assert.equal(selectedRecruitCommand(state, player, config.unit, ids).producerId, ids[0], 'Charge en temps restant');
    const rallies = selectedRallyCommands(state, player, ids, { x: 500, y: 500 });
    assert.equal(rallies.length, 3);
    for (const rally of rallies) command(state, player, rally);
    for (const slot of slots.slice(0, 3)) assert.deepEqual(slot.rally, { x: 500, y: 500 });
    assert.equal(slots[3].rally, undefined);
    const unitRallies = selectedRallyCommands(state, player, ids, { unitId: state.units.find((unit) => unit.team === player).id });
    for (const rally of unitRallies) command(state, player, rally);
    for (const slot of slots.slice(0, 3)) assert.equal(slot.rally.unitId, unitRallies[0].unitId);
    state.queues[player] = Array.from({ length: 8 }, () => ({ producerId: ids[0], remaining: 1 }));
    assert.equal(selectedRecruitCommand(state, player, config.unit, ids).producerId, ids[1], 'Ignore les files pleines');
    slots[0].occupe = false;
    assert.equal(buildingsOfType(state, player, config.id, bounds).length, 2);
    slots[1].batiment.type = 'autre';
    assert.equal(buildingsOfType(state, player, config.id, bounds).length, 1);
    assert.equal(selectedRallyCommands(state, player, ids, { x: 500, y: 500 }).length, 1);
  }
}
console.log('PASS: double-tap bâtiments, sélection pure, charge, lot ×5 et ralliements, deux factions.');
