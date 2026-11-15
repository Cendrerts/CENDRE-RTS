import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseReplayOptions } from '../scripts/tests-longs-options.mjs';

assert.deepEqual(parseReplayOptions(18, 37, false, []), { seed: null, series: 'difficile-normal' });
assert.deepEqual(parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile', '--graine', '14']), { seed: 14, series: 'brutal-difficile' });
for (const argumentsList of [['--graine'], ['--graine', '17'], ['--graine', '38'], ['--graine', '23.5'], ['--inconnu']]) {
  assert.throws(() => parseReplayOptions(18, 37, false, argumentsList));
}
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'inconnue', '--graine', '1']));
assert.throws(() => parseReplayOptions(1, 20, true, ['--serie', 'brutal-difficile']));

const result = spawnSync(process.execPath, ['tests/ia-sans-blocage.mjs', '--graine', '23'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  encoding: 'utf8',
  timeout: 240000,
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
const lines = result.stdout.trim().split('\n');
// Le héros participe désormais à l'assaut : référence déterministe après #113.
const expected = 'Seed 23: cooks, 305.4s, rats team 0, rubies 0/730, waves 1/1, bank seconds 0/0';
assert.deepEqual(lines.filter((line) => line.startsWith('Seed ')), [expected]);
const reports = lines.filter((line) => line.startsWith('releve ')).map((line) => JSON.parse(line.slice(7)));
assert.deepEqual(reports.map(({ seconds, team }) => [seconds, team]), [[120, 0], [120, 1], [240, 0], [240, 1]]);
assert(lines.indexOf(expected) > lines.findLastIndex((line) => line.startsWith('releve ')));
assert(!result.stdout.includes('Tournament:'));
console.log('PASS: graine 23 identique au tournoi, partie unique et relevés à 120 s.');
