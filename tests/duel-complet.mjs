import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mesurerDuelComplet } from '../scripts/duel-complet.mjs';

const debut = performance.now();
const { tableau, resume } = await mesurerDuelComplet(3);
const duree = (performance.now() - debut) / 1000;

assert.equal(resume.secondesJeu, 180);
assert.equal(tableau.length, 3);
assert.ok(resume.unitesProduites >= 20, `${resume.unitesProduites} unités produites, 20 attendues`);
assert.ok(resume.unitesMortes >= 5, `${resume.unitesMortes} unités mortes, 5 attendues`);
assert.deepEqual(resume.clients.map(({ equipe }) => equipe), [0, 1]);
for (const client of resume.clients) {
  assert.ok(client.snapshots >= 1800, `Snapshots manquants pour l’équipe ${client.equipe}`);
  assert.equal(client.ecarts, 0, JSON.stringify(client.premierEcart));
}
assert.ok(duree < 60, `Duel de trois minutes exécuté en ${duree.toFixed(2)} s`);
console.log(`PASS : ${resume.unitesProduites} unités produites, ${resume.unitesMortes} mortes, aucun écart (${duree.toFixed(2)} s).`);
