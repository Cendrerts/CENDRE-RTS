import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iconSvg } from '../public/game/icons.js';
import { CATEGORIES } from '../public/game/radial.js';

const read = (file) => readFileSync(new URL(`../public/game/${file}`, import.meta.url), 'utf8');
const forbidden = /[\u{2190}-\u{2BFF}\u{1F300}-\u{1FAFF}]/u;
const html = read('index.html');
const names = new Set(['menu']);
for (const button of html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) {
  assert(!forbidden.test(button[0]), `Unicode dans un bouton HTML : ${button[0]}`);
  for (const icon of button[0].matchAll(/<svg data-icon="([^"]+)"[^>]*>[\s\S]*?<\/svg>/g)) {
    names.add(icon[1]);
    assert.equal(icon[0], iconSvg(icon[1]), `SVG statique désynchronisé : ${icon[1]}`);
  }
}
for (const file of ['game.js', 'radial.js']) {
  const source = read(file);
  for (const call of source.matchAll(/iconSvg\('([^']+)'\)/g)) names.add(call[1]);
  // Inspect all string literals, including labels appended to buttons. Only
  // existing non-button status messages and the building portrait are exempt.
  const nonButtonLines = /'◉ Tour :|Safari →|portrait\.textContent/;
  for (const line of source.split('\n')) {
    if (nonButtonLines.test(line)) continue;
    for (const literal of line.matchAll(/(['"`])(?:\\.|(?!\1).)*?\1/g)) {
      assert(!forbidden.test(literal[0]), `${file} : ${line.trim()}`);
    }
  }
}
for (const category of CATEGORIES) assert(category.icon.startsWith('<svg'));
for (const name of names) {
  const svg = iconSvg(name);
  assert(svg.startsWith('<svg'));
  assert(svg.includes('viewBox="0 0 24 24"'));
  assert(svg.includes('stroke="currentColor"'));
  assert(svg.includes('aria-hidden="true"'));
  assert(!forbidden.test(svg));
}
assert.throws(() => iconSvg('missing'));
console.log(`PASS: ${names.size} icônes SVG, boutons sans pictogrammes Unicode.`);
