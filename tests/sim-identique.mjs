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
  // La même IA pilote les deux parties pour isoler les différences de simulation.
  for (const file of ['ai.js', 'ai-config.js']) {
    const source = await readFile(new URL(`../public/game/${file}`, import.meta.url));
    await writeFile(join(directory, file), source);
  }
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const { CendreSim: Reference } = await import(pathToFileURL(join(directory, 'sim.js')));
  const probe = Reference.create();
  const referenceHasSimpleHeroes = !Object.hasOwn(probe, 'heroProgress');
  const referenceHasPantries = Object.hasOwn(probe, 'pantries');
  const referenceHasFieldKitchens = Object.hasOwn(probe, 'fieldKitchens');
  // Les héros, les garde-manger et la cuisine de campagne modifient l’état initial.
  const loadedReferenceSim = referenceHasSimpleHeroes && referenceHasPantries && referenceHasFieldKitchens
    ? Reference : Sim;
  // Les rangs sont débloqués pour comparer le scénario chargé avec une référence antérieure à D67.
  const unlockAllRanks = (state) => {
    for (const base of state.bases) base.niveau = 3;
  };
  const referenceLoaded = loadedScenario(loadedReferenceSim);
  const loaded = loadedScenario(Sim);
  unlockAllRanks(referenceLoaded);
  unlockAllRanks(loaded);
  const identical = (actual, expected, label) => {
    // Compare the entire serializable state, including visibility, events,
    // target references, positions, resources and winner, without rounding.
    // Aligner la représentation des stocks quand origin/main précède D68.
    const ingredients = expected.ingredients.map((stock) =>
      typeof stock === 'number' ? { viande: stock, epices: 0, conserves: 0 } : stock);
    // Comparer les cuissons au repos quand origin/main précède les plats combinés.
    const { roti, bouillon, ...actualState } = actual;
    const { roti: expectedRoti = { readyAt: null }, bouillon: expectedBouillon = { readyAt: null }, ...expectedState } = expected;
    assert.equal(
      pack({ ...actualState, roti, bouillon }),
      pack({ ...expectedState, ingredients, roti: expectedRoti, bouillon: expectedBouillon }),
      label,
    );
  };
  identical(loaded, referenceLoaded, 'loadedScenario initial');
  for (let tick = 1; tick <= 1200; tick++) {
    Sim.tick(loaded, 1 / 60);
    loadedReferenceSim.tick(referenceLoaded, 1 / 60);
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
  const slot = probe.slots[0][0];
  const building = Reference.BUILDINGS[0][0];
  probe.rubies[0] = building.cost;
  assert(Reference.construct(probe, 0, building.id, slot.baseId, slot.id));
  // Tant qu’origin/main n’a pas D70, les dégâts aux bâtiments changent le duel.
  // D68 change aussi les gains de ressources, donc le déroulement d'un duel.
  // Comparer deux parties de la branche tant que main n'a pas les mêmes règles.
  const referenceHasD70 = Number.isFinite(slot.batiment.hp);
  const referenceHasD68 = typeof probe.ingredients[0]?.viande === 'number';
  const sameRules = referenceHasD70 && referenceHasD68 && loadedReferenceSim === Reference;
  const secondSim = sameRules ? Reference : Sim;
  const secondAI = sameRules
    ? (await import(pathToFileURL(join(directory, 'ai.js')))).createAI
    : createAI;
  const secondState = structuredClone(state);
  const controllers = [0, 1].map((team) => createAI(team, 'brutal', state));
  const secondControllers = [0, 1].map((team) => secondAI(team, 'brutal', secondState));
  identical(state, secondState, 'Brutal initial');
  for (let step = 1; step <= 3000; step++) {
    for (const team of [0, 1]) {
      if (state.time >= delays[team]) {
        controllers[team].update(state);
      }
      if (secondState.time >= delays[team]) {
        secondControllers[team].update(secondState);
      }
    }
    Sim.tick(state, 0.1);
    secondSim.tick(secondState, 0.1);
    if (step % 600 === 0) {
      identical(state, secondState, `Brutal minute ${step / 600}`);
    }
  }
  assert.ok(state.time >= 300 - 1e-8, 'La partie doit couvrir cinq minutes');
  const comparison = sameRules ? 'avec origin/main' : 'entre deux parties de la branche (règles différentes sur origin/main)';
  console.log(`sim-identique : 1 200 ticks chargés et Brutal/Brutal graine 18, cinq minutes identiques ${comparison}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
