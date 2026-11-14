import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handleAbandonChoice } from '../public/game/abandon-duel.js';

const gameDirectory = new URL('../public/game/', import.meta.url);
for (const filename of readdirSync(gameDirectory).filter((name) => name.endsWith('.js'))) {
  const source = readFileSync(new URL(filename, gameDirectory), 'utf8');
  assert.doesNotMatch(source, /\b(?:confirm|alert|prompt)\s*\(/, filename);
}
let commands = 0;
for (const choice of ['continue', 'close', 'escape', undefined]) {
  handleAbandonChoice(choice, () => commands++);
}
assert.equal(commands, 0);
handleAbandonChoice('abandon', () => commands++);
assert.equal(commands, 1);

const source = readFileSync(new URL('game.js', gameDirectory), 'utf8');
const handlers = source.slice(source.indexOf('function closePauseMenu()'), source.indexOf("$('#quitGame').onclick"));
const elements = new Map();
const $ = (selector) => {
  if (!elements.has(selector)) {
    elements.set(selector, { hidden: true, focus() {} });
  }
  return elements.get(selector);
};
const context = vm.createContext({
  $, handleAbandonChoice, running: true, paused: false,
  net: { finished: false }, touchUI: null, radial: null,
  updateAmbience() {}, leaveRoom() { commands++; },
  document: { addEventListener() {} }, window: { addEventListener() {} },
});
vm.runInContext(handlers, context);
vm.runInContext('openAbandonDialog();', context);
assert.equal(context.paused, false);
assert.equal($('#abandonActions').hidden, false);
$('#continueDuel').onclick();
assert.equal(commands, 1);
assert.equal($('#pauseMenu').hidden, true);
vm.runInContext('openAbandonDialog();', context);
$('#abandonDuel').onclick();
$('#abandonDuel').onclick();
assert.equal(commands, 2);
vm.runInContext('openAbandonDialog(); net.finished = true; closePauseMenu();', context);
$('#abandonDuel').onclick();
assert.equal(commands, 2);
assert.equal($('#abandonActions').hidden, true);
assert.match(source, /function finish\(\)\s*\{\s*closePauseMenu\(\);/);
console.log('PASS: no native dialogs; only Abandonner leaves; duel continues; end closes dialog.');
