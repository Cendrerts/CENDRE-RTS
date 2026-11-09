import assert from 'node:assert/strict';
import { BrigadeCuisine } from '../public/game/cooks-config.js';
import { RatsGout } from '../public/game/rats-config.js';
import { unitLabel, armyToastText, groupToastText } from '../public/game/selection.js';
import { panelModel } from '../public/game/panel.js';
import { productionModel } from '../public/game/production.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const plurals = [
  ['Commis', 'Gardes-Manger', 'Bouchers-Tireurs', 'Chefs de Brigade'],
  ['Rats-Essuyeurs', 'Rats-Éboueurs', 'Rats-Balance-Déchets', 'Chamans de la Poubelle'],
];
for (const [faction, config] of [BrigadeCuisine, RatsGout].entries()) {
  for (const [index, type] of Object.keys(config.unites).entries()) {
    const singular = config.unites[type].name;
    assert.equal(unitLabel(type, 1, faction), singular);
    for (const count of [2, 7]) {
      assert.equal(unitLabel(type, count, faction), plurals[faction][index]);
      assert.equal(unitLabel(type, count, faction) === singular, faction === 0 && type === 'commis');
    }
    for (const count of [1, 2, 7]) {
      const state = Sim.create();
      state.units = Array.from({ length: count }, (_, id) => ({
        id,
        type,
        team: faction,
        hp: 50,
        max: 50,
      }));
      const model = panelModel(state, faction, new Set(state.units.map((unit) => unit.id)));
      assert.equal(model.left.name, unitLabel(type, count, faction));
      assert.equal(model.grid[0][0].name, unitLabel(type, count, faction));
    }
    for (const count of [0, 1, 2, 7]) {
      const state = Sim.create();
      state.queues[faction] = Array.from({ length: count }, () => ({ type }));
      const item = productionModel(state, faction).find((item) => item.type === type);
      assert.equal(item.name, singular);
      assert.equal(item.queued, count);
    }
  }
}
for (const count of [1, 2, 7]) {
  const label = count === 1 ? 'unité' : 'unités';
  assert.equal(armyToastText(count), `${count} ${label} · Toute l'armée`);
  assert.equal(groupToastText(0, count), `Groupe 1 assigné · ${count} ${label}`);
}
console.log('PASS: noms singuliers et pluriels des deux factions, sélection, production, groupes et armée.');
