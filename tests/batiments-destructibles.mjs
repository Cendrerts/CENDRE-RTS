import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { buildingBounds, resolveTap, unitHitbox } from '../public/game/tap.js';

function scenario() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.rubies = [1000, 1000];
  return state;
}

function placeUnit(state, type, team, x, y) {
  Sim.spawn(state, type, team, state.bases[team]);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, path: [], harvest: null });
  return unit;
}

function attack(state, unit) {
  state.visible[unit.team].fill(1);
  unit.cool = 0;
  Sim.tick(state, 0.05);
}

for (const chantier of [false, true]) {
  let state = scenario();
  let slot = state.slots[1][0];
  const config = Sim.BUILDINGS[1][0];
  assert(Sim.construct(state, 1, config.id, slot.baseId, slot.id));
  assert.equal(slot.batiment.hp, 600);
  if (!chantier) {
    state.time = slot.batiment.readyAt;
    assert(Sim.recruit(state, config.unit, 1, slot.id));
    assert.equal(state.queues[1].length, 1);
  }
  assert.equal(Sim.isUnderConstruction(state, slot), chantier);
  const survivor = placeUnit(state, 'knight', 1, state.bases[1].x - 140, state.bases[1].y);
  Sim.hold(state, 1, [survivor.id]);
  const position = { x: survivor.x, y: survivor.y };
  const attacker = placeUnit(state, 'knight', 0, slot.x, slot.y + 25);
  const before = state.rubies[1];
  attack(state, attacker);
  assert(slot.batiment.hp < 600);
  const damaged = slot.batiment.hp;
  assert.equal(view(state, 1).slots[1][0].batiment.hp, damaged);
  assert.equal(view(state, 1).damageEvents[0].team, 1);
  state = unpack(pack(state));
  slot = state.slots[1][0];
  assert.equal(slot.batiment.hp, damaged);
  slot.batiment.hp = 1;
  attack(state, state.units.find((unit) => unit.id === attacker.id));
  assert.equal(slot.occupe, false);
  assert.equal(slot.batiment, null);
  assert.deepEqual(state.queues[1], []);
  assert.equal(state.rubies[1], before);
  assert.equal(state.winner, null);
  assert.equal(state.corpses.length, 0);
  assert.equal(Sim.matchStats(state).teams[0].buildingsDestroyed, 1);
  const existing = state.units.find((unit) => unit.id === survivor.id);
  assert.deepEqual({ x: existing.x, y: existing.y }, position);
  state.units = state.units.filter((unit) => unit.team === 0);
  const soldier = state.units[0];
  Object.assign(soldier, { x: state.bases[1].x, y: state.bases[1].y + 30 });
  state.bases[1].hp = 1;
  attack(state, soldier);
  assert.equal(state.winner, 0);
}

{
  const state = scenario();
  const mine = state.mines[2];
  const { x, y } = mine.site;
  const worker = placeUnit(state, 'commis', 1, mine.x, mine.y);
  assert(Sim.build(state, 1, 2));
  assert.equal(mine.site.hp, 400);
  assert(Sim.gather(state, 1, [worker.id], 2));
  assert(Sim.recruit(state, 'commis', 1, 'mine_2'));
  const slot = state.slots[1].find((entry) => entry.baseId === 'mine_2');
  assert(Sim.construct(state, 1, Sim.BUILDINGS[1][0].id, slot.baseId, slot.id));
  const before = state.rubies[1];
  const attacker = placeUnit(state, 'knight', 0, x, y);
  attack(state, attacker);
  assert.equal(view(state, 0).mines[2].site.hp, mine.site.hp);
  assert(mine.site.hp < 400);
  state.visible[0].fill(0);
  assert.equal(view(state, 0).mines[2].site.hp, undefined);
  mine.site.hp = 1;
  attack(state, attacker);
  assert.equal(mine.owner, null);
  assert.equal(mine.depot, false);
  assert.deepEqual(mine.site, { x, y });
  assert.equal(worker.harvest, null);
  assert.deepEqual(worker.path, []);
  assert.deepEqual(state.queues[1], []);
  assert.equal(state.rubies[1], before);
  assert.equal(state.winner, null);
  assert(state.slots[1].includes(slot));
  worker.x = mine.x + 100;
  attacker.x = mine.x;
  attacker.y = mine.y;
  assert(Sim.build(state, 0, 2));
  assert.equal(mine.owner, 0);
  assert.equal(mine.site.hp, 400);
  assert(state.slots[1].includes(slot));
}

{
  const state = scenario();
  const slot = state.slots[1][0];
  assert(Sim.construct(state, 1, Sim.BUILDINGS[1][0].id, slot.baseId, slot.id));
  // Old saves have no health fields on their buildings.
  delete slot.batiment.hp;
  delete slot.batiment.max;
  Sim.migrateState(state);
  assert.equal(slot.batiment.hp, 600);
  const attacker = placeUnit(state, 'knight', 0, slot.x, slot.y + 25);
  const defender = placeUnit(state, 'commis', 1, slot.x - 20, slot.y + 25);
  Sim.hold(state, 1, [defender.id]);
  Sim.order(state, [attacker.id], slot.x, slot.y, slot.batiment);
  attack(state, attacker);
  assert.equal(attacker.target, slot.batiment);
  assert(defender.hp < defender.max);
  assert.equal(slot.batiment.hp, 600);
  defender.x -= 140;
  attack(state, attacker);
  assert(slot.batiment.hp < 600);
  const damaged = slot.batiment.hp;
  defender.x += 140;
  attack(state, attacker);
  assert.equal(slot.batiment.hp, damaged);

  state.visible[0].fill(1);
  const selection = new Set([attacker.id]);
  const bounds = buildingBounds(slot, 0.65, false, 1, 0);
  const point = { x: slot.x, y: bounds.y + bounds.height / 2 };
  defender.x -= 140;
  assert.deepEqual(resolveTap(state, 0, selection, point, 0.8), { kind: 'attack', target: slot.batiment });
  defender.x = point.x + 5;
  const hitbox = unitHitbox(defender);
  defender.y += point.y - (hitbox.y + hitbox.height / 2);
  assert.deepEqual(resolveTap(state, 0, selection, point, 0.8), { kind: 'attack', target: defender });
}

for (const tapTower of [true, false]) {
  const state = scenario();
  const tower = state.bases[1];
  const slots = state.slots[1].filter((slot) => slot.baseId === 'main_1').slice(0, 3);
  assert.equal(slots.length, 3);
  for (const slot of slots) {
    assert(Sim.construct(state, 1, Sim.BUILDINGS[1][0].id, slot.baseId, slot.id));
  }
  state.time = Math.max(...slots.map((slot) => slot.batiment.readyAt));
  const attackers = Array.from({ length: 6 }, (_, index) =>
    placeUnit(state, 'knight', 0, tower.x - 400, tower.y + (index - 2.5) * 24));
  const selection = new Set(attackers.map((unit) => unit.id));
  const [selectedSlot, ...otherSlots] = slots;
  const point = tapTower ? tower : selectedSlot;
  state.visible[0].fill(1);
  const action = resolveTap(state, 0, selection, point);
  assert.deepEqual(action, { kind: 'attack', target: tapTower ? tower : selectedSlot.batiment });
  Sim.order(state, [...selection], point.x, point.y, action.target);
  // Garder la visibilité forcée malgré le recalcul périodique du brouillard.
  state.fogClock = -30;
  for (let tick = 0; tick < 600; tick++) {
    Sim.tick(state, 0.05);
    if (!tapTower && !selectedSlot.occupe) break;
  }
  if (tapTower) {
    assert.equal(tower.hp, 0);
    assert(slots.every((slot) => slot.occupe));
  } else {
    assert.equal(selectedSlot.batiment, null);
    assert.equal(tower.hp, tower.max);
    assert(otherSlots.every((slot) => slot.occupe));
  }
}

{
  const state = scenario();
  const slot = state.slots[1][0];
  assert(Sim.construct(state, 1, Sim.BUILDINGS[1][0].id, slot.baseId, slot.id));
  const mine = state.mines[2];
  const worker = placeUnit(state, 'commis', 1, mine.x, mine.y);
  assert(Sim.build(state, 1, 2));
  const attacker = placeUnit(state, 'knight', 0, slot.x - 100, slot.y);
  state.visible[0].fill(1);
  assert.deepEqual(resolveTap(state, 0, new Set([attacker.id]), mine.site), {
    kind: 'attack', target: mine.site,
  });
  for (const building of [slot.batiment, mine.site]) {
    const order = {
      kind: 'attack',
      ids: [attacker.id],
      x: building.x,
      y: building.y,
      target: { structure: building.structure, team: 1, structureId: building.structureId },
    };
    state.visible[0].fill(1);
    command(state, 0, order);
    assert.equal(attacker.target, building);
    Sim.hold(state, 0, [attacker.id]);
    command(state, 0, { ...order, queue: true });
    assert.equal(attacker.target, building);
    const restored = unpack(pack(state));
    const restoredAttacker = restored.units.find((unit) => unit.id === attacker.id);
    const restoredBuilding = building === mine.site ? restored.mines[2].site : restored.slots[1][0].batiment;
    assert.equal(restoredAttacker.target, restoredBuilding);
    assert.deepEqual(restoredAttacker.orderQueue[0].target, order.target);
    state.visible[0].fill(0);
    command(state, 0, order);
    assert.equal(attacker.target, null);
    command(state, 1, { ...order, ids: [worker.id] });
    assert.equal(worker.target, null);
  }
}

console.log('PASS : destruction, files, reprise, chantier, victoire, ciblage et tap.');
