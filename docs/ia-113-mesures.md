# PR #167 — correction de l’oscillation des vagues

## Correction

Chaque unité garde l’heure de son dernier départ. Les réserves et les secours
excluent les unités parties il y a moins de dix secondes ; `launchAttack`
contrôle également cette contrainte pour toutes les difficultés.

Le rappel économique devient un état défensif : les unités retirées de
`deployed` reçoivent un ordre vers la menace et les départs normaux comme les
secours restent interdits pendant ce rappel. L’exception d’assaut déjà engagé
(`committedAssault`) reste en place. Le départ au plafond (`saturated`) reste
possible dès la levée du rappel, sous réserve du délai individuel de dix secondes.
Aucune statistique, vitesse ou modification de `sim.js`.

Le scénario ajouté à `tests/ia-cohesion.mjs` couvre les deux équipes, Brutal
et Impitoyable : départ au plafond, menace sur le trajet d’une extension hors
du rayon des mines, absence de relance avant dix secondes, reprise après levée
de menace et blocage des secours si la menace persiste.

## Cause confirmée par la trace temporaire

Rejeu avant correction : `node tests/impitoyable.mjs --graine 10`.
La ligne 390 du fichier d’origine (`for (const unit of army) deployed.delete(unit.id)`)
retire les mêmes huit unités à chaque réaction, juste avant `launchAttack`.
Le rappel est déclenché par `threatenedEconomy=true`, avec
`committedAssault=false` et `invaders=0`. Ainsi `defending` restait faux et
`saturated` relançait immédiatement les réserves, en remettant la route à zéro.

Les lignes exactes de la trace (horloge flottante de simulation) :

```json
{"time":385.00000000001904,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":385.00000000001904,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":385.2000000000191,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":385.2000000000191,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":385.40000000001913,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":385.40000000001913,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":385.6000000000192,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":385.6000000000192,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":385.8000000000192,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":385.8000000000192,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":386.00000000001927,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":386.00000000001927,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":386.2000000000193,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":386.2000000000193,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":386.40000000001936,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":386.40000000001936,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":386.6000000000194,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":386.6000000000194,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":386.80000000001945,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":386.80000000001945,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":387.0000000000195,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":387.0000000000195,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":387.20000000001954,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":387.20000000001954,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":387.4000000000196,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":387.4000000000196,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
{"time":387.60000000001963,"team":1,"launch":[64,65,66,69,70,71,72,75],"traceRemoval":{"time":387.60000000001963,"line":390,"threatenedEconomy":true,"committedAssault":false,"invaders":0,"ids":[64,65,66,69,70,71,72,75]}}
```

La trace temporaire a été retirée du code.

## Rejeux ciblés

Aucun tournoi complet lancé. Les deux voies explicites de rejeu sont limitées
à deux parties. La suite courte a lancé sa propre graine 23 : chevauchement
temporaire à trois parties avant détection, puis suspension du rejeu 10 et
reprise après terminaison de la suite courte. Cette limite n’a donc pas été
respectée pendant tout le run.

`node tests/impitoyable.mjs --graine 1`

```text
AssertionError [ERR_ASSERTION]: Seed 1: no winner after 25 minutes
```

`node tests/impitoyable.mjs --graine 2`

```text
{"seed":2,"strongTeam":1,"winner":0,"duration":1228.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,14]},{"time":300,"rubies":815,"armies":[12,14]}]}
```

`node tests/impitoyable.mjs --graine 3`

```text
{"seed":3,"strongTeam":0,"winner":1,"duration":1091.3,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":355,"armies":[14,13]},{"time":300,"rubies":642.5,"armies":[3,12]}]}
```

`node tests/impitoyable.mjs --graine 8`

```text
{"seed":8,"strongTeam":1,"winner":0,"duration":1252.2,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":42.5,"armies":[10,14]},{"time":300,"rubies":717.5,"armies":[10,15]}]}
```

`node tests/impitoyable.mjs --graine 10`

```text
{"seed":10,"strongTeam":1,"winner":0,"duration":1017,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,14]},{"time":300,"rubies":770,"armies":[10,15]}]}
```

`node tests/ia-sans-blocage.mjs --graine 18`

```text
Seed 18: cooks, 672.2s, rats team 1, rubies 725/35, waves 6/6, bank seconds 4/0
```

`node tests/ia-sans-blocage.mjs --graine 30`

```text
Seed 30: cooks, 309.9s, rats team 1, rubies 690/25, waves 1/1, bank seconds 0/0
```

`node tests/ia-sans-blocage.mjs --graine 32`

```text
Seed 32: cooks, 799.7s, rats team 1, rubies 110/30, waves 6/10, bank seconds 20/0
```

`node tests/equilibrage-factions.mjs --graine 28`

```text
Seed 28: cooks, 1234.0s, rats team 1, rubies 685/253
```

**Critères non atteints pour Impitoyable :** graine 1 sans vainqueur à
1 500 s ; graines 2, 3, 8 et 10 perdues (`winner=0` pour les graines
2, 8 et 10, `winner=1` pour 3). Les victoires exigées sur 1, 2, 3 et 8
ne sont pas rétablies.

**Critères atteints sur les autres rejeux :** vainqueur sur 18, 30, 32 et 28 ;
`bank seconds` de 0/0 sur 30 et 20/0 sur 32, inférieurs à 60.

## Vérifications

- `node scripts/tests-courts.mjs` : **78 OK, 1 KO**.
- Échec de `tests-longs-graine.mjs` : référence exacte ancienne de la graine 23.
  Résultat actuel : `Seed 23: rats, 848.9s, rats team 0, rubies 745/5, waves 7/6, bank seconds 22/0`.
  Référence attendue : `Seed 23: cooks, 314.7s, rats team 0, rubies 35/780, waves 1/1, bank seconds 0/0`.
  Le test exige aussi les relevés limités à 120 et 240 s, devenus incomplets
  pour cette partie plus longue. Ce fichier n’est pas modifié hors du périmètre demandé.
- `node --check` : **34 fichiers JavaScript** de `public/game/` passent.
- `git diff --check` : OK.
- Aucun tournoi complet lancé ; aucun commit ni push, conformément à la règle finale.
- La suite courte a lancé implicitement une troisième partie (graine 23) en
  parallèle des deux rejeux explicites. Après découverte, un rejeu explicite a
  été suspendu jusqu’à la fin de la suite pour revenir à deux parties actives.

## État prêt pour le workflow

Correction de l’oscillation et scénario court préparés en moins de 25 minutes,
sans commit ni push conformément à la règle finale. Aucun changement dans
`.github/`. La PR reste **KO** : critères Impitoyable non remplis et suite courte
à 78/79. Le test de cohésion ajouté passe ; il ne prouve pas les victoires.

Description proposée pour la PR : empêcher les départs répétés d’une même
unité pendant dix secondes et bloquer les départs pendant le rappel économique,
avec un ordre de défense effectif. Trace causale et neuf résultats exacts
ci-dessus. Les critères Impitoyable et la suite courte restent non satisfaits.

Sur un vrai téléphone : observer la défense de l’extension menacée, l’absence
de piétinement après rappel et le départ au plafond une fois la menace levée.
Aucune interface tactile modifiée.
