import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/latence-duel.mjs', import.meta.url));

function lancer(...options) {
  const sortie = execFileSync(process.execPath, [script, ...options], { encoding: 'utf8' });
  return sortie.trimEnd().split('\n').at(-1);
}

const json = lancer();
assert.equal(lancer('--delai', '0,40,100', '--gigue', '0,40'), json);
const { delais } = JSON.parse(json);
assert.deepEqual(
  delais.map(({ delai, gigue, trou }) => [delai, gigue, trou]),
  [0, 40, 100].flatMap((delai) => [[delai, 0, false], [delai, 40, false], [delai, 40, true]]),
);

// Valeurs mesurées par le script de #203 avant l'ajout de la gigue.
assert.deepEqual(
  delais.filter(({ gigue, trou }) => gigue === 0 && !trou)
    .map(({ delai, premiereImage, sautMax, ecartServeur }) => [delai, premiereImage, sautMax, ecartServeur]),
  [
    [0, 1, 1.6000000000000918, 33.061136156489496],
    [40, 1, 1.6000000000000918, 37.66392595493057],
    [100, 1, 1.6000000000000918, 43.131056632320046],
  ],
);

for (const { delai, gigue, trou, premiereImage, sautsVisibles, messagesGroupes } of delais) {
  assert.equal(premiereImage, 1, `Départ à la première image attendu à ${delai} ms, gigue ${gigue}, trou ${trou}.`);
  assert(Number.isInteger(sautsVisibles) && sautsVisibles >= 0 && sautsVisibles <= 125);
  if (trou) {
    const sansTrou = delais.find((mesure) => mesure.delai === delai && mesure.gigue === gigue && !mesure.trou);
    assert(messagesGroupes > sansTrou.messagesGroupes, `Le trou doit grouper des messages à ${delai} ms.`);
  }
}
console.log('OK — références de #203, départ immédiat, livraisons groupées et JSON reproductible.');
