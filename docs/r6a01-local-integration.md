# R6a-01 : recette intégrée locale, sans installation ni provenance attestée

Le banc de test `tests/test_r6a_offline_qualification.py` utilise des répertoires **jetables** pour exercer ensemble les composants intégrés R5a-01, R5a-02/03, R5b-01 et R5b-02a.

`tools/qualify_local_installation_fixture.py` charge en lecture seule le verrou de la cible temporaire, vérifie son égalité avec le verrou transmis par le banc d'essai, puis produit le statut local. Une nouvelle cible n'a pas de verrou et reste `unmanaged-legacy`. Une cible contenant un verrou valide avec les octets attendus reste `unknown`, jamais `verified`. Toute dérive du contenu installé bloque l'enchaînement.

Pour un upgrade additif, le composant relie le plan SemVer R5a au plan de fichiers R5b et à une simulation d'observation de publication GitHub. Les fichiers existants ne sont pas modifiés. Une suppression, un remplacement qui requiert revue, un fichier unmanaged présent ou un lien symbolique sur le chemin d'ajout font échouer la recette. Les états de check GitHub, protection de base, concurrence et identité sont **simulés**, et ne constituent aucune attestation indépendante.

## Limites impératives

Cette tranche R6 n'est PAS une qualification d'installateur opérationnel. Même avec une recette verte, aucune donnée de sortie ne peut établir une identité hôte indépendante, la source d'une release, une transaction CAS, un instantané filesystem atomique, la permission d'écrire GitHub ou de lancer une dépense. Les champs `releaseIndependentlyAttested`, `hostIndependentlyAuthenticated`, `targetRefCasVerified`, `sourceProvenanceVerified`, `authorizedToPublish`, `authorizedToExecute`, `promotionAllowed` et `writesPerformed` restent **false**. `paidApprovalRequired` reste **true**.

Les lectures d'état de R2a sont en partie basées sur des noms de chemins, donc vulnérables à des courses filesystem privilégiées ; elles ne remplacent pas l'inventaire fd-relative R3g, le contrôle CAS distant ni une isolation du runner. L'ownership R2d et les manifests fournis sont des données synthétiques : un objet prétendant être un plan ne constitue pas une autorité. Ne jamais passer un vrai dépôt cible à cette recette.

Exécuter `python3 -m unittest discover -s tests -p test_r6a_offline_qualification.py` puis la CI indépendante `npm run check` et `actionlint` sur le SHA exact.

## Après R6a-01

R6a-02 : recette multi-dépôts distincte et qualification négative des scénarios concurrentiels avec environnements GitHub d'essai uniquement autorisés. R5b-02 réel : publication d'une PR brouillon via identité/permissions GitHub vérifiées. R3e-03 et SEC-02 : authentification hôte, immutabilité de tags et provenance indépendante. R3 : runtime OpenCode/OPSX réel et isolation des credentials. R7 : pilote payé avec autorisation propre. Aucune de ces gates n'est levée par cette tranche hors ligne.
