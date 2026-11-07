import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { BUILD_ORDERS, DIFFICULTIES } from '../public/game/ai-config.js';

assert.deepEqual(Object.keys(DIFFICULTIES), ['facile', 'normal', 'difficile', 'brutal']);
assert.throws(() => createAI(0, 'unknown'));
for (const order of BUILD_ORDERS) {
  const available = new Set();
  for (const building of order) {
    assert(building.requires.every((id) => available.has(id)));
    available.add(building.id);
  }
}
// Identical visible observations produce identical decisions, even when hidden
// enemy health and ownership differ. No omniscient choice of attack targets.
{
  const a = S.create();
  const b = S.create();
  b.units[1].hp = 1;
  b.mines[2].owner = 1;
  createAI(0).update(a);
  createAI(0).update(b);
  assert.deepEqual(a.units.filter((unit) => unit.team === 0), b.units.filter((unit) => unit.team === 0));
  assert.deepEqual(a.queues[0], b.queues[0]);
  assert.equal(a.rubies[0], b.rubies[0]);
}
// Micro uses visible enemies only, focuses the weakest, and retreats under cover.
{
  const state = S.create();
  state.units = [];
  for (const team of [0, 0, 1, 1]) S.spawn(state, 'archer', team);
  state.units.forEach((unit, index) => {
    unit.x = 810 + index * 10;
    unit.y = 450;
    unit.path = [];
  });
  state.units[3].hp = 1;
  S.visibility(state);
  const ai = createAI(0);
  ai.update(state);
  assert.equal(state.units[0].target, state.units[3]);
  state.units[0].hp = state.units[0].max * 0.2;
  state.time = 2;
  ai.update(state);
  assert(state.units[0].retreat);
}

// An uncontested economy takes its first expansion around three minutes.
for (const team of [0, 1]) {
  const state = S.create();
  const ai = createAI(team);
  state.bases[1 - team].hp = 1000000;
  while (state.time < 300 && state.winner === null) {
    ai.update(state);
    S.tick(state, 0.1);
  }
  assert(state.mines.some((mine, index) => index >= 2 && mine.owner === team && mine.depot));
  assert(state.units.filter((unit) => unit.team === team && unit.type === 'commis').length >= 4);
}

// Fixed PRNG seed: reproducible legal initial worker positions, alternating
// factions and decision order to avoid giving normal a consistent first move.
let seed = 18;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
let wins = 0;
for (let game = 0; game < 20; game++) {
  const state = S.create();
  for (const unit of state.units) {
    const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
    unit.x = (cell % S.COLS) * S.CELL + 10;
    unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
  }
  S.visibility(state);
  const normal = game % 2;
  const controllers = [0, 1].map((team) => createAI(team, team === normal ? 'normal' : 'facile'));
  const inactive = [0, 0];
  const previous = [null, null];

  for (let step = 0; step < 9000 && state.winner === null; step++) {
    for (const team of game % 2 ? [1, 0] : [0, 1]) {
      controllers[team].update(state);
      // Harvest deliveries, production, movement and combat are also activity;
      // merely polling the controller is not.
      const progress = JSON.stringify({
        rubies: state.rubies[team],
        jobs: state.queues[team],
        units: state.units.filter((unit) => unit.team === team).map((unit) => [unit.id, unit.x, unit.y, unit.hp, unit.cargo, unit.harvest?.elapsed]),
        enemyBase: state.bases[1 - team].hp,
      });
      const active = progress !== previous[team];
      previous[team] = progress;
      inactive[team] = state.rubies[team] > 200 && !active ? inactive[team] + 0.1 : 0;
      assert(inactive[team] <= 30, `Inactive AI: game ${game}, team ${team}`);
    }
    S.tick(state, 0.1);
  }
  assert.notEqual(state.winner, null, `Game ${game} must finish`);
  assert(state.time < 900, `Game ${game} exceeds 15 minutes`);

  if (state.winner === normal) wins++;
  console.log(`Game ${game + 1}: ${state.time.toFixed(1)}s, winner ${state.winner === normal ? 'normal' : 'facile'}`);
}
assert(wins >= 14, `Normal won only ${wins}/20`);
console.log(`PASS: normal wins ${wins}/20, finite matches, economy, fog and micro.`);

// Visibility checks may use public identity and coordinates; reading hidden
// combat information must fail immediately, rather than merely change a result.
for (const difficulty of Object.keys(DIFFICULTIES)) {
  const state = S.create();
  const controller = createAI(0, difficulty);
  const hidden = state.units.find((unit) => unit.team === 1);
  assert(!S.canSee(state, 0, hidden));
  for (const property of ['hp', 'max', 'type', 'target', 'harvest', 'cargo']) {
    const value = hidden[property];
    Object.defineProperty(hidden, property, {
      configurable: true,
      get() {
        assert.fail(`${difficulty} read invisible enemy ${property}`);
      },
    });
    // Keep the original value for other isolated scenarios if this list grows.
    assert.notEqual(value, undefined);
  }
  for (const time of [0, 60, 150, 300]) {
    state.time = time;
    controller.update(state);
  }
}

// A worker scout leaves at one minute and is replaced in the economy.
{
  const state = S.create();
  S.spawn(state, 'commis', 0);
  S.spawn(state, 'commis', 0);
  state.rubies[0] = 1000;
  state.time = 60;
  const controller = createAI(0, 'difficile');
  controller.update(state);
  const explorers = state.units.filter((unit) => unit.team === 0 && unit.retreat && !unit.harvest);
  assert.equal(explorers.length, 1);
  assert(explorers[0].path.length > 0);
  state.time = 61;
  controller.update(state);
  assert(state.queues[0].some((job) => job.type === 'commis'));
}

// Parallel production, including repeated buildings, uses ordinary paid jobs.
{
  const state = S.create();
  for (let index = 0; index < 8; index++) S.spawn(state, 'knight', 0);
  state.rubies[0] = 2000;
  for (const building of BUILD_ORDERS[0]) assert(S.construct(state, 0, building.id));
  const controller = createAI(0, 'difficile');
  for (const time of [0, 1, 2]) {
    state.time = time;
    controller.update(state);
  }
  assert.equal(S.producers(state, 0, 'archer').length, 3);
  assert(S.producers(state, 0, 'archer').every((producer) => state.queues[0].some((job) => job.producerId === producer.id)));
  assert(state.rubies[0] < 1450);
}

// Last observed composition survives loss of sight; hidden changes stay unknown.
{
  const state = S.create();
  state.units = [];
  S.spawn(state, 'knight', 0);
  S.spawn(state, 'knight', 1);
  state.units.forEach((unit, index) => {
    unit.x = 810 + index * 60;
    unit.y = 450;
    unit.path = [];
  });
  state.rubies[0] = 0;
  S.visibility(state);
  const controller = createAI(0, 'difficile');
  controller.update(state);
  assert.equal(controller.intelligence.composition.knight, 1);
  state.visible[0].fill(0);
  state.units[1].type = 'mage';
  state.time = 1;
  controller.update(state);
  assert.equal(controller.intelligence.composition.knight, 1);
  assert.equal(controller.intelligence.composition.mage, undefined);
  state.units[1].type = 'commis';
  S.visibility(state);
  state.time = 2;
  controller.update(state);
  assert.equal(controller.intelligence.composition.knight, 1, 'Seeing workers must not erase the last observed army');
}

// Losing armies fall back; mages step away from melee during their cooldown.
for (const mage of [false, true]) {
  const state = S.create();
  state.units = [];
  S.spawn(state, mage ? 'mage' : 'knight', 0);
  for (let index = 0; index < (mage ? 1 : 5); index++) S.spawn(state, 'knight', 1);
  state.units.forEach((unit, index) => {
    unit.x = 1000 + index * 25;
    unit.y = 450;
    unit.path = [];
  });
  state.units[0].cool = 2;
  state.rubies[0] = 0;
  S.visibility(state);
  createAI(0, 'difficile').update(state);
  assert(state.units[0].retreat);
  assert(state.units[0].path.length > 0);
}

// An uncontested hard AI expands again at five minutes and saturates its mines.
for (const team of [0, 1]) {
  const state = S.create();
  state.bases[1 - team].hp = 1000000;
  const controller = createAI(team, 'difficile');
  while (state.time < 420) {
    controller.update(state);
    S.tick(state, 0.1);
  }
  assert(controller.metrics.expansions.length >= 2);
  assert(controller.metrics.expansions[0] < 240);
  assert(controller.metrics.expansions[1] < 360);
  const mines = state.mines.filter((mine) => mine.owner === team);
  for (const mine of mines) {
    const index = state.mines.indexOf(mine);
    assert.equal(state.units.filter((unit) => unit.team === team && unit.type === 'commis' && unit.harvest?.mine === index).length, 3);
  }
}

// A depot lost in sight is reclaimed with a legal build action, paying its cost.
{
  const state = S.create();
  const worker = state.units.find((unit) => unit.team === 0);
  worker.x = state.mines[3].x;
  worker.y = state.mines[3].y;
  state.rubies[0] = 1000;
  state.time = 150;
  S.visibility(state);
  const controller = createAI(0, 'difficile');
  controller.update(state);
  assert.equal(state.mines[3].owner, 0);
  state.mines[3].owner = 1;
  const before = state.rubies[0];
  state.time = 151;
  controller.update(state);
  assert.equal(state.mines[3].owner, 0);
  assert(state.rubies[0] <= before - S.RULES.mineCost);
}

function playSeries(strong, weak, minimumWins) {
  seed = 18;
  let victories = 0;
  let earlyExpansions = 0;
  let bankSum = 0;
  let bankSamples = 0;
  const results = [];
  for (let game = 0; game < 20; game++) {
    const state = S.create();
    for (const unit of state.units) {
      const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
      unit.x = (cell % S.COLS) * S.CELL + 10;
      unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
    }
    S.visibility(state);
    const strongTeam = game % 2;
    const controllers = [0, 1].map((team) => createAI(team, team === strongTeam ? strong : weak));
    let firstExpansion = null;
    let rubySum = 0;
    let samples = 0;
    for (let step = 0; step < 9000 && state.winner === null; step++) {
      for (const team of game % 2 ? [1, 0] : [0, 1]) controllers[team].update(state);
      S.tick(state, 0.1);
      if (strong === 'difficile') {
        if (firstExpansion === null && state.mines.some((mine, index) => index >= 2 && mine.owner === strongTeam && mine.depot)) firstExpansion = state.time;
        if (state.time >= 180 && state.time <= 480) {
          rubySum += state.rubies[strongTeam];
          samples++;
        }
      }
    }
    assert.notEqual(state.winner, null, `${strong}/${weak}, game ${game}: no winner after 15 minutes`);
    if (state.winner === strongTeam) victories++;
    if (strong === 'difficile') {
      if (firstExpansion !== null && firstExpansion < 240) earlyExpansions++;
      if (state.time > 480) assert(controllers[strongTeam].metrics.waves >= 3, `Only ${controllers[strongTeam].metrics.waves} waves in ${state.time}s`);
      if (samples) assert(rubySum / samples < 250, `Game ${game}: average bank ${rubySum / samples}`);
      bankSum += rubySum;
      bankSamples += samples;
    }
    results.push({ game: game + 1, seconds: Math.round(state.time), winner: state.winner === strongTeam ? strong : weak });
  }
  console.table(results);
  assert(victories >= minimumWins, `${strong} won only ${victories}/20 against ${weak}`);
  if (strong === 'difficile') {
    assert(earlyExpansions >= 18, `Only ${earlyExpansions}/20 expansions before four minutes`);
    assert(bankSamples > 0);
    assert(bankSum / bankSamples < 250);
    console.log(`Economy: ${earlyExpansions}/20 early expansions, average bank ${(bankSum / bankSamples).toFixed(1)} rubies.`);
  }
  console.log(`PASS: ${strong} beats ${weak} ${victories}/20 (required ${minimumWins}).`);
}
playSeries('difficile', 'normal', 15);
playSeries('brutal', 'difficile', 13);
