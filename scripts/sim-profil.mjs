import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadedScenario } from './render-scenario.mjs';

// Only the temporary copy is instrumented. Nested calls are charged to their
// own stage, so the rows add up to the measured instrumented tick duration.
export function instrumentTick(source) {
  const stages = [
    ['tick', 'combat / ordres / projectiles / entretien'],
    ['visibility', 'brouillard / visibilité'],
    ['automaticTarget', 'ciblage'],
    ['separate', 'séparation'],
    ['moveSafely', 'déplacements'],
    ['route', 'recherche de chemin'],
    ['harvestTick', 'récolte'],
    ['monstersTick', 'monstres'],
    ['braisesTick', 'braises'],
    ['watchtowersTick', 'tours'],
    ['productionTick', 'production'],
    ['devourTick', 'dévorer'],
    ['ragoutTick', 'ragoût'],
    ['festinTick', 'festin'],
  ];
  let instrumented = source;
  const wrappers = [];
  for (const [name, label] of stages) {
    const declaration = `function ${name}(`;
    if (instrumented.split(declaration).length !== 2) {
      throw new Error(`Sim profil : fonction absente ou ambiguë : ${name}`);
    }
    instrumented = instrumented.replace(declaration, `function profilOriginal_${name}(`);
    wrappers.push(`function ${name}(...args) {
  const parent = profilActive;
  const frame = { children: 0 };
  profilActive = frame;
  const started = performance.now();
  try {
    return profilOriginal_${name}(...args);
  } finally {
    const elapsed = performance.now() - started;
    profilTotals[${JSON.stringify(label)}] = (profilTotals[${JSON.stringify(label)}] || 0) + elapsed - frame.children;
    if (parent) {
      parent.children += elapsed;
    }
    profilActive = parent;
  }
}`);
  }
  return `export const profilTotals = {};
let profilActive = null;
${instrumented}\n${wrappers.join('\n')}`;
}

const directory = await mkdtemp(join(tmpdir(), 'cendre-sim-profil-'));
try {
  await cp(new URL('../public/game/', import.meta.url), directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const source = await readFile(join(directory, 'sim.js'), 'utf8');
  // Measure ordinary ticks separately: instrumentation overhead must not be
  // included in the reported mean/p95 used for the before/after comparison.
  const { CendreSim: Sim } = await import(pathToFileURL(join(directory, 'sim.js')));
  const state = loadedScenario(Sim);
  for (let index = 0; index < 120; index++) {
    Sim.tick(state, 1 / 60);
  }
  const durations = [];
  for (let index = 0; index < 1200; index++) {
    const started = performance.now();
    Sim.tick(state, 1 / 60);
    durations.push(performance.now() - started);
  }
  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  durations.sort((a, b) => a - b);
  console.log(`Sim.tick : moyenne ${mean.toFixed(4)} ms ; p95 ${durations[Math.ceil(durations.length * 0.95) - 1].toFixed(4)} ms (120 + 1 200 ticks)`);
  await writeFile(join(directory, 'sim-profile.js'), instrumentTick(source));
  const { CendreSim: ProfiledSim, profilTotals } = await import(pathToFileURL(join(directory, 'sim-profile.js')));
  const profiledState = loadedScenario(ProfiledSim);
  for (let index = 0; index < 120; index++) {
    ProfiledSim.tick(profiledState, 1 / 60);
  }
  for (const key of Object.keys(profilTotals)) {
    profilTotals[key] = 0;
  }
  const profiledTicks = [];
  for (let index = 0; index < 1200; index++) {
    const previousTotals = { ...profilTotals };
    ProfiledSim.tick(profiledState, 1 / 60);
    const stages = Object.fromEntries(Object.entries(profilTotals).map(([stage, elapsed]) => [
      stage,
      elapsed - (previousTotals[stage] || 0),
    ]));
    profiledTicks.push({
      stages,
      elapsed: Object.values(stages).reduce((sum, value) => sum + value, 0),
    });
  }
  const total = Object.values(profilTotals).reduce((sum, value) => sum + value, 0);
  console.table(Object.entries(profilTotals).sort((a, b) => b[1] - a[1]).map(([stage, elapsed]) => ({
    étape: stage,
    'cumul ms': Number(elapsed.toFixed(3)),
    '% tick instrumenté': Number((elapsed / total * 100).toFixed(2)),
  })));
  // Rank instrumented ticks so each peak retains its own stage breakdown.
  const peaks = profiledTicks.sort((a, b) => b.elapsed - a.elapsed).slice(0, Math.ceil(profiledTicks.length * 0.05));
  const peakMean = peaks.reduce((sum, tick) => sum + tick.elapsed, 0) / peaks.length;
  console.log(`Pics : les 5 % de ticks instrumentés les plus lents (${peaks.length} ticks) ; tick moyen ${peakMean.toFixed(4)} ms`);
  console.table(Object.keys(profilTotals).map((stage) => ({
    étape: stage,
    'moyenne ms': Number((peaks.reduce((sum, tick) => sum + (tick.stages[stage] || 0), 0) / peaks.length).toFixed(4)),
  })).sort((a, b) => b['moyenne ms'] - a['moyenne ms']));
} finally {
  await rm(directory, { recursive: true, force: true });
}
