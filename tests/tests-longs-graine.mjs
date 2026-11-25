import assert from 'node:assert/strict';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { parseReplayOptions, reportReplay } from '../scripts/tests-longs-options.mjs';

assert.deepEqual(parseReplayOptions(18, 37, false, []), { seed: null, series: 'difficile-normal' });
assert.deepEqual(parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile', '--graine', '14']), { seed: 14, series: 'brutal-difficile' });
for (const argumentsList of [['--graine'], ['--graine', '17'], ['--graine', '38'], ['--graine', '23.5'], ['--inconnu']]) {
  assert.throws(() => parseReplayOptions(18, 37, false, argumentsList));
}
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'inconnue', '--graine', '1']));
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile']));

// Le résultat d'une partie dépend de l'équilibrage. La suite courte
// vérifie la sélection de la graine et les relevés sans lancer le tournoi.
const { seed } = parseReplayOptions(18, 37, false, ['--graine', '23']);
assert.equal(seed, 23);
const state = Sim.create();
const controllers = [0, 1].map((team) => createAI(team, 'brutal'));
const lines = [];
const log = console.log;
try {
  console.log = (line) => lines.push(line);
  for (const step of [1198, 1199, 1200, 2399, 2400]) {
    state.time = (step + 1) / 10;
    reportReplay(seed, step, state, controllers);
    reportReplay(null, step, state, controllers);
  }
} finally {
  console.log = log;
}
assert(lines.every((line) => line.startsWith('releve ')));
const reports = lines.map((line) => JSON.parse(line.slice(7)));
assert.deepEqual(reports.map(({ seconds, team }) => [seconds, team]), [
  [120, 0],
  [120, 1],
  [240, 0],
  [240, 1],
]);
console.log('PASS : sélection de la graine 23 et relevés des deux équipes toutes les 120 s.');
