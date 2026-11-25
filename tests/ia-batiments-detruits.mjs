import assert from 'node:assert/strict';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const step = 0.1;
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

function scenario(team) {
  const state = Sim.create();
  state.units = state.units.filter((unit) => unit.team === team);
  state.monsters = [];
  state.camps = [];
  state.rubies[team] = 1000;
  return { state, controller: createAI(team, 'difficile') };
}

function placeUnit(state, type, team, x, y) {
  Sim.spawn(state, type, team, state.bases[team]);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, path: [], harvest: null });
  return unit;
}

function hitStructure(state, target, attackers) {
  const team = 1 - target.team;
  state.visible[team].fill(1);
  Sim.order(state, attackers.map((unit) => unit.id), target.x, target.y, target);
  Sim.tick(state, 0.05);
  assert(state.damageEvents.some((event) => event.team === target.team &&
    event.x === target.x && event.y === target.y));
}

function destroy(state, target) {
  target.hp = 1;
  const attacker = placeUnit(state, 'knight', 1 - target.team, target.x, target.y);
  hitStructure(state, target, [attacker]);
  assert(target.hp <= 0);
  state.units = state.units.filter((unit) => unit !== attacker);
  Sim.visibility(state);
}

function run(state, controller, seconds, observe) {
  const until = state.time + seconds;
  while (state.time < until) {
    controller.update(state);
    observe();
    Sim.tick(state, step);
  }
  assert.equal(state.winner, null);
}

for (const team of [0, 1]) {
  const config = Sim.BUILDINGS[team][0];
  {
    const { state, controller } = scenario(team);
    const slot = state.slots[team][2];
    assert(Sim.construct(state, team, config.id, slot.baseId, slot.id));
    state.time = slot.batiment.readyAt;
    controller.update(state);
    assert(state.queues[team].some((job) => job.producerId === slot.id));
    state.rubies[team] = 1000;
    const homeMine = state.mines[team];
    for (const unit of state.units) {
      Object.assign(unit, { x: homeMine.x, y: homeMine.y });
    }
    destroy(state, slot.batiment);
    assert.equal(slot.batiment, null);
    assert(!state.queues[team].some((job) => job.producerId === slot.id));

    const destroyedAt = state.time;
    let rebuiltAt;
    let recruited = false;
    const existing = new Set(state.units.map((unit) => unit.id));
    run(state, controller, 60, () => {
      if (slot.batiment?.type === config.id) rebuiltAt ??= state.time;
      if (state.queues[team].some((job) => job.type === config.unit && job.producerId === slot.id)) {
        assert(!Sim.isUnderConstruction(state, slot));
        recruited = true;
      }
    });
    assert(rebuiltAt - destroyedAt < 5, `équipe ${team}, reconstruction en moins de 5 s`);
    assert(recruited);
    assert(state.units.some((unit) => unit.team === team && unit.type === config.unit && !existing.has(unit.id)));
  }

  {
    const { state, controller } = scenario(team);
    const index = team + 2;
    const mine = state.mines[index];
    const worker = placeUnit(state, 'commis', team, mine.x, mine.y);
    assert(Sim.build(state, team, index));
    assert(Sim.gather(state, team, [worker.id], index));
    controller.update(state);
    const existing = new Set(state.units.map((unit) => unit.id));
    destroy(state, mine.site);
    assert.equal(mine.owner, null);
    assert.equal(mine.depot, false);

    const destroyedAt = state.time;
    let reclaimedAt;
    run(state, controller, 60, () => {
      if (mine.owner === team && mine.depot) reclaimedAt ??= state.time;
    });
    assert(reclaimedAt - destroyedAt < 60, `équipe ${team}, reprise du dépôt en moins de 60 s`);
    assert(state.units.some((unit) => unit.team === team && unit.type === config.unit && !existing.has(unit.id)));
  }

  for (const kind of ['production', 'depot']) {
    const { state, controller } = scenario(team);
    const index = kind === 'production' ? team + 2 : 4;
    const mine = state.mines[index];
    const worker = placeUnit(state, 'commis', team, mine.x, mine.y);
    assert(Sim.build(state, team, index));
    state.units = state.units.filter((unit) => unit !== worker && unit.type !== 'commis');
    let target = mine.site;
    if (kind === 'production') {
      const site = state.slots[team].find((slot) => slot.baseId === `mine_${index}` && distance(slot, mine) > 240);
      assert(Sim.construct(state, team, config.id, site.baseId, site.id));
      target = site.batiment;
    }
    const direction = kind === 'depot' || team ? 1 : -1;
    const base = state.bases[team];
    const defenders = [0, 30, 60].map((offset) =>
      placeUnit(state, 'knight', team, base.x, base.y + offset));
    const attackers = [0, 5, -5].map((offset) =>
      placeUnit(state, 'archer', 1 - team, target.x + offset, target.y + direction * 117));
    assert(attackers.every((unit) => distance(unit, mine) > 240 && distance(unit, state.mines[team]) > 240));
    hitStructure(state, target, attackers);
    assert(target.hp < target.max);

    let defended = false;
    run(state, controller, 3, () => {
      if (defenders.filter((unit) => attackers.includes(unit.target) ||
        (unit.attackDestination && distance(unit.attackDestination, target) < 55)).length >= 2) {
        defended = true;
      }
    });
    assert(defended, `équipe ${team}, défense du bâtiment ${kind} en moins de 3 s`);
  }
}

console.log('PASS : défense, reconstruction et reprise des dépôts pour les deux équipes.');
