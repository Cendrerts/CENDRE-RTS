# Issue #101 — confirmation d’abandon

Capture Chromium en viewport tactile 844×390 : [boîte ouverte](abandon-duel-844x390.png).
Le panneau est ouvert avec le gestionnaire réel du jeu, dans un état de duel injecté pour la capture, sans serveur réseau.

La confirmation réutilise le menu pause. « Continuer » est à gauche et mis en avant ; « Abandonner » est rouge à droite. Les deux boutons mesurent au moins 44 px. La partie continue et la fin du duel ferme le panneau. La commande de sortie reste inchangée.

Le test `tests/abandon-duel.mjs` vérifie l’absence des appels interdits, les choix, les doubles clics, l’absence de pause et la fermeture en fin de partie. Le callback interne de validation du placement radial est renommé `confirmPlacement` pour ne conserver aucune occurrence de `confirm(` dans les fichiers JavaScript.

À tester sur un vrai téléphone : confort tactile, annulation et abandon pendant un duel réseau, fin de partie avec la boîte ouverte, et application installée sur l’écran d’accueil iPhone.

Validation effectuée : les 55 fichiers `tests/*.mjs` passent avec Node, ainsi que `node --check` sur tous les fichiers `public/game/*.js`. Vérification Chromium : panneau visible, boutons d’au moins 44 px, fermeture par « Continuer », aucune erreur JavaScript.
