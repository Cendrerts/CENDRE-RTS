import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Same seeded starts and side/decision-order alternation as issue #66.
// Isolated modules keep test-only faction settings out of the game configs.
for (const horde of [false, true]) {
  const directory = await mkdtemp(join(tmpdir(), 'cendre-no-stall-'));
  try {
    const variants = [];
    for (const reversed of [false, true]) {
      const variant = join(directory, reversed ? 'reversed' : 'normal');
      await mkdir(variant);
      for (const file of ['sim.js', 'ai.js', 'ai-config.js', 'slots.js', 'rats-config.js', 'cooks-config.js']) {
        let source = await readFile(new URL('../public/game/' + file, import.meta.url), 'utf8');
        if (horde && file === 'rats-config.js') {
          source = source.replace('export const RatsGout = {', 'export const RatsGout = {\n  unitLimit: 45,');
          for (const [before, after] of [[60, 36], [75, 45], [100, 60]]) {
            source = source.replace(`cost: ${before},`, `cost: ${after},`);
          }
        }
        if (horde && file === 'cooks-config.js') {
          source = source.replace('export const BrigadeCuisine = {', 'export const BrigadeCuisine = {\n  unitLimit: 30,');
        }
        if (horde && file === 'sim.js') {
          // Main currently has a fixed cap; emulate #66's faction cap only here.
          assert(source.includes('s.units.filter((unit) => unit.team === team).length + queue.length < populationCap(s, team)'));
          source = source.replace('export function populationCap(state, team) {\n  return 30;', 'export function populationCap(state, team) {\n  return unitLimit(team);');
          source = source.replace('function stats(type, team) {', 'function unitLimit(team) {\n  return (team === 1 ? RatsGout : BrigadeCuisine).unitLimit;\n}\nfunction stats(type, team) {');
          source = source.replace('  stats,', '  unitLimit,\n  stats,');
        }
        if (reversed && file === 'sim.js') {
          source = source.replace("import { BrigadeCuisine } from './cooks-config.js';", "import { RatsGout as BrigadeCuisine } from './rats-config.js';");
          source = source.replace("import { RatsGout } from './rats-config.js';", "import { BrigadeCuisine as RatsGout } from './cooks-config.js';");
        }
        await writeFile(join(variant, file), source);
      }
      await writeFile(join(variant, 'package.json'), '{"type":"module"}');
      variants.push({
        sim: (await import(pathToFileURL(join(variant, 'sim.js')))).CendreSim,
        ai: (await import(pathToFileURL(join(variant, 'ai.js')))).createAI,
      });
    }
    const [{ sim: normalSim, ai: normalAI }, { sim: reversedSim, ai: reversedAI }] = variants;
    console.log(horde ? 'Horde: cap 45, costs 36/45/60' : 'Current main settings');
    // The emergency order bypasses assembly and includes already deployed
    // troops. Both the bank and the military-capacity triggers are exercised.
    for (const { sim, ai } of variants) {
      for (const difficulty of ['facile', 'normal', 'difficile', 'brutal']) {
        for (const rich of [false, true]) {
          const state = sim.create();
          const count = rich ? 4 : (sim.unitLimit?.(0) ?? 30) - 1;
          for (let index = 0; index < count; index++) sim.spawn(state, 'knight', 0);
          for (const unit of state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis')) {
            unit.x = 850;
            unit.y = 450;
            unit.path = [];
          }
          state.rubies[0] = rich ? 800 : 0;
          state.time = 120;
          // No observed targets: the public enemy start is the fallback.
          state.visible[0].fill(0);
          const controller = ai(0, difficulty);
          controller.update(state);
          assert.equal(controller.metrics.waves, 1, `${difficulty}: emergency wave`);
          assert.equal(controller.metrics.waveSizes[0], count);
          const troops = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
          for (const unit of troops) {
            assert.equal(unit.retreat, false);
            assert(unit.path.length > 0);
            assert(Math.hypot(unit.attackDestination.x - state.bases[1].x, unit.attackDestination.y - state.bases[1].y) < 200);
          }
        }
      }
      // Defense and a pending retreat must not veto the emergency order.
      // Leave the two guards home and target the nearest observed structure.
      {
        const state = sim.create();
        for (let index = 0; index < 8; index++) sim.spawn(state, 'knight', 0);
        sim.spawn(state, 'knight', 1);
        const invader = state.units.find((unit) => unit.team === 1 && unit.type === 'knight');
        invader.x = state.bases[0].x + 100;
        invader.y = state.bases[0].y;
        assert(sim.construct(state, 1, 'niche_ordures'));
        state.rubies[0] = 1000;
        state.time = 120;
        state.visible[0].fill(1);
        const expected = [...state.slots[1].filter((slot) => slot.occupe), state.bases[1]]
          .sort((a, b) => Math.hypot(a.x - state.bases[0].x, a.y - state.bases[0].y) - Math.hypot(b.x - state.bases[0].x, b.y - state.bases[0].y))[0];
        const orders = [];
        const originalOrder = sim.order;
        sim.order = (...args) => {
          orders.push(args);
          return originalOrder(...args);
        };
        try {
          const controller = ai(0, 'brutal');
          controller.update(state);
          assert.equal(controller.metrics.waves, 1);
          assert.equal(controller.metrics.waveSizes[0], 6);
          const [, ids, x, y, target, retreat] = orders.at(-1);
          const army = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
          assert.deepEqual(ids, army.slice(2).map((unit) => unit.id));
          assert.equal(x, expected.x);
          assert.equal(y, expected.y);
          assert.equal(target, null);
          assert.equal(retreat, false);
          state.time = 121;
          controller.update(state);
          assert.equal(controller.metrics.waves, 1, 'Emergency timer resets after the wave');
          // Capturing a site can remove its slots entirely. Once the site is
          // visible again, a removed building must no longer attract a wave.
          state.slots[1] = state.slots[1].filter((slot) => !slot.occupe);
          state.visible[0].fill(1);
          state.rubies[0] = 1000;
          state.time = 240;
          controller.update(state);
          assert.equal(controller.metrics.waves, 2);
          assert.equal(orders.at(-1)[2], state.bases[1].x);
          assert.equal(orders.at(-1)[3], state.bases[1].y);
        } finally {
          sim.order = originalOrder;
        }
      }
      // Income may exceed throughput before the population cap is reached.
      {
        const state = sim.create();
        state.rubies[0] = 10000;
        for (const type of ['garde_manger', 'boucherie', 'ecole_brigade', 'boucherie', 'boucherie']) {
          assert(sim.construct(state, 0, type));
        }
        state.rubies[0] = 1600;
        ai(0, 'brutal').update(state);
        assert(state.slots[0].filter((slot) => slot.occupe).length > 5, 'Rich AI scales throughput even below the population cap');
      }
      // Extra production sites keep the existing economy population budget.
      {
        const state = sim.create();
        state.rubies[0] = 10000;
        const worker = state.units.find((unit) => unit.team === 0);
        for (const index of [2, 3, 4]) {
          worker.x = state.mines[index].x;
          worker.y = state.mines[index].y;
          assert(sim.build(state, 0, index));
        }
        for (let index = 1; index < 16; index++) sim.spawn(state, 'commis', 0);
        ai(0, 'brutal').update(state);
        assert(!state.queues[0].some((job) => job.type === 'commis'), 'A fourth site must not consume the military population budget');
      }
      const state = sim.create();
      const limit = sim.unitLimit?.(0) ?? 30;
      for (let index = 1; index < limit; index++) sim.spawn(state, 'knight', 0);
      state.rubies[0] = 1000;
      ai(0, 'brutal').update(state);
      assert(state.slots[0].filter((slot) => slot.occupe).length >= 2, 'Full population invests surplus in production');
      // If every slot is filled, an expansion opens new production capacity.
      {
        const state = sim.create();
        state.rubies[0] = 10000;
        while (sim.construct(state, 0, 'garde_manger')) {
          // Fill only the existing site's legal slots, paying each cost.
        }
        const limit = sim.unitLimit?.(0) ?? 30;
        for (let index = 1; index < limit; index++) sim.spawn(state, 'knight', 0);
        const worker = state.units.find((unit) => unit.team === 0 && unit.type === 'commis');
        worker.x = state.mines[3].x;
        worker.y = state.mines[3].y;
        sim.visibility(state);
        state.rubies[0] = 900;
        state.time = 300;
        const controller = ai(0, 'brutal');
        controller.update(state);
        assert.equal(state.mines[3].owner, 0);
        assert(state.mines[3].depot);
        assert.equal(controller.metrics.expansions.length, 1);
        assert(state.slots[0].some((slot) => !slot.occupe));
        assert(state.rubies[0] < 900);
      }
    }
    const wins = { cooks: 0, rats: 0, timeout: 0 };
    const outcomes = new Set();
    const timeoutSeeds = [];
    const hoarding = [];
    let totalWaves = 0;
    for (let game = 0; game < 20; game++) {
      const reversed = game % 2 === 1;
      const sim = reversed ? reversedSim : normalSim;
      const ai = reversed ? reversedAI : normalAI;
      const ratsTeam = reversed ? 0 : 1;
      assert.equal(sim.unitLimit?.(ratsTeam) ?? 30, horde ? 45 : 30);
      assert.equal(sim.unitLimit?.(1 - ratsTeam) ?? 30, 30);
      for (const [type, cost] of Object.entries(horde ? { knight: 36, archer: 45, mage: 60 } : { knight: 60, archer: 75, mage: 100 })) {
        assert.equal(sim.stats(type, ratsTeam).cost, cost);
      }
      const initialSeed = 18 + game;
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
      const bankSince = [null, null];
      const longestBank = [0, 0];
      for (let step = 0; step < 12000 && state.winner === null; step++) {
        for (const team of reversed ? [1, 0] : [0, 1]) {
          if (state.time >= startDelays[team]) {
            controllers[team].update(state);
          }
        }
        sim.tick(state, 0.1);
        for (const team of [0, 1]) {
          if (state.rubies[team] > 1500) {
            bankSince[team] ??= state.time;
            longestBank[team] = Math.max(longestBank[team], state.time - bankSince[team]);
          } else {
            bankSince[team] = null;
          }
        }
      }
      totalWaves += controllers.reduce((sum, controller) => sum + controller.metrics.waves, 0);
      if (longestBank.some((seconds) => seconds > 60)) hoarding.push({ seed: initialSeed, longestBank });
      const winner = state.winner === null ? 'timeout' : state.winner === ratsTeam ? 'rats' : 'cooks';
      console.log(`Seed ${18 + game}: ${winner}, ${state.time.toFixed(1)}s, rats team ${ratsTeam}, rubies ${state.rubies.map(Math.round).join('/')}, waves ${controllers.map((controller) => controller.metrics.waves).join('/')}, bank seconds ${longestBank.map(Math.round).join('/')}`);
      outcomes.add(`${winner}:${Math.round(state.time)}`);
      if (state.winner === null) {
        timeoutSeeds.push(initialSeed);
      }
      assert(state.time <= 1200 + 1e-6);
      wins[winner]++;
    }
    console.log(`Tournament: rats ${wins.rats}/20, cooks ${wins.cooks}/20, timeouts ${wins.timeout}, distinct outcomes ${outcomes.size}/20, timeout seeds: ${timeoutSeeds.join(', ') || 'none'}`);
    console.log(`Mean waves per game: ${totalWaves / 20}; hoarding: ${JSON.stringify(hoarding)}`);
    assert(outcomes.size >= 16, `Only ${outcomes.size}/20 distinct games`);
    assert.equal(wins.timeout, 0, `Timeout seeds: ${timeoutSeeds.join(', ')}`);
    assert.deepEqual(hoarding, [], 'No bank above 1500 rubies for more than 60 consecutive seconds');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
