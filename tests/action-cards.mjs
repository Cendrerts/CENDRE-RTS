import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CendreSim as Sim } from '../public/game/sim.js';
import { dishOptions, kingFeastCard, fieldKitchenCard, rankCard, costText } from '../public/game/action-cards.js';
import { panelModel } from '../public/game/panel.js';
import { resourceChanges, resourceStock } from '../public/game/resource-feedback.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { actionCardValuesSource } from '../scripts/action-card-values.mjs';

const valuesFile = new URL('../public/game/action-card-values.js', import.meta.url);
assert.equal(await readFile(valuesFile, 'utf8'), await actionCardValuesSource(),
  'Régénérer les valeurs des fiches avec node scripts/action-card-values.mjs');

function assertCard(card) {
  assert(card.name.trim());
  assert(card.cost && costText(card.cost).trim());
  assert(card.duration.trim());
  assert.match(card.effect, /\w.+[.]$/u);
}

function economy(state, team) {
  return { stock: resourceStock(state, team), spent: { ...(state.resourceSpent?.[team] ?? {}) } };
}

assertCard(kingFeastCard);
assert.equal(costText(kingFeastCard.cost), 'Gratuit');
assertCard(fieldKitchenCard);
assert.equal(fieldKitchenCard.cost.rubies, Sim.FIELD_KITCHEN_COST);

for (const team of [0, 1]) {
  const state = Sim.create();
  const context = { baseId: 'main_' + team, tab: 'production', width: 844 };
  state.rubies[team] = 2000;
  for (const level of [1, 2]) {
    state.bases[team].niveau = level;
    const { upgrade } = panelModel(state, team, new Set(), context);
    const card = rankCard(upgrade, team);
    assertCard(card);
    assert.equal(card.name, Sim.nextMainLevel(state, team).names[team]);
    assert.equal(card.cost.rubies, Sim.nextMainLevel(state, team).cost);
  }

  state.bases[team].niveau = 1;
  const upgrades = [
    [{ kind: 'upgradeMain' }, Sim.nextMainLevel(state, team).cost],
    [{ kind: 'construct', type: Sim.BUILDINGS[team][0].id }, Sim.BUILDINGS[team][0].cost],
    [{ kind: 'build', index: 2 }, Sim.RULES.mineCost],
  ];
  Object.assign(state.units.find((unit) => unit.team === team), {
    x: state.mines[2].x,
    y: state.mines[2].y,
  });
  if (team === 0) {
    Sim.spawn(state, 'hero', team);
    upgrades.push([{ kind: 'fieldKitchen' }, Sim.FIELD_KITCHEN_COST]);
  }
  for (const [order, cost] of upgrades) {
    const before = economy(state, team);
    command(state, team, order);
    assert.deepEqual(resourceChanges(before, economy(state, team)), [{ resource: 'rubies', amount: -cost }]);
  }
  if (team === 0) {
    assert.equal(view(state, team).fieldKitchenReadyAt, state.fieldKitchenReadyAt);
    assert(!Object.hasOwn(view(state, 1), 'fieldKitchenReadyAt'));
  }

  state.bases[team].niveau = 3;
  Object.assign(state.ingredients[team], { viande: 200, epices: 100, conserves: 100 });
  assert.equal(dishOptions[team].length, 3);
  for (const card of dishOptions[team]) {
    assertCard(card);
    const before = economy(state, team);
    command(state, team, { kind: 'cookDish', dish: card.dish });
    const changes = resourceChanges(before, economy(state, team));
    assert.deepEqual(Object.fromEntries(changes.map(({ resource, amount }) => [resource, -amount])), card.cost);
    assert.equal(parseInt(card.duration, 10), state[card.dish].readyAt - state.time);
    assert.throws(() => command(state, team, { kind: 'cookDish', dish: card.dish }));
    assert.deepEqual(resourceChanges(before, economy(state, team)), changes, 'Un refus ne débite rien');
  }

  const before = economy(state, team);
  const recruitmentCost = Sim.stats('commis', team).cost;
  command(state, team, { kind: 'recruit', type: 'commis' });
  state.rubies[team] += recruitmentCost;
  const snapshot = view(unpack(pack(state)), team);
  assert.deepEqual(resourceChanges(before, economy(snapshot, team)), [
    { resource: 'rubies', amount: -recruitmentCost },
    { resource: 'rubies', amount: recruitmentCost },
  ], 'Un revenu dans le même instantané ne masque pas la dépense');
  assert.deepEqual(view(state, 1 - team).resourceSpent[team], {}, 'Le cumul est privé');
}

console.log('PASS : six plats, deux capacités, montées de rang et dépenses confirmées.');
