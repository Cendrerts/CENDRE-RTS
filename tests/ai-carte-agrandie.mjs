import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// Each team captures its own nearest expansion before any exposed site.
for (const team of [0, 1]) {
  const state = Sim.create();
  const natural = state.mines.map((mine, index) => ({ ...mine, index }))
    .filter((mine) => mine.index >= 2)
    .sort((a, b) => Math.hypot(a.x - state.bases[team].x, a.y - state.bases[team].y) - Math.hypot(b.x - state.bases[team].x, b.y - state.bases[team].y))[0];
  const worker = state.units.find((unit) => unit.team === team);
  worker.x = natural.x;
  worker.y = natural.y;
  worker.harvest = null;
  state.rubies[team] = 1000;
  state.time = 150;
  Sim.visibility(state);
  const controller = createAI(team, 'difficile');
  controller.update(state);
  assert.equal(state.mines[natural.index].owner, team);
  assert.equal(controller.metrics.expansions.length, 1);
}

// Visible resistance selects each of the three public approaches. Hidden
// troops must not affect the decision. Check both directions of travel.
for (const team of [0, 1]) {
  for (const expected of ['centre', 'nord', 'sud']) {
    const state = Sim.create();
    state.units = [];
    const base = state.bases[team];
    for (let index = 0; index < 24; index++) {
      Sim.spawn(state, 'knight', team);
      const unit = state.units.at(-1);
      unit.x = base.x + (team ? -110 : 110);
      unit.y = base.y + (team ? 65 : -65);
      unit.path = [];
    }
    for (const lane of Sim.lanes.filter((lane) => lane.name !== expected)) {
      const [x, y] = lane.points[lane.name === 'centre' ? 5 : 6];
      for (let index = 0; index < 8; index++) {
        Sim.spawn(state, 'knight', 1 - team);
        const enemy = state.units.at(-1);
        enemy.x = x;
        enemy.y = y;
      }
    }
    state.rubies[team] = 0;
    state.time = 240;
    state.visible[team].fill(1);
    const controller = createAI(team, 'brutal');
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert.equal(controller.metrics.lanes[0], expected);
    const attackers = state.units.filter((unit) => unit.team === team).slice(2);
    if (expected !== 'centre') {
      assert(attackers.every((unit) => unit.orderQueue.length > 0));
    }
    // Ninety seconds is no longer a reason to recall troops still travelling.
    state.time = 331;
    state.visible[team].fill(0);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert(attackers.every((unit) => !unit.retreat && unit.orderQueue.length > 0), 'La vague poursuit ses points de passage après 90 secondes');
  }
}
// A losing army in the middle of the enlarged map retreats all the way
// to its own base, using traversable paths in both directions.
for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  Sim.spawn(state, 'knight', team);
  for (let index = 0; index < 8; index++) {
    Sim.spawn(state, 'knight', 1 - team);
  }
  for (const [index, unit] of state.units.entries()) {
    unit.x = 2000 + index * 10;
    unit.y = 1100;
    unit.path = [];
  }
  state.rubies[team] = 0;
  Sim.visibility(state);
  createAI(team, 'difficile').update(state);
  const unit = state.units[0];
  assert(unit.retreat);
  const destination = unit.path.at(-1);
  assert(Math.hypot(destination.x - state.bases[team].x, destination.y - state.bases[team].y) < 200);
}

// Mature waves must attack the enemy base even with nearer known depots.
{
  const state = Sim.create();
  state.units = [];
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.mines[2].owner = 1;
  state.mines[2].depot = true;
  state.rubies[0] = 0;
  state.time = 480;
  state.visible[0].fill(1);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  const lane = Sim.lanes.find((candidate) => candidate.name === controller.metrics.lanes[0]);
  for (const [x, y] of lane.points.slice(1, -1)) {
    for (const unit of state.units) {
      unit.x = x;
      unit.y = y;
      unit.path = [];
    }
    Sim.tick(state, 0.05);
    state.time++;
    controller.update(state);
  }
  assert(state.units.every((unit) => unit.orderQueue.some((point) =>
    Math.hypot(point.x - state.bases[1].x, point.y - state.bases[1].y) < 200)));
}

// Streaming reinforcements require Brutal, the population cap and 720 seconds.
for (const [difficulty, time, capped, expected] of [
  ['normal', 800, true, false],
  ['difficile', 800, true, false],
  ['brutal', 718, true, false],
  ['brutal', 800, false, false],
  ['brutal', 720, true, true],
  ['impitoyable', 720, true, true],
]) {
  const state = Sim.create();
  state.units = [];
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.rubies[0] = 0;
  state.time = time;
  state.visible[0].fill(0);
  const controller = createAI(0, difficulty);
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  Sim.spawn(state, 'knight', 0);
  const reinforcement = state.units.at(-1);
  reinforcement.x = 2000;
  reinforcement.y = 1100;
  reinforcement.path = [];
  if (capped) {
    while (state.units.length + state.queues[0].length < Sim.unitLimit(0)) {
      state.queues[0].push({ type: 'knight' });
    }
  }
  state.time++;
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  assert.equal(reinforcement.orderQueue.length > 0, expected,
    `${difficulty} at ${state.time}s, capped=${capped}: streaming reinforcements`);
}

// A raid on an undefended expansion evacuates workers and recalls the army.
{
  const state = Sim.create();
  const worker = state.units.find((unit) => unit.team === 0);
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.rubies[0] = 0;
  state.time = 240;
  state.visible[0].fill(0);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  const army = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
  const destinations = army.map((unit) => ({ ...unit.attackDestination }));
  const mine = state.mines[2];
  mine.owner = 0;
  mine.depot = true;
  worker.x = mine.x;
  worker.y = mine.y;
  for (let index = 0; index < 5; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = mine.x + 60;
    enemy.y = mine.y;
  }
  state.time = 241;
  Sim.visibility(state);
  controller.update(state);
  assert(worker.retreat);
  assert(army.some((unit, index) => unit.attackDestination?.x !== destinations[index].x || unit.attackDestination?.y !== destinations[index].y));
}

// An outnumbered mature assault must not force a siege of the main.
for (const [team, time] of [[0, 240], [1, 240], [0, 480], [1, 480]]) {
  const state = Sim.create();
  state.units = [];
  const enemyBase = state.bases[1 - team];
  for (let index = 0; index < 4; index++) {
    Sim.spawn(state, 'archer', team);
    const unit = state.units.at(-1);
    unit.x = enemyBase.x + (team ? 150 : -150);
    unit.y = enemyBase.y;
    unit.path = [];
  }
  for (let index = 0; index < 8; index++) {
    Sim.spawn(state, 'knight', 1 - team);
    const unit = state.units.at(-1);
    unit.x = enemyBase.x + (team ? 180 : -180);
    unit.y = enemyBase.y;
    unit.path = [];
  }
  state.time = time;
  state.rubies[team] = 0;
  Sim.visibility(state);
  const controller = createAI(team, 'brutal');
  controller.metrics.waves = 2;
  controller.update(state);
  const attackers = state.units.filter((unit) => unit.team === team);
  assert(attackers.every((unit) => unit.target !== enemyBase));
}

// An unseen blockade cannot affect the choice of a shorter flank.
{
  const state = Sim.create();
  state.units = [];
  for (let index = 0; index < 24; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  for (let index = 0; index < 12; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = 2000;
    enemy.y = 1100;
  }
  state.rubies[0] = 0;
  state.time = 240;
  state.visible[0].fill(0);
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.lanes[0], 'nord');
}
console.log('PASS: natural expansions, three attack lanes, fog and long-distance wave timing.');

// The map issue excludes long tournaments; keep their default execution intact.
if (process.argv.includes('--short')) {
  console.log('SKIP: tournois longs (mode --short, suivi #113).');
  process.exit(0);
}

// Reproduce the blocked tournament seeds, including faction and update order.
const directory = await mkdtemp(join(tmpdir(), 'cendre-map-ai-'));
try {
  for (const file of ['sim.js', 'ai.js', 'ai-config.js', 'slots.js', 'rats-config.js', 'cooks-config.js']) {
    let source = await readFile(new URL('../public/game/' + file, import.meta.url), 'utf8');
    if (file === 'sim.js') {
      source = source.replace("import { BrigadeCuisine } from './cooks-config.js';", "import { RatsGout as BrigadeCuisine } from './rats-config.js';");
      source = source.replace("import { RatsGout } from './rats-config.js';", "import { BrigadeCuisine as RatsGout } from './cooks-config.js';");
    }
    await writeFile(join(directory, file), source);
  }
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const { CendreSim: reversedSim } = await import(pathToFileURL(join(directory, 'sim.js')));
  const { createAI: reversedAI } = await import(pathToFileURL(join(directory, 'ai.js')));
  const results = [];
  for (const initialSeed of [19, 22]) {
    const reversed = initialSeed % 2 === 1;
    const sim = reversed ? reversedSim : Sim;
    const ai = reversed ? reversedAI : createAI;
    let seed = initialSeed;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const state = sim.create();
    const startDelays = [random() * 4, random() * 4];
    for (const unit of state.units.filter((unit) => unit.type === 'commis')) {
      const cell = sim.nearest(unit.x + random() * 120 - 60, unit.y + random() * 120 - 60);
      unit.x = (cell % sim.COLS) * sim.CELL + 10;
      unit.y = Math.floor(cell / sim.COLS) * sim.CELL + 10;
    }
    sim.visibility(state);
    const controllers = [0, 1].map((team) => ai(team, 'brutal'));
    for (let step = 0; step < 18000 && state.winner === null; step++) {
      for (const team of reversed ? [1, 0] : [0, 1]) {
        if (state.time >= startDelays[team]) {
          controllers[team].update(state);
        }
      }
      sim.tick(state, 0.1);
    }
    results.push({ seed: initialSeed, winner: state.winner, time: state.time });
    console.log(`Seed ${initialSeed}: winner ${state.winner}, ${state.time.toFixed(1)}s.`);
  }
  for (const result of results) {
    assert.notEqual(result.winner, null, `Seed ${result.seed}: no winner within 30 minutes`);
    assert(result.time < 1800, `Seed ${result.seed}: match must finish before 30 minutes`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

// A rich, population-capped Brutal mirror must make room for its army.
{
  const state = Sim.create();
  // Keep this economy benchmark free of neutral hunting losses. Real camps
  // remain enabled in the seeded matches above and scripts/monstres-duels.mjs.
  state.monsters = [];
  state.camps = [];
  const controllers = [0, 1].map((team) => createAI(team, 'brutal'));
  const surplusSince = [null, null];
  const checked = [false, false];
  let largestArmy = 0;
  for (let step = 0; step < 18000 && state.winner === null; step++) {
    for (const team of [0, 1]) {
      controllers[team].update(state);
      const units = state.units.filter((unit) => unit.team === team && unit.hp > 0);
      const queue = state.queues[team];
      const workers = units.filter((unit) => unit.type === 'commis').length + queue.filter((job) => job.type === 'commis').length;
      largestArmy = Math.max(largestArmy, units.filter((unit) => unit.type !== 'commis').length);
      if (state.time >= 720 && units.length + queue.length >= (Sim.unitLimit?.(team) ?? 30) && state.rubies[team] >= 1000 && surplusSince[team] === null) {
        surplusSince[team] = state.time;
      }
      if (state.rubies[team] < 400) surplusSince[team] = null;
      if (surplusSince[team] !== null && state.time >= surplusSince[team] + 30) {
        assert(workers <= 10, `Team ${team}: ${workers} living or queued workers after 30s of surplus`);
        checked[team] = true;
      }
    }
    Sim.tick(state, 0.1);
  }
  assert(largestArmy > 14, `Brutal mirror: army never exceeded 14 (${largestArmy})`);
  console.log(`Brutal mirror: largest army ${largestArmy}, surplus checks ${checked.join('/')}.`);
}
