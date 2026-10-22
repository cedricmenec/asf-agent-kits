# R3 — Contrat de confiance des releases AgentKit

Statut : proposition non opérationnelle. Aucun tag, secret, workflow de release ou permission privilégiée n'est activé.

## Frontière de confiance

Un manifeste local et des empreintes SHA-256 ne prouvent **pas** l'identité de l'éditeur. Le prototype R2b doit conserver `sourceProvenanceVerified=false`, `promotionAllowed=false` et `writesPerformed=false` tant qu'une preuve GitHub indépendante n'a pas été vérifiée.

Les données fournies par le kit lui-même (URL, nom de branche, SHA déclaré, signature auto-déclarée) sont **non fiables**. Un agent ne doit jamais déduire la provenance d'une correspondance de hash locale seule.

## Politique de publication proposée

1. Un tag immuable de forme `kits/<kit-id>/v<semver>` référence un commit déterminé du catalogue.
2. Un ruleset de tags GitHub est requis avant la première release ; création réservée à une identité de publication explicitement autorisée, suppression et réécriture interdites, bypass limité et documenté.
3. Le commit cible appartient à l'historique attendu de la branche `main` protégée, au moment de la publication.
4. Les artefacts ont des SHA-256 inscrits dans un manifeste de release versionné, associé à ce commit ; l'installateur vérifie le contenu téléchargé octet par octet.
5. La provenance est attestée par une source indépendante du manifeste, et la chaîne de confiance (identité, dépôt, commit, tag, artefact) est validée intégralement.
6. Les versions publiées ne sont jamais remplacées en place ; une correction exige une nouvelle version.
7. Toute incertitude, incohérence, tag mobile, changement de propriétaire, permission insuffisante, artefact manquant ou attestation invalide entraîne un **refus fermé**.

## Séquence d'implémentation sûre

- **SEC-02a — préparation (sans privilèges) :** formaliser le schéma de provenance, la matrice d'identités et les cas de refus ; ajouter des fixtures positives et adversariales sans écrire de tag.
- **SEC-02b — gate humain :** soumettre au propriétaire la proposition de ruleset de tags et les permissions exactes. Ne pas modifier les Settings sans son accord spécifique.
- **SEC-02c — qualification :** tester une publication fictive sur refs non protégées et artefacts synthétiques, sans frais LLM, puis qualifier le workflow de release sur un SHA exact.
- **R3 — renderer :** rendre les fichiers managed de manière déterministe, conserver les overlays, construire un plan de PR dry-run ; ne pas appliquer de modifications au dépôt cible avant une étape explicitement autorisée.

## Matrice de refus minimale

| Scénario | Décision |
| --- | --- |
| SHA-256 local correct, tag non vérifié | Refus |
| Tag résolu vers un commit différent du manifeste | Refus |
| Tag supprimé ou déplacé | Refus |
| Attestation absente ou identité non approuvée | Refus |
| Artefact altéré, même si le nom de version correspond | Refus |
| Provenance attestée, mais permissions GitHub inconnues | Refus |
| Dérive locale ou collision de propriété managed/overlay | Conflit, aucune écriture |
| Tous les éléments vérifiés et autorisés | Éligible à une **future** proposition de PR, jamais à un déploiement implicite |

## Critères de sortie

- [ ] Contrat revu et approuvé pour les identités, la preuve et les règles de tags.
- [ ] Tests négatifs et CI indépendante sur le SHA exact de l'implémentation.
- [ ] Aucun chemin d'activation payante automatique.
- [ ] Accord propriétaire séparé avant la moindre modification administrative ou création de tag protégé.

Références : [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9), [R2b #7](https://github.com/cedricmenec/asf-agent-kits/issues/7).
