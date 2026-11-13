import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iconSvg } from '../public/game/icons.js';

const css = readFileSync(new URL('../public/game/panel.css', import.meta.url), 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1].trim().split(',').map((selector) => selector.trim()),
  declarations: match[2],
}));
function declaration(selector, property) {
  const matches = rules.filter((rule) => rule.selectors.includes(selector));
  const values = matches.flatMap((rule) => [...rule.declarations.matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, 'g'))]);
  assert(values.length, `Règle manquante : ${selector} / ${property}`);
  return values.at(-1)[1].trim();
}
for (const selector of [
  '#contextPanel button svg[data-icon]',
  '.unit-panel button svg[data-icon]',
  '#squadTools button svg[data-icon]',
  '#selectionToggle svg[data-icon]',
  '#idleWorkers svg[data-icon]',
  '.camera button svg[data-icon]',
]) {
  for (const dimension of ['width', 'height']) {
    const value = declaration(selector, dimension);
    assert.match(value, /^\d+px !important$/, 'La taille doit surcharger le style inline 1em');
    assert(parseFloat(value) >= 18, `${selector} / ${dimension} < 18px`);
  }
}
for (const selector of [
  '#combatActions button svg[data-icon]',
  '.actions button svg[data-icon]',
  '.army button svg[data-icon]',
  '#radialUI button svg[data-icon]',
]) {
  assert.equal(declaration(selector, 'width'), '24px !important');
  assert.equal(declaration(selector, 'height'), '24px !important');
}
for (const selector of [
  '#contextPanel button',
  '.unit-panel button',
  '#squadTools button',
  '#selectionToggle',
  '#idleWorkers',
  '.camera button',
  '#combatActions button',
  '#radialUI button',
]) {
  for (const dimension of ['min-width', 'min-height']) {
    assert(parseFloat(declaration(selector, dimension)) >= 44, `${selector} / ${dimension} < 44px`);
  }
}
assert.equal(declaration("button svg[data-icon='selection']", 'stroke-width'), '2.2');
assert(iconSvg('selection').includes('M3 10v4m18-4v4M10 3h4m-4 18h4'));
console.log('PASS: icônes 18/24 px, sélection renforcée et cibles tactiles ≥ 44 px.');
