# Serveur temps réel — issue #26

`wrangler.jsonc` déploie les fichiers de `public/` et le Worker. Seul `/api/ws`
passe au Durable Object `MATCH`, identifié par le code du salon. Aucun accès D1
n'est nécessaire. L'API HTTP historique dans `app/api/match/route.ts` et ses tests
restent en place en secours ; le client essaie toujours le WebSocket d'abord.

## Protocole pour le futur client WebSocket

- Créer : `wss://<hôte>/api/ws?action=create&team=0` (ou `team=1`).
- Rejoindre : `/api/ws?action=join&code=ABCDEFG`.
- Reconnecter : `/api/ws?code=ABCDEFG`.

Chaque connexion envoie d’abord `{type:'hello', token}` (jeton requis pour une
reconnexion, omis pour créer ou rejoindre). Aucun jeton ne passe dans l’URL.
Sans hello valide sous 5 secondes, la socket est fermée.

La réponse `{type:'session', code, token, team, status}` donne le code et
le jeton à conserver côté client. Seul son SHA-256 est stocké côté serveur.
Une reconnexion remplace l'ancienne socket de ce participant.

Envoyer `{type:'cmd', seq:1, cmd:{kind:'move', ids:[1], x:200, y:300}}` avec une
séquence strictement croissante par participant, conservée lors des reconnexions.
Le serveur accuse réception immédiatement avec `{type:'ack', seq:1}`, y compris
pour un doublon. Cet accusé confirme la réception, pas la validité de l'ordre.
Une commande refusée produit ensuite `{type:'error', error:'…'}` et consomme sa
séquence, comme dans l'API HTTP. Les commandes réutilisent sa validation et ses
coûts ; les identifiants d'unités adverses sont ignorés.

Les messages `{type:'snapshot', code, team, status, ack, countdown, state}` sont
envoyés à 10 Hz, avec `state` filtré par `view`. Le champ `ack` contient la dernière
séquence traitée. Les ordres attendent les deux participants et le compte à rebours
de 3 secondes. `{type:'leave'}` abandonne (ou ferme un salon en attente).
`{type:'ping'}` reçoit `{type:'pong'}` ; aucune commande n'est nécessaire pour
maintenir la présence d'une socket ouverte.

La simulation avance par pas fixes de 50 ms. Un intervalle fonctionne tant qu'une
socket est connectée. Une fermeture conserve 10 secondes de grâce avant la pause ;
une absence de plus de 2 minutes donne la victoire à l'autre joueur. Une alarme
vérifie ces délais même sans socket. L'état sérialisé, les participants et leurs
séquences sont sauvegardés toutes les 5 secondes, ainsi qu'aux transitions de
session et à la fin. Après éviction, le dernier instantané est restauré ; jusqu'à
5 secondes depuis ce dernier instantané peuvent être perdues. Les salons expirent
après 2 heures.

## Vérification

`node tests/realtime-server.mjs` utilise des sockets et une horloge simulées, sans
réseau. `npx wrangler deploy --dry-run` vérifie le bundle et la configuration.
Après raccordement du client WebSocket (étape 2), vérifier sur deux vrais téléphones
le Wi-Fi/réseau mobile, les ordres tactiles, le passage en arrière-plan, les pertes
de connexion, la reconnexion et l'annonce du vainqueur.
