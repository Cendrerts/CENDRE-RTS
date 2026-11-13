import assert from 'node:assert/strict';
import { CendreSim as Sim, canRecruit, recruitBlockReason } from '../public/game/sim.js';
import { recruitToastText } from '../public/game/production.js';

assert.equal(recruitToastText(0, 'Files pleines'), 'Files pleines');
assert.equal(recruitToastText(1, 'Files pleines'), '1 lancée · Files pleines');
assert.equal(recruitToastText(2, 'Files pleines'), '2 lancées · Files pleines');
assert.equal(recruitToastText(3, 'Files pleines'), '3 lancées · Files pleines');

for (const team of [0, 1]) {
  function check(state, type, expected, producerId = null) {
    const before = structuredClone(state);
    assert.equal(recruitBlockReason(state, team, type, producerId), expected);
    assert.deepEqual(state, before, 'Le diagnostic ne modifie pas l’état');
    assert.equal(canRecruit(structuredClone(state), team, type, producerId), expected === null);
  }
  const state = Sim.create();
  state.rubies[team] = 9999;
  check(state, 'commis', null);
  check(state, 'archer', 'producer');
  state.rubies[team] = 0;
  check(state, 'commis', 'rubies');
  check(state, 'archer', 'producer');
  check(state, 'commis', 'producer', 'missing_producer');
  const cap = Sim.populationCap(state, team);
  assert.equal(cap, team === 1 ? 45 : 30);
  for (const population of [cap - 1, cap, cap + 1]) {
    state.units = Array.from({ length: population }, () => ({ team }));
    assert.equal(
      recruitBlockReason(state, team, 'commis') === 'population',
      population >= Sim.populationCap(state, team),
    );
  }
  state.units = Array.from({ length: cap }, () => ({ team }));
  check(state, 'commis', 'population');
  state.units = [];
  state.queues[team] = Array.from({ length: 8 }, () => ({
    type: 'commis',
    producerId: `main_${team}`,
    remaining: 1,
  }));
  check(state, 'commis', 'queues');
  state.rubies[team] = 9999;
  check(state, 'commis', 'queues');
  state.queues[team].pop();
  check(state, 'commis', null);
  state.units = Array.from({ length: cap - state.queues[team].length }, () => ({ team }));
  check(state, 'commis', 'population');
  state.units = [];
  state.queues[team] = [];
  assert(Sim.construct(state, team, Sim.BUILDINGS[team][1].id));
  assert(Sim.construct(state, team, Sim.BUILDINGS[team][1].id));
  const producerId = Sim.producers(state, team, 'archer')[0].id;
  state.queues[team] = Array.from({ length: 8 }, () => ({ producerId, type: 'archer', remaining: 1 }));
  check(state, 'archer', null);
  check(state, 'archer', 'queues', producerId);
  state.queues[team] = [];
  state.rubies[team] = Sim.stats('archer', team).cost * 2;
  let launched = 0;
  while (launched < 5 && !recruitBlockReason(state, team, 'archer')) {
    assert(Sim.recruit(state, 'archer', team));
    launched++;
  }
  assert.equal(launched, 2);
  check(state, 'archer', 'rubies');
}
console.log('PASS: raisons de refus, priorités, lecture seule et lot partiel pour les deux factions.');
