Le dessin des unités réutilise les chemins `Path2D` des ombres tant que leur position et leur taille restent identiques. Ces chemins sont détenus par une `WeakMap` : déplacement, interpolation réseau et changement de taille reconstruisent la géométrie ; les unités supprimées peuvent être libérées. Aucun cache d’image par unité n’est ajouté.

Les recherches de sprites sont mutualisées par type et équipe, invalidées au changement d’échelle ou de densité de pixels ; une image non encore chargée est recherchée à nouveau. Les unités non sélectionnées n’allouent plus les coordonnées de sélection. Les barres de vie restaurent uniquement `fillStyle`, seul réglage qu’elles modifient, sans sauvegarder tout le contexte Canvas. Les coordonnées, couleurs, formes et l’ordre des dessins sont conservés.

Le nouveau test Playwright `tests/rendu-unites-identique.mjs` sert `origin/main:public/game/game.js` via `route.fulfill`, ainsi que son module de barres de vie pour comparer la totalité du changement. Il capture ensuite le nouveau rendu de `loadedScenario` en 844×390, après 60 ticks identiques pour afficher les barres de vie et deux dessins pour exercer les caches. Simulation et horloge visuelle sont figées ; les polices, sprites et terrain sont chargés avant les captures. Il impose au moins 99,5 % de pixels identiques avec une tolérance de 8 par canal, alpha compris. Les captures sont dans `artifacts/issue-157/identity/`.

Mesures : Chromium 157, CPU ×4, 844×390, banc lancé seul, scénarios et budgets inchangés. Trois commandes de banc au total : la première s’est arrêtée avant lancement du navigateur (Playwright absent), puis une mesure avant et une après. Playwright a été installé dans `/tmp`, sans modifier les dépendances du projet.

```sh
PLAYWRIGHT_MODULE=/tmp/cendre-render-tools/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/chromium BENCH_OUTPUT=/tmp/cendre-before node scripts/render-bench.mjs
PLAYWRIGHT_MODULE=/tmp/cendre-render-tools/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/chromium BENCH_OUTPUT=/tmp/cendre-after node scripts/render-bench.mjs
```

| Scénario / mesure (ms) | Avant | Après | Évolution |
| --- | ---: | ---: | ---: |
| loadedScenario / units | 2.0532 | 1.8335 | -10.70 % |
| loadedScenario / drawMs | 5.2907 | 4.9287 | -6.84 % |
| loadedScenario / terrain | 0.1950 | 0.1583 | -18.80 % |
| loadedScenario / fog | 0.5255 | 0.5383 | +2.44 % |
| loadedScenario / effects | 1.3868 | 1.2935 | -6.73 % |
| loadedScenario / hud | 1.1128 | 1.0835 | -2.64 % |
| hordeFullDraw / units | 2.1795 | 2.1373 | -1.93 % |
| hordeFullDraw / drawMs | 4.4567 | 4.9008 | +9.97 % |
| hordeFullDraw / terrain | 0.1712 | 0.2012 | +17.53 % |
| hordeFullDraw / fog | 0.5290 | 0.5377 | +1.64 % |
| hordeFullDraw / effects | 0.5950 | 0.8167 | +37.25 % |
| hordeFullDraw / hud | 0.9655 | 1.1682 | +20.99 % |

**Critère de performance non atteint.** `loadedScenario.layers.units` baisse de 10,70 %, sous les 25 % requis. Son `drawMs` baisse de 6,84 %, mais celui de `hordeFullDraw` augmente de 9,97 % (limite +5 %). Dans ce dernier passage, terrain (+17,53 %), effets (+37,25 %) et HUD (+20,99 %) dépassent +10 %. Ces écarts sont conservés tels que mesurés ; aucun passage supplémentaire n’a été lancé pour sélectionner un résultat favorable.

Les deux exécutions complètes du banc terminent avec le code 1 : des budgets absolus p95/max sont dépassés dès le code de départ. La validation structurelle des couches, les effectifs et les dégâts passent. Les JSON bruts avant/après sont joints dans ce dossier pour permettre la revue.

Vérifications :

- `PLAYWRIGHT_MODULE=/tmp/cendre-render-tools/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/tests-courts.mjs` : **78 OK, 0 KO**, dont `tests/render-bench.mjs`, `tests/rendu-unites-identique.mjs` et le test de restauration des styles des barres de vie.
- Comparaison visuelle : **329 160 / 329 160 pixels (100 %) dans la tolérance de 8 par canal**, seuil requis 99,5 %.
- `node --check` sur chacun des fichiers `public/game/*.js`, ainsi que sur le nouveau test Playwright : OK.
- `git diff --check` : OK.
- Aucune suite longue lancée séparément. Le lanceur court existant inclut `tests-longs-graine.mjs`, qui appelle lui-même uniquement la graine 23 de `ia-sans-blocage.mjs` ; ce sous-test a passé. Les quatre suites longues complètes restent à la charge du relecteur.

Le travail et ces vérifications sont prêts pour le workflow moins de 15 minutes après le début du run, sans commit ni push.

À tester sur un vrai téléphone : fluidité pendant les combats denses, ombres et barres de vie pendant les déplacements, sélection, zoom et déplacement de caméra, chargement initial des sprites, interpolation des unités en multijoueur.

Aucun changement de simulation, règles, IA, scénario, budget ou `.github/`. Aucun commit ni push ; cette description est prête pour la PR créée par le workflow, conformément à la consigne supplémentaire.

Refs #157 — le critère de performance reste à atteindre.
