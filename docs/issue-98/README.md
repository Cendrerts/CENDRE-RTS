# Emblèmes de faction — issue #98

Les boutons de faction affichent une toque sur un couperet croisé et une tête de rat de profil sur un couvercle de poubelle. Les SVG font 32 px, avec un aplat issu de `TEAM_COLORS` et un contour sombre de 1,5 px. Les textes et les styles du menu restent inchangés.

[Capture du menu en 844×390](menu-844x390.png), réalisée dans Chromium. Les deux emblèmes sont distincts et les libellés de faction sont entiers. Le panneau conserve son défilement existant pour accéder au bas du menu.

Le test `tests/emblemes-factions.mjs` contrôle les deux icônes, leur présence dans les bons boutons, leurs dimensions, leurs couleurs, leur contour et la disparition des anciennes références.

À vérifier sur un vrai téléphone : reconnaissance des silhouettes et lisibilité des moustaches à taille réelle, contraste et sélection tactile des deux factions.

Vérifications réussies : les 51 fichiers `tests/*.mjs` exécutés avec Node, `node --check` sur les 32 fichiers `public/game/*.js` et `git diff --check`.
