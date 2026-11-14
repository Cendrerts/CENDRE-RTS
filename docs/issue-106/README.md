# Issue #106 — Ragoût de guerre

La tour principale Cuistot prépare un Ragoût pour 40 ingrédients en 20 secondes. Les militaires vivants à la fin de la cuisson gagnent 15 % de dégâts pendant 45 secondes. Une nouvelle préparation renouvelle la durée sans cumuler le bonus. Les ouvriers et les Rats-Goût sont exclus.

La commande est partagée entre solo et serveur. Le panneau affiche un bouton SVG d’au moins 44 × 44 px, grisé mais tapable en cas de refus. La tour affiche une barre de cuisson ; les militaires buffés affichent de la vapeur et le compteur d’ingrédients indique la durée restante.

Captures 844 × 390 :

- `tour-ragout-844x390.png` : tour sélectionnée et bouton Ragoût.
- `cuisson-844x390.png` : cuisson et toast de refus d’une seconde préparation.
- `unite-buffee-844x390.png` : vapeur au-dessus du militaire et compte à rebours.

Reproduction : `PLAYWRIGHT_MODULE=/chemin/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/ragout-capture.mjs`.

Vérifications : `tests/ragout.mjs` couvre les refus solo et serveur, la persistance, la cuisson, les dégâts militaires et ouvriers, le renouvellement et l’expiration. Le script navigateur vérifie la taille tactile du bouton, le toast pendant la cuisson et l’absence d’erreurs JavaScript.

Tous les tests autorisés passent, avec `ai-carte-agrandie.mjs --short`. Les quatre tournois longs ont été exclus conformément à la consigne. `node --check` passe sur tous les fichiers `public/game/*.js`, ainsi que sur le serveur modifié et le script de capture.

À tester sur un vrai téléphone : confort du bouton au pouce, lisibilité de la vapeur et du compteur en combat, et retour visuel pendant un duel réseau.
