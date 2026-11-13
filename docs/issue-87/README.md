Icônes des boutons — issue #87

Les boutons utilisent des SVG inline à trait simple, en `currentColor`, sans dépendre des polices du téléphone. Les libellés, les dimensions CSS, les commandes et les messages restent inchangés. `tests/icons.mjs` vérifie les noms utilisés, la cohérence des SVG statiques et l’absence de pictogrammes Unicode dans les boutons.

Captures Chromium headless, viewport tactile 844×390 :

- [Panneau des unités](unites-844x390.png)
- [Menu radial](radial-844x390.png)

Les captures proviennent du jeu solo démarré avec un commis sélectionné. Le menu radial a été ouvert avec une instrumentation temporaire du navigateur, absente du code livré.

Vérifications réussies : les 47 fichiers `tests/*.mjs` exécutés avec Node, `node --check` sur les 31 fichiers JavaScript de `public/game/`, `git diff --check` et ouverture du jeu dans Chromium sans erreur JavaScript. Les icônes visibles sur les deux captures ont été contrôlées visuellement : aucun carré vide.

À vérifier sur un vrai téléphone Android : lisibilité des traits, contraste des boutons désactivés, plein écran et précision des appuis dans le panneau et le menu radial.
