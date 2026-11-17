# IA : relancer les sièges avec une banque pleine (#171)

Brutal et Impitoyable au plafond avec plus de 1 500 rubis relancent une vague sans attendre le retour au ralliement ni le secours à 120 s lorsque leur route a été abandonnée. Le délai individuel de départ de 10 s et le changement de voie sont conservés. `siegeStalled` reste actif après 90 s sur une étape intermédiaire.

Une vague au plafond avec cette banque peut aussi devenir un siège avant 720 s : elle conserve son engagement et reçoit ses renforts en flux après les pertes. Les actions de recrutement et de cuisine existantes sont conservées. Aucun changement de simulation, de coûts, de statistiques ou de vitesse.

## Vérifications

Le test court `tests/ia-banque-plafond.mjs` couvre les deux factions en Brutal et Impitoyable dès 480 s, au plafond avec 3 000 rubis : départ sans rassemblement, relance immédiate d'un siège bloqué par une autre voie, production après pertes sous 30 s et renforts envoyés sur la route sous le plafond.

Trois rejeux longs seulement, une fois chacun. **Ils ont chargé la première version du correctif (relance immédiate), avant le complément qui active le siège riche avant 720 s. Le critère de banque n'est donc pas validé pour la version finale.** Lignes exactes :

```text
Seed 22: cooks, 1392.3s, rats team 1, rubies 555/20, waves 9/12, bank seconds 54/0
Seed 32: cooks, 800.3s, rats team 1, rubies 685/20, waves 8/8, bank seconds 157/0
```

La graine 22 respecte le critère sur cette première version ; la graine 32 échoue (157 s > 60 s). Cet échec a motivé le complément avant 720 s. Aucun rejeu supplémentaire n'a été lancé, conformément au plafond de trois rejeux. Le relecteur doit encore vérifier les deux graines sur la version finale et lancer les quatre tournois complets et les duels 1 à 4.

Le duel `node scripts/monstres-duels.mjs 2` garde un vainqueur (première version) :

```text
{"seed":2,"winner":1,"seconds":1616.5}
```

`node scripts/tests-courts.mjs` : **85 OK, 0 KO** sur la version finale du contrôleur. Le test ciblé a également été relancé après ajout de son assertion sur les renforts en flux : succès. `tests/tests-longs-graine.mjs` passe : la ligne figée de la graine 23 reste inchangée.

`node --check` passe sur chaque fichier `public/game/*.js`. `git diff --check` passe.

Description préparée pour le workflow ; aucun commit ni push, et aucun changement dans `.github/`. La création de la PR est laissée au workflow conformément à la consigne supplémentaire.

## Sur un vrai téléphone

Vérifier en paysage 844×390 que les vagues et leurs renforts restent lisibles après un siège abandonné. Aucun changement d'interface ni de cible tactile.
