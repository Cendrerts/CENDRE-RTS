# PR #167 — rétablissement du départ au plafond

Référence relue : `930d532`. Correction limitée à `public/game/ai.js` et au
test de cohésion associé. Le workflow effectue le commit et le push.

## Correction et limite constatée

Brutal et Impitoyable retrouvent le départ lorsque `saturated` est vrai, même
sous le seuil normal de force. Sous le plafond, `overdue` seul ne suffit
toujours pas à lancer leurs petites vagues. Le seuil de force des
contre-attaques reste en place. `garrisonIds`, les secours et les renforts
restent inchangés.

Le test court `tests/ia-cohesion.mjs` exige désormais le départ au plafond de
sept attaquants blessés de force 3,5, pour les deux équipes et les deux
difficultés. Les cas de garnison, de délai sous le plafond et de contre-attaque
sous le seuil restent couverts.

**Le critère de victoire d’Impitoyable n’est pas rempli.** La trace du passage
précédent montrait déjà que la graine 10 partait via `saturated` à 308,6 s
(sept attaquants, force 4,7), puis relançait huit attaquants de force 5,8 entre
385,6 et 387,6 s, toutes les 0,2 s. Restaurer le plafond reproduit une défaite
à 893,4 s. La graine 3 est également perdue, à 855,4 s.

Piste proposée pour une correction ultérieure : distinguer une vraie nouvelle
vague d’une relance des mêmes réserves au plafond et empêcher ces relances
répétées, tout en conservant un départ obligatoire au plafond. Cette piste
n’est pas implémentée ni validée ici ; ne pas rétablir le blocage global de
`saturated` pour gagner ces graines.

## Rejeux ciblés

Tous lancés avec `--graine`, deux parties au maximum à la fois.
Aucun tournoi complet lancé. Les lignes JSON sont à comparer explicitement
sur `winner` et `strongTeam` : en mode graine, une défaite d’Impitoyable ne
fait pas échouer le processus du test.

`node tests/impitoyable.mjs --graine 1`

```json
{"seed":1,"strongTeam":0,"winner":0,"duration":776,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":532.5,"armies":[1,10]}]}
```

`node tests/impitoyable.mjs --graine 2`

```json
{"seed":2,"strongTeam":1,"winner":1,"duration":674.8,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":540,"armies":[3,10]}]}
```

`node tests/impitoyable.mjs --graine 3`

```json
{"seed":3,"strongTeam":0,"winner":1,"duration":855.4,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":805,"armies":[13,5]}]}
```

`node tests/impitoyable.mjs --graine 8`

```json
{"seed":8,"strongTeam":1,"winner":1,"duration":673.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":42.5,"armies":[10,16]},{"time":300,"rubies":532.5,"armies":[12,6]}]}
```

`node tests/impitoyable.mjs --graine 10`

```json
{"seed":10,"strongTeam":1,"winner":0,"duration":893.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":782.5,"armies":[11,9]}]}
```

`node tests/ia-sans-blocage.mjs --graine 18`

```text
Seed 18: cooks, 1747.5s, rats team 1, rubies 650/30, waves 14/31, bank seconds 95/41
```

`node tests/ia-sans-blocage.mjs --graine 30`

```text
Seed 30: cooks, 590.6s, rats team 1, rubies 690/50, waves 4/3, bank seconds 0/0
```

`node tests/ia-sans-blocage.mjs --graine 32`

```text
Seed 32: cooks, 1105.6s, rats team 1, rubies 610/770, waves 15/13, bank seconds 190/0
```

`node tests/equilibrage-factions.mjs --graine 28`

```text
Seed 28: rats, 588.8s, rats team 1, rubies 30/556
```

Les quatre parties précédemment sans vainqueur (Impitoyable 1, sans blocage
30 et 32, équilibrage 28) ont désormais un vainqueur. Il reste des épisodes
de banque supérieure à 1 500 rubis pendant 95 s (sans blocage 18) et 190 s
(sans blocage 32), au-delà des 60 s tolérées par le tournoi complet.
Les rejeux ciblés n’appliquent pas cette assertion du tournoi ; leurs codes
de sortie ne prouvent donc pas l’absence de thésaurisation.

## Vérifications finales

- `node scripts/tests-courts.mjs` : **79 OK, 0 KO**, suite entière lancée
  une seule fois après la dernière modification du code et des tests.
- `node --check` : **34 fichiers JavaScript** de `public/game/` passent.
- `git diff --check` : OK.
- Neuf rejeux ciblés terminés, deux au maximum à la fois ; aucun tournoi complet.
- Modifications préparées en moins de 25 minutes, sans commit ni push,
  conformément à la règle finale du workflow. Aucun changement dans `.github/`.

Description proposée pour la PR : rétablissement du départ au plafond et
conservation de la garnison ; les neuf lignes de résultats ci-dessus sont
à reprendre dans la description. Correction encore partielle : Impitoyable
perd 3 et 10, et les graines sans blocage 18 et 32 dépassent 60 s de banque.

Sur un vrai téléphone : observer le maintien de la garnison et le départ des
vagues au plafond, notamment lorsque les unités sont blessées.
Aucune interface tactile modifiée.
