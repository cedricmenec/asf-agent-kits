# REL-01 : contrôle en lecture seule des preuves d'une release

**Statut : proposition à qualifier en PR.** Ce contrôle ne crée ni tag, ni release, ni ruleset. Il ne modifie aucun dépôt et n'autorise aucune installation ou promotion.

## Objectif limité

Relier un manifeste de release candidat à quatre observations indépendantes, lues via l'API GitHub :

1. L'identité exacte du dépôt, sa branche `main` protégée et la présence du commit source dans l'historique de `main`.
2. Un tag **annoté** `kits/<kit-id>/v<version>` résolu vers ce commit et une release GitHub publiée, ni brouillon ni prépublication, associée à l'auteur attendu.
3. Le SHA-256 du **manifeste local candidat** comparé à l'empreinte et à la taille de l'asset `release-manifest.json` exposées par GitHub.
4. Les fichiers listés par le manifeste relus au **SHA exact du commit**, avec leurs tailles et SHA-256 vérifiés. Les chemins suspects, collisions de casse, réponses partielles et fichiers manquants entraînent un refus.

Le manifeste est un **asset de release**, construit **après** la fixation du commit et avec son SHA exact. Ne pas essayer de stocker dans le même commit un fichier qui contient son propre SHA Git : ce serait circulaire. La release doit donc conserver l'asset immuable et sa provenance propre.

## Exécution consultative

Après installation des dépendances Python déjà figées dans `requirements-contracts.txt`, dans un environnement qui possède un jeton GitHub en lecture seule :

```bash
python3 tools/inspect_release_evidence.py \
  --repository cedricmenec/asf-agent-kits \
  --kit opencode-openspec \
  --version 1.0.0 \
  --expected-publisher PUBLISHER_LOGIN_APPROUVE \
  --manifest chemin/vers/release-manifest.json
```

Le jeton est lu depuis `GH_TOKEN` ou `GITHUB_TOKEN`, jamais imprimé. Tous les accès distants sont des requêtes GET vers `api.github.com`, à taille et durée limitées, sans suivre de redirection. Un rapport JSON signale les incohérences ; code de sortie 3 en cas d'échec. Aucun secret, fichier ou asset n'est écrit.

`releaseEvidenceConsistent=true` signifie seulement que **les observations et les octets du code source concordent**. Les champs `sourceProvenanceVerified`, `trustEvidenceIndependentlyVerified`, `tagGovernanceVerified`, `promotionAllowed` et `authorizedToExecute` restent **toujours à false**, même après une inspection cohérente. Cette étape ne vérifie pas d'attestation cryptographique de l'identité du publieur, ni la portée effective d'un ruleset de tags. Elle ne prouve pas non plus les octets de tous les assets binaires distribués, au-delà du manifeste dont l'empreinte est comparée. Les réponses GitHub ne forment pas un instantané atomique.

## Tests de refus

`python3 -m unittest tests/test_inspect_release_evidence.py` couvre sans réseau : dépôt inattendu, branche non protégée, release brouillon ou absente, auteur inattendu, tag déplacé ou non annoté, commit hors `main`, liste d'assets incomplète, manifeste absent, empreinte manquante ou incorrecte, fichier altéré, chemin dangereux et clés JSON dupliquées. Le passage de la CI reste à vérifier sur le SHA de la PR.

## Limites et tâches manuelles avant une vraie release

- [ ] Le propriétaire valide l'identité de publication et le mécanisme d'attestation indépendant.
- [ ] Le propriétaire qualifie et active en personne un ruleset de tags couvrant réellement le namespace prévu, interdisant mise à jour et suppression, après décision explicite.
- [ ] Une qualification indépendante vérifie ce ruleset, les permissions effectives et le workflow de release avant de publier le premier tag.
- [ ] Un test réel vérifie l'installation et la mise à jour à partir des assets publiés, ainsi que le retour arrière.

**Aucune release `1.0.0` ne doit être déduite du seul résultat de ce contrôle.** Voir aussi [Contrat R3](r3-release-trust-contract.md) et [Plan SEC-02](sec02-tag-governance-plan.md).
