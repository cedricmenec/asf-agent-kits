# R3h-04 : recette de CAS locale interprocessus sur journal temporaire

**Limite de portée : Linux uniquement, fixture jetable.** Ce jalon ne crée aucun stockage dans un dépôt de produit, sur GitHub ni dans ASF V3. Il n'exécute aucun LLM, modèle payant, réseau, Git, workflow opérationnel ou commande OpenCode/OPSX. Son entrée ne comprend **aucun chemin** : seul un dossier privé `mkdtempSync(tmpdir())`, alloué par la recette elle-même, peut être modifié.

Le module `core/disposable-checkpoint-cas-qualification.mjs` teste la progression du journal R3h-02 entre `plan` et `apply`. Avant toute I/O, il vérifie la chaîne, ses SHA et un snapshot de mutex synthétique via `previewCheckpointJournalRecovery`. Dans le dossier privé 0700, un seul propriétaire local obtient le verrou par `mkdir('.cas-lock')` atomique ; **aucun vol/expiration automatique de verrou** n'est admis. Le journal 0600 à lien unique est ouvert sans suivi de symlink, validé par `lstat/fstat`, vérifié octet par octet et comparé à la version et au digest préalablement attendus.

**Une seule voie de mutation conditionnelle :** sous le verrou, relire l'état, comparer les octets antérieurs et le digest attendu, écrire un fichier temporaire exclusif `O_EXCL|O_NOFOLLOW`, synchroniser, puis `rename` dans le même dossier et `fsync` du dossier. La transaction refuse les versions périmées et les réécritures/replays. Un processus enfant distinct peut créer un verrou laissé orphelin : la tentative de mutation concurrente refuse de poursuivre. **Ce scénario qualifie le conflit interprocessus et le verrou orphelin ; il ne démontre pas encore une course simultanée entre deux processus vivants.**

Le scénario `crash-before-rename` laisse un fichier temporaire tronqué et teste que la dernière version commitée est toujours lisible et cohérente ; la fixture supprime ensuite uniquement les fichiers temporaires qu'elle possède, **sans lancer de retry payant**. Les autres scénarios négatifs vérifient symlink, hardlink, mauvais droits, fichier corrompu ou absent, digest attendu périmé, replay, mauvaise observation SHA, mauvais mutex, job payant concurrent et champs d'autorité injectés.

### Contraintes / non-garanties

- Le `mkdir` et `rename` ne protègent que **ce système de fichiers local**, sur une même racine privée, et ne se transposent ni automatiquement aux références GitHub, ni à un CAS distribué.
- Les appels et leurs entrées synthétiques ne prouvent pas l'identité d'un hôte, le statut réel d'un job GitHub, l'existence d'un commit distant ou les permissions d'une GitHub App.
- Un `fsync` local n'est pas une garantie universelle de résistance aux coupures électriques, NFS, Windows ou stockage distribué.
- Aucun nettoyage automatique d'un verrou suspect en environnement opérationnel. Le répertoire de la **fixture** est détruit intégralement en `finally`, succès ou refus.
- Les empreintes SHA-256 sans signature restent recalculables par un adversaire ; aucune preuve de provenance autonome.

Résultat : `disposableLocalWritesPerformed=true` seulement, mais `targetRepositoryWritesPerformed=false`, `gitRefsWritten=false`, `checkpointBytesDurablyStored=false`, `independentlyAuthenticatedHost=false`, `mutexIndependentlyVerified=false`, `resumeAuthorized=false`, `authorizedToExecute=false`, `promotionAllowed=false` et `paidApprovalRequired=true`.

Commande dédiée : `node --test tests/disposable-checkpoint-cas-qualification.test.mjs`; puis `npm run check` et `actionlint` via CI indépendante au SHA exact.

Pour un vrai checkpoint GitHub durable, les gates demeurent R3e-03 [#22](https://github.com/cedricmenec/asf-agent-kits/issues/22), SEC-02 [#9](https://github.com/cedricmenec/asf-agent-kits/issues/9), politique de CAS à identité unique, mutex payé au niveau du job, et approbations distinctes. Suivi [R3h-04 #82](https://github.com/cedricmenec/asf-agent-kits/issues/82).
