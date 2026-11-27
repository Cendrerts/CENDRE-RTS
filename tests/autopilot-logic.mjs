import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const selector = fileURLToPath(new URL('../scripts/autopilot-logic.jq', import.meta.url));

function issue(number, fields = {}) {
  return { number, state: 'open', labels: [], body: null, ...fields };
}

function select(issues, associated = [], closed = []) {
  return execFileSync('jq', [
    '-r', '--argjson', 'associated', JSON.stringify(associated),
    '--argjson', 'closed', JSON.stringify(closed), '-f', selector,
  ], { input: JSON.stringify(issues), encoding: 'utf8' }).trim();
}

const issues = [
  issue(31),
  issue(15, { body: 'Dépend de #3\nDépend de #4' }),
  issue(12, { labels: [{ name: 'bloqué' }] }),
  issue(10),
  issue(5, { pull_request: {} }),
  issue(2, { state: 'closed' }),
  issue(20),
];

assert.equal(select(issues, [10], [3, 4]), '15');
assert.equal(select(issues, [10], [3]), '20');
assert.equal(select(issues, [], [3, 4]), '10');
assert.equal(select(issues.slice(1, -1), [10], []), '');
console.log('PASS : sélection par numéro, dépendances, PR associée et label bloqué.');
