Ajoute un passage `hordeFullDraw` qui reprend `hordeScenario` sans le modifier et utilise le même `setup`, la même caméra et le même vrai `draw()` que `loadedScenario`.

L’instrumentation est appliquée uniquement à la copie de `game.js` servie par `route.fulfill`. `drawMs` mesure uniquement l’appel à `draw()`, hors simulation et préparation des caches ou de la liste d’unités. Les moyennes par couche figurent dans les JSON et dans une table console. La vapeur et les anneaux des héros, imbriqués dans les fonctions d’unité, sont attribués aux effets sans double comptage. La couche effets comprend aussi les bâtiments, mines, tours, foyers, cadavres, Sangliers et projectiles ; HUD comprend les marqueurs, files d’ordres et la mini-carte.

Mesure isolée : Chromium 157, CPU ×4, viewport 844×390, 600 images de chauffe puis 600 images mesurées par passage. Aucun test court lancé pendant le banc. Commande utilisée (Playwright installé dans `/tmp`, sans changement des dépendances du projet) :

```sh
PLAYWRIGHT_MODULE=/tmp/cendre-bench/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/render-bench.mjs
```

| Passage | Moyenne (ms) | p95 (ms) | Max (ms) |
| --- | ---: | ---: | ---: |
| combatScenario | 1.525 | 2.300 | 9.500 |
| hordeScenario | 2.071 | 3.100 | 11.100 |
| hordeFullDraw | 7.783 | 13.800 | 25.700 |
| loadedScenario | 7.277 | 12.200 | 20.300 |

| Couche, moyenne (ms) | hordeFullDraw | loadedScenario |
| --- | ---: | ---: |
| Terrain | 0.161 | 0.108 |
| Brouillard | 0.486 | 0.529 |
| Unités : sprites et barres de vie | 2.158 | 1.914 |
| Effets | 0.605 | 1.354 |
| HUD / mini-carte | 0.963 | 1.016 |
| drawMs | 4.394 | 4.935 |
| Somme des couches / drawMs | 99.5% | 99.7% |

Les quatre fichiers sont générés dans `artifacts/issue-17/` : `benchmark.json`, `benchmark-horde.json`, `benchmark-horde-full.json`, `benchmark-loaded.json`. Les deux passages complets passent la validation des cinq couches numériques positives ou nulles et de leur somme entre 70 % et 110 % de `drawMs`. Les effectifs et les dégâts attendus sont vérifiés.

Le banc termine avec le code 1 : les maxima des quatre passages dépassent leurs budgets ; les p95 des deux passages complets dépassent aussi 4 ms. Les seuils restent inchangés (horde complète : max < 8 ms, p95 < 4 ms). Aucune optimisation effectuée. Les unités sont la couche la plus lourde dans les deux passages complets ; cette mesure ne comprend pas le travail GPU différé.

Vérifications :

- `node scripts/tests-courts.mjs` : **76 OK, 0 KO**, dont `render-bench.mjs` et le nouveau test d’instrumentation.
- `tests/render-bench.mjs` conserve toutes ses assertions existantes.
- Nouveau test sans navigateur : exécution du code injecté avec une horloge déterministe, attribution des effets imbriqués sans double comptage, rejet des marques manquantes et des mesures incohérentes.
- `node --check` sur chaque fichier `public/game/*.js` et sur les scripts du banc.
- `git diff origin/main -- public/` vide ; aucun changement de simulation, scénario, rendu de production ou `.github/`.
- Les quatre tests longs n’ont pas été lancés.

À tester sur un vrai téléphone : reproduire les mesures sur un appareil en paysage et vérifier la fluidité du rendu avec les deux scènes complètes. Les chiffres Chromium avec ralentissement CPU ne remplacent pas cette mesure.

Closes #155
