# R3g-04 : preuve de cohérence Git locale sur fixtures jetables

Ce jalon non payant compare un commit Git **local et synthétique** à une copie indépendante de fichiers temporaires inspectée avec l'outil fd-relative R3g-03. Ce n'est ni un vérificateur d'origine distante GitHub ni une attestation de release signée.

## Fonctionnement

`tools/verify_local_git_fixture.py` expose `verify_local_git_fixture(git_dir, snapshot_root, pinned_sha, expected_paths)`. Les chemins sont des absolus fournis par un hôte de test qui a lui-même créé ces deux espaces temporaires. La copie `snapshot_root` ne contient pas `.git` ; elle est inventoriée sans suivre les symlinks et avec SHA-256 des vrais octets.

Un Git CLI explicitement appelé en lecture (pas de shell, aucune opération réseau ou de mutation) examine `HEAD^{commit}`, l'arbre `ls-tree -r -z` au SHA attendu et les blobs correspondants via `cat-file`. Les modes sont limités à `100644`, les entrées doivent correspondre exactement à l'allowlist de snapshot, et les contenus réels des blobs sont comparés aux empreintes SHA-256 fd-relative. HEAD et le snapshot sont relus après l'inspection pour détecter les changements ordinaires. Timeout de cinq secondes par commande, contrôle de taille de sortie après lecture, configuration Git globale/système désactivée et objets de remplacement désactivés.

Les tests utilisent uniquement des dépôts Git créés dans `tempfile.TemporaryDirectory`, des commits synthétiques sans hook/réseau et une copie de snapshot séparée. Scénarios négatifs : HEAD incorrect, dépôt local avancé, blob modifié, fichier non répertorié ou supplémentaire dans le commit, mode exécutable, symlink, entrées injectées et chemin Git symlink. La commande Git est requise en CI sur Linux et n'est jamais utilisée pour accéder à `threadstep` ou à un dépôt utilisateur.

## Garanties et frontières

`localGitObjectsMatchSnapshot=true` signifie exclusivement que les objets d'un dépôt Git local hôte et la copie de bytes correspondent. Cela **ne prouve pas** : dépôt protégé, origine GitHub, authenticité d'un token, commit signé, attestation de release, absence de course inter-fichiers globale ou intégrité d'un Git dir malveillant. La sortie maintient `remoteGitHubEvidenceVerified=false`, `sourceProvenanceVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`.

Ne pas réutiliser ce preview sur un Git dir fourni par une tâche/LLM non fiable ; l'hôte doit contrôler les répertoires et l'exécutable Git. Une utilisation réelle R5/R6 demandera un contrôle GitHub authentifié et indépendante CI ainsi que les gates R3e-03 et SEC-02. Aucun appel payant, secret, App, rule, tag ou workflow opérationnel n'est exécuté par ce module.
