import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

assert.equal(S.unitLimit(0), 30);
assert.equal(S.unitLimit(1), 45);
for (const [type, cost] of Object.entries({ commis: 40, knight: 36, archer: 45, mage: 60 })) {
  assert.equal(S.stats(type, 1).cost, cost);
}

// Recruitment counts both living units and reserved queue places.
for (const team of [0, 1]) {
  const state = S.create();
  state.rubies[team] = 10000;
  while (state.units.filter((unit) => unit.team === team).length < S.unitLimit(team) - 1) {
    S.spawn(state, 'commis', team);
  }
  assert(S.recruit(state, 'commis', team));
  assert(!S.recruit(state, 'commis', team));
  S.tick(state, 5);
  assert.equal(state.units.filter((unit) => unit.team === team).length, S.unitLimit(team));
  assert(!S.recruit(state, 'commis', team));
}

// Factions are bound to team IDs in production. Load an isolated copy with the
// two config imports exchanged to test each faction in each starting position.
// Simulation, AI, map and combat rules otherwise remain identical.
const directory = await mkdtemp(join(tmpdir(), 'cendre-balance-'));
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
  const wins = { cooks: 0, rats: 0 };
  for (let game = 0; game < 10; game++) {
    const reversed = game % 2 === 1;
    const sim = reversed ? reversedSim : S;
    const ai = reversed ? reversedAI : createAI;
    const ratsTeam = reversed ? 0 : 1;
    assert.equal(sim.unitLimit(ratsTeam), 45);
    assert.equal(sim.unitLimit(1 - ratsTeam), 30);
    let seed = 18 + game;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const state = sim.create();
    for (const unit of state.units) {
      const cell = sim.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
      unit.x = (cell % sim.COLS) * sim.CELL + 10;
      unit.y = Math.floor(cell / sim.COLS) * sim.CELL + 10;
    }
    sim.visibility(state);
    const controllers = [0, 1].map((team) => ai(team, 'brutal'));
    for (let step = 0; step < 12000 && state.winner === null; step++) {
      for (const team of reversed ? [1, 0] : [0, 1]) controllers[team].update(state);
      sim.tick(state, 0.1);
    }
    const winner = state.winner === null ? 'timeout' : state.winner === ratsTeam ? 'rats' : 'cooks';
    console.log(`Seed ${18 + game}: ${winner}, ${state.time.toFixed(1)}s, rats team ${ratsTeam}, rubies ${state.rubies.map(Math.round).join('/')}`);
    assert.notEqual(state.winner, null, `Seed ${18 + game}: no winner within 20 simulated minutes`);
    assert(state.time <= 1200 + 1e-6);
    wins[winner]++;
  }
  assert(wins.rats >= 4 && wins.rats <= 6, `Rats win ${wins.rats}/10; expected 4–6 (${JSON.stringify(wins)})`);
  console.log('PASS: Brutal tournament balanced 4–6, faction population caps and military costs.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
