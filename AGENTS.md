# CENDRE — consignes pour les agents de code

RTS 1v1 mobile (téléphone en paysage), navigateur pour l'instant. Cuistots-Furieux contre Rats.
Le jeu est dans `public/game/` (canvas 2D, JS natif, pas de Phaser). La simulation partagée est dans `public/game/sim.js`. Le serveur multijoueur est dans `lib/match.mjs`.

## Règles de travail
- **Une issue = une PR, petite et ciblée.** Ne touche pas à ce que l'issue ne demande pas. Pas de refonte opportuniste.
- **Critère de réussite :** chaque issue en donne un. La PR doit le remplir, sinon elle n'est pas terminée.
- **Tests :** les tests courts se lancent avec `node scripts/tests-courts.mjs` (jamais de glob `tests/*.mjs` dans un run Codex) ; les 4 tests longs sont lancés par le relecteur ; `node --check` doit passer sur chaque fichier de `public/game/`. Ajoute ou complète un test dans `tests/` qui prouve le critère de réussite, quand c'est testable sans navigateur.
- **Format du code :** une instruction par ligne, des noms explicites, pas de code compacté sur une seule ligne.
- **Référence mobile :** viewport 844×390 en paysage, tactile, avec le pouce. Aucune action fréquente ne doit demander de viser une cible de moins de 44 px à l'écran.
- **Simulation :** toute logique de jeu va dans `sim.js` (partagée entre le solo et le serveur). Le rendu et l'interface ne modifient jamais l'état directement en multijoueur : ils passent par les commandes.
- **Description de la PR (en français) :** ce qui a changé, ce qui a été vérifié, ce qui reste à tester sur un vrai téléphone.

## Exigence
Les joueurs de RTS sont très exigeants. Un mauvais clic, une unité bloquée ou un ordre en retard est un bug, pas un détail.
