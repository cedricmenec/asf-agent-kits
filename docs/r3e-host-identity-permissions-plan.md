# R3e — Plan de qualification de l'identité et des permissions de l'hôte GitHub

> **Proposition d'architecture R3e-01, non opérationnelle.** Ce document n'installe aucune App, ne crée aucun secret, n'applique aucun ruleset et n'active aucun workflow ou modèle payant. L'implémentation et les preuves de terrain sont des jalons distincts. [Suivi #22](https://github.com/cedricmenec/asf-agent-kits/issues/22).

## 1. État de départ et frontière d'autorité

Les PR R3b #15, R3c #19 et R3d #21 sont fusionnées : le catalogue peut vérifier la cohérence déclarative d'une politique liée à un SHA et refuser certaines réponses HTTP malveillantes ou incomplètes. Elles ne constituent **pas** une preuve indépendante de l'identité du service ayant construit le transport ou des permissions du token.

Le domaine non fiable comprend la tâche, la branche de travail, les fichiers générés par un agent, les déclarations du kit, les paramètres de workflow fournis par l'appelant et les réponses d'un transport arbitraire. **Seul un runtime hôte isolé et explicitement approuvé** pourra fournir des credentials, le dépôt cible autorisé et une capacité de lecture GitHub. Le même domaine non fiable ne doit pas produire et valider lui-même sa preuve d'identité.

Les sorties du préflight R3 restent inconditionnellement sans autorité : `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`. Une preuve de lecture GitHub **ne prouve pas** la signature d'une release, l'autorisation de dépense ou un CAS atomique.

## 2. Autorités et objets à distinguer

- **Propriétaire/administrateur GitHub** : autorise explicitement l'installation de l'App, sa liste de dépôts et toute extension de permissions. Le propriétaire de la PR ou de la tâche ne peut pas s'octroyer ce droit par fichier.
- **Exécuteur du runtime hôte** : charge sa propre politique depuis une ref déjà protégée et figée, obtient la capacité de lecture en dehors du processus LLM, impose les origines/ressources et journalise des preuves non sensibles. Le runtime est à qualifier et non présumé fiable par un booléen.
- **GitHub App** : identité stable `app_id` et **installation spécifique** `installation_id` à rattacher au dépôt attendu ; aucune App Executor V1 (5321746) ou Controller V3 (5361227) n'est réutilisée par défaut.
- **Token d'installation** : délivré hors domaine agent, borné à un dépôt/installation et à des permissions en lecture. Ne doit jamais être inclus dans un champ de tâche, de résultat JSON, une trace, un artefact, un argument de commande ou la mémoire d'un modèle.
- **Déclencheur humain et identité GitHub Actions** : la provenance d'un événement de workflow ou la valeur déclarée `actor` ne prouve ni l'autorisation d'une dépense ni les permissions effectives du jeton.
- **Commit et politique** : SHA complet issu d'une source protégée, validé contre les règles et les checks GitHub indépendants ; une double lecture de ref n'est pas une transaction.

## 3. Contrat de bootstrap hôte (à implémenter)

1. Un code hôte approuvé charge hors de la PR candidate la configuration fermée : `owner/repo`, `repository_id` (si disponible), nom de branche, SHA de commit, chemin et Git blob SHA de la politique, règles et checks requis, `app_id`, `installation_id`, droits de lecture attendus, date limite de validité de la session.
2. L'hôte, séparé des jobs qui exécutent du code généré, résout son principal d'installation GitHub et vérifie la **correspondance de dépôt/installation/permissions effectives** via des réponses authentifiées provenant du service GitHub attendu. L'identifiant numérique stable du dépôt doit correspondre quand l'API le fournit. Ne pas accepter une chaîne `hostAuthenticated:true` auto-déclarée.
3. L'hôte établit lui-même le transport HTTPS, attache son credential hors portée de la tâche et n'expose au préflight que la capacité de lecture autorisée. Pas de proxy ou base URL modifiable par l'agent ; redirections et routes non autorisées refusées.
4. Les requêtes R3b/R3c/R3d vérifient rulesets, checks au SHA attendu et octets de la politique ancrée. Toute incohérence, 403/404/429, page incomplète, mauvaise installation, permission manquante, expiration, fuite potentielle ou ref déplacée => refus fermé.
5. Journaliser uniquement IDs, SHAs, permissions attendues/constatées, code de refus et identifiant de run **sans token ni contenu de secret**. Un nouvel essai sur une ref modifiée exige une nouvelle décision ; pas de retry payant automatique.
6. Le résultat demeure consultatif ; tout accès en écriture ou lancement payant utilise une **autorité différente**, un gate et une approbation spécifiques. Les permissions d'installation en lecture ne deviennent jamais un jeton de publication.

## 4. Matrice d'accès et points à qualifier sur GitHub

| Ressource | Usage | Permissions minimales présumées, à vérifier indépendamment |
| --- | --- | --- |
| Dépôt et identité stable | Identifier l'origine, la branche par défaut, l'archive et le dépôt cible | Métadonnées en lecture ; vérifier les contraintes réelles des dépôts privés |
| Branche/commit/contents par SHA | Confirmer la ref et les octets de la politique | Contents en lecture (à vérifier pour l'endpoint branch exact) |
| Rulesets de branche + détail | Confirmer PR, checks stricts, suppression et force-push interdits | **Administration en lecture pourrait être exigée** selon le type de token et l'endpoint ; ne pas l'accorder par défaut |
| Check-runs du SHA | Confirmer contexte de CI et GitHub App indépendante | Checks en lecture ; vérifier l'App productrice et l'exhaustivité de pagination |
| Identité et périmètre de l'installation | Lier `app_id`, `installation_id`, dépôt et droits réels | Endpoint/jeton admissibles et permission correspondante **à qualifier sur GitHub**, ne pas se fier à une valeur fournie par l'agent |

Cette matrice est **provisoire** : pas de prétention de disponibilité des APIs pour le compte ou l'installation actuels. Si la lecture du ruleset exige un accès administratif non autorisé, bloquer le gate et proposer une architecture de preuve de rechange revérifiée, **sans élargir silencieusement les permissions**.

## 5. Découpage des PR et critères d'acceptation

### R3e-01 — Spécification (présente PR documentaire)

- Contrat explicite des autorités, provenance indépendante, matrice des droits, origine du code hôte et cas de refus.
- Aucune création de secret, token, App, installation, tag ou référence opérationnelle.
- CI de documentation verte sur SHA exact ; revue et autorisation séparée avant fusion.

### R3e-02 — Code et tests synthétiques (future PR)

- Implémenter un **bootstrap hôte de test** qui ne permet pas à la tâche de construire le transport, usurper la cible, changer la politique ou exposer le token.
- Tests adversariaux : installation inattendue, dépôt déplacé, permissions incomplètes, source de politique mutable, token expiré/révoqué, réseau inaccessible, quota, pagination, ref qui change, transport substitué, réponse forgée. Toute incertitude => zéro grant.
- Vérifier que le chemin LLM ne possède jamais les credentials GitHub ; le simple découpage de fonctions ne prouve pas l'isolation d'un runner.
- PR brouillon et CI Node/Python/actionlint indépendantes au SHA exact.

### R3e-03 — Qualification hôte authentifié (gate contrôlé)

- Vérifier d'abord en lecture les permissions/installations **déjà approuvées** et documenter l'écart réel du contrat.
- Pour tout nouveau secret, modification d'installation App, scope élargi, environnement protégé, ruleset ou test de production : **autorisation explicite distincte de l'administrateur** avant action.
- Après accord, qualification bornée non payante avec preuve GitHub d'identité/droits effectifs, échecs négatifs et audit des logs sans secret. Aucune activation OpenCode ni paiement.
- Seul le résultat d'une validation réelle, traçable, peut marquer la capacité de transport authentifiée ; les indicateurs de provenance release et d'exécution restent faux.

## 6. Dépendances et décisions à trancher

- R3b #15, R3c #19 et R3d #21 sont des fondations fusionnées, pas des preuves de runtime opérationnel.
- [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9) doit traiter les **tags immuables, les artefacts et les attestations de release** séparément de l'identité du transport.
- Décisions propriétaire futures : quel runtime hôte isolé, quelle identité GitHub App pour une installation en lecture, quels dépôts pilotes, quels scopes réellement disponibles, quelle séparation entre lecture, publication et exécution facturable. Aucune de ces décisions n'est autorisée par la fusion d'une PR documentaire.
- [Feuille de route du catalogue](https://app.notion.com/p/40012ac916368112b7fbc8d25dbb9838) et [issue R3e #22](https://github.com/cedricmenec/asf-agent-kits/issues/22).

**Critère de sortie R3e** : preuve reproductible de l'identité et des permissions réelles de l'hôte sur une installation autorisée, contrôle SHA/CI/branche protégée et refus adversariaux sans activation payante. Tant qu'une de ces conditions manque, le jalon n'est **pas opérationnel**.
