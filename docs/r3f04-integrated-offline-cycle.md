# R3f-04 : qualification intégrée du cycle OpenSpec sur fixtures

**Mode mock uniquement, sans I/O ni exécution réelle.** `core/openspec-offline-cycle.mjs` assemble les composants R3f-01 (transitions, checklist, checkpoints), R3f-02 (observation simulée de Git et CI, reprise manuelle non autorisée) et R3f-03 (prévisualisation d'inventaires OPSX/archivage). Toutes les entrées viennent de fixtures contrôlées par l'appelant. Ce n'est pas un runtime de production, un agent OpenCode ni une preuve indépendante.

## Ordre du parcours simulé

1. Inspecter une transition `plan` pure et son checkpoint de SHA distinct.
2. Contrôler l'observation distante simulée et la recommandation de `apply` manuelle, sans autorisation d'exécution.
3. Simuler `apply` avec checklist pré-sync complètement cochée et un checkpoint d'implémentation au SHA suivant.
4. Inspecter la chaîne plan/apply simulée et l'absence de conflits, de PR finale ambiguë et de run concurrent.
5. Vérifier un inventaire de sync OPSX uniquement sous les specs canoniques prévues ; **ne pas appeler le modèle**.
6. Vérifier l'archive du change à contenu inchangé avec `--skip-specs` en simulation.
7. Produire le snapshot `finalize` consultatif et une synthèse sans aucun grant.

Le harness refuse toute erreur de chaîne, chemin, checklist, politiques, SHA, contrôle CI, snapshot sync/archive, activité concurrente, date, ou injection de champ de token ou retry. Les erreurs des composants sont ramenées à un motif générique, sans inclure de données sensibles éventuelles.

**Non-objectifs et preuves :** aucune source GitHub réelle, aucun accès App, aucun CAS, aucun paiement, aucune synchronisation sémantique OPSX, aucune archive réelle, aucun installateur ou publication. Même un résultat `simulatedOnly=true` conserve `authorizedToExecute=false`, `writesPerformed=false`, `opsxCommandInvoked=false`, `paidApprovalRequired=true` et `sourceProvenanceVerified=false`. Les SHA et booléens venant de mocks ne sont pas des attestations.

Exécuter `node --test tests/openspec-offline-cycle.test.mjs` (sans fournisseur) puis les tests indépendants CI sur SHA exact. Toute exécution OpenCode/OPSX réelle requiert une autorisation de dépense distincte, un hôte R3e-03 réellement qualifié, la provenance SEC-02 et une publication par PR protégée.

Voir [`R3f-01`](r3f01-openspec-phase-contract.md), [`R3f-02`](r3f02-checkpoint-resume-preview.md) et [`R3f-03`](r3f03-opsx-offline-guard.md).
