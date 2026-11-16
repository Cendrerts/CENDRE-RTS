# PR #167 — rappel économique et engagement des vagues

## Corrections

Le délai individuel de dix secondes entre deux départs est conservé.

La défense globale dépend de nouveau uniquement des envahisseurs près des
mines : `defending = invaders.length > 0;`. Le rappel économique conserve
l'ordre de défense des unités rappelées. Sa variable locale `recallingArmy`
bloque uniquement le départ normal et `forceWave` pendant ce tick.
Le rappel n'annule donc plus indirectement les missions de tour, de foyer
ou de chasse. Le besoin de secours reste calculé avec la banque avant les
dépenses de macro.

Un refus de `launchAttack` laisse maintenant la mise à jour continuer.
Seul un départ accepté incrémente les métriques et modifie l'engagement
des unités ; les secours effacent leur mission de foyer après acceptation.

## Diagnostic de la graine 10

Après les deux premières corrections, le rejeu reproduit la défaite à
1 264,2 s. La trace temporaire précise pourquoi des vagues supérieures sont
encore rappelées : `knownBase=0` désactive à lui seul `committedAssault`.

Extraits exacts de `node tests/impitoyable.mjs --graine 10` :

```text
DBG {"event":"launch","time":383.80000000001877,"team":1,"count":8,"rebuildingBank":true,"knownBase":0}
DBG {"event":"recall","time":384.60000000001895,"team":1,"threatenedEconomy":true,"invaders":0,"knownBase":0,"army":11,"observed":1,"rebuildingBank":false,"point":{"x":3240,"y":450}}
DBG {"event":"recall","time":558.2000000000584,"team":1,"threatenedEconomy":true,"invaders":0,"knownBase":0,"army":14,"observed":1,"rebuildingBank":true,"point":{"x":2700,"y":1350}}
```

À 384,6 s, la troisième vague est engagée et l'armée compte onze militaires
contre un adversaire observé. À 558,2 s, même une vague avec banque de
reconstruction est rappelée. Dans les deux cas, l'absence de découverte
de la base empêche l'exception d'assaut de fonctionner.
Une tentative de suppression de cette dépendance ne suffit pas à gagner
la graine 10 et fait perdre la graine 8 : elle a donc été retirée.
La trace complémentaire de cette tentative
montre une base adverse encore à 1 115 PV après le siège, puis l'assaut gagnant
de Brutal sur la base d'Impitoyable :

```text
DBG {"event":"recall","time":1012.0000000001615,"team":1,"army":9,"observed":2,"knownBase":1,"rebuilding":false,"nearEnemy":0,"bases":[1115,1500]}
DBG {"event":"late","time":1140.1000000000586,"team":1,"army":10,"deployed":0,"nearEnemy":0,"bases":[1115,1128]}
DBG {"event":"late","time":1140.1000000000586,"team":0,"army":14,"deployed":14,"nearEnemy":9,"bases":[1115,1128]}
```

**Tentative retirée** : Brutal gagne la graine 10 à 1 158,2 s et la graine 8
à 891,4 s. Ces résultats ne sont pas ceux de la version finale.
**La graine 10 reste non résolue.**
Aucun réglage supplémentaire de combat n'est présenté comme validé.
Les traces `DBG` ont été retirées du code.

## Couverture courte

- `tests/ia-cohesion.mjs` conserve les scénarios du délai de dix secondes,
  du rappel persistant et des secours, pour les deux équipes et difficultés.
  Un scénario supplémentaire vérifie qu'une tour reste en capture pendant
  une menace économique lointaine, avec une banque qui déclencherait les secours.
- `tests/tests-longs-graine.mjs` compare la ligne déterministe de la graine 23
  au résultat de cette version et vérifie ses relevés toutes les 120 s.

## Rejeux ciblés de la version finale

Aucun des quatre tournois complets n'a été lancé. Les lignes ci-dessous proviennent
des rejeux exécutés sur le code finalement conservé.

`node tests/impitoyable.mjs --graine 1`

```text
{"seed":1,"strongTeam":0,"winner":0,"duration":552.1,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":532.5,"armies":[1,10]}]}
```

`node tests/impitoyable.mjs --graine 2`

```text
{"seed":2,"strongTeam":1,"winner":1,"duration":1304.1,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":540,"armies":[3,10]}]}
```

`node tests/impitoyable.mjs --graine 3`

```text
{"seed":3,"strongTeam":0,"winner":0,"duration":1169,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":805,"armies":[13,5]}]}
```

`node tests/impitoyable.mjs --graine 8`

```text
{"seed":8,"strongTeam":1,"winner":1,"duration":929.9,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":42.5,"armies":[10,16]},{"time":300,"rubies":532.5,"armies":[12,6]}]}
```

`node tests/impitoyable.mjs --graine 10`

```text
{"seed":10,"strongTeam":1,"winner":0,"duration":1264.2,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":782.5,"armies":[11,9]}]}
```

`node tests/ia-sans-blocage.mjs --graine 18`

```text
Seed 18: cooks, 1152.3s, rats team 1, rubies 740/480, waves 10/14, bank seconds 75/70
```

`node tests/ia-sans-blocage.mjs --graine 30`

```text
Seed 30: cooks, 1055.2s, rats team 1, rubies 910/35, waves 7/10, bank seconds 0/4
```

`node tests/ia-sans-blocage.mjs --graine 32`

```text
Seed 32: cooks, 1195.6s, rats team 1, rubies 605/390, waves 10/16, bank seconds 465/226
```

`node tests/equilibrage-factions.mjs --graine 28`

```text
Seed 28: cooks, 699.6s, rats team 1, rubies 435/456
```

Impitoyable gagne les graines 1, 2, 3 et 8. La graine 10 reste perdue.
Tous les neuf rejeux obligatoires ont un vainqueur.

**Limite supplémentaire observée :** les `bank seconds 75/70` de la graine 18
et `465/226` de la graine 32 dépassent la limite de 60 s vérifiée par le tournoi complet ia-sans-blocage.
Le critère d’accumulation du tournoi reste donc KO malgré les vainqueurs.

## Vérifications

- `node scripts/tests-courts.mjs` : **79 OK, 0 KO**, sur le code conservé.
- `node --check` : **34 fichiers JavaScript** de `public/game/` passent.
- `git diff --check` : OK.
- Graine 23 : `Seed 23: cooks, 411.8s, rats team 0, rubies 35/700, waves 1/2, bank seconds 0/0`.
- Description de la PR actualisée avant les 25 minutes ; les vérifications
  finales ont continué ensuite. Aucun code publié par l'agent.

Aucun commit ni push ; aucun changement dans `.github/`, conformément à la
consigne finale. La description de la PR est mise à jour séparément.

## Sur un vrai téléphone

Observer la défense d'une extension menacée, la poursuite des missions
de tour, foyer et chasse pendant un rappel lointain, l'absence de piétinement
et la reprise des vagues après le délai de dix secondes.
Aucune interface tactile modifiée.
