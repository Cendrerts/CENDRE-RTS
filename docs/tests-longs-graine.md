# Rejouer une partie des tests longs

```sh
node tests/ia-sans-blocage.mjs --graine 34
node tests/impitoyable.mjs --graine 1
node tests/equilibrage-factions.mjs --graine 23
node tests/ai.mjs --graine 14 --serie difficile-normal
node tests/ai.mjs --graine 1 --serie brutal-difficile
```

`ia-sans-blocage` et `equilibrage-factions` acceptent les graines 18 à 37.
`ia-sans-blocage` rejoue uniquement le scénario pré-horde, celui des lignes de
référence de l’issue #159. `impitoyable` accepte les graines 1 à 10.

Dans `ai.mjs`, `--graine N` désigne la partie numéro N (1 à 20) de la série,
comme la colonne `game` du tableau complet. La série par défaut est
`difficile-normal`. Chaque série commence avec le générateur initialisé à 18.
Seuls les placements initiaux consomment ce générateur : les placements des
parties précédentes sont recalculés, sans simuler ces parties, afin de retrouver
son état exact. L’indice de ligne du tableau reste celui du tournoi complet.

Le mode isolé saute les autres scénarios et les assertions de bilan du tournoi.
Les assertions propres à la partie restent actives. Il imprime deux lignes
`releve {...}` toutes les 120 secondes simulées, au format du diagnostic, puis
le résultat habituel de la partie. Sans option, les scénarios, les graines et
les assertions du tournoi restent inchangés.
