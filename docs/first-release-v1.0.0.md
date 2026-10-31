# Première release ASF AgentKit 1.0.0

## Périmètre volontairement simple

La V1 fournit le kit `opencode-openspec` à partir d'un tag GitHub fixe et d'un
checkout local épinglé sur le commit exact. La CLI installe neuf fichiers
depuis les objets Git, prépare un lock avec le SHA du commit et l'empreinte de
chaque fichier, refuse les collisions, puis laisse le développeur créer une
PR Git ordinaire.

La V1 ne vérifie pas automatiquement la provenance du tag ni l'identité de
l'éditeur. Le propriétaire vérifie le ruleset de tags, le réglage des releases
immuables, l'auteur, le commit et le manifeste avant de publier. Le lock garde
donc le statut explicite `user-pinned-git-object-unattested`. Aucun service de
signature, GitHub App d'installation ou flux de publication automatisé n'est
nécessaire pour atteindre cet objectif.

## Préparer et vérifier le manifeste

À exécuter sur le commit final de `main`, après le passage de la CI :

```sh
SOURCE_SHA="$(git rev-parse HEAD)"
python3 -m pip install -r requirements-contracts.txt
python3 tools/build_release_manifest.py \
  --source . \
  --source-commit "$SOURCE_SHA" > release-manifest.json
python3 tools/build_release_manifest.py \
  --source . \
  --source-commit "$SOURCE_SHA" > release-manifest.second.json
cmp release-manifest.json release-manifest.second.json
```

La commande est en lecture seule et refuse les métadonnées autres que la
version stable épinglée, un SHA absent, un dépôt Git incorrect, une dépendance
runtime divergente ou un fichier de distribution manquant. Le manifeste
contient SHA-256 de l'inventaire runtime explicite. Il est créé après le commit
et joint à la release GitHub comme asset `release-manifest.json`, ce qui évite
la référence circulaire d'un commit qui contiendrait son propre SHA.

## Publication manuelle

1. Dans GitHub, confirme que le tag est `kits/opencode-openspec/v1.0.0`, que
   le commit correspond à `SOURCE_SHA`, que le check `check` est vert sur ce
   SHA et que l'auteur est le publieur attendu.
2. Crée une release **draft** depuis ce tag et ce commit, ajoute
   `release-manifest.json`, puis vérifie les notes et les assets.
3. Publie seulement après cette revue. Les releases immuables s'appliquent à
   partir de leur publication. La règle de tags empêche les acteurs sans
   bypass de créer, déplacer ou supprimer le tag.
4. Après publication, télécharge le manifeste et exécute le contrôle de
   cohérence en lecture seule :

```sh
gh release download 'kits/opencode-openspec/v1.0.0' \
  --repo cedricmenec/asf-agent-kits \
  --pattern release-manifest.json \
  --dir ./release-check
GH_TOKEN="$GITHUB_TOKEN" python3 tools/inspect_release_evidence.py \
  --repository cedricmenec/asf-agent-kits \
  --kit opencode-openspec \
  --version 1.0.0 \
  --expected-publisher cedricmenec \
  --manifest ./release-check/release-manifest.json
```

Ce contrôle confirme la cohérence observée du dépôt, du tag, du commit, de
l'asset manifeste et des fichiers source. Il n'atteste pas cryptographiquement
l'éditeur et ne remplace pas la vérification manuelle des Settings GitHub.

## Installer dans un autre dépôt

Remplace `OWNER/REPO` par le dépôt cible, déjà cloné localement. Le dépôt cible
doit être propre, contenir l'application et ses tests, et fournir une branche
ordinaire sur laquelle le développeur peut créer une PR.

```sh
git clone https://github.com/cedricmenec/asf-agent-kits.git agent-kits
git -C agent-kits fetch --no-tags origin \
  'refs/tags/kits/opencode-openspec/v1.0.0:refs/tags/kits/opencode-openspec/v1.0.0'
SOURCE_SHA="$(git -C agent-kits rev-parse \
  'refs/tags/kits/opencode-openspec/v1.0.0^{commit}')"
git -C agent-kits switch --detach "$SOURCE_SHA"
git -C agent-kits status --short

git -C ../REPO switch -c chore/install-asf-agentkit-1.0.0
BASE_SHA="$(git -C ../REPO rev-parse HEAD)"
cp agent-kits/kits/opencode-openspec/mvp-config.example.json ../agentkit-config.json
```

Édite `../agentkit-config.json` hors du dépôt cible : `targetRepository`,
branche par défaut, répertoire et préfixe de tâches, commande de tests,
noms des secrets et mutex du dépôt. N'y mets aucune valeur de secret.

```sh
python3 agent-kits/bin/asf-agentkit install \
  --repo OWNER/REPO \
  --checkout ../REPO \
  --kit opencode-openspec \
  --version 1.0.0 \
  --source agent-kits \
  --source-commit "$SOURCE_SHA" \
  --config ../agentkit-config.json \
  --dry-run
```

Relis le plan : il doit afficher neuf fichiers à créer et zéro conflit. Puis
applique-le sur la branche ordinaire explicitement créée :

```sh
python3 agent-kits/bin/asf-agentkit install \
  --repo OWNER/REPO \
  --checkout ../REPO \
  --kit opencode-openspec \
  --version 1.0.0 \
  --source agent-kits \
  --source-commit "$SOURCE_SHA" \
  --config ../agentkit-config.json \
  --apply \
  --expected-head "$BASE_SHA"
python3 agent-kits/bin/asf-agentkit status --repo OWNER/REPO --checkout ../REPO
python3 agent-kits/bin/asf-agentkit doctor \
  --repo OWNER/REPO --checkout ../REPO --config ../agentkit-config.json
```

Vérifie le diff, exécute les tests du dépôt, puis ouvre et fais relire une PR
Git ordinaire. L'installation locale ne requiert pas d'App GitHub. L'exécution
future du workflow peut exiger que le propriétaire configure les secrets,
l'App et les permissions adaptés au dépôt cible. Toute phase OpenCode
potentiellement payante reste soumise à son autorisation explicite.

## Limites connues de la V1

- Le client choisit et épingle le SHA ; la CLI n'interroge pas GitHub pour
  authentifier le tag ou le manifeste.
- La commande `install --pr` avec JWT App, la publication automatisée et
  `finalize` ne sont pas requis pour installer le kit par PR Git ordinaire.
- La release démontre l'installation et le flux `plan`/`apply` qualifiés sur
  le dépôt représentatif existant. Les personnalisations incompatibles sont
  bloquées et demandent une revue manuelle.
- Une correction ultérieure paraîtra sous une nouvelle version ; ne remplace
  ni le contenu du tag ni les assets publiés de `1.0.0`.
