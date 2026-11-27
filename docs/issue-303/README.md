# Issue 303 — Direction artistique du terrain

| Vue | Avant | Après |
| --- | --- | --- |
| Carte entière | [Capture](avant/carte-entiere.png) | [Capture](apres/carte-entiere.png) |
| Départ Cuistots-Furieux, 844×390 | [Capture](avant/depart-0-844x390.png) | [Capture](apres/depart-0-844x390.png) |
| Départ Rats, 844×390 | [Capture](avant/depart-1-844x390.png) | [Capture](apres/depart-1-844x390.png) |

Les deux départs utilisent le même scénario avant et après, avec un commis, une unité de mêlée et une unité à distance pour chaque faction. La carte entière est photographiée sans brouillard.

```sh
MAP_CAPTURE_OUTPUT=docs/issue-303/apres node scripts/map-capture.mjs --terrain-art
```

La bande des Braises traverse le centre avec un fondu vers les Cendres et le Marécage. La rotation de 180° reproduit les teintes de part et d’autre du centre. Les courbes des haies sont calculées à partir des cases et de leurs voisins directs, puis peintes avec l’atlas existant.

## Vérifications

- Les 125 tests courts passent, dont `map-layout.mjs`, `map-lanes.mjs` et le nouveau test des teintes et du hachage. La syntaxe de tous les fichiers `public/game/*.js` a été vérifiée.
- La luminosité du sol a baissé de 22 à 23 % sur trois échantillons en luma Rec. 709. La comparaison des rasters confirme que le cœur des massifs est identique et que le débord visible reste dans les 8 px des cases franchissables adjacentes.
- À caméra fixe, le cache de terrain a rasterisé chaque version une seule fois. La comparaison avec l’instrumentation de `render-bench.mjs` alterne les deux versions dans le même Chromium, avec un cache par version et 1 000 images mesurées par scénario.

| Couche terrain | Avant | Après | Écart |
| --- | ---: | ---: | ---: |
| Horde, 91 unités | 0,138 ms | 0,105 ms | −24 % |
| Scénario chargé, 93 unités | 0,117 ms | 0,101 ms | −14 % |

Les chiffres du tableau proviennent de la passe exécutée après la suite de tests. Les premières mesures en parallèle ont varié et l’exécution standard du benchmark a dépassé ses budgets globaux de rendu.

## À vérifier sur téléphone

En paysage, quitter les deux bases et suivre une lisière au pouce. Vérifier que le débord du feuillage laisse le chemin lisible, que les unités se détachent du sol en mouvement et que les trois teintes restent distinctes à faible luminosité.
