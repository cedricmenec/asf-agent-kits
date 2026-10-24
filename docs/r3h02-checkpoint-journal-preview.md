# R3h-02a: contrat de journal de checkpoints hors ligne et reprise consultative

**Préparation non opérationnelle.** Le module `core/checkpoint-journal-preview.mjs` produit et contrôle en mémoire des enveloppes JSON de checkpoints de phases `plan -> apply -> finalize` sans accès au disque, à GitHub, à un fournisseur LLM, à un runner, à OPSX ni à une autorité de publication. Il ne rend **aucun checkpoint durable**. Son format facilite une future persistance par une autorité hôte distincte, dont la CAS, les identités, l'intégrité indépendante et les droits restent à concevoir et qualifier.

## Contrat V1

- Champs exacts et versionnés : `kind`, `version`, `repository`, `taskId`, `branch`, `policyDigest`, `planCheckpointDigest`, `phase`, `sequence`, `parentSha`, `headSha`, `event`, `checkpoint`, `previousDigest`, `digest`.
- Chaque entrée comporte un événement R3f vérifié par `previewOpenSpecTransition` : scopes, checklist, SHA attendu et phase cohérents avec le checkpoint précédent. La séquence est strictement `plan:1 -> apply:2 -> finalize:3`. La phase `auto` et les tentatives de rejouer, revenir en arrière, sauter une étape ou continuer après `finalize` sont refusées.
- Un `digest` SHA-256 non signé lie les octets JSON logiques de l'enveloppe aux données précédentes. La seconde entrée et la troisième réutilisent le `planCheckpointDigest` du plan ; `previousDigest` forme la chaîne. La politique verrouille dépôt, tâche, branche, SHA initial et préfixes de chemins autorisés.
- Le validateur refuse récursivement les getters, champs arbitraires, symboles, prototypes inattendus, références cycliques, tableaux incomplets, champs secrets injectés, valeurs non sérialisables et toute divergence. Les refus utilisent un message fixe sans reproduction de valeurs sensibles.
- La reprise compare **uniquement un cliché synthétique fourni par l'appelant** à l'empreinte du journal, au SHA et parent SHA, au dépôt/branche et au mutex attendu ; elle refuse toute concurrence supposée, retry payant, PR finale ambiguë ou chaîne terminée. Elle suggère seulement la prochaine phase manuelle.
- Les enveloppes sont compatibles avec une sérialisation/relecture JSON, mais aucun état n'est écrit et **aucun verrou réel ni preuve d'immutabilité du stockage n'est fourni**. Les empreintes non signées ne résistent pas à un appelant malveillant qui recalcule toutes les valeurs. Les observations d'hôte, les commits, la CI, les approbations de dépenses et le mutex restent non authentifiés.

Les résultats fixent toujours `checkpointBytesDurablyStored=false`, `hostEvidenceIndependentlyAuthenticated=false`, `resumeAuthorized=false`, `authorizedToExecute=false`, `writesPerformed=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `promotionAllowed=false`, `paidApprovalRequired=true`. La récupération expose également `mutexIndependentlyVerified=false`.

Tests adversariaux : `node --test tests/checkpoint-journal-preview.test.mjs`, puis `npm run check` et `actionlint` en CI au SHA exact de la PR.

## Suites, prérequis d'un checkpoint réellement durable

1. Définir un stockage hôte append-only ou CAS avec **une seule autorité d'écriture**, identité source indépendante et comparaison de version/commit atomique ; prouver toute lecture contre le dépôt et le SHA GitHub réels. Aucun fichier fictif local ne peut certifier un état distant.
2. Séparer les autorisations modèle, accès réseau et hôte ; contrôler quotas/permissions/app GitHub via R3e-03 (issue #22) et provenance de release SEC-02 (issue #9).
3. Mettre sous contrainte réelle le mutex GitHub Actions partagé avant **tout** appel payant, sans retry payant automatique, et exiger une autorisation propriétaire spécifique.
4. Qualifier OpenCode/OPSX véritables, la persistance et reprise après crash, la publication par PR sécurisée, les tests de concurrence et la récupération multi-dépôts.

Ce travail satisfait la partie **contrat/reprise pure** de l'issue R3h-02 #76, et **ne clôture pas** ses exigences de durabilité opérationnelle.
