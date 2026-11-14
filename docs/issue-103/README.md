# Issue 103 — carte agrandie, partie 1

La carte partagée mesure 4000 × 2200, avec une grille de déplacement et de brouillard de 200 × 110 cellules. Les départs sont en (450, 1750) et (3550, 450). Le terrain et les extensions sont symétriques par rotation de 180°.

Chaque départ dispose de sa mine de rubis, d’une naturelle proche et protégée et de deux extensions sur les flancs. La Veine riche est au centre exact. La tour et le dépôt central sont sur la médiatrice des départs, à égale distance des deux joueurs. Trois chemins, centre, nord et sud, relient les bases entre les murs de forêt ; les passages entre clairières font 220 unités de large. Les deux petits bosquets traversables conservent les règles existantes de dissimulation et de dégâts.

Les six emplacements réservés, sans entités ni récompenses, sont nommés dans `Sim.reservedSites` :

| Nom | Position |
| --- | --- |
| camp-nord-ouest | 1050, 450 |
| camp-sud-est | 2950, 1750 |
| camp-nord-est | 2550, 450 |
| camp-sud-ouest | 1450, 1750 |
| braises-ouest | 1450, 1350 |
| braises-est | 2550, 850 |

Le rendu réassemble les éléments de l’image Terres Brûlées existante, sans modifier les assets ni les unités. Les murs affichés suivent la grille de collision. Le zoom conserve l’échelle tactile précédente et la vue initiale est centrée sur sa base, en solo et en multijoueur. La mini-carte respecte les proportions du monde, indique les bases visibles et conserve les mines explorées ; toucher et glisser déplacent la caméra. La synchronisation utilisait déjà les dimensions exportées par la simulation.

## Captures

- [Départ Cuistots, 844 × 390](depart-0-844x390.png).
- [Départ Rats, 844 × 390](depart-1-844x390.png).
- [Carte entière, affichée en 1600 × 880](carte-entiere.png). Le brouillard est révélé uniquement par la fixture de capture pour montrer toute la disposition.

Reproduction :

```sh
PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/map-capture.mjs
```

## Vérifications

- 52 fichiers de tests exécutés individuellement avec Node, tous réussis.
- Les quatre tournois longs ont été volontairement exclus : `ai.mjs`, `ia-sans-blocage.mjs`, `equilibrage-factions.mjs`, `impitoyable.mjs`.
- `node --check` sur les 34 fichiers `public/game/*.js` ; `git diff --check`.
- Nouveau test `tests/map-lanes.mjs` : 24 traversées complètes par commandes et ticks réels (3 chemins × 2 départs × 4 types d’unités), contrôle de chaque point de passage, du terrain praticable, de la survie et de l’absence d’immobilisation pendant deux secondes. Vérifications de symétrie, d’accessibilité des réserves, de distance des objectifs, de caméra et de sérialisation du brouillard.
- Tests de foule : 40 unités dans le couloir nord, croisement de 20 contre 20 et arrivée de 30 unités à la base, sans perte ni blocage.
- Chromium : départs centrés, échelle tactile conservée, mini-carte glissable à la souris et par événements tactiles réels émulés, aucune erreur JavaScript.
- Vérification courte de l’IA existante aux deux départs pendant 60 secondes simulées : recrutement fonctionnel. Aucun tournoi ni changement de comportement IA.

À tester sur un vrai téléphone : fluidité des déplacements et du zoom, chargement du terrain, lisibilité de la mini-carte et précision du glissement au pouce, puis duel multijoueur sur réseau mobile. Les tournois longs et les adaptations IA restent à la relecture et à #110.

Aucun changement d’équilibrage, aucun changement dans `.github/`, aucun commit ni push.
