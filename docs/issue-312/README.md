# Issue #312 · Sol et masses bloquantes peints

- [Carte entière avant](carte-entiere-avant.png) et [carte entière après](carte-entiere-apres.png)
- [Départ Cuistots-Furieux](depart-0-844x390.png) et [départ Rats](depart-1-844x390.png), à 844×390 avec unités

Les captures proviennent de `scripts/map-capture.mjs --terrain-art`. Les départs incluent un chevalier et un archer ajoutés par le script de capture.

## Mesure du rendu

`scripts/render-bench.mjs` a comparé la révision `4edc9d0` et le terrain peint sous Chromium 157, à 844×390, avec un ralentissement CPU ×4. Les deux passes ont utilisé les mêmes cœurs et mesuré 600 images par scénario.

| Scénario | Moyenne avant → après | P95 avant → après |
| --- | ---: | ---: |
| Combat | 6,39 → 3,04 ms | 16,60 → 4,30 ms |
| Horde | 2,38 → 2,59 ms | 3,40 → 3,60 ms |
| Horde, rendu complet | 11,11 → 10,87 ms | 17,60 → 16,00 ms |
| Partie chargée, rendu complet | 11,89 → 11,63 ms | 17,40 → 17,50 ms |

La plus forte hausse mesurée est de 8,7 % sur la moyenne du scénario Horde. Le coût moyen de la passe terrain est passé de 0,241 à 0,247 ms pour la horde en rendu complet et de 0,291 à 0,217 ms pour la partie chargée.
