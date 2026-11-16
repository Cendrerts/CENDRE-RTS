# PR #167 — correction partielle de la régression d’Impitoyable

Référence relue : `0539f08`. Aucun commit ni push ; publication par le workflow.

La garnison et la sélection des attaquants des vagues normales retrouvent leur
comportement antérieur. Seul le héros d’Impitoyable accompagne les vagues de
secours, avec deux soldats ordinaires laissés en garnison. Brutal conserve sa
sélection antérieure, y compris pour les secours. Après 20 minutes simulées, les
secours d’Impitoyable engagent aussi les derniers gardes pour terminer le siège.
Statistiques, vitesses, revenus et
configuration des difficultés et `sim.js` inchangés.

Les rejeux demandés sont lancés avec `--graine`, deux parties au maximum à la fois.
Aucun tournoi complet lancé. **Objectif non atteint** : les graines 1, 2, 3 et 9
sont gagnées, mais 8 et 10 restent perdues. Ces deux défaites du côté équipe 1
empêchent le seuil ≥ 4/5 dans cette équipe, même si les trois autres graines
de cette équipe sont gagnées. Ne pas considérer la régression comme résolue.
La validation a dépassé les 25 minutes demandées ; aucun commit ni push effectué.

## Lignes de résultat

`node tests/impitoyable.mjs --graine 1`

```text
{"seed":1,"strongTeam":0,"winner":0,"duration":889.4,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":477.5,"armies":[5,8]}]}
```

`node tests/impitoyable.mjs --graine 2`

```text
{"seed":2,"strongTeam":1,"winner":1,"duration":571.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":540,"armies":[3,10]}]}
```

`node tests/impitoyable.mjs --graine 3`

```text
{"seed":3,"strongTeam":0,"winner":0,"duration":450.3,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":442.5,"armies":[3,15]}]}
```

`node tests/impitoyable.mjs --graine 8`

```text
{"seed":8,"strongTeam":1,"winner":0,"duration":1440.1,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":42.5,"armies":[10,16]},{"time":300,"rubies":532.5,"armies":[12,6]}]}
```

`node tests/impitoyable.mjs --graine 9`

```text
{"seed":9,"strongTeam":0,"winner":0,"duration":889.4,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":477.5,"armies":[5,8]}]}
```

`node tests/impitoyable.mjs --graine 10`

```text
{"seed":10,"strongTeam":1,"winner":0,"duration":893.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":782.5,"armies":[11,9]}]}
```

`node tests/ia-sans-blocage.mjs --graine 18`

```text
Seed 18: cooks, 1747.5s, rats team 1, rubies 650/30, waves 14/31, bank seconds 95/41
```

## Vérifications

- `node scripts/tests-courts.mjs` : 78 OK, une référence déterministe du rejeu 23
  en échec ; référence rétablie puis `node tests/tests-longs-graine.mjs` : PASS.
  La suite entière n’a pas été relancée après cette correction de référence.
- `node --check` : les 34 fichiers JavaScript de `public/game/` passent.
- `git diff --check` : OK.


Le test court `tests/ia-cohesion.mjs` couvre les deux équipes, Brutal et Impitoyable,
les vagues normales et de secours, le maintien de deux gardes et leur engagement
dans les secours après 20 minutes. La référence du rejeu court 23 retrouve
314,7 s puisque Brutal conserve sa garnison initiale.

Sur un vrai téléphone : observer que le héros reste avec la garnison lors des
vagues normales et accompagne les secours d’Impitoyable. Aucune interface tactile
modifiée.
