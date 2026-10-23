# R3f-01 : modèle hors ligne de phases et checkpoints OpenSpec

**Statut : contrat logiciel consultatif, non exécutable.** Cette bibliothèque n'exécute ni OpenCode, ni OpenSpec, ni OPSX, ni GitHub, ni LLM, ni écriture de fichier. Des observations booléennes d'un test ou d'une tâche peuvent être forgées : aucune preuve d'authenticité ni autorisation n'en découle.

## Références relues avant implémentation

ThreadStep `cedricmenec/threadstep`, `main` SHA `b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a` au 23 octobre 2026 :

- [`AGENTS.md`](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/AGENTS.md) : branche persistante `agent/openspec/TS-NNN`, checkpoint de plan avant `apply`, checkpoint de code vérifié avant OPSX sync ; aucune reprise payante implicite.
- [Workflow `agent-openspec.yml`](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/.github/workflows/agent-openspec.yml) : `plan` publie un checkpoint sans code, `apply` exige le plan et une checklist complétée, `auto` sauvegarde séparément plan et implémentation, `finalize` reprend sur code commité. OPSX sync sémantique, validations strictes et archive arrivent **après** le checkpoint d'implémentation ; ils peuvent déclencher un appel payant et ne doivent jamais être simulés comme déjà exécutés.
- [Contrat de checklist](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/docs/factory/openspec-checklist-contract.md) : cases pré-sync effectivement réalisables sur runner, rubrique `Manual acceptance` et rubrique `Post-sync review` narratives sans cases. La revue humaine reste à effectuer après livraison.
- [Guide de reprise](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/docs/factory/validation-and-recovery.md) : refus d'un SHA de checkpoint incertain et nouveau consentement avant toute reprise payante.
- [Garde de chemins](https://github.com/cedricmenec/threadstep/blob/b0ad3f9292acffff3f2b5cbe93c84f1fd95da30a/scripts/agent-openspec-checkpoint.mjs) : plan limité au change ; produits autorisés et répertoires protégés explicites ; sync/archive sous contrôle séparé.

## Automate déterministe

| Demande | État requis | État simulé produit | Invariants |
| --- | --- | --- | --- |
| `plan` | aucun checkpoint | `planned`, séquence 1 | seulement artefacts de plan et checklist structurée |
| `apply` | `planned` au SHA exact | `implemented`, séquence 2 | checklist cochée, tests/scope/plan en état simulé conforme |
| `auto` | aucun checkpoint | `implemented`, séquence 2 | SHA de plan intermédiaire distinct, plan et code présent dans la liste de chemins, pas de prétention à une exécution OPSX |
| `finalize` | `implemented` au SHA exact | `complete`, séquence 3 | seuls chemins specs/archive ; indicateurs simulés sync/archive requis mais **non exécutés** |

Le modèle refuse les transitions rétrogrades, `plan` ou `auto` sur branche déjà checkpointée, changement de branche/tâche/politique, SHA de départ divergent, état/empreinte modifié, chemin traversant ou protégé, fichier hors préfixes produit approuvés, collision de casse, checklist sans rubriques requises ou case manuelle/post-sync, case non cochée avant `apply` et déclaration de CI indépendante prématurée. Une erreur mock fait échouer la transition sans retry. Le chemin `auto` fournit un SHA intermédiaire de plan distinct mais ne vérifie pas qu'il est réellement publié : ce contrôle appartient à l'hôte.

Les snapshots contiennent un digest SHA-256 déterministe de la politique et une chaîne de digest de checkpoints ; **ces valeurs ne sont pas signées**. Une tâche malveillante peut recalculer les digests et produire de faux booléens. Dans le futur runtime, vérifier en dehors du modèle l'identité GitHub réelle, les commits protégés et les autorisations coûteuses. Ne jamais traiter `stage: complete` comme une preuve d'OPSX ou de livraison.

## Vérification gratuite

`node --test tests/openspec-offline-phases.test.mjs` vérifie la mécanique et les cas adversariaux avec des fixtures synthétiques. La CI indépendante `npm run check` exécutée sur le SHA exact de la PR reste nécessaire. Aucun workflow, secret, permissions ou configuration de production ne change.

## Suivi

R3f-02 devra traiter un stockage/chargement réel des checkpoints avec preuves distantes et concurrence GitHub, puis R3f-03 la synchronisation sémantique OPSX et la politique de budget. **Aucun de ces jalons n'est implémenté ici.** R3e-03 qualifie séparément un hôte authentifié ; SEC-02 protège les releases ; R5 gère les PR d'installation non destructives. Ces opérations exigent les autorisations spécifiques lorsqu'elles impliquent secrets, privilèges, production ou dépenses.
