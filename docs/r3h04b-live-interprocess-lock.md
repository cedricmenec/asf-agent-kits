# R3h-04b : qualification d'un verrou CAS local sous concurrence réelle

La première recette R3h-04 (PR #84) teste le CAS de fichiers en répertoire privé temporaire ainsi que le refus d'un verrou créé par un processus enfant et resté orphelin. Cette seconde recette **test seule** provoque volontairement une contention réelle entre **deux processus enfants simultanément vivants** autour du même `mkdir('.cas-lock')`.

`tests/r3h04-live-interprocess-lock.test.mjs` crée exclusivement sa propre racine `mkdtempSync(tmpdir())` en mode 0700. Un premier processus enfant acquiert `.cas-lock` en mode 0700 et annonce son état à travers un fichier de synchronisation local 0600. Alors qu'il est toujours vivant et détient le verrou, un second processus distinct tente le même `mkdir` et doit recevoir `EEXIST`. Le premier processus ne libère le verrou qu'après réception d'un signal local contrôlé par le test.

Un deuxième scénario tue le propriétaire du verrou avec `SIGKILL` et vérifie qu'un autre processus ne peut ni acquérir ni voler automatiquement le verrou orphelin. Le parent supprime uniquement son dossier **jetable** et n'intervient pas sur un dépôt cible. Les tests imposent des timeouts et un nettoyage en `finally`.

Ce résultat démontre **uniquement l'exclusion mutuelle de la primitive `mkdir` sur le système de fichiers Linux de CI** ; il ne prouve pas une opération atomique GitHub, une course complète de CAS à deux écritures, une persistance de production, des garanties NFS, la résistance à une panne électrique, une autorité authentifiée ou la récupération automatique de locks. L'absence de reprise automatique en cas de verrou suspect est intentionnelle (refus fermé). Aucun modèle, dépense, secret, GitHub write, installation ou activation n'est exécuté.

Commande : `node --test tests/r3h04-live-interprocess-lock.test.mjs`; CI : `npm run check` et `actionlint` sur SHA exact. Les validations réelles d'hôte (R3e-03 #22), source de release (SEC-02 #9), mutex GitHub Actions et autorisation payante restent des gates explicites.
