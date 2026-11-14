# Issue #105 — camps de Sangliers des cendres

Quatre camps symétriques de deux sangliers occupent les emplacements réservés de la carte. La simulation partagée gère l’agression à moins de 90 px du camp ou après une attaque, les attaques de 12 dégâts toutes les 1,2 s, la laisse de 260 px, le retour protégé avec régénération et les réapparitions 120 s après la mort du dernier sanglier. Chaque dernier coup donne 15 ingrédients au joueur concerné, sans dépense possible.

Les monstres utilisent une collection et un compteur d’identifiants distincts des armées pour conserver les décisions, les effectifs et les départages de collision des unités existantes. Les attaques explicites, les dégâts de zone et la riposte automatique les prennent en compte. Le serveur conserve les camps et les ingrédients et transmet les monstres visibles ainsi que les ingrédients du joueur. Les références de cible sont rétablies après sérialisation.

## Vérification

**55 fichiers de tests exécutés avec succès**, hors les quatre tournois explicitement exclus. Le script D11 séparé conserve les échecs détaillés ci-dessous.

- `node tests/monstres-neutres.mjs` : effectifs, symétrie, état initial déterministe, attaque explicite hors du rayon d’agression, butin des deux joueurs, attribution unique, absence de réapparition partielle, laisse, retour à pleine vie, réapparition complète, brouillard, ciblage tactile et persistance multijoueur.
- Les scénarios de déplacement de `crowd.mjs`, `map-lanes.mjs`, les trajets de récolte de `expansion.mjs` et les ralliements traversant un camp de `rally.mjs` et le miroir économique final de `ai-carte-agrandie.mjs` désactivent les camps dans leurs fixtures pour isoler leur objet de test. Les parties avec graines de `ai-carte-agrandie.mjs` conservent les camps réels. Le nouveau test vérifie les interactions avec les camps.
- Les quatre tournois `ai.mjs`, `impitoyable.mjs`, `ia-sans-blocage.mjs` et `equilibrage-factions.mjs` ne sont pas lancés, conformément à la consigne de l’issue (#113).
- `node --check` sur chaque fichier de `public/game/` et sur `lib/match.mjs`.

## Capture mobile

[camp-844x390.png](camp-844x390.png) : camp visible et compteur d’ingrédients à **12 px**, après les rubis, avec SVG inline. Aucune erreur JavaScript dans Chromium.

Reproduction :

```sh
PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs CHROME_PATH=/usr/bin/chromium node scripts/monstres-capture.mjs
```

Le script sert les fichiers du jeu, lance le solo, fige le temps et révèle le camp uniquement dans la page de capture. Il ne modifie pas les sources du jeu.

Les quatre duels Brutal contre Brutal sont reproductibles avec `node scripts/monstres-duels.mjs` (graines 1 à 4, retards initiaux et positions de départ déterministes, limite de 20 minutes simulées). Une sélection peut être relancée, par exemple `node scripts/monstres-duels.mjs 3 4`.

Résultats de la version finale :

| Graine | Vainqueur | Temps simulé |
| --- | --- | --- |
| 1 | Équipe 0 | 904,1 s |
| 2 | Aucun | Limite de 1 200 s |
| 3 | Aucun | Limite de 1 200 s |
| 4 | Équipe 1 | 839,9 s |
| 19 (test de carte) | Équipe 1 | 896,6 s |
| 22 (test de carte) | Équipe 1 | 563,7 s |

Quatre graines terminent bien avant 20 minutes, mais **la garantie D11 n’est pas entièrement validée**, puisque les graines 2 et 3 atteignent la limite. La graine 2 a également été rejouée sur une copie du code initial (`e46e698`), sans les changements de cette issue : elle atteint aussi 1 200 s sans vainqueur. Le script conserve cet échec visible et renvoie un code de sortie non nul. Aucune correction de l’IA n’est incluse dans cette issue, conformément au périmètre et au report des tournois vers #113.

## À vérifier sur téléphone

Lisibilité des sangliers et du compteur, précision de la sélection tactile du monstre avec le pouce, chasse et retour du camp en solo puis dans un duel réseau, sans gêner le déplacement de caméra et les commandes habituelles.
