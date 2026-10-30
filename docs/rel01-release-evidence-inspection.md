# REL-01 : contrôle en lecture seule des preuves d'une release

**Statut : contrôles consultatifs intégrés par les PR #98 et #99, puis durcis pour les versions d'exécution.** Aucun tag, release ou ruleset créé ; aucune installation de production ni promotion autorisée.

## Objectif limité

Relier un manifeste de release candidat à quatre observations indépendantes, lues via l'API GitHub :

1. L'identité exacte du dépôt, sa branche `main` protégée et la présence du commit source dans l'historique de `main`.
2. Un tag **annoté** `kits/<kit-id>/v<version>` résolu vers ce commit et une release GitHub publiée, ni brouillon ni prépublication, associée à l'auteur attendu.
3. Le SHA-256 du **manifeste local candidat** comparé à l'empreinte et à la taille de l'asset `release-manifest.json` exposées par GitHub.
4. Les fichiers listés par le manifeste relus au **SHA exact du commit**, avec leurs tailles et SHA-256 vérifiés. Les chemins suspects, collisions de casse, réponses partielles et fichiers manquants entraînent un refus.

Le manifeste est un **asset de release**, construit **après** la fixation du commit et avec son SHA exact. Ne pas essayer de stocker dans le même commit un fichier qui contient son propre SHA Git : ce serait circulaire. La release doit donc conserver l'asset immuable et sa provenance propre.

## Exécution consultative

### Préparer un manifeste depuis des objets Git exacts (sans publication)

`build_candidate.py` accepte `--source-commit` pour lire les fichiers du
descripteur dans les **objets Git** d'un checkout local, sans utiliser les
éventuelles modifications du worktree. Le remote `origin`, le commit exact,
les chemins, les empreintes et la version déclarée dans le `version.json`
épinglé sont contrôlés. Le descripteur doit indiquer le même
`sourceRepository`, `sourceCommitSha` et `kitVersion`. Par exemple :

```bash
python3 tools/build_candidate.py \
  --source /chemin/vers/asf-agent-kits \
  --source-commit SHA_SOURCE_COMPLET \
  --descriptor /chemin/vers/metadata-et-inventaire.json
```

Pour le profil `opencode-openspec`, les versions déclarées de Node, OpenCode
et OpenSpec doivent aussi correspondre aux commandes et aux **deux** étapes
`setup-node` du workflow au commit exact. La version Node retenue pour cette
qualification est `22.23.3` ; elle est épinglée dans le modèle. Une version
majeure flottante ou une incohérence provoque un refus. Ce contrôle ne prouve
ni le verrouillage des dépendances transitives npm, ni la provenance distante.

Le descripteur énumère explicitement les chemins à inclure ; il n'existe
pas de périmètre de release implicitement approuvé. La sortie est un manifeste
**candidat non attesté**, même si les empreintes des blobs sont exactes.

Pour évaluer son usage sans installer ni publier, la CLI prend en charge
`install --dry-run --candidate-manifest /chemin/vers/release-manifest.json`
(ou `upgrade --dry-run` avec ses paramètres habituels). Elle vérifie
les métadonnées, les neuf templates requis et les empreintes de **tous**
les artefacts énumérés contre le commit local épinglé. La sortie contient
`candidateBytesMatchPinnedGit=true`, une empreinte du JSON **canonique**
et conserve `releaseProvenanceVerified=false` et le niveau de confiance
`user-pinned-git-object-unattested`. Un manifeste candidat est **refusé**
avec `--apply` ou `--pr` : il ne permet pas de promouvoir une release.

Cette étape ne valide ni le pinning exact de Node et des dépendances,
ni une attestation de l'éditeur, ni les protections de tags/releases, ni
le chemin d'installation depuis de véritables assets GitHub publiés.
Ces gates restent à traiter avant une release officielle.

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
