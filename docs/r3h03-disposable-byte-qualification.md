# R3h-03 : qualification locale des octets du journal de checkpoints

Cette recette Node exerce les contrats R3h-02 sur de **vrais octets de fichier dans un répertoire temporaire privé jetable**, exclusivement sur Linux. Ce n'est ni le journal GitHub protégé d'ASF V3 ni une validation d'un déploiement réel.

## Limites de l'interface

La fonction `qualifyDisposableCheckpointJournal(policy, entries, observed, expectedMutexGroup, fault='none')`, dans `core/disposable-checkpoint-journal-qualification.mjs`, **ne prend aucun chemin, callback de mutation, secret ni token**. Elle exécute le préflight R3h-02 avant toute I/O, puis alloue uniquement son propre dossier via `mkdtempSync(tmpdir())` en mode 0700.

Elle crée `journal.json` exclusivement (O_EXCL, O_NOFOLLOW, mode 0600), écrit les bytes attendus, `fsync` le fichier puis le répertoire, inspecte `lstat`, le type, les permissions, l'unicité du lien, la taille et l'identité dev/inode, et relit via un descripteur sans suivi de lien symbolique. Les octets sont comparés *exactement* à la sérialisation de départ ; le JSON relu est ensuite revalidé par R3h-02. Le répertoire temporaire est supprimé dans `finally` en réussite comme en refus.

## Scénarios négatifs

Le paramètre `fault` ne permet que des injections fermées et internes à ce dossier : `truncate`, `flip`, `replace`, `symlink`, `world-readable`, `hardlink`, `extra-file`. Les tests vérifient également les erreurs de SHA, groupe mutex, retry payant et champs de credentials auto-déclarés, avant toute I/O.

Commande dédiée : `node --test tests/disposable-checkpoint-journal-qualification.test.mjs`. La validation complète se fait via `npm run check` et la CI SHA exact, avec actionlint.

## Garanties réellement couvertes et exclusives

Cette qualification observe une écriture et une relecture effectives, mais **n'est pas une preuve de durabilité en cas de panne électrique**, ni une garantie de snapshot cohérent multi-fichiers, ni une opération CAS interprocessus, ni une ref GitHub vérifiée. Un `fsync` réussi sur un dossier jetable ne fournit pas d'attestation de source. Les données de politique, CI, SHA et mutex restent **synthétiques et falsifiables par l'appelant**.

La sortie expose `disposableLocalWritesPerformed=true`, `fileFsyncCompleted=true`, `disposableByteReadMatched=true` uniquement après vérification, mais `temporaryFileRetained=false`, `targetRepositoryWritesPerformed=false`, `gitRefsWritten=false`, `checkpointBytesDurablyStored=false`, `independentlyAuthenticatedHost=false`, `mutexIndependentlyVerified=false`, `resumeAuthorized=false`, `authorizedToExecute=false`, `promotionAllowed=false` et `paidApprovalRequired=true`.

Une véritable implémentation exigera une autorité d'écriture CAS unique, un hôte GitHub authentifié R3e-03 (#22), la provenance SEC-02 (#9), la protection des branches et le mutex au niveau des jobs, plus l'accord explicite avant tout usage de modèle payant. Aucune permission, release ou ref protégée n'est changée ici.

Suivi : [R3h-03 #78](https://github.com/cedricmenec/asf-agent-kits/issues/78) ; prérequis [R3h-02 #76](https://github.com/cedricmenec/asf-agent-kits/issues/76).
