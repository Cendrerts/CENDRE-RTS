import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { createAI } from '../public/game/ai.js';
import { panelModel } from '../public/game/panel.js';
import { productionModel } from '../public/game/production.js';
import { CendreSim as Sim } from '../public/game/sim.js';

for (const team of [0, 1]) {
  for (const [index, duration] of [20, 30, 40].entries()) {
    const state = Sim.create();
    state.time = 12;
    state.rubies[team] = 1000;
    const { id: type, unit, cost } = Sim.BUILDINGS[team][index];
    const slot = state.slots[team][0];
    const place = { kind: 'construct', type, slotId: slot.id };
    const cancel = { kind: 'cancelConstruction', slotId: slot.id };
    command(state, team, place);
    assert.equal(slot.batiment.readyAt, 12 + duration);
    assert.equal(state.rubies[team], 1000 - cost);
    assert.equal(unpack(pack(state)).slots[team][0].batiment.readyAt, slot.batiment.readyAt);
    assert.equal(view(state, team).slots[team][0].batiment.readyAt, slot.batiment.readyAt);
    assert(!view(state, 1 - team).slots[team].some((item) => item.id === slot.id));
    state.visible[1 - team].fill(1);
    assert.equal(view(state, 1 - team).slots[team][0].batiment.readyAt, slot.batiment.readyAt);
    assert.throws(() => command(state, 1 - team, cancel), /Chantier indisponible/);
    assert.throws(() => command(state, team, { kind: 'setRally', buildingId: slot.id, x: 100, y: 100 }));
    assert.throws(() => command(state, team, { kind: 'recruit', type: unit, producerId: slot.id }));
    assert.equal(Sim.recruitBlockReason(state, team, unit), 'construction');
    assert.equal(Sim.recruitBlockReason(state, team, unit, slot.id), 'construction');
    assert(!productionModel(state, team).some((item) => item.type === unit));
    const panel = panelModel(state, team, new Set(), { slotId: slot.id });
    assert.equal(panel.mode, 'construction');
    assert.match(panel.left.status, new RegExp(`${duration} s restantes`));

    command(state, team, cancel);
    assert.equal(state.rubies[team], 1000);
    assert.equal(slot.occupe, false);
    assert.equal(slot.batiment, null);
    assert.throws(() => command(state, team, cancel), /Chantier indisponible/);
    command(state, team, place);
    state.time = slot.batiment.readyAt - 0.001;
    assert.equal(Sim.canRecruit(state, team, unit, slot.id), false);
    state.time = slot.batiment.readyAt;
    assert.equal(Sim.canRecruit(state, team, unit, slot.id), true);
    assert.equal(Sim.recruitBlockReason(state, team, unit, slot.id), null);
    assert.throws(() => command(state, team, cancel), /Chantier indisponible/);

    assert(Sim.recruit(state, unit, team, slot.id));
    const otherSlot = state.slots[team][1];
    command(state, team, { ...place, slotId: otherSlot.id });
    assert.equal(Sim.recruitBlockReason(state, team, unit, otherSlot.id), 'construction');
    assert(Sim.recruit(state, unit, team));
    assert.equal(state.queues[team].at(-1).producerId, slot.id);
    state.time = otherSlot.batiment.readyAt;
    assert(Sim.recruit(state, unit, team));
    assert.equal(state.queues[team].at(-1).producerId, otherSlot.id);
  }
}

// Les sauvegardes antérieures contiennent des bâtiments déjà opérationnels.
{
  const state = Sim.create();
  state.rubies[0] = 1000;
  const { id, unit } = Sim.BUILDINGS[0][0];
  assert(Sim.construct(state, 0, id));
  const slot = state.slots[0][0];
  delete slot.batiment.readyAt;
  const restored = unpack(pack(state));
  assert(Sim.canRecruit(restored, 0, unit, slot.id));
  assert(!Sim.cancelConstruction(restored, 0, slot.id));
}

for (const team of [0, 1]) {
  const state = Sim.create();
  state.rubies[team] = 800;
  const controller = createAI(team, 'normal');
  const originalRecruit = Sim.recruit;
  let producedWorker = false;
  let recruitedMilitary = false;
  Sim.recruit = (s, type, player, producerId) => {
    if (!['commis', 'hero'].includes(type)) {
      assert(Sim.producers(s, player, type).some((producer) => producer.id === producerId),
        'L’IA ne demande une unité militaire qu’à un bâtiment opérationnel');
    }
    const recruited = originalRecruit(s, type, player, producerId);
    if (recruited && !['commis', 'hero'].includes(type)) recruitedMilitary = true;
    return recruited;
  };
  try {
    for (let step = 0; step < 280 && !recruitedMilitary; step++) {
      controller.update(state);
      if (state.slots[team].some((slot) => Sim.isUnderConstruction(state, slot)) &&
          state.units.filter((unit) => unit.team === team && unit.type === 'commis').length > 1) {
        producedWorker = true;
      }
      Sim.tick(state, 0.1);
    }
  } finally {
    Sim.recruit = originalRecruit;
  }
  assert(producedWorker, 'L’économie continue pendant les travaux');
  assert(recruitedMilitary, 'L’IA recrute dès que la production militaire est opérationnelle');
}
