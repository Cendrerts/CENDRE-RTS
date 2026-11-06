# CENDRE — Terres Brûlées, alpha 0.4

RTS navigateur avec solo local et duels 1v1 par code. L'hôte choisit son camp et partage le lien d'invitation ; le second joueur rejoint le camp opposé. Le duel démarre après 3 secondes. Internet requis, même sur le même Wi-Fi.

## Architecture
- `public/game/` : carte peinte, HUD tactile, simulation partagée, rendu canvas.
- `lib/match.mjs` : serveur autoritaire, salons D1, concurrence par révision CAS, jetons de participant hachés, validation des ordres et filtrage du brouillard.
- `app/api/match/route.ts` : API HTTP, requêtes de même origine.
- `db/schema.ts` et `drizzle/` : schéma et migration des salons.
- `app/page.tsx` : entrée redirigeant vers le jeu.

Le client interroge le serveur toutes les 250 ms plus le temps réseau, avec interpolation visuelle. Les ordres ont des numéros de séquence pour éviter les doublons. Pas d'IA dans les duels. Reconnexion par session du navigateur au rechargement. Suspension après 10 s d'absence et défaite après 2 min. Quitter un duel compte comme abandon. Les salons expirent après 2 heures et sont nettoyés lors d'une création ultérieure.

## Jeu
Braise sud-ouest, Voile nord-est ; gardiens, arbalétriers, mages ; 30 unités maximum. Fog et mémoire d'exploration ; tour de vision après 4 s d'occupation (bases ennemies exclues) ; bois centraux cachant les unités et retirant 2 PV/s ; avant-postes près des mines pour 120 or ; rubis +4/s contre +2/s pour les mines normales. Victoire en détruisant la base adverse.

## Validation
`node tests/simulation.mjs`
`node tests/multiplayer.mjs`
`node --check public/game/game.js`
Build avec le helper Sites `build-site.mjs`. Migration locale avec Wrangler D1 (fichier dans drizzle). La publication applique les migrations de production.

## Limites de l'alpha
Synchronisation HTTP, sans WebSocket ni matchmaking. Pas de tests de charge ni de validation sur deux téléphones physiques. Une reconnexion reprend la session du même onglet ; fermer définitivement l'onglet peut perdre cette session. Pas de construction libre ni d'ouvriers. Carte peinte fixe et unités vectorielles provisoires. Chemins et équilibrage à affiner.

## Alpha 0.5 — Cuistos-Furieux
La faction sud-ouest utilise quatre dessins vectoriels partagés entre carte et portraits (aucune génération d’image). Gardes-Manger, Bouchers-Tireurs et Chefs de Brigade conservent les statistiques des trois combattants. Un commis apparaît au départ ; recrutement instantané à la Grande Cuisine : 40 or, 60 PV, faible attaque. Cliquer le bâtiment ouvre la production ; le bouton Recruter reste un raccourci. Commis disponibles uniquement pour cette faction, validé serveur. Déplacement, exploration, avant-postes ; pas de récolte manuelle à ce stade.

## Alpha 0.6 — Rats-Goût
Remplace le Voile au nord-est. Rat-Essuyeur (50 PV), Rat-Éboueur (150), Rat-Balance-Déchets (80), Chaman de la Poubelle (100). Les vitesses et portées fournies sont converties à 20 pixels par unité. Coûts provisoires conservés : 40/60/75/100 or. Un ouvrier initial par camp. File serveur séquentielle de 8 commandes maximum, réservant la population, durées 5/10/12/25 secondes ; seule cette faction utilise ces durées. Chaman : 25 dégâts sur cible et ennemis à 45 pixels, sans dégâts alliés. Les bâtiments/tier sont conservés dans rats-config.js ; construction et déblocage par tier non implémentés. Production regroupée à la Grande Décharge. Apparence du bâtiment peinte encore provisoire. Collecte manuelle non implémentée.

## Alpha 0.7 — Horde contre Élite (équilibrage actuel)
Les configurations rats-config.js et cooks-config.js font foi. Brigade de Cuisine : PV 50/200/90/150, dégâts 2/12/22/35, production 5/20/24/45 s. Rats-Goût : PV 45/110/60/80, dégâts 2/7/11/18, production 5/10/12/22 s. Les deux camps utilisent la file séquentielle, les deux mages infligent des dégâts de zone (rayon 45 px, sans tir allié). Vitesses et portées converties à 20 px par unité. Coûts, cadences d’attaque et limite de 30 unités inchangés. Le vol du chef reste visuel : il suit les chemins terrestres. Ces valeurs remplacent celles des versions précédentes.

## Alpha 0.8 — Départ économique
Toute nouvelle partie solo ou multijoueur commence avec une base et un seul ouvrier par camp, 100 or et aucune unité de combat. Positions adaptées à la carte conservées. Base des cuistots renommée Cuisine Centrale. Revenus passifs et production inchangés ; les parties déjà enregistrées gardent leur état.

## Alpha 0.9 — Emplacements fixes
Quatre slots par base (±60, ±40), construction gratuite instantanée niveau 1 au premier slot libre, via le menu Recruter > Construire autour de la base. Trois modèles par faction, doublons autorisés. Placement synchronisé serveur et masqué par le brouillard. Les bâtiments sont pour l’instant des placements : pas de production dédiée, bonus, collision ou destruction. Les recrutements restent au bâtiment principal.

## Alpha 0.10 — Économie par ouvriers
Les revenus passifs sont remplacés par les livraisons. Ouvriers initiaux et produits : affectation automatique à une mine possédée ; sélectionner des ouvriers puis toucher une mine possédée pour changer l’affectation. Trajets sur le graphe navigable à 60 px/s, minage 3 s, sac de 10 (20 aux rubis), crédit seulement au retour à la base principale. Déplacement/repli/tenir interrompent la récolte et conservent le sac ; réaffecter à une mine pour le déposer puis reprendre. Une mine capturée interrompt le minage adverse ; un sac déjà rempli peut encore être livré. Mort : sac perdu. Aucun stock limité de gisement pour l’instant.

## Équilibrage — Rat-Éboueur à 9 dégâts
`node scripts/balance.mjs` exécute les trois matchups demandés avec cadence 1 s, puis avec les intervalles du jeu. Simulation séparée à événements simultanés, focus sur la première cible vivante, dégâts excédentaires perdus, timeout distinct de l’annihilation. Pas de portée, déplacement ni zone. Le moteur du jeu conserve son traitement séquentiel et son attaque initiale immédiate : ces résultats sont un banc théorique, pas une reproduction exacte des batailles.

## Alpha 0.11 — Extensions minières
Carte de fond conservée. Deux mines normales au nord et deux au sud, sept au total avec les deux départs et les rubis. Chaque mine neutre possède un site de base secondaire. Construction/prise de contrôle au bouton Base secondaire : 120 or, unité à moins de 95 px et pas d’ennemi dans cette zone. Ces bases servent de dépôts aux deux factions ; choix du chemin praticable le plus court à chaque chargement, retour à un dépôt allié si le dépôt visé est capturé. Recrutement toujours à la base initiale, défaite toujours à sa destruction. Silhouettes vectorielles légères de cuisine/boucherie/four et ferraille/atelier toxique/autel inspirées de la référence.

## Alpha 0.12 — Production par bâtiment
Huit emplacements par base principale ou secondaire, posés sur le terrain praticable. Menu Bâtiments avec choix de base et construction de base secondaire à une mine découverte (120 or). Bâtiments spécialisés gratuits instantanés comme précédemment, unités débloquées seulement par leur bâtiment. Bases → ouvriers ; garde-manger/niche → corps-à-corps ; boucherie/atelier → tireurs ; école/autel → mages. File indépendante de huit commandes par bâtiment, répartition automatique par durée restante ou choix manuel du producteur. Population totale unités + commandes limitée à 30. Les unités sortent près de leur producteur ; ouvriers des extensions affectés à leur mine locale. Capture d’une extension : bâtiments précédents supprimés, commandes annulées et remboursées, huit emplacements libres pour le nouveau propriétaire. Anciennes commandes sans producteur affectées à un bâtiment compatible ou remboursées. IA construit ses prérequis.

## Alpha 0.13 — Réactivité multijoueur
Envoi immédiat des commandes hors requête en vol ; commandes accumulées envoyées ensemble dès la réponse, déduplication serveur par séquence conservée. Échanges espacés de 200 ms départ à départ si le réseau le permet, sans rajouter 250 ms après chaque réponse. Lissage repart de la position affichée et adapte sa durée à l’espacement des snapshots (80–500 ms), sans extrapoler dans le brouillard. RTT affiché dans le badge. Une seule requête en vol, reprise après erreur temporisée. Réduction des remplacements DOM identiques. Architecture HTTP/D1 conservée : pas une garantie de latence faible sur réseaux lents.
