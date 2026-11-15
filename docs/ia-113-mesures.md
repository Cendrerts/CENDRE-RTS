# Issue #113 — correction partielle et mesures pour la PR

Référence : `60fc462`, après #164. Aucun commit ni push ; publication par le workflow.

Brutal et Impitoyable choisissent leurs deux gardes parmi les soldats ordinaires.
Le héros accompagne les vagues normales et les vagues de secours. Les statistiques,
vitesses, revenus et règles de simulation restent inchangés.

| Partie | Avant | Après |
| --- | --- | --- |
| Impitoyable 2 | Victoire à 674,8 s | Victoire à 518,2 s |
| Impitoyable 3 | Défaite à 855,4 s | Victoire à 522,1 s |
| Sans blocage 18 | 1 747 s, référence de l'issue | Victoire Cuistots à 1 025 s |

Mesures obtenues avec les rejeux `--graine`, via `snapshot` de l'outil existant.
Aucun tournoi complet lancé. La graine 2 gagnait déjà sur ce checkout.

Le point Difficile 15/20 reste NON RÉSOLU. Les réglages tentés ont été retirés :
- Protection des archers déjà en vague : victoires 2 à 516 s et 3 à 533 s
  (contre respectivement 516 et 504 s avant).
- Priorités d'urgence élargies : victoires 2 à 465 s et 14 à 416 s, mais armée
  dégradée sur 5 et 7 (7 militaires, héros mort niveau 1 à 360 s, contre
  11 militaires, héros vivant niveau 3 avant).
- Évacuation ciblée des récolteurs, éclaireur préservé : victoires 5 et 7 à
  478 s contre 590 s avant ; 9 gagne à 1 109 s contre 504 s avant ;
  surtout, 11 PERD à 638 s contre une victoire à 571 s avant. Réglage rejeté.
Les décisions de Difficile sont donc intégralement conservées. Ne pas fermer
l'issue sur cette PR sans traiter ce point.

Vérifications : suite courte par `node scripts/tests-courts.mjs` ; scénario
`tests/ia-cohesion.mjs` couvrant le héros dans les deux camps, les deux difficultés
et les deux types de vagues ; `ai-carte-agrandie.mjs --short` ; syntaxe des
34 fichiers JavaScript de `public/game/`.
Bilan de la suite : 78 OK et une ancienne référence de rejeu en échec ;
après actualisation, le rejeu isolé passe également. Les scénarios courts de
cohésion et de grande carte ont été rejoués avec le code final et passent.
La référence exacte du rejeu 23 dans `tests-longs-graine.mjs` doit suivre le
nouveau trajet du héros : 305,4 s au lieu de 314,7 s, même vainqueur.

Sur téléphone : observer le héros dans une vague normale et une vague de secours.
Aucune interface tactile modifiée. `monstres-duels` reste dans #166.
