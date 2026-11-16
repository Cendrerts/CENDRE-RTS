Corrige #168 : Difficile prépare sa première extension à 120 s au lieu de 150 s. Ce départ anticipé laisse davantage de marge au trajet et au financement du dépôt avant les combats. Seul le paramètre `expansion` de Difficile change ; les règles de `sim.js`, les statistiques, les vitesses, les revenus et les paramètres de Brutal et d’Impitoyable sont inchangés.

`tests/ai.mjs` affiche le temps de la première extension de l’équipe forte uniquement avec `--graine`, sans changer les assertions. Le nouveau test court `tests/ai-expansion-difficile.mjs` reprend exactement les placements et l’ordre de décision des graines 2 et 6 du tournoi. Il vérifie une mine d’index ≥ 2, possédée par Difficile, avec dépôt avant 240 s.

Avant correction : 14/20 extensions avant 240 s, 20/20 victoires. Les graines 2, 6, 10, 14, 16 et 18 ne posaient aucune extension. Le nouveau test échoue avant correction sur la graine 2 (`expansion null`), puis passe après correction sur les deux graines à 140,9 s (13,4 s de calcul dans la suite courte, sous la limite de 30 s).

Après correction : **20/20 extensions avant 240 s et 20/20 victoires de Difficile**. Chacun des vingt rejeux ciblés termine avec le code 0, assertions individuelles conservées. Les seuils collectifs (≥ 18 extensions, ≥ 15 victoires) sont vérifiés à partir de ces vingt résultats. Les quatre tournois longs complets n’ont pas été lancés.

Commandes de mesure : `node tests/ai.mjs --serie difficile-normal --graine N`, pour N de 1 à 20, avant et après correction, deux processus au maximum.

Les vingt lignes finales :

```text
expansion 1: 157.7
expansion 2: 140.9
expansion 3: 157.7
expansion 4: 140.9
expansion 5: 157.7
expansion 6: 140.9
expansion 7: 157.7
expansion 8: 140.9
expansion 9: 157.7
expansion 10: 140.9
expansion 11: 157.7
expansion 12: 140.9
expansion 13: 157.7
expansion 14: 140.9
expansion 15: 157.7
expansion 16: 140.9
expansion 17: 157.7
expansion 18: 140.9
expansion 19: 157.7
expansion 20: 140.9
```

Vainqueurs des rejeux finaux (durées arrondies par le test) :

| Graine | Durée (s) | Vainqueur |
| --- | --- | --- |
| 1 | 482 | difficile |
| 2 | 392 | difficile |
| 3 | 695 | difficile |
| 4 | 370 | difficile |
| 5 | 490 | difficile |
| 6 | 392 | difficile |
| 7 | 490 | difficile |
| 8 | 370 | difficile |
| 9 | 695 | difficile |
| 10 | 392 | difficile |
| 11 | 590 | difficile |
| 12 | 370 | difficile |
| 13 | 522 | difficile |
| 14 | 426 | difficile |
| 15 | 438 | difficile |
| 16 | 392 | difficile |
| 17 | 590 | difficile |
| 18 | 392 | difficile |
| 19 | 695 | difficile |
| 20 | 370 | difficile |

Vérifications :

- `node scripts/tests-courts.mjs` : **84 OK, 0 KO**, dont le nouveau test de régression (13,4 s).
- `node --check` : les 34 fichiers JavaScript de `public/game/` passent.
- `git diff --check` : OK.

Sur un vrai téléphone : vérifier en paysage 844×390 que l’ouvrier rejoint la naturelle et que le dépôt apparaît avant quatre minutes dans une partie contre Difficile. Les entrées tactiles et le rendu ne changent pas.

Aucun commit ni push effectué ; publication de la PR laissée au workflow conformément à la consigne.
