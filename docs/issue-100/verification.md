Les déclarations du HUD sous 9 px ont été relevées à 9 px dans style.css et panel.css. Les feuilles mobile.css, production.css et radial.css respectaient déjà ce seuil. Aucun changement de comportement, de couleur, d’icône ou de géométrie des boutons.

Reproduction : `PLAYWRIGHT_MODULE=/chemin/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/tailles-texte.mjs` (ou `node scripts/tailles-texte.mjs` avec Playwright et son navigateur installés). Le script sert les fichiers du jeu, lance le solo, fige la simulation pour les captures et prépare les sélections (unité seule, bâtiment, groupe mixte avec compteurs à 9 px) sans modifier les sources du jeu. Il mesure les nœuds texte visibles du HUD, contrôle les cibles tactiles et les débordements des libellés dans le panneau et la production, puis écrit tailles.txt et les quatre captures pour les deux factions.

Le test Node textes-lisibles.mjs parcourt toutes les feuilles CSS de public/game/ et interdit les tailles en px sous 9, sauf les sélecteurs explicitement listés du menu d’accueil.

À tester sur un vrai téléphone : lecture en un coup d’œil à distance normale, confort au pouce et rendu des polices sur Safari iOS et Chrome Android.

Résultats : les 52 fichiers tests/*.mjs passent avec Node ; node --check passe sur chaque fichier public/game/*.js et sur le nouveau script Playwright ; git diff --check passe. Les six états Playwright (trois sélections, deux factions) passent, toutes les cibles visibles mesurées font au moins 44×44 px et aucun libellé du panneau ou de Production ne déborde. Captures examinées pour les deux factions avec unité sélectionnée : ordres complets, boutons à leur place.

Lors de l’exécution parallèle des lots Node, le seuil temporel de separation.mjs a échoué sous charge (2,299 ms/tick). Relancé seul après les simulations, il passe à 0,212 ms/tick, sans modification du jeu ni du test.
