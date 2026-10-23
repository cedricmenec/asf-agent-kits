# R3e-02: bootstrap d'hôte synthétique, sans privilèges

**Statut : simulation hors ligne, non opérationnelle.** Une correspondance d'identité obtenue depuis une fixture ou une réponse injectée n'est PAS une authentification GitHub. Aucun credential réel n'est installé ou utilisé et aucun secret, permission, App, ruleset, release ou traitement payant n'est activé.

Le module `core/synthetic-host-bootstrap.mjs` associe une configuration figée côté hôte aux contrôles R3d existants. Il refuse les observations ou tâches ayant des champs inattendus, getters, symboles, tokens, identités de dépôt différentes, installation ou App inattendue, permissions autres que lecture, contexte de CI erroné et horodatage incohérent.

## Interfaces

- `createSyntheticHostBootstrap(config, services)` n'est appelé que par un hôte simulé contrôlant sa configuration et les services. La tâche LLM n'est jamais autorisée à construire l'hôte, le transport ou l'observateur.
- `config.hostPolicy` contient les paramètres immuables R3d (repository, branch, expectedSha, rulesetName, checkContexts, checkAppId, policyPath et expectedPolicyBlobSha).
- `config.installation` contient appId, installationId, repositoryId et permissions en lecture. Les permissions administratives en lecture sont optionnelles et leur faisabilité réelle reste à qualifier.
- `services.observeInstallation()` est **un mock injecté**, pas une API d'authentification. Sa réponse contient identités, permissions exactes, issuedAtSeconds et expiresAtSeconds.
- `services.transport` est injecté côté hôte et utilisé par le GET limité R3c. `services.nowSeconds()` est une horloge simulée, non attestée.
- La demande de tâche ne contient que repository, branch et expectedSha. Les observations sont rafraîchies à chaque invocation ; les appels concurrents sont refusés.

## Refus fermé et non-autorité

Les requêtes ou observations incorrectes échouent sans appel payé ni retry. Les exceptions des services simulés sont nettoyées pour éviter de renvoyer des détails de secrets. L'expiration est vérifiée avant et après la séquence R3d. Les échecs HTTP, faux checks, permissions non conformes, pagination incomplète, ref déplacée et blob de politique modifié sont refusés via les composants R3.

Le résultat n'accorde aucun pouvoir : `independentlyAuthenticatedHost=false`, `trustEvidenceIndependentlyVerified=false`, `sourceProvenanceVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`. Le champ `syntheticInstallationMatched=true` constate seulement la cohérence de données simulées, non une provenance indépendante.

## Tests et étape suivante

`node --test tests/synthetic-host-bootstrap.test.mjs` couvre les attaques sur les IDs d'installation, dépôt, App, permissions, expiration/révocation, injection de secrets et de transport, erreurs HTTP, quota, CI, provenance de politique, mutation de ref, concurrence et horloge. La CI GitHub `npm run check` et `actionlint` reste la preuve d'intégration au SHA exact avec les vrais composants R3d.

**R3e-03 est un gate distinct :** avant une qualification réelle, choisir et faire approuver la frontière d'isolation, l'identité GitHub App et l'installation, ses droits réellement nécessaires, les protections GitHub et la gestion hors processus LLM des credentials. Ne pas réutiliser par défaut Executor V1 ou Controller V3. Même une vraie lecture GitHub authentifiée ne prouvera pas la provenance d'une release (SEC-02), une autorisation d'exécuter ou de dépenser.
