import assert from 'node:assert/strict';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';

function setup(team, { conserves = 30, distance = 150, level = 3, militaryCount = 6 } = {}) {
  const state = Sim.create();
  state.watchtowers = [];
  state.rubies = [0, 0];
  Object.assign(state.ingredients[team], { viande: 60, epices: 40, conserves });
  const base = state.bases[team];
  base.niveau = level;
  for (let index = 0; index < militaryCount; index++) {
    Sim.spawn(state, index === 0 ? 'hero' : 'knight', team);
    const unit = state.units.at(-1);
    const angle = (index - 2.5) * Math.PI / 12;
    unit.x = base.x + Math.cos(angle) * distance * (team === 0 ? 1 : -1);
    unit.y = base.y + Math.sin(angle) * distance;
  }
  return state;
}

function playOpening(state, team, difficulty = 'normal') {
  const controller = createAI(team, difficulty);
  for (let step = 0; step < 5; step++) {
    controller.update(state);
    Sim.tick(state, 0.1);
  }
}

for (const [team, levelThree, levelTwo] of [[0, 'banquet', 'roti'], [1, 'peste', 'bouillon']]) {
  const preferred = setup(team);
  playOpening(preferred, team);
  assert.notEqual(preferred[levelThree].readyAt, null, levelThree);
  assert.equal(preferred[levelTwo].readyAt, null, levelTwo);
  assert.deepEqual(preferred.ingredients[team], { viande: 30, epices: 20, conserves: 15 });

  const fallback = setup(team, { conserves: 0 });
  playOpening(fallback, team);
  assert.equal(fallback[levelThree].readyAt, null, levelThree);
  assert.notEqual(fallback[levelTwo].readyAt, null, levelTwo);

  for (const [options, difficulty] of [
    [{ distance: 600 }, 'normal'],
    [{}, 'facile'],
    [{ level: 1 }, 'normal'],
    [{ militaryCount: 5 }, 'normal'],
  ]) {
    const state = setup(team, options);
    playOpening(state, team, difficulty);
    assert.equal(state[levelThree].readyAt, null, levelThree);
    assert.equal(state[levelTwo].readyAt, null, levelTwo);
  }

  const alreadyCooking = setup(team);
  assert(Sim.cookDish(alreadyCooking, team, levelThree).ok);
  const readyAt = alreadyCooking[levelThree].readyAt;
  playOpening(alreadyCooking, team);
  assert.equal(alreadyCooking[levelThree].readyAt, readyAt, levelThree);
  assert.notEqual(alreadyCooking[levelTwo].readyAt, null, levelTwo);
  assert.equal(alreadyCooking.ingredients[team].conserves, 15);

  const active = setup(team);
  Sim.spawn(active, 'knight', team);
  const distantAlly = active.units.at(-1);
  distantAlly.x = active.bases[team].x + (team === 0 ? 600 : -600);
  distantAlly[`${levelThree}Until`] = 20;
  playOpening(active, team);
  assert.equal(active[levelThree].readyAt, null, levelThree);
  assert.notEqual(active[levelTwo].readyAt, null, levelTwo);
}
