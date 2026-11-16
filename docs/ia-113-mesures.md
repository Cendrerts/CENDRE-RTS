# PR #167 — graines 8 et 10 d’Impitoyable

Référence relue : `26c495c`. Contre-essai local sur main `60fc462`.
Les modifications sont préparées dans la branche ; le workflow effectue le commit
et le push.

## Diagnostic et correction

**Graine 8 : le héros sorti de garnison casse la partie.** Les traces temporaires
`console.log('DBG ...')` montrent les mêmes départs normaux à 208,4 s (équipe 1)
et 233,4 s (équipe 0). Au secours de 329,8 s, sept unités partent dans les deux
versions, mais main garde `knight, hero`, et la PR garde `knight, mage`.
À 360 s, l’armée adverse compte déjà 11 unités sur main contre 10 sur la PR.
Main gagne à 673,4 s, donc la règle des gardes après 1 200 s n’intervient pas
dans cette divergence. La sélection des secours retrouve `army.slice(garrison)`,
commune à Brutal et Impitoyable. Les deux exceptions propres à Impitoyable sont
retirées pour respecter D5.

**Graine 10 : le lancement normal contourne son seuil via la saturation.**
Sur la PR avant correction, les traces donnent :

- 308,6 s : sept attaquants, force 4,7, saturation vraie, contre-attaque fausse ;
- 385,6 à 387,6 s : huit attaquants de force 5,8 relancés toutes les 0,2 s ;
- 840 s : équipe 1, population 30, 17 militaires, 672,5 rubis, 36 vagues ;
- victoire adverse à 893,4 s, comme main.

La première cause est le lancement normal autorisé par `saturated || overdue`,
pas les secours ni le flux de renforts D30. Supprimer cette seule exception
retarde la défaite à 1 107,3 s. Un second contre-essai avec traces isole alors une
contre-attaque à 719,0 s : 14 attaquants, force 9,2, sous le seuil normal de 12.
En imposant aussi le seuil à la contre-attaque, Impitoyable gagne à 799,4 s.

La saturation et le délai de trajet ne dispensent plus Brutal ni Impitoyable de
`enoughTroops`. La contre-attaque peut ouvrir la fenêtre de départ, mais exige
elle aussi le seuil de force normal. La règle est commune aux deux difficultés ;
les renforts D30, les secours et les autres difficultés conservent leurs
conditions de lancement.
Aucun changement de statistiques, vitesse, revenus, configuration ou `sim.js`.

Les traces temporaires sont retirées. Le test court `tests/ia-cohesion.mjs`
couvre les deux équipes et les deux difficultés : garnison des vagues normales
et de secours (y compris à 1 200 s), attente à population pleine sous le seuil
de force, départ au seuil atteint, absence de relance des survivants blessés
après le délai de trajet et contre-attaque refusée sous le seuil.

## Rejeux ciblés

Uniquement avec `--graine`, deux parties au maximum à la fois.
Aucun tournoi complet lancé. Impitoyable gagne les quatre graines demandées ;
la graine 18 se termine par une victoire des Cuistots à 1 529,9 s.

`node tests/impitoyable.mjs --graine 2`

```text
{"seed":2,"strongTeam":1,"winner":1,"duration":1069.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":540,"armies":[3,10]}]}
```

`node tests/impitoyable.mjs --graine 3`

```text
{"seed":3,"strongTeam":0,"winner":0,"duration":789.2,"snapshots":[{"time":120,"rubies":42.5,"armies":[4,4]},{"time":200,"rubies":305,"armies":[14,13]},{"time":300,"rubies":805,"armies":[13,5]}]}
```

`node tests/impitoyable.mjs --graine 8`

```text
{"seed":8,"strongTeam":1,"winner":1,"duration":543.6,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":42.5,"armies":[10,16]},{"time":300,"rubies":532.5,"armies":[12,6]}]}
```

`node tests/impitoyable.mjs --graine 10`

```text
{"seed":10,"strongTeam":1,"winner":1,"duration":799.4,"snapshots":[{"time":120,"rubies":55,"armies":[4,4]},{"time":200,"rubies":30,"armies":[10,16]},{"time":300,"rubies":782.5,"armies":[11,9]}]}
```

`node tests/ia-sans-blocage.mjs --graine 18`

```text
Seed 18: cooks, 1529.9s, rats team 1, rubies 545/10, waves 11/10, bank seconds 29/0
```

## Vérifications

- `node scripts/tests-courts.mjs` : **79 OK, 0 KO**, suite entière exécutée une
  fois à la fin, après la dernière modification du code et des tests.
- `node --check` : les **34 fichiers JavaScript** de `public/game/` passent.
- `git diff --check` : OK.
- `tests/tests-longs-graine.mjs` passe dans la suite courte ; sa référence
  déterministe de la graine 23 reste inchangée.
- Modifications prêtes pour le commit et le push du workflow en moins de
  25 minutes. Aucun fichier de `.github/` modifié.

Sur un vrai téléphone : observer le regroupement des renforts et le maintien de
la garnison pendant les secours. Aucune interface tactile modifiée.
