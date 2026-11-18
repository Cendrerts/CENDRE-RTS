import assert from 'node:assert/strict';
import { mesurerLatenceDuel } from '../scripts/latence-duel.mjs';

const resultat = await mesurerLatenceDuel();
assert.deepEqual(resultat.delais.map(({ delai }) => delai), [0, 40, 100]);
for (const { delai, premiereImage, sautMax, ecartServeur } of resultat.delais) {
  assert.equal(premiereImage, 1, `L'ouvrier doit partir dès la première image à ${delai} ms.`);
  assert(Number.isFinite(sautMax) && sautMax > 0);
  assert(Number.isFinite(ecartServeur) && ecartServeur >= 0);
}
assert.equal(JSON.stringify(await mesurerLatenceDuel()), JSON.stringify(resultat));
console.log('OK — départ visible à la première image et mesures reproductibles.');
