import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { createAI } from '../public/game/ai.js';
import { panelModel } from '../public/game/panel.js';
import { CendreSim as Sim } from '../public/game/sim.js';

for (const team of [0, 1]) {
  const state = Sim.create();
  const base = state.bases[team];
  const mainId = 'main_' + team;
  const upgrade = { kind: 'upgradeMain' };
  const archer = { kind: 'construct', type: Sim.BUILDINGS[team][1].id };
  const mage = { kind: 'construct', type: Sim.BUILDINGS[team][2].id };
  const panel = (tab) => panelModel(state, team, new Set(), { baseId: mainId, tab });

  assert.equal(base.niveau, 1);
  assert.match(panel('production').left.status, /Niveau 1/);
  assert.equal(panel('production').upgrade.name, team ? 'Grande Décharge' : 'Brasserie');
  const tierReason = /Tour principale de niveau 2 requise .*rang 3/;
  assert.throws(() => command(state, team, archer), tierReason);
  assert.match(panel('buildings').grid[0][1].prerequisite, tierReason);
  assert.throws(() => command(state, team, upgrade), /250 rubis nécessaires/);

  state.rubies[team] = 1000;
  command(state, team, upgrade);
  assert.equal(state.rubies[team], 750);
  assert.equal(base.readyAt, 45);
  assert.throws(() => command(state, team, upgrade), /déjà en cours/);
  assert.equal(state.rubies[team], 750);
  assert.throws(() => command(state, team, archer), tierReason);
  assert.equal(unpack(pack(state)).bases[team].readyAt, 45);
  assert.equal(Sim.restore(Sim.serialize(state)).bases[team].readyAt, 45);
  assert.equal(view(state, team).bases[team].niveau, 1);
  assert.equal(view(state, team).bases[team].readyAt, 45);
  assert.equal(view(state, 1 - team).bases[team].niveau, undefined);
  assert.equal(view(state, 1 - team).bases[team].readyAt, undefined);
  state.visible[1 - team].fill(1);
  assert.equal(view(state, 1 - team).bases[team].niveau, 1);
  assert.equal(view(state, 1 - team).bases[team].readyAt, 45);

  command(state, team, { kind: 'recruit', type: 'commis', producerId: mainId });
  command(state, team, { kind: 'recruit', type: 'hero', producerId: mainId });
  Sim.tick(state, 44.9);
  assert.equal(base.niveau, 1);
  assert.equal(state.units.filter((unit) => unit.team === team && unit.type === 'commis').length, 2);
  assert(state.units.some((unit) => unit.team === team && unit.type === 'hero'));
  Sim.tick(state, 0.1);
  assert.equal(base.niveau, 2);
  assert.equal(base.readyAt, undefined);
  command(state, team, archer);
  assert.throws(() => command(state, team, mage), /niveau 3 requise .*rang 4/);

  state.rubies[team] = 450;
  command(state, team, upgrade);
  assert.equal(state.rubies[team], 0);
  assert.equal(base.readyAt, 105);
  assert.equal(panel('production').upgrade.name, team ? 'Palais des Ordures' : 'Grand Restaurant');
  Sim.tick(state, 59.9);
  assert.equal(base.niveau, 2);
  assert.equal(Sim.producers(state, team, 'archer').length, 1);
  Sim.tick(state, 0.1);
  assert.equal(base.niveau, 3);
  assert.equal(base.readyAt, undefined);
  assert.equal(panel('production').upgrade, null);
  assert.throws(() => command(state, team, upgrade), /Niveau maximal/);
  state.rubies[team] = 200;
  command(state, team, mage);
}

// Une ancienne sauvegarde peut avoir un bâtiment avancé avant toute montée.
{
  const state = Sim.create();
  const slot = state.slots[0][0];
  slot.occupe = true;
  slot.batiment = { type: Sim.BUILDINGS[0][2].id, x: slot.x, y: slot.y, niveau: 1 };
  delete state.bases[0].niveau;
  const restored = Sim.restore(Sim.serialize(state));
  assert.equal(restored.bases[0].niveau, 1);
  assert.equal(Sim.producers(restored, 0, 'mage')[0].id, slot.id);
}

for (const team of [0, 1]) {
  const state = Sim.create();
  const ai = createAI(team, 'normal');
  for (let step = 0; step < 2400 && !Sim.producers(state, team, 'archer').length; step++) {
    ai.update(state);
    Sim.tick(state, 0.1);
  }
  assert.equal(state.bases[team].niveau, 2);
  assert(Sim.producers(state, team, 'archer').length, 'L’IA Normal doit construire un rang 3 en moins de 4 min.');
}

console.log('OK — niveaux, coûts, durées, production, brouillard et IA Normal pour les deux factions.');
