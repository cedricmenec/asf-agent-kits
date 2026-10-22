# R3b — Préflight GitHub consultatif, sans privilèges

**Statut : prototype non opérationnel.** Il ne lance aucun modèle et n'accorde jamais de droit de paiement, de fusion ou de déploiement.

## Frontière de confiance

R3a vérifie les règles applicatives sur des valeurs JSON déclarées, mais un champ comme refProtectionChecked=true ne prouve pas la protection GitHub. R3b ajoute un examen des **réponses fournies par un adaptateur de lecture GitHub externe**.

Fonction exportée : inspectGithubManualGate(spec, get) dans core/github-gates.mjs.

La spécification exige un dépôt, une branche et un commit SHA exact, le nom du ruleset, les contextes requis, l'identité numérique de l'App de CI et le Git blob SHA attendu d'un fichier de politique. Les seuls fichiers de politique autorisés sont AGENTS.md et .asf/agentkit.yaml.

L'adaptateur get reçoit des chemins GET sous /repos/{owner}/{repo}. Il doit être construit ultérieurement par une autorité indépendante et authentifiée : ce module **n'authentifie pas** son transport, son acteur GitHub, son identité d'installation, les permissions réseau ou son origine. Les tests utilisent uniquement des réponses fictives.

## Observations examinées

1. Identité et état non archivé du dépôt ; branche par défaut attendue.
2. Existence d'une branche protégée au SHA exact.
3. Inventaire et détails d'un ruleset actif sur cette branche précise, sans bypass ni exclusions.
4. PR obligatoires, interdiction de supprimer et de forcer des pushes, branche à jour exigée avant fusion.
5. Check indépendant terminé/success au SHA exact, fourni par l'App GitHub Actions attendue ; aucun statut ambigu ni doublon.
6. Politique récupérée à partir du SHA de commit immuable, dont les **octets** sont contrôlés localement par empreinte Git blob SHA-1 et décodage UTF-8 strict.
7. Seconde lecture de la branche après les autres observations pour détecter un déplacement évident de ref.

Toute absence de donnée, divergence, exception API, identité ambiguë, contenu altéré, vérification rouge ou règles insuffisantes entraîne un refus fermé. Aucune relance automatique.

## Résultat et limites obligatoires

Même lorsque les réponses fournies sont cohérentes, l'objet renvoyé indique seulement apiObservationsConsistent=true et la liste des checks observés. Les champs sourceProvenanceVerified, trustEvidenceIndependentlyVerified, authorizedToExecute, promotionAllowed et writesPerformed restent **toujours false** ; paidApprovalRequired reste true.

L'analyse est non atomique. Elle ne remplace pas une authentification du transport GitHub, l'approbation humaine d'un run payant, un contrôle CAS final, une preuve de provenance de release ou des tags réellement protégés. Les assertions du futur adaptateur peuvent être fausses : **ne jamais utiliser cette sortie pour activer OpenCode**.

## Qualification

Tests Node synthétiques de la fonction et refus adversariaux dans tests/github-gates.test.mjs, en plus des contrôles Python, Node et actionlint du catalogue. La CI GitHub sur SHA exact est le gate de qualification de la PR.

Issue : https://github.com/cedricmenec/asf-agent-kits/issues/14
Suivi releases : https://github.com/cedricmenec/asf-agent-kits/issues/9
