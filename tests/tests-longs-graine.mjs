import assert from 'node:assert/strict';
import { parseReplayOptions, reportReplay } from '../scripts/tests-longs-options.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

assert.deepEqual(parseReplayOptions(18, 37, false, []), { seed: null, series: 'difficile-normal' });
assert.deepEqual(parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile', '--graine', '14']), { seed: 14, series: 'brutal-difficile' });
for (const argumentsList of [['--graine'], ['--graine', '17'], ['--graine', '38'], ['--graine', '23.5'], ['--inconnu']]) {
  assert.throws(() => parseReplayOptions(18, 37, false, argumentsList));
}
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'inconnue', '--graine', '1']));
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile']));

// Vérifier les relevés sans lancer un duel dont le résultat dépend de l'équilibrage.
const state = Sim.create();
const controllers = [{ metrics: { waves: 1 } }, { metrics: { waves: 2 } }];
const lines = [];
const originalLog = console.log;
console.log = (line) => lines.push(line);
try {
  for (const seconds of [120, 240, 360]) {
    state.time = seconds;
    const step = seconds * 10 - 1;
    reportReplay(null, step, state, controllers);
    reportReplay(23, step - 1, state, controllers);
    reportReplay(23, step, state, controllers);
    reportReplay(23, step + 1, state, controllers);
  }
} finally {
  console.log = originalLog;
}
assert(lines.every((line) => line.startsWith('releve ')));
const reports = lines.map((line) => JSON.parse(line.slice(7)));
assert.deepEqual(reports.map(({ seconds, team, waves }) => [seconds, team, waves]), [
  [120, 0, 1], [120, 1, 2],
  [240, 0, 1], [240, 1, 2],
  [360, 0, 1], [360, 1, 2],
]);
console.log('PASS : options de rejeu et relevés des deux équipes toutes les 120 s.');
