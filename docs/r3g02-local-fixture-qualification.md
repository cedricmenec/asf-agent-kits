# R3g-02 : qualification locale du lock, des overlays, checkpoints et archives

**Périmètre strict : répertoires temporaires jetables et lecture seule.** La fonction `previewLocalFixtureQualification` confronte les octets réels de trois copies d'une fixture (`before/`, `after/`, `archived/`) au lock synthétique et aux garde-fous R3f. Elle ne doit jamais recevoir la racine d'un dépôt réel ni une configuration façonnée par un LLM.

## Contrat

- `fixtureRoot` est un chemin absolu choisi et créé par le banc de test hôte. Les arbres `before`, `after`, `archived` sont des sous-dossiers de cette racine ; les tests ne créent et ne détruisent que des dossiers jetables sous le répertoire système temporaire.
- `headSha` et `syncPolicy` correspondent à un SHA **déclaré**, et non à une ref Git authentifiée. Les allowlists `expectedPaths.before/after/archived` précisent chaque fichier qui doit être inventorié ; les fichiers inattendus, liens et modes exécutables sont refusés par R3g-01.
- `lock` est un objet mock `{headSha,files:[{path,sha256}]}` ; son inventaire doit correspondre **exactement** aux fichiers `before` lus sur disque. `localLockFingerprint` est une empreinte non signée, sans autorité.
- `checkpoint` contient `hostPolicy`, la chaîne de checkpoints purement synthétiques `plan` puis `apply`, `observed` et `checkAppId`. R3f-02 doit indiquer une reprise manuelle `finalize` au même SHA, sans accorder de droit.
- R3f-03 vérifie que seule une spec canonique explicitement autorisée change entre `before` et `after`, puis que `archived` contient les fichiers du changement actif déplacés, à octets identiques, sans altérer les fichiers externes, les overlays ou les specs canoniques.

Tous les échecs sont fermés et renvoient une erreur générique sans reproduire des valeurs potentiellement sensibles. Aucun modèle, CLI OPSX, réseau, commande Git, GitHub App, secret, workflow, fusion, écriture applicative ou retry payant n'est déclenché.

## Limites

Ces vérifications sont des observations, **pas une attestation** : le lock et les checkpoints sont simulés, les SHA Git sont des étiquettes non vérifiées et les lectures par pathname restent sujettes aux races d'un adversaire filesystem privilégié. Les sorties gardent `realGitHeadVerified=false`, `filesystemRaceFree=false`, `localSourceAuthenticated=false`, `sourceProvenanceVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`.

Avant un installateur réel R5 ou une qualification opérationnelle R3e-03/SEC-02, exiger un runner isolé, primitives fd-relative no-follow, provenance des commits et releases, et une décision explicite du propriétaire pour les permissions, secrets, configurations protégées ou coûts.

Tests non payants : `node --test tests/local-fixture-qualification.test.mjs`, puis CI indépendante `npm run check` / actionlint au SHA exact.
