import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Seules ces règles du menu d’accueil peuvent descendre sous 9 px.
const menuSelectors = /\.(?:intro|brand|features|note)\b/;
const directory = new URL('../public/game/', import.meta.url);
const failures = [];
for (const file of (await readdir(directory)).filter((name) => name.endsWith('.css'))) {
  const css = (await readFile(new URL(file, directory), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().split(',');
    if (selectors.every((selector) => menuSelectors.test(selector))) {
      continue;
    }
    for (const declaration of rule[2].matchAll(/(?:^|;)\s*(font-size|font)\s*:\s*([^;{}]+)/g)) {
      // En raccourci font, la première longueur est la taille, avant l’interligne.
      const size = declaration[2].match(/(?:^|\s)(\d*\.?\d+)px\b/);
      if (size && Number(size[1]) < 9) {
        failures.push(`${file}: ${rule[1].trim()} { ${declaration[1]}: ${declaration[2]} }`);
      }
    }
  }
}
assert.deepEqual(failures, [], 'Textes du HUD sous 9 px');
console.log('PASS: aucune taille de police CSS sous 9 px hors menu d’accueil (.intro, .brand, .features, .note).');
