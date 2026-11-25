import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pack } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { createMatch } from '../scripts/ia-diagnostic.mjs';
import { loadedScenario } from '../scripts/render-scenario.mjs';

const directory = await mkdtemp(join(tmpdir(), 'cendre-sim-identique-'));
try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main', 'public/game/'], { encoding: 'utf8' }).trim().split('\n');
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const source = execFileSync('git', ['show', `origin/main:${file}`]);
    await writeFile(join(directory, file.slice('public/game/'.length)), source);
  }
  // Use the branch's AI on both sides so the test only compares the simulations.
  for (const file of ['ai.js', 'ai-config.js']) {
    const source = await readFile(new URL(`../public/game/${file}`, import.meta.url));
    await writeFile(join(directory, file), source);
  }
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const { CendreSim: Reference } = await import(pathToFileURL(join(directory, 'sim.js')));
  const { createAI: referenceAI } = await import(pathToFileURL(join(directory, 'ai.js')));
  // La comparaison avec une référence antérieure à D66 garde la pose instantanée.
  // construction.mjs vérifie le nouveau comportement en simulation normale.
  if (!Reference.isUnderConstruction) {
    const construct = Sim.construct;
    Sim.construct = (state, team, ...args) => {
      const placed = construct(state, team, ...args);
      if (placed) {
        const slot = state.slots[team].find((item) => Sim.isUnderConstruction(state, item));
        delete slot.batiment.readyAt;
      }
      return placed;
    };
  }

  // Les rangs sont déjà débloqués pour comparer le combat et les ordres avec
  // une référence antérieure à D67. tour-principale.mjs teste les montées.
  Reference.constructionTierReason ??= () => null;
  const unlockAllRanks = (state) => {
    for (const base of state.bases) base.niveau = 3;
  };
  const referenceLoaded = loadedScenario(Reference);
  const loaded = loadedScenario(Sim);
  unlockAllRanks(referenceLoaded);
  unlockAllRanks(loaded);
  const identical = (actual, expected, label) => {
    // Compare the entire serializable state, including visibility, events,
    // target references, positions, resources and winner, without rounding.
    assert.equal(pack(actual), pack(expected), label);
  };
  identical(loaded, referenceLoaded, 'loadedScenario initial');
  for (let tick = 1; tick <= 1200; tick++) {
    Sim.tick(loaded, 1 / 60);
    Reference.tick(referenceLoaded, 1 / 60);
    if (tick % 60 === 0) {
      identical(loaded, referenceLoaded, `loadedScenario tick ${tick}`);
    }
  }
  const { state, delays } = createMatch(18, false);
  unlockAllRanks(state);
  // Les tours survivent à la première percée pour comparer les cinq minutes.
  for (const base of state.bases) {
    base.hp = 1000000;
    base.max = base.hp;
  }
  const referenceState = structuredClone(state);
  const controllers = [0, 1].map((team) => createAI(team, 'brutal', state));
  const referenceControllers = [0, 1].map((team) => referenceAI(team, 'brutal', referenceState));
  identical(state, referenceState, 'Brutal initial');
  for (let step = 1; step <= 3000; step++) {
    for (const team of [0, 1]) {
      if (state.time >= delays[team]) {
        controllers[team].update(state);
      }
      if (referenceState.time >= delays[team]) {
        referenceControllers[team].update(referenceState);
      }
    }
    Sim.tick(state, 0.1);
    Reference.tick(referenceState, 0.1);
    if (step % 600 === 0) {
      identical(state, referenceState, `Brutal minute ${step / 600}`);
    }
  }
  assert.ok(state.time >= 300 - 1e-8, 'La partie doit couvrir cinq minutes');
  console.log('sim-identique : 1 200 ticks chargés et Brutal/Brutal graine 18, cinq minutes identiques');
} finally {
  await rm(directory, { recursive: true, force: true });
}
