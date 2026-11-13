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
    assert(svg.includes('M2.5 15.5C2.5 10.5 6.5 8 11 8 14.5 8 18.5 10.5 22 13 18.5 15 14.5 16.5 9.5 16.5 5.5 16.5 2.5 17 2.5 15.5Z'), 'Tête en goutte du rat');
    assert(svg.includes('<circle cx="7.5" cy="6.5" r="3.6"'), 'Oreille ronde du rat');
    assert(svg.includes('<circle cx="14" cy="11.3" r="1.2" fill="#111719" stroke="none"/>'), 'Œil plein du rat');
    assert(!svg.includes('fill-rule="evenodd"'), 'Aucun œil évidé');
  }
}
for (const filename of readdirSync(gameDirectory)) {
  if (!/\.(js|html|css)$/.test(filename)) continue;
  const source = readFileSync(new URL(filename, gameDirectory), 'utf8');
  assert(!/\b(?:rook|biohazard)\b/.test(source), `Ancien emblème dans ${filename}`);
}
console.log('PASS: emblèmes de faction, couleurs, taille et boutons du menu.');
