import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RealtimeMotion } from '../public/game/realtime.js';

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

for (const mesure of delais) {
  const { delai, gigue, trou, premiereImage, sautMax, ecartServeur, ecartServeur3s, sautsVisibles, messagesGroupes } = mesure;
  assert.equal(premiereImage, 1, `Départ à la première image attendu à ${delai} ms, gigue ${gigue}, trou ${trou}.`);
  assert(Number.isInteger(sautsVisibles) && sautsVisibles >= 0 && sautsVisibles <= 187);
  if (gigue === 0 && !trou) {
    // À 100 ms, l'écran montre la position datant du délai aller, du tampon et des 8 ms depuis la dernière image.
    const limiteEcart = delai === 100 ? 126 * (100 + 100 + 8) / 1000 : 20;
    assert(sautMax <= 3.5, `Saut de ${sautMax} px à ${delai} ms.`);
    assert(ecartServeur <= limiteEcart, `Écart à 1 s de ${ecartServeur} px à ${delai} ms.`);
    assert(ecartServeur3s <= limiteEcart, `Écart à 3 s de ${ecartServeur3s} px à ${delai} ms.`);
    assert(ecartServeur3s <= ecartServeur + 0.01, `Le retard augmente à ${delai} ms.`);
  }
  if (trou) {
    const sansTrou = delais.find((mesure) => mesure.delai === delai && mesure.gigue === gigue && !mesure.trou);
    assert(messagesGroupes > sansTrou.messagesGroupes, `Le trou doit grouper des messages à ${delai} ms.`);
  }
}

{
  const motion = new RealtimeMotion();
  const vitesse = 126 / 1000;
  const tampon = 100;
  let unite = { id: 1, x: 0, y: 0 };
  let prochainSnapshot = 0;
  let position;
  for (let temps = 0; temps <= 3000; temps = Math.min(temps + 16, 3000)) {
    if (temps >= prochainSnapshot) {
      unite = { ...unite, x: prochainSnapshot * vitesse };
      motion.receive([unite], prochainSnapshot, prochainSnapshot / 1000);
      prochainSnapshot += 100;
    }
    position = motion.position(unite, temps);
    if (temps === 3000) break;
  }
  const attendu = (3000 - tampon) * vitesse;
  const ecart = Math.hypot(position.x - attendu, position.y);
  assert(ecart < 20, `Écart de ${ecart} px avec la position interpolée après 3 s.`);
}

console.log('OK — départ immédiat, lissage sur 3 s, livraisons groupées et JSON reproductible.');
