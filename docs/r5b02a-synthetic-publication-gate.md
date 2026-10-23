# R5b-02a : préflight de publication de PR uniquement synthétique

Le module `tools/preview_pr_publication.py` consomme un **aperçu in-memory R5b-01**, une politique hôte déclarée et une observation GitHub **simulée**, sans effectuer de réseau, écriture de fichier, appel GitHub, commit, ref, PR, signature, LLM ou traitement payant.

## Contrat fermé

La sortie R5b-01 doit être une proposition `review-preview-only` sans conflit ni grant, avec des chemins strictement gérés sous `.asf/agentkit/`, un SemVer stable et une empreinte SHA-256 déclarée par artefact. Aucune suppression, reprise d'un fichier unmanaged, révision conflictuelle ou falsification de champ d'autorité n'est admise.

La politique hôte synthétique fixe dépôt, ID numérique du dépôt, branche cible, SHA exact, contexte `check`, GitHub App de CI indépendante attendue et **nom théorique** de la branche de PR. Les observations synthétiques doivent coïncider sur les identités, le SHA cible, la protection déclarée, un check réussi au SHA exact, l'absence de publication concurrente, de PR concurrente et de branche déjà existante. Les observations doivent avoir au plus cinq minutes, sans retour d'horloge.

Ces données sont toutes falsifiables par l'appelant. En particulier, `baseProtected=true` et `checkConclusion=success` ne constituent **pas** des contrôles GitHub indépendants. Deux lectures d'une ref ne constituent pas une opération atomique CAS.

## Résultat et limites

Le résultat rapporte uniquement les coordonnées du scénario simulé et `syntheticObservationsConsistent=true`. Il conserve obligatoirement `githubPrCreated=false`, `hostIndependentlyAuthenticated=false`, `targetRefCasVerified=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `authorizedToPublish=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false` et `paidApprovalRequired=true`.

Les tests `python3 -m unittest discover -s tests -p test_mock_pr_publication.py` exercent les identités erronées, ref déplacée, protections et checks fictifs absents, horloge, concurrency, PR ou branche déjà présente, faux permissions/provenance, paths, collisions et tentative de retry. Les validations `npm run check` et `actionlint` sont assurées en CI GitHub indépendante au SHA exact.

**Pour passer à R5b-02 réel, il reste obligatoire** de qualifier l'installation et les permissions GitHub App par R3e-03, d'établir la provenance de release avec une preuve indépendante SEC-02, de séparer strictement les identités de lecture et de publication, d'utiliser une autorité CAS unique sur les refs et un contrôleur de permissions et de quotas, puis de publier uniquement une PR brouillon sans fusion automatique et de la qualifier avec R6. Secrets, permissions privilégiées, rulesets, tags, releases et traitements payants sont hors périmètre de cette PR. Aucune autorisation opérationnelle ne résulte de son intégration.
