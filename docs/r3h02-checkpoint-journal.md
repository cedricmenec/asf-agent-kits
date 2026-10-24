# R3h-02 : contrat de journal des checkpoints et reprise refus-fermée

**Prévisualisation pure et consultative, sans stockage durable effectif.** Le module `core/checkpoint-journal-preview.mjs` fournit un format sérialisable en JSON pour préparer des checkpoints R3f et des reprises *manuelles*. Son nom « journal » désigne le contrat de données, pas un stockage GitHub ou filesystem. Il ne lit ni n'écrit aucun fichier, ne démarre aucun LLM/OPSX, n'utilise aucun credential, ne publie aucun commit ou PR et n'admet aucune dépense.

## Invariants et format v1

- Un journal contient **exactement** la séquence `plan` (1), puis éventuellement `apply` (2), puis `finalize` (3). La phase `auto` est refusée : l'intermédiaire de plan n'est pas une preuve durable distincte.
- Chaque entrée inclut `kind`, `version`, `repository`, `taskId`, `branch`, `policyDigest`, `planCheckpointDigest`, `phase`, `sequence`, `parentSha`, `headSha`, `event`, `checkpoint`, `previousDigest` et `digest`.
- Le digest SHA-256 est calculé dans un ordre de champs fermé. Le `planCheckpointDigest` est conservé à chaque phase, et `previousDigest` lie chaque entrée à la précédente. Le contrôle **rejoue** chaque transition via `previewOpenSpecTransition` (R3f-01) et reconstruit l'entrée attendue : aucune valeur de checkpoint fournie par le demandeur n'est une autorité.
- Les objets entrants sont inspectés récursivement avant lecture : propriétés supplémentaires, accesseurs, symboles, références cycliques, prototypes exotiques, trous dans les tableaux et valeurs non JSON sont refusés. Les erreurs n'incluent pas de secrets.
- Le journal JSON peut être sérialisé et revalidé ultérieurement ; ni le hash ni la présence de données dans le journal ne prouvent qu'elles existent sur une ref GitHub protégée.

## Reprise simulée

`previewCheckpointJournalRecovery(policy, entries, observed, expectedMutexGroup)` exige un journal de une ou deux entrées et une observation *synthétique* sans champ inconnu : dépôt, branche, SHA courant et parent, digest du journal, groupe mutex attendu, zéro job payant actif, première tentative et zéro PR finale ambiguë. Si tout correspond, elle propose **seulement** `apply` après `plan`, ou `finalize` après `apply`.

Une tentative de replay, de retour arrière, de modification de l'identité, du scope, du SHA, du hash, du groupe mutex ou du nombre de jobs est refusée. Après `finalize`, aucune reprise payante n'est proposée.

L'observation et le groupe mutex sont fournis par l'appelant et donc **entièrement falsifiables**. Même une reprise qui passe ce test retourne `resumeAuthorized=false`, `authorizedToExecute=false`, `checkpointBytesDurablyStored=false`, `hostEvidenceIndependentlyAuthenticated=false`, `mutexIndependentlyVerified=false`, `promotionAllowed=false`, `writesPerformed=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false` et `paidApprovalRequired=true`.

## Qualification et suite

Tests : `node --test tests/checkpoint-journal-preview.test.mjs`, `npm run check` et `actionlint` via CI GitHub au SHA exact.

**Hors périmètre / dépendances bloquantes :** écriture atomique sur la ref GitHub par une unique autorité CAS, vraie persistance résistant aux crashes, inventaire des fichiers versionnés, validation du commit parent et de CI via hôte authentifié R3e-03 (#22), provenance des releases SEC-02 (#9), mutex réel `threadstep-paid-development-v1` au niveau des jobs, permission payante distincte et runtime OPSX. Les hashes non authentifiés sont inutilisables comme preuve d'autorité. Aucune étape réelle ou payante n'est permise par cette PR.

Lien : [issue R3h-02 #76](https://github.com/cedricmenec/asf-agent-kits/issues/76).
