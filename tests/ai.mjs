import { parseReplayOptions, reportReplay } from '../scripts/tests-longs-options.mjs';
import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { BUILD_ORDERS, DIFFICULTIES } from '../public/game/ai-config.js';

const replay = parseReplayOptions(1, 20, true);

let seed = 18;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

if (replay.seed === null) {
  assert.deepEqual(Object.keys(DIFFICULTIES), ['facile', 'normal', 'difficile', 'brutal', 'impitoyable']);
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

    for (let step = 0; step < 15000 && state.winner === null; step++) {
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
    assert(state.time < 1500, `Game ${game} exceeds 25 minutes`);

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
    worker.x = state.mines[2].x;
    worker.y = state.mines[2].y;
    state.rubies[0] = 1000;
    state.time = 150;
    S.visibility(state);
    const controller = createAI(0, 'difficile');
    controller.update(state);
    assert.equal(state.mines[2].owner, 0);
    state.mines[2].owner = 1;
    const before = state.rubies[0];
    state.time = 151;
    controller.update(state);
    assert.equal(state.mines[2].owner, 0);
    assert(state.rubies[0] <= before - S.RULES.mineCost);
  }

}

function playSeries(strong, weak, minimumWins) {
  if (replay.seed !== null && replay.series !== `${strong}-${weak}`) {
    return;
  }
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
    // --graine is the 1-based game number. Only placements consume this PRNG;
    // consume previous games' draws without playing their deterministic simulations.
    if (replay.seed !== null && game + 1 !== replay.seed) {
      continue;
    }
    S.visibility(state);
    const strongTeam = game % 2;
    const controllers = [0, 1].map((team) => createAI(team, team === strongTeam ? strong : weak));
    let firstExpansion = null;
    let rubySum = 0;
    let samples = 0;
    for (let step = 0; step < 15000 && state.winner === null; step++) {
      for (const team of game % 2 ? [1, 0] : [0, 1]) controllers[team].update(state);
      S.tick(state, 0.1);
      reportReplay(replay.seed, step, state, controllers);
      if (firstExpansion === null && state.mines.some((mine, index) => index >= 2 && mine.owner === strongTeam && mine.depot)) {
        firstExpansion = state.time;
      }
      if (strong === 'difficile') {
        if (state.time >= 180 && state.time <= 480) {
          rubySum += state.rubies[strongTeam];
          samples++;
        }
      }
    }
    if (replay.seed !== null) {
      console.log(`expansion ${game + 1}: ${firstExpansion === null ? null : firstExpansion.toFixed(1)}`);
    }
    assert.notEqual(state.winner, null, `${strong}/${weak}, game ${game}: no winner after 25 minutes`);
    if (state.winner === strongTeam) victories++;
    if (strong === 'difficile') {
      if (firstExpansion !== null && firstExpansion < 240) earlyExpansions++;
      if (state.time > 720 && state.winner !== strongTeam) {
        assert(controllers[strongTeam].metrics.waves >= 3, `Only ${controllers[strongTeam].metrics.waves} waves in ${state.time}s`);
      }
      if (samples) assert(rubySum / samples < 250, `Game ${game}: average bank ${rubySum / samples}`);
      bankSum += rubySum;
      bankSamples += samples;
    }
    results[game] = { game: game + 1, seconds: Math.round(state.time), winner: state.winner === strongTeam ? strong : weak };
  }
  console.table(results);
  if (replay.seed !== null) {
    return;
  }
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

if (replay.seed === null) {
  // Fixed orders only: the push trigger is the placement of the second depot.
  // Neither opponent uses createAI or reads hidden units.
  function scriptedOpponent(team, strategy) {
    let nextOrder = 0;
    let expansionWorker = null;
    let attack = null;
    const sent = new Set();
    return {
      update(state) {
        if (state.time < nextOrder) return;
        nextOrder = state.time + 0.5;
        const own = state.units.filter((unit) => unit.team === team);
        const workers = own.filter((unit) => unit.type === 'commis');
        const army = own.filter((unit) => unit.type !== 'commis');
        const mines = state.mines.filter((mine) => mine.owner === team);
        const workerTarget = strategy === 'rush' ? 5 : mines.length * 5;
        const queuedWorkers = state.queues[team].filter((job) => job.type === 'commis').length;
        if (workers.length + queuedWorkers < workerTarget) S.recruit(state, 'commis', team);
        for (const worker of workers) {
          if (worker.id === expansionWorker || worker.harvest) continue;
          const destination = mines.find((mine) => workers.filter((other) => other.harvest?.mine === state.mines.indexOf(mine)).length < 5);
          if (destination) S.gather(state, team, [worker.id], state.mines.indexOf(destination));
        }
        if (strategy === 'push' && state.time >= 120 && mines.length < 2) {
          const destination = state.mines.map((mine, index) => ({ mine, index }))
            .filter(({ index }) => index >= 2)
            .sort((a, b) => Math.hypot(a.mine.x - state.bases[team].x, a.mine.y - state.bases[team].y) - Math.hypot(b.mine.x - state.bases[team].x, b.mine.y - state.bases[team].y))[0];
          const worker = workers.find((unit) => unit.id === expansionWorker) || workers[0];
          if (worker) {
            expansionWorker = worker.id;
            if (S.build(state, team, destination.index)) {
              S.gather(state, team, [worker.id], destination.index);
              expansionWorker = null;
            } else if (worker.harvest || !worker.path.length) {
              S.order(state, [worker.id], destination.mine.x, destination.mine.y, null, true);
            }
          }
        }
        const order = BUILD_ORDERS[team];
        const buildingCount = strategy === 'rush' ? 1 : 2;
        for (const building of order.slice(0, buildingCount)) {
          if (!S.producers(state, team, building.unit).length) S.construct(state, team, building.id);
          for (const producer of S.producers(state, team, building.unit)) {
            if (!state.queues[team].some((job) => job.producerId === producer.id)) S.recruit(state, building.unit, team, producer.id);
          }
        }
        if (!attack) {
          if (strategy === 'rush' && state.time >= 150) attack = state.bases[1 - team];
          if (strategy === 'push') {
            attack = state.mines.find((mine, index) => index >= 2 && mine.owner === 1 - team && mine.depot) || null;
          }
        }
        for (const unit of army) {
          if (!attack) continue;
          const visibleWorkers = state.units.filter((enemy) => enemy.team !== team && S.canSee(state, team, enemy) && enemy.type === 'commis' && Math.hypot(enemy.x - attack.x, enemy.y - attack.y) < 300);
          const target = visibleWorkers[0];
          if (target && unit.target !== target) {
            S.order(state, [unit.id], target.x, target.y, target, false);
          } else if (!sent.has(unit.id) || !unit.path.length && !unit.target) {
            const goal = strategy === 'push' && !visibleWorkers.length && sent.has(unit.id) ? state.bases[1 - team] : attack;
            S.order(state, [unit.id], goal.x, goal.y, null, false);
            sent.add(unit.id);
          }
        }
      },
    };
  }

  for (const strategy of ['rush', 'push']) {
    let victories = 0;
    seed = 57;
    for (let game = 0; game < 10; game++) {
      const state = S.create();
      const team = game % 2;
      for (const unit of state.units) {
        const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
        unit.x = (cell % S.COLS) * S.CELL + 10;
        unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
      }
      S.visibility(state);
      const brutal = createAI(team, 'brutal');
      const opponent = scriptedOpponent(1 - team, strategy);
      let economyChecked = false;
      for (let step = 0; step < 15000 && state.winner === null; step++) {
        const controllers = team ? [opponent, brutal] : [brutal, opponent];
        for (const index of game % 2 ? [1, 0] : [0, 1]) controllers[index].update(state);
        S.tick(state, 0.1);
        if (!economyChecked && state.time >= 240) {
          economyChecked = true;
          if (strategy === 'push') {
            const counts = [0, 1].map((owner) => state.units.filter((unit) => unit.team === owner && unit.type === 'commis').length);
            assert(counts[team] >= counts[1 - team], `Push ${game}: workers ${counts}`);
          }
        }
      }
      assert.notEqual(state.winner, null, `${strategy} ${game}: unfinished match`);
      if (state.winner === team) victories++;
      console.log(`${strategy} ${game}: ${state.time.toFixed(1)}s, ${state.winner === team ? 'brutal' : 'script'}`);
    }
    assert(victories >= 8, `Brutal won ${victories}/10 against ${strategy}`);
  }

  // With no rush to repel, both factions launch a real first wave before 4 min.
  for (const team of [0, 1]) {
    const state = S.create();
    const controller = createAI(team, 'brutal');
    while (state.time < 240 && controller.metrics.waves === 0) {
      controller.update(state);
      S.tick(state, 0.1);
    }
    assert(controller.metrics.waves > 0);
    assert(controller.metrics.waveSizes[0] >= 7);
    assert(state.time < 240);
  }

  // Brutal delays its expansion without defenders, even with money to pay.
  {
    const state = S.create();
    state.time = 120;
    state.rubies[0] = 1000;
    const controller = createAI(0, 'brutal');
    controller.update(state);
    assert(state.units.filter((unit) => unit.team === 0).every((worker) => worker.harvest || worker.retreat));
    assert.equal(controller.metrics.expansions.length, 0);
  }

  // A scout that sees the enemy base returns to paid work rather than attacking.
  {
    const state = S.create();
    state.time = 60;
    const controller = createAI(0, 'brutal');
    controller.update(state);
    const scout = state.units.find((unit) => unit.team === 0 && unit.retreat && !unit.harvest);
    assert(scout);
    scout.x = state.bases[1].x;
    scout.y = state.bases[1].y;
    scout.path = [];
    S.visibility(state);
    state.time = 61;
    controller.update(state);
    assert.equal(controller.intelligence.bases.length, 1);
    assert.equal(scout.harvest?.mine, 0);
  }

  // Harvesting is parallel: five workers really yield more than the old three.
  for (const team of [0, 1]) {
    const income = [];
    for (const count of [3, 5]) {
      const state = S.create();
      for (let index = 1; index < count; index++) S.spawn(state, 'commis', team);
      const workers = state.units.filter((unit) => unit.team === team);
      S.gather(state, team, workers.map((worker) => worker.id), team);
      while (state.time < 60) S.tick(state, 0.1);
      income.push(state.rubies[team]);
    }
    assert(income[1] > income[0]);
  }

  // A visibly destroyed army opens an immediate counterattack, before the timer.
  {
    const state = S.create();
    state.units = [];
    for (let index = 0; index < 8; index++) S.spawn(state, 'knight', 0);
    for (let index = 0; index < 3; index++) S.spawn(state, 'knight', 1);
    for (const unit of state.units) {
      unit.x = state.bases[0].x + (unit.team ? 160 : 110);
      unit.y = state.bases[0].y - 65;
      unit.path = [];
    }
    state.rubies[0] = 0;
    state.time = 60;
    S.visibility(state);
    const controller = createAI(0, 'brutal');
    controller.update(state);
    assert.equal(controller.metrics.waves, 0);
    state.units = state.units.filter((unit) => unit.team === 0);
    S.visibility(state);
    state.time = 61;
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert(controller.metrics.waveSizes[0] >= 5);
  }

  // An outmatched expansion evacuates its workers and recalls distant defenders.
  {
    const state = S.create();
    const worker = state.units.find((unit) => unit.team === 0);
    worker.x = state.mines[3].x;
    worker.y = state.mines[3].y;
    state.rubies[0] = 1000;
    assert(S.build(state, 0, 3));
    S.gather(state, 0, [worker.id], 3);
    S.spawn(state, 'knight', 0);
    for (let index = 0; index < 5; index++) S.spawn(state, 'knight', 1);
    for (const unit of state.units.filter((unit) => unit.team === 1 && unit.type === 'knight')) {
      unit.x = worker.x + 60;
      unit.y = worker.y;
      unit.path = [];
    }
    state.time = 140;
    S.visibility(state);
    createAI(0, 'brutal').update(state);
    assert.equal(worker.harvest, null);
    assert(worker.retreat);
    assert(worker.path.length > 0);
    const defender = state.units.find((unit) => unit.team === 0 && unit.type === 'knight');
    assert(defender.path.length > 0);
    assert(defender.attackDestination);
    assert(Math.hypot(defender.attackDestination.x - state.mines[3].x, defender.attackDestination.y - state.mines[3].y) < 100);
  }

}
