# R3a — Noyau portable de politique des tâches manuelles

**Statut : prototype pur, sans exécution, sans autorisation de dépense.** Issue [R3a #11](https://github.com/cedricmenec/asf-agent-kits/issues/11). Source auditée : [ThreadStep au SHA a94106f6a3205db51e7cd188a6ba461326d6cec3](https://github.com/cedricmenec/threadstep/tree/a94106f6a3205db51e7cd188a6ba461326d6cec3). Aucun code d'ASF Controller V3 n'est copié.

## Frontière d'extraction vérifiée

| Source ThreadStep | Contrat portable R3a | Exclus |
| --- | --- | --- |
| \`scripts/normalize-task-id.mjs\` | IDs canoniques en forme \`PREFIX-NNN\`, branche par tâche, fichier backlog paramétré | Alias numériques implicites TS-009, couplage produit |
| \`scripts/agent-openspec-checkpoint.mjs\` | Refus fermé des fichiers protégés, des secrets et des changements hors phase | git staging/commit/push, workflow de publication |
| \`scripts/asf/opencode-model-policy.mjs\` | Choix strict sur allowlist ; \`small_model=model\` ; \`agent.title.disable=true\` | Appels OpenCode, sélection cachée d'un second modèle |
| \`scripts/check-openspec-task-phases.mjs\` | Phase manuelle explicite, plan limité au changement, application limitée aux chemins produit | Validation sémantique LLM de checklist |
| \`scripts/sync-guard.mjs\` | Phase finalize limitée aux spécifications canoniques et à l'archive de la tâche | Fichiers modifiés, snapshot Git, OPSX Sync payant |
| \`.github/workflows/agent-openspec.yml\` | \`workflow_dispatch\` propriétaire, task ID, branch SHA, check indépendant et mutex local | \`workflow_call\`, réservations V3, wave ID, CAS multi-dépôts |

**Exclusions fortes :** \`scripts/asf/waves/authenticate-executor.mjs\`, \`threadstep-paid-development-v1\`, orchestrateur de backlog V1, Controller V3, refs de vague, GitHub Apps et App tokens. La chaîne de confiance du catalogue et de la cible ne doit jamais être déduite de données fournies par l'agent.

## Interface du module pur

\`\`\`js
import { evaluateManualRequest } from "./core/manual-policy.mjs";
const preview = evaluateManualRequest(config, candidateRequest, assertedPolicyEvidence);
\`\`\`

Les trois arguments sont des **valeurs JSON inertes**, sans entrée/sortie, chargement de secret ou requête GitHub. Le préflight exige un ensemble fermé de champs, un contexte manuel déclaré, un acteur correspondant au propriétaire déclaré, une tâche canonique, un profil activé, une phase valide, un modèle OpenRouter figurant sur la liste autorisée, un SHA de branche concordant, et les checks attendus. Les chemins sont vérifiés avant toute manipulation ultérieure ; les fichiers de politique/CI, secrets, pseudo-répertoires Git, répertoires propres à l'agent et autres dossiers hors périmètre sont refusés. Les commandes de validation sont conservativement limitées à \`npm run check\`, \`npm test\` et \`node --test\`.

**Important :** \`assertedPolicyEvidence.refProtectionChecked=true\` est une affirmation de l'appelant, pas une preuve GitHub indépendante. Ce module ne peut pas vérifier l'acteur GitHub, la provenance du code, les SHA distants, les checks en temps réel, les symlinks ni l'autorisation d'une dépense. Les résultats affichent inconditionnellement \`authorizedToExecute=false\`, \`sourceProvenanceVerified=false\`, \`trustEvidenceIndependentlyVerified=false\`, \`paidApprovalRequired=true\` et \`writesPerformed=false\`. Ne jamais convertir ce module en autorité d'exécution en changeant ces booléens.

## Restrictions volontaires et validation

- La syntaxe de tâches supportée dans cette première extraction est strictement \`^[A-Z][A-Z0-9]{1,9}-[0-9]{1,6}$\`, sans alias numérique. Une expression régulière non approuvée est rejetée plutôt qu'exécutée (risque ReDoS).
- Les chemins éditables sont ceux du plan OpenSpec propre à la tâche et des \`allowedProductPrefixes\`, puis des \`openspec/specs/\` ou archives propres à la tâche lors de finalize. Le profil direct se limite aux préfixes produit. Aucun accès au filesystem réel n'est réalisé dans cette unité.
- Le profil direct ne prend que la phase \`auto\` dans ce contrat préliminaire ; les autres phases devront faire l'objet d'une spécification atomique.
- \`autoMerge=true\`, activation non manuelle, versions runtime \`latest\`, commandes shell arbitraires ou champs d'orchestration ASF V3 sont refusés.
- **Ce contrat est un sous-ensemble strict du schéma R1**, pas un changement silencieux de son contrat : les options existantes non prises en charge refusent fermé. La convergence du schéma et la vérification par une ref GitHub protégée constituent des jalons séparés.

## Preuves de test

Exécuter \`npm run check\` (tous les tests Python et Node, dont \`tests/manual-policy.test.mjs\`). Les cas positifs couvrent plan sur un projet vierge synthétique, apply sur projet existant synthétique, profil direct et finalize ; les cas adversariaux vérifient modèle, tâche, chemin, branche, acteur, metadata V3, config non reconnue, doublons/collisions et confiance prétendue.

La CI sur SHA exact doit rester verte avant toute promotion. **Cette PR doit rester brouillon** jusqu'à qualification et revue ; aucune fusion, création de tag, ruleset, workflow opérationnel, secret ni appel LLM n'est autorisée par ce document. Avant tout workflow réel : prouver le chargement de politique depuis une ref protégée et figer OpenCode/Actions/versions de dépendances (le workflow ThreadStep d'origine contient \`latest\` et des tags d'actions majeurs).
