import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJobs } from '../scripts/tests-longs.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
function runCli(...args) {
  return spawnSync(process.execPath, ['scripts/tests-longs.mjs', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

const listing = runCli('--list');
assert.equal(listing.status, 0, listing.stderr);
assert.equal(listing.stdout, [
  'ia-sans-blocage node tests/ia-sans-blocage.mjs',
  'equilibrage node tests/equilibrage-factions.mjs',
  'ai node tests/ai.mjs',
  'impitoyable node tests/impitoyable.mjs',
  'duel-1 node scripts/monstres-duels.mjs 1',
  'duel-2 node scripts/monstres-duels.mjs 2',
  'duel-3 node scripts/monstres-duels.mjs 3',
  'duel-4 node scripts/monstres-duels.mjs 4',
].join('\n') + '\n');

for (const [args, message] of [
  [['--list', '--jobs', '0'], /--jobs.*entier strictement positif/],
  [['--list', '--jobs', 'abc'], /--jobs.*entier strictement positif/],
  [['--list', '--inconnue'], /Option inconnue.*--inconnue/],
  [['--list', '--seulement', 'inconnu'], /Job inconnu.*--seulement.*inconnu/],
  [[], /--sortie.*obligatoire/],
]) {
  const result = runCli(...args);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, message);
}

const tempDir = await mkdtemp(join(tmpdir(), 'cendre-tests-longs-'));
const outputDir = join(tempDir, 'resultats');
try {
  const jobs = [
    { name: 'graine', args: ['-e', "console.log('Seed 1: ok')"] },
    { name: 'echec', args: ['-e', "console.error('Error: échec factice'); process.exitCode = 1;"] },
    { name: 'succes', args: ['-e', "console.log('détail'); console.log('PASS\\n'.repeat(41).trimEnd());"] },
  ];
  assert.equal(await runJobs(jobs, { parallel: 2, outputDir }), 1);

  const summary = await readFile(join(outputDir, 'resume.txt'), 'utf8');
  const [statuses, ...sections] = summary.trimEnd().split('\n\n');
  const statusLines = statuses.split('\n');
  assert.equal(statusLines.length, 3);
  assert.match(statusLines.sort().join('\n'), /^echec 1 \d+\.\d\ngraine 0 \d+\.\d\nsucces 0 \d+\.\d$/);
  assert.deepEqual(sections, [
    '== graine ==\nSeed 1: ok',
    '== echec ==\nError: échec factice',
    '== succes ==\n' + 'PASS\n'.repeat(40).trimEnd(),
  ]);
  assert.equal(await readFile(join(outputDir, 'echec.log'), 'utf8'), 'Error: échec factice\n');
  assert.equal(await readFile(join(outputDir, 'succes.log'), 'utf8'), 'détail\n' + 'PASS\n'.repeat(41));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('PASS : liste des huit jobs, validation des options et résumé des jobs factices.');
