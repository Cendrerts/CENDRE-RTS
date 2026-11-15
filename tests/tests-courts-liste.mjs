import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LONG_TESTS } from '../scripts/tests-courts.mjs';

assert.deepEqual([...LONG_TESTS].sort(), [
  'ai.mjs',
  'equilibrage-factions.mjs',
  'ia-sans-blocage.mjs',
  'impitoyable.mjs',
]);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const output = execFileSync(process.execPath, ['scripts/tests-courts.mjs', '--list'], {
  cwd: projectRoot,
  encoding: 'utf8',
});
const entries = await readdir(new URL('./', import.meta.url), { withFileTypes: true });
const expectedLines = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !LONG_TESTS.includes(entry.name))
  .map((entry) => `tests/${entry.name}${entry.name === 'ai-carte-agrandie.mjs' ? ' --short' : ''}`)
  .sort();
assert.deepEqual(output.trim().split('\n').sort(), expectedLines);
assert.ok(expectedLines.includes('tests/tests-courts-liste.mjs'));
for (const name of LONG_TESTS) {
  assert.ok(!output.split('\n').some((line) => line === `tests/${name}`));
}
console.log('PASS : liste complète des tests courts, exclusion des quatre tests longs et option --short.');
