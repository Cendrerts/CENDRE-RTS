# Issue 115 — carte v2

La simulation conserve le monde de 4000 × 2200, les neuf mines et les six réserves. Chaque base occupe une chambre fermée avec un goulet de 160 px. La naturelle est dans la poche suivante, dont la sortie mesure 300 px. Les trois tracés partagent cet accès : centre de 440 px et clairière de 720 × 520 px autour de la Veine riche, flancs de 180 px, quatre passages de 140 px. La grille reste symétrique par rotation de 180°. Elle compte 23,8 % de forêt infranchissable et des bosquets isolés dans les clairières périphériques.

Les tracés complets mesurent environ 6440 px au centre et 5024 px sur chaque flanc. Le test de déplacement mesure aussi les distances réellement parcourues par chaque type d'unité et exige un gain d'au moins 10 % sur les flancs. Les camps sont à au moins 250 px des segments de `Sim.lanes`. Les Sangliers suivent automatiquement leurs réserves.

Le terrain affiché et la mini-carte utilisent déjà le raster construit depuis `Sim.walk`. Le brouillard utilise la même grille de 200 × 110. Les bases et les dimensions du monde ne changent pas : le centrage initial de la caméra et les conversions de la mini-carte sont conservés et contrôlés par les fixtures.

## Captures

- [Carte entière](carte-entiere.png), affichée en 1600 × 880, brouillard révélé uniquement pour la capture.
- [Départ Cuistots en 844 × 390](depart-0-844x390.png).
- [Départ Rats en 844 × 390](depart-1-844x390.png).

Le script `scripts/map-capture.mjs` fige le temps de simulation, initialise séparément chaque équipe et vérifie le centrage de caméra, l'échelle tactile, les glissements souris/tactile de la mini-carte et l'absence d'erreur JavaScript. Les assets existants sont conservés.

## Vérification

- `node tests/map-layout.mjs` : symétrie de chaque cellule, isolation de chaque base après bouchage du goulet, isolation de la poche naturelle après bouchage de sa sortie, sections de passage et de chemin, clairière centrale, distances, taux de forêt, accès aux neuf mines, aux dépôts et aux six réserves depuis les deux bases, éloignement des camps et initialisation des Sangliers.
- `node tests/map-lanes.mjs` : 56 traversées avec commandes et ticks réels, dans les deux sens, avec Commis, Garde-Manger, Boucher et Mage ; contrôle des immobilisations, des destinations et des distances réellement parcourues.
- 56 fichiers de tests courts passent ; `node tests/ai-carte-agrandie.mjs --short` passe également. Ce mode conserve les tests d'extensions, de choix des trois approches, de brouillard, de retraite et de progression des vagues.
- `node --check` sur tous les `public/game/*.js` et `git diff --check`.
- Les fixtures de micro utilisent maintenant la ligne praticable y = 450 ; la fixture de laisse des Sangliers choisit une position de retour praticable. Aucun comportement de combat ou d'IA n'est changé.

Le lancement complet de `tests/ai-carte-agrandie.mjs` a atteint une absence de vainqueur à 1800 secondes simulées pour la seed 19. Le run a été arrêté pendant la seed suivante ; le critère de passage intégral de ce fichier reste donc non rempli. Les contrôles fonctionnels précédant les tournois passent. Les réglages de l'IA restent à #113. Les autres tournois longs (`ai.mjs`, `impitoyable.mjs`, `equilibrage-factions.mjs`, `ia-sans-blocage.mjs`) sont exclus de la validation courte ; les deux premiers, initialement inclus dans le lancement générique, ont été interrompus.

## Mesure de rendu

Trois paires successives ont été mesurées sans tests en parallèle. La comparaison finale utilise la médiane des trois moyennes et celle des trois p95 ; les mesures brutes sont conservées, y compris le dépassement ponctuel du premier p95 de la horde. [Résultat agrégé](benchmark-comparison.json).

Les fichiers `benchmark-before/` et `benchmark-after/` contiennent les mesures Chromium à 844 × 390, CPU ralenti ×4, après 600 images de chauffe puis 600 images mesurées. `--map-baseline` charge le `sim.js` de `BASELINE_REF` (HEAD par défaut), sans modifier les fichiers de travail. `BENCH_COMPARE` contrôle que la moyenne et le p95 restent sous 110 % de cette référence. Les plafonds absolus historiques restent appliqués au lancement habituel sans comparaison.

| Scénario | Moyenne avant/après | p95 avant/après |
| --- | --- | --- |
| Combat 60 unités | 1.005 / 0.889 ms | 2.00 / 1.80 ms |
| Horde 91 unités | 1.515 / 1.406 ms | 2.50 / 2.30 ms |

La moyenne et le p95 médians ne dépassent pas la référence de 10 %.

Commandes reproductibles, avec Playwright et Chromium disponibles :

```sh
BENCH_OUTPUT=docs/issue-115/benchmark-before node scripts/render-bench.mjs --map-baseline
BENCH_OUTPUT=docs/issue-115/benchmark-after BENCH_COMPARE=docs/issue-115/benchmark-before node scripts/render-bench.mjs
node scripts/map-capture.mjs
```

Pour répéter les deux autres paires, utiliser respectivement les sous-dossiers `run-2` et `run-3` dans les deux répertoires de résultats. La référence git de ces mesures est `13c44169ae51e7e3081bb28a643decce646e95e7` (HEAD précédant les modifications de travail).

À tester sur un vrai téléphone : lisibilité des ouvertures et des passages au zoom de départ, précision du déplacement au pouce, fluidité du zoom et de la mini-carte, croisement de deux armées dans les goulets, puis duel multijoueur sur réseau mobile.
