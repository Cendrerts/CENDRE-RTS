import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/monstres-duels.mjs', import.meta.url), 'utf8');
const stepLimit = Number(source.match(/step < (\d+) && state\.winner === null/)?.[1]);
const stepSeconds = Number(source.match(/Sim\.tick\(state, ([\d.]+)\)/)?.[1]);
const rejectionSeconds = Number(source.match(/state\.time >= (\d+)\) process\.exitCode = 1/)?.[1]);

assert.equal(stepLimit * stepSeconds, 30 * 60, 'Le duel simule au maximum 30 minutes de jeu.');
assert.equal(rejectionSeconds, 30 * 60, 'Un vainqueur entre 20 et 30 minutes doit être accepté.');
assert.match(source, /avant 30 minutes \(D29\)/);
console.log('Limite des duels Sangliers : 30 minutes (D29).');
