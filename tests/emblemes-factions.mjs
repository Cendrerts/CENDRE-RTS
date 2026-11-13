import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { iconSvg } from '../public/game/icons.js';
import { TEAM_COLORS } from '../public/game/unit-overlays.js';

const gameDirectory = new URL('../public/game/', import.meta.url);
const html = readFileSync(new URL('index.html', gameDirectory), 'utf8');
const factions = [['chooseHuman', 'cuistots'], ['chooseGhost', 'ratsgout']];
for (const [team, [buttonId, name]] of factions.entries()) {
  const svg = iconSvg(name);
  const button = html.match(new RegExp(`<button id="${buttonId}"[^>]*>([\\s\\S]*?)</button>`));
  assert(button, `Bouton absent : ${buttonId}`);
  assert(button[1].includes(svg), `Emblème incorrect : ${buttonId}`);
  assert(svg.includes('viewBox="0 0 24 24"'));
  assert(svg.includes('width="32" height="32"'));
  assert(svg.includes('width:32px;height:32px'));
  assert(svg.includes(`fill="${TEAM_COLORS[team]}"`));
  assert(svg.includes('stroke="#111719" stroke-width="1.5" vector-effect="non-scaling-stroke"'));
  assert(!/gradient/i.test(svg));
  if (name === 'ratsgout') {
    assert(svg.includes('fill-rule="evenodd"'), 'Œil évidé du rat');
    assert(svg.includes('M14.5 10.5a1.5 1.5'), 'Œil rond de diamètre 3');
  }
}
for (const filename of readdirSync(gameDirectory)) {
  if (!/\.(js|html|css)$/.test(filename)) continue;
  const source = readFileSync(new URL(filename, gameDirectory), 'utf8');
  assert(!/\b(?:rook|biohazard)\b/.test(source), `Ancien emblème dans ${filename}`);
}
console.log('PASS: emblèmes de faction, couleurs, taille et boutons du menu.');
