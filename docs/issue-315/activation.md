# Activer Codex Autopilot

Le workflow se déclenche à la fin d’une exécution de Codex, toutes les deux heures de 6 h à 20 h UTC et sur demande. Il teste les fichiers JavaScript du jeu et les tests du commit de tête de chaque PR Codex dans un conteneur sans secrets. Il mémorise les réussites par commit et limite les demandes de correction à deux par PR. Quand Codex est libre et que moins de six PR attendent une relecture, il demande une correction ou lance la première issue éligible par numéro.

## À faire par Malo

1. Connecte-toi avec le compte propriétaire du dépôt qui peut déjà lancer Codex en commentant `/codex`. Le workflow Codex exige que GitHub attribue le rôle `OWNER` au commentaire.
2. Dans les paramètres de ton compte GitHub, ouvre **Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Donne-lui un nom et une date d’expiration. Dans **Resource owner**, choisis le propriétaire du dépôt. Dans **Repository access**, choisis **Only select repositories**, puis **CENDRE-RTS**. Dans **Repository permissions**, choisis **Issues → Read and write**, puis génère et copie le jeton. [Documentation GitHub sur les jetons personnels](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
3. Dans le dépôt **CENDRE-RTS**, ouvre **Settings → Secrets and variables → Actions → New repository secret**. Saisis `AUTOPILOT_TOKEN` dans **Name**, colle le jeton dans **Secret** et clique sur **Add secret**. [Documentation GitHub sur les secrets Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
4. Intègre `docs/issue-315/codex-autopilot.yml` dans `.github/workflows/codex-autopilot.yml` sur la branche par défaut avec `scripts/autopilot-logic.jq`. Le lancement automatique devient actif dès que le workflow est installé sur cette branche.
5. Dans **Actions → Codex Autopilot → Run workflow**, lance un essai lorsque Codex est libre. Vérifie que le compte propriétaire a publié un seul commentaire et que le workflow **Codex** a démarré.

Aucun essai sur téléphone n’est nécessaire pour cette automatisation GitHub.
