# R3f-03 : garde de sync OPSX et d'archive, entièrement hors ligne

**Aucun modèle, réseau, Git, filesystem ou workflow n'est exécuté.** R3f-03 ne réalise pas la synchronisation sémantique. Il inspecte seulement des inventaires de chemins, modes et SHA-256 fournis par un hôte simulé. Une correspondance d'empreintes ne prouve pas que les requirements OpenSpec ont été conservés, ni que GitHub a authentifié les données.

## Sources actuelles

ThreadStep `main=b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a` relu le 23 octobre 2026 : [`scripts/sync-guard.mjs`](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/scripts/sync-guard.mjs), [`docs/factory/opsx-sync-quality.md`](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/docs/factory/opsx-sync-quality.md), [`agent-openspec.yml`](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/.github/workflows/agent-openspec.yml). Le workflow sauvegarde l'inventaire des fichiers avant OPSX sync, vérifie après qu'aucun fichier hors `openspec/specs/` n'a changé, répète les validations strictes, puis archive via `openspec archive CHANGE --yes --skip-specs`.

## Vérification d'inventaires synthétiques

`previewOfflineOpsxSync(hostPolicy,before,after)` compare deux inventaires triables au même HEAD. Seuls les fichiers `openspec/specs/**/spec.md` présents dans l'allowlist explicite de l'hôte peuvent être ajoutés ou modifiés. Un résultat sans modification canonique, un fichier non autorisé touché, une suppression, un lien symbolique, un changement de mode ou HEAD, un chemin ambigu ou un doublon de casse => refus fermé. **REMOVED/RENAMED ne sont pas encore qualifiés et les suppressions sont bloquées.**

`previewOfflineOpsxArchive(hostPolicy,syncPreview,beforeArchive,afterArchive,date)` compare l'entrée d'archivage au fingerprint du résultat sync consultatif. L'archive doit déplacer les octets des fichiers `openspec/changes/ts-nnn/**` vers `openspec/changes/archive/YYYY-MM-DD-ts-nnn/**` sans les changer ni modifier les specs canoniques ou d'autres chemins. Cette vérification est une simulation structurelle, pas une preuve de livraison Git ou de conservation de la sémantique.

Le résultat ne fournit aucune opération d'application ni d'exécution : `opsxCommandInvoked=false`, `semanticRequirementsIndependentlyVerified=false`, `authorizedToExecute=false`, `sourceProvenanceVerified=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`.

## Contrôles et jalons suivants

Les tests Node adversariaux vérifient chemin protégé, mutation hors specs, faux flags d'autorité, mode, symlink, duplication, HEAD, archive invalide/incomplète, dates impossibles et changement des empreintes. `npm run check` et la CI GitHub indépendante sont nécessaires sur SHA exact.

Le futur runtime devra **réellement** faire exécuter OPSX dans un environnement isolé, avec source vérifiée, budget et autorisation propriétaire spécifique avant tout appel modèle, puis mesurer les conséquences sur des octets réels, valider strictement les specs et soumettre une PR. SEC-02/R3e-03/R5 restent des gates indépendants. Aucun appel payant ni permission GitHub n'est activé par cette PR.
