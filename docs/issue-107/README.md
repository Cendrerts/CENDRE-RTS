# Issue #107 — Les Rats-Goût dévorent les cadavres

Les militaires des deux camps et les Sangliers laissent un cadavre non bloquant pendant 30 secondes. La commande partagée `devour` envoie un seul militaire Rat manger pendant 4 secondes ; ses compagnons se déplacent à côté. Le repas apporte 6 ingrédients (10 pour un Sanglier) et soigne 30 % des PV maximum. Les dégâts pendant le repas et les nouveaux ordres l'annulent sans gain. Un cadavre consommé ou expiré libère proprement les autres rats qui le visaient.

Pour une sélection contenant un militaire Rat, le tap sur un cadavre dispose d'un diamètre minimal de 44 pixels ; à distance équivalente (6 pixels), les ennemis précèdent les cadavres. Les ouvriers seuls et les Cuistots ignorent les cadavres pour le ciblage, ce qui préserve les taps sur les mines et bâtiments. Le contour os de 2 pixels à l'écran et la croix claire rendent la silhouette sombre repérable. Les cadavres s'estompent durant leurs 5 dernières secondes ; une barre indique le repas et le gain flotte à la fin. Les commandes et les données visibles passent aussi par le serveur multijoueur. L'IA et le Ragoût restent inchangés.

## Vérifications

- `node tests/devorer.mjs` : morts militaires des deux camps, ouvriers, expiration, Sangliers, durée, ingrédients, soins et plafond, déplacement et immobilité, interruptions par dégâts et ordres, concurrence, sélection multiple, restrictions de faction, tap et sérialisation déterministe.
- Tests courts de `tests/`, avec `node tests/ai-carte-agrandie.mjs --short`.
- Conformément à la consigne spécifique : `ai.mjs`, `impitoyable.mjs`, `ia-sans-blocage.mjs` et `equilibrage-factions.mjs` sont laissés au relecteur.
- `node --check` sur chaque fichier `public/game/*.js` et `git diff --check`.
- Chromium tactile 844×390 : tap réel sur un cadavre, vérification d'un repas en cours et absence d'erreur JavaScript. Capture avec un cadavre seul au sol et un cadavre en cours de repas avec sa barre : [devorer-844x390.png](devorer-844x390.png).

La capture se reproduit avec `PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs node scripts/devorer-capture.mjs` (Chromium dans `/usr/bin/chromium`, ou variable `CHROME_PATH`). Le scénario est injecté uniquement par le serveur local du script.

## À vérifier sur un vrai téléphone

Confort au pouce et choix de cible dans un champ de bataille chargé, lisibilité du cadavre et de la progression, annulation en combat et retour visuel en duel avec latence réseau. Les chiffres de prototype restent à évaluer en partie.

Closes #107
