import assert from 'node:assert/strict';
import { parseReplayOptions } from '../scripts/tests-longs-options.mjs';

function parse(argumentsList) {
  return parseReplayOptions(1, 20, true, argumentsList, true);
}

assert.equal(parse([]).block, null);
assert.equal(parse(['--bloc', 'poussees']).block, 'poussees');
assert.throws(() => parse(['--bloc', 'inconnu']), /--bloc attend poussees/);
assert.throws(() => parse(['--bloc', 'poussees', '--graine', '1']), /--bloc est incompatible avec --graine et --serie/);
assert.throws(() => parse(['--serie', 'brutal-difficile', '--bloc', 'poussees']), /--bloc est incompatible avec --graine et --serie/);
assert.throws(() => parseReplayOptions(1, 20, false, ['--bloc', 'poussees']), /Option inconnue : --bloc/);
