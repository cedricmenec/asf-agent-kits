# SEC-02 — proposition de gouvernance des tags et des releases AgentKit

> **Statut : document de préparation, sans effet sur GitHub Settings.** Ce document ne constitue ni une autorisation administrative, ni une release, ni une preuve de provenance. Aucun tag ne doit être créé par cette PR.

## 1. État de référence

- Dépôt cible : `cedricmenec/asf-agent-kits`.
- Branche source : `main`, protégée par le ruleset `asf-catalogue-main-protection` (ID 25587465), PR et check indépendant `check` requis, mise à jour stricte.
- Les contenus R2c (manifestes de candidats), R3a (préflight de politique) et R3b (inspection consultative de réponses GitHub) **ne vérifient pas** une attestation de provenance de release.
- Tout statut `sourceProvenanceVerified`, `promotionAllowed` ou `authorizedToExecute` reste `false` tant que la preuve indépendante correspondante n'est pas réellement disponible et validée.

## 2. Namespace et immutabilité

Une release de kit devra correspondre à un tag annoté de la forme `kits/<kit-id>/v<MAJOR>.<MINOR>.<PATCH>` ; les versions de prépublication et les alias mutables, s'ils sont un jour autorisés, nécessiteront un contrat séparé.

**Proposition de ruleset de tags GitHub** (à arbitrer, **ne pas appliquer automatiquement**) :

| Attribut | Valeur proposée |
| --- | --- |
| Nom | `asf-kits-immutable-release-tags` |
| Cible | Tags correspondant au motif `kits/*/v*` |
| Enforcement | `active` **uniquement après autorisation explicite** |
| Suppression | Interdite |
| Mise à jour / retag | Interdite |
| Création | Réservée à une identité de publication indépendante et approuvée ; une interdiction globale sans exception pourrait empêcher toute publication légitime |
| Bypass | Aucun bypass par défaut ; si indispensable, identité dédiée au strict minimum et justification documentée |
| Historique | Un tag existant ne doit pas changer de cible ; correction par **nouvelle version**, jamais par remplacement |

Les motifs GitHub et la portée effective des règles doivent être testés en lecture et vérifiés dans l'interface avant activation. **Ne pas supposer** que le glob `kits/*/v*` protège toutes les sous-arborescences : qualifier les correspondances réelles des règles GitHub, en particulier les composants séparés par `/`. Si la syntaxe de motif ne garantit pas le périmètre attendu, **refuser l'activation** jusqu'à preuve contraire.

## 3. Contrat d'autorité de publication

Aucune entrée du workflow, aucun fichier de tâche et aucun manifeste candidat ne peut choisir les credentials ou l'identité de publication.

Avant d'autoriser la publication, il faudra vérifier indépendamment :

1. L'identité de l'acteur est reconnue par GitHub et explicitement autorisée par le propriétaire du catalogue pour **une** publication déterminée.
2. Le SHA source est un commit complet appartenant à `main` protégée ; il est déterminé et comparé à l'instant de validation, sans suivre de nom de branche mutable après validation.
3. Le manifest de release, les chemins normalisés, les octets exacts et les empreintes SHA-256 correspondent à ce SHA.
4. La provenance de l'artefact est établie par une preuve indépendante de ses déclarations internes, avec vérification de l'émetteur, du dépôt, du workflow et de la liaison SHA → artefact.
5. L'écriture du tag est un acte privilégié distinct de l'installation d'un kit, du contrôle en lecture seule ou de la fusion d'une PR.
6. Une preuve absente, expirée, contradictoire ou invérifiable provoque un **refus fermé**, pas un retry privilégié.

Le simple fait qu'une CI soit verte sur un commit n'est pas une signature d'artefact, et la double lecture d'une ref n'apporte pas de garantie CAS atomique.

## 4. Qualification non payante et scénarios adversariaux

Avant de demander une autorisation administrative pour un ruleset de tags, qualifier hors production et sans secrets :

- Tag pointant vers un autre commit que celui du manifeste → **refus**.
- Tag existant renommé, déplacé ou supprimé → **refus**.
- SHA source valide mais ref non protégée / historique `main` non prouvé → **refus**.
- Manifest ayant le bon nom de version mais octets de l'artefact modifiés → **refus**.
- Identité de l'émetteur inconnue, attestation absente ou invalide → **refus**.
- Réponse GitHub tronquée, pagination incomplète, redirection ou refus réseau → **refus**.
- Autre kit/version correspondant à un motif de tag non protégé → **refus de publication**.
- Dépôt cible avec fichiers managed divergents ou symlink hostile → **conflit ; aucune écriture**.
- Aucun appel LLM, aucune relance payante automatique.

Prévoir une CI indépendante, des tests d'identité et des preuves reproductibles au SHA exact. Les tests synthétiques ne valent pas une vérification d'identité GitHub réelle.

## 5. Décision à soumettre au propriétaire, plus tard

Avant tout réglage GitHub ou toute création de tag, demander un accord distinct portant sur :
- l'identité du publieur et son périmètre de permissions ;
- le namespace exact et les correspondances effectives du ruleset ;
- les opérations interdites (update, delete, retag) et les rares exceptions éventuelles ;
- la procédure de validation indépendante des attestations et des artefacts ;
- le scénario de qualification, son coût (zéro LLM pour les essais non payants) et le plan d'arrêt.

Après accord, un opérateur humain applique le ruleset dans **Settings → Rules → Rulesets** ; un second contrôle API confirme l'activation effective. La fusion du présent document **n'applique aucune protection**.

## 6. Dépendances et limites

- [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9) : protection des tags / preuve de provenance.
- [R3c #16](https://github.com/cedricmenec/asf-agent-kits/issues/16) : transport GitHub GET consultatif et ancrage sur une ref protégée, toujours non publié.
- [Contrat de confiance R3](r3-release-trust-contract.md) : frontières de sécurité des releases.

Tant que R3c n'est pas implémenté et qualifié avec un transport authentifié indépendant, aucune preuve GitHub opérationnelle n'est revendiquée. Cette PR documentaire n'exécute pas de publication de release.
