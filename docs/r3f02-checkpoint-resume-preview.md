# R3f-02 : inspection offline d'une reprise sur checkpoints distants simulés

**Prototype consultatif sans I/O.** Les observations et commits fournis en entrée sont des fixtures. Une valeur `success`, un SHA de Git ou un digest de snapshot ne prouvent pas que GitHub les a réellement signés ou servis. Ce module ne fournit aucun credential, ne lit pas le réseau, ne pousse aucun commit, ne déclenche aucun modèle et ne propose aucun retry automatique.

## Contrat de reprise

Le module `core/openspec-offline-resume.mjs` vérifie une chaîne synthétique préalablement générée par R3f-01. Il réutilise le validateur de digest et d'identité de politique du module précédent. La chaîne doit être soit un checkpoint de `plan` unique (séquence 1), soit `plan` puis `apply` liés par `previousDigest` (séquences 1 et 2). Elle doit correspondre exactement au dépôt, à la branche `agent/openspec/TS-NNN`, au dernier SHA et au parent de commit annoncés dans une observation distante fournie par l'hôte.

Le sujet de commit mock doit correspondre à l'étape attendue : `agent(TS-NNN): validated OpenSpec plan checkpoint` ou `agent(TS-NNN): verified implementation checkpoint`. Une observation âgée de plus de cinq minutes, une branche absente, un check `check` manquant, un mauvais App ID de CI, une PR finale ambiguë ou un autre run actif provoquent un refus fermé. L'existence réelle des commits, du check et des permissions doit encore être prouvée par une source indépendante.

Une chaîne `plan` peut conduire à **une suggestion de phase manuelle `apply`**. Une chaîne `plan -> apply` peut conduire à **une suggestion manuelle `finalize`**. Un checkpoint `auto` isolé ne fournit pas encore la preuve du SHA de plan intermédiaire et ne permet donc pas de reprise ; ne pas relancer un `auto` payant. Un état `complete` ne demande aucune reprise de modèle et est également refusé.

## Sécurité et coûts

Le résultat marque systématiquement `resumeAuthorized=false`, `authorizedToExecute=false`, `remoteEvidenceIndependentlyAuthenticated=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `writesPerformed=false`, `promotionAllowed=false`, `paidApprovalRequired=true`. Une suggestion n'est pas une approbation de dépense. Tout nouvel `apply` ou `finalize` réel exige une autorisation propriétaire spécifique et une inspection indépendante des preuves GitHub sur SHA exact.

Cette phase ne prétend pas implémenter le stockage durable GitHub, l'authentification R3e-03, la mise à jour CAS de refs, la vérification cryptographique des releases (SEC-02), la synchronisation OPSX sémantique ou les workflows de production. Les tests Node n'utilisent que des fixtures locales et la CI GitHub vérifie leur intégration au dépôt sur SHA exact.

## Source de référence

[ThreadStep, workflow OpenSpec au SHA b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/.github/workflows/agent-openspec.yml), [contrat de reprise](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/docs/factory/validation-and-recovery.md), [R3f-01](r3f01-openspec-phase-contract.md).
