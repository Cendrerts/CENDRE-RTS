# Issue #116 — Tours de guet neutres

Deux tours remplacent l’ancienne tour centrale : `tour-nord` (1800, 650) et `tour-sud` (2200, 1550). Elles sont indestructibles, sans attaque et sans collision supplémentaire. Une présence militaire exclusive à moins de 90 px pendant 4 secondes consécutives donne la propriété. Absence, contestation ou changement de camp remettent la progression à zéro. La propriété persiste après le départ des unités et donne 420 px de vision, jusqu’à la reprise adverse.

Le drapeau et le point sur la mini-carte utilisent les couleurs des factions, ou le gris neutre. La progression est circulaire. Les propriétaires et compteurs de pertes sont synchronisés, y compris hors vision pour déclencher « Tour de guet perdue ». La progression ennemie hors vision reste masquée. Les anciennes sauvegardes reçoivent deux tours neutres. L’IA reste inchangée.

## Vérifications

- `node tests/watchtowers.mjs` : coordonnées, symétrie, terrain praticable, accès depuis les deux bases, rayon de capture, 4 secondes, interruptions, contestation neutre et possédée, reprise, ouvriers, possession persistante, vision accordée/retirée, indépendance, migration et synchronisation.
- Suite courte : résultats dans `tests-courts.txt`. Chaque fichier court est exécuté avec Node ; `ai-carte-agrandie.mjs` utilise `--short`. Les quatre suites contenant les tournois longs (`ai`, `equilibrage-factions`, `ia-sans-blocage`, `impitoyable`) sont exclues conformément à l’issue.
- `node --check` sur tous les fichiers `public/game/*.js`.
- Chromium tactile, viewport 844×390 : `tour-neutre-844x390.png`, `tour-capture-844x390.png`, `tour-possedee-844x390.png`. Vérification de l’alerte de perte et absence d’erreur JavaScript.

Reproduction des captures : `PLAYWRIGHT_MODULE=/chemin/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/watchtowers-capture.mjs`.

## À tester sur un vrai téléphone

Lisibilité des drapeaux, de la jauge et des points de mini-carte aux différents zooms ; déplacement tactile vers chaque tour ; reprise contestée et réception de l’alerte dans un duel entre deux téléphones.
