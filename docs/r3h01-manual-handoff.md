# R3h-01: préflight de passage entre phases manuelles et checkpoints

Le module `core/manual-phase-handoff-preview.mjs` relie **sans aucun effet de bord** les garde-fous de `R3a` (`evaluateManualRequest`) et les checkpoints synthétiques de `R3f-01` (`previewOpenSpecTransition`). Il ne contient aucun appel GitHub, aucun runner, aucun appel OpenCode, modèle, CLI OpenSpec ou OPSX, aucun commit ni CAS.

L'enveloppe est fermée et vérifie récursivement les entrées avant leur transmission aux validateurs précédents : pas d'accesseur, propriété symbolique, prototype exotique, structure circulaire, champ secret ou champ inconnu. Les identités dépôt/tâche/branche, les préfixes de produit et les chemins **exacts** entre la demande R3a et l'événement R3f doivent concorder. Le SHA attendu doit être identique et la création d'un plan exige le SHA de base initial. Pour une phase `apply`, R3f vérifie le checkpoint de plan et sa chaîne de digests.

`syntheticSlot` compare uniquement un groupe de concurrence fourni par la politique de configuration et des observations **simulées** : aucun job payant actif, aucune PR finale ouverte, tentative numéro un. C'est un **préfiltre**, pas un véritable mutex partagé GitHub Actions, un verrou transactionnel ou une permission de facturation. Des observations auto-déclarées ne prouvent ni l'absence de concurrence réelle ni la protection du dépôt. Le profil direct R4 est explicitement exclu de ce compositeur OpenSpec.

La sortie est un diagnostic de handoff : phase, tâche, branche, SHA synthétique courant, futur SHA déclaré, étape de checkpoint, groupe de concurrence attendu et limites. Les valeurs `paidExecutionStarted`, `independentlyAuthenticatedHost`, `sourceProvenanceVerified`, `trustEvidenceIndependentlyVerified`, `authorizedToExecute`, `promotionAllowed`, `writesPerformed` restent **toujours fausses** et `paidApprovalRequired=true`.

Tests : `node --test tests/manual-phase-handoff-preview.test.mjs`, puis `npm run check` et `actionlint` en CI indépendante au SHA exact.

**Ce qui reste bloqué avant un runtime opérationnel :** vérification réelle de l'identité/installation/permissions de l'hôte R3e-03, provenance attestée SEC-02, file de concurrence protégée au niveau des jobs GitHub Actions, séparation effective des credentials et du modèle, admission payante explicite, commandes `opsx` réellement validées, checkpoints durables via une autorité CAS unique, vérification des refs/protection/CI, branche/PR contrôlées. Ce document n'accorde aucune activation, permission ou dépenses.
