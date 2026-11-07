import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { DIFFICULTIES } from '../public/game/ai-config.js';
import { pack, unpack } from '../lib/match.mjs';

assert.deepEqual(DIFFICULTIES.impitoyable, { ...DIFFICULTIES.brutal, incomeBonus: 0.25 });
for (const [difficulty, settings] of Object.entries(DIFFICULTIES)) {
  assert.equal(settings.incomeBonus, difficulty === 'impitoyable' ? 0.25 : 0);
}
// With identical resources and observations, every decision is Brutal's.
for (const team of [0, 1]) {
  const brutalState = S.create();
  const ruthlessState = S.create();
  const brutal = createAI(team, 'brutal');
  const ruthless = createAI(team, 'impitoyable');
  for (const time of [0, 60, 150, 300]) {
    brutalState.time = time;
    ruthlessState.time = time;
    brutal.update(brutalState);
    ruthless.update(ruthlessState);
    assert.deepEqual({ ...ruthlessState, incomeMultiplier: [1, 1] }, brutalState);
  }
}
const humanMatch = unpack(pack(S.create()));
assert.deepEqual(humanMatch.incomeMultiplier, [1, 1]);
const legacy = S.create();
delete legacy.incomeMultiplier;
assert.deepEqual(unpack(pack(legacy)).incomeMultiplier, [1, 1]);

// Both factions, ordinary and rich mines, and a partially depleted final bag.
// No rounding at deposit: fractional rubies remain spendable and persist.
for (const strongTeam of [0, 1]) {
  for (const cargo of [10, 20, 1]) {
    const state = S.create();
    createAI(strongTeam, 'impitoyable').update(state);
    createAI(1 - strongTeam, 'brutal').update(state);
    assert.deepEqual(state.incomeMultiplier, strongTeam ? [1, 1.25] : [1.25, 1]);
    state.queues = [[], []];
    for (const worker of state.units) {
      worker.cargo = cargo;
      worker.path = [];
      worker.harvest = { mine: worker.team, phase: 'VERS_BASE', elapsed: 0 };
    }
    const before = [...state.rubies];
    S.tick(state, 0.01);
    for (const team of [0, 1]) {
      assert.equal(state.rubies[team] - before[team], cargo * (team === strongTeam ? 1.25 : 1));
    }
    assert.deepEqual(unpack(pack(state)).rubies, state.rubies);
  }
}

// Follow real worker trips and check every completed deposit independently.
{
  const state = S.create();
  createAI(0, 'impitoyable').update(state);
  createAI(1, 'brutal').update(state);
  state.queues = [[], []];
  const deposits = [0, 0];
  for (let step = 0; step < 3000; step++) {
    const before = [...state.rubies];
    const cargo = state.units.map((unit) => unit.cargo);
    S.tick(state, 0.01);
    for (const [index, worker] of state.units.entries()) {
      const delivered = cargo[index] > 0 && worker.cargo === 0;
      assert.equal(state.rubies[worker.team] - before[worker.team], delivered ? cargo[index] * state.incomeMultiplier[worker.team] : 0);
      if (delivered) deposits[worker.team]++;
    }
  }
  assert(deposits.every((count) => count >= 3));
}

const menu = readFileSync(new URL('../public/game/index.html', import.meta.url), 'utf8');
assert.match(menu, /value="brutal">Brutal<\/option><option value="impitoyable">Impitoyable · l’IA récolte \+25 %/);
assert.match(menu, /id="aiDifficulty" style="min-height:44px"/);

// Ten reproducible seeds, alternating factions and controller update order.
let victories = 0;
for (let game = 0; game < 10; game++) {
  let seed = game + 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const state = S.create();
  for (const unit of state.units) {
    const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
    unit.x = (cell % S.COLS) * S.CELL + 10;
    unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
  }
  S.visibility(state);
  const strongTeam = game % 2;
  const controllers = [0, 1].map((team) => createAI(team, team === strongTeam ? 'impitoyable' : 'brutal'));
  for (let step = 0; step < 9000 && state.winner === null; step++) {
    for (const team of strongTeam ? [1, 0] : [0, 1]) controllers[team].update(state);
    S.tick(state, 0.1);
  }
  assert.notEqual(state.winner, null, `Seed ${game + 1}: no winner after 15 minutes`);
  if (state.winner === strongTeam) victories++;
  console.log(`Seed ${game + 1}: ${state.winner === strongTeam ? 'Impitoyable' : 'Brutal'} (${state.time.toFixed(1)}s)`);
}
assert(victories >= 8, `Impitoyable won ${victories}/10 against Brutal`);
console.log(`PASS: exact deposit bonus, default human income, persistence, menu and ${victories}/10 victories.`);
