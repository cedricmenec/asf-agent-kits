# ASF AgentKit OpenCode + OpenSpec : démarrage de qualification

Cette recette décrit le **candidat de développement** `opencode-openspec@0.1.0`,
épinglé au commit `3c0932d31234f48c6d8b644d2318e8bcab67bc99`.
Ce n'est **pas une release signée**. La première exécution OpenCode réelle n'est
pas encore qualifiée. Suivi : [issue #91](https://github.com/cedricmenec/asf-agent-kits/issues/91).

## 1. Préparer un dépôt cible

Pour ce pilote, le dépôt contient déjà une application Node 22 avec
`package.json`, `package-lock.json`, `npm run check`, une CI indépendante
nommée `check`, `openspec/config.yaml` et une tâche
`backlog/tasks/AQ-009.md`. Il n'est pas nécessaire d'installer ASF V3.

```sh
git clone https://github.com/cedricmenec/asf-agent-kits.git
git clone https://github.com/cedricmenec/asf-agentkit-qualification.git
cd asf-agent-kits
git switch --detach 3c0932d31234f48c6d8b644d2318e8bcab67bc99
cp kits/opencode-openspec/mvp-config.example.json ../qualification-config.json
```

Dans `../qualification-config.json`, adapter `targetRepository` à
`cedricmenec/asf-agentkit-qualification`, `taskPrefix` à `AQ`,
et `mutexGroup` à `agentkit-qualification-paid-v1`. Pour un autre dépôt,
adapter aussi ses chemins, son script de tests et son groupe de concurrence.
Ce fichier ne contient **aucun secret**.

## 2. Vérifier le plan avant toute écriture

```sh
python3 bin/asf-agentkit install \
  --repo cedricmenec/asf-agentkit-qualification \
  --checkout ../asf-agentkit-qualification \
  --kit opencode-openspec --version 0.1.0 --source . \
  --source-commit 3c0932d31234f48c6d8b644d2318e8bcab67bc99 \
  --config ../qualification-config.json --dry-run
```

Sur la base de qualification `782fb78f9aa930fe82e35effa40221422e7fef00`,
le plan attendu est **10 créations, 0 conflit**, digest
`90a3732da3ac2b986789347970ef1af484d65725e38a0f95824e009cf1123026`.
Sur un autre SHA ou dépôt, **relire le plan**, ne pas réutiliser le digest.

## 3. Vérifier l'installation locale, sans GitHub ni LLM

Sur une **branche locale ordinaire et propre** du dépôt cible, rejouer la
commande précédente avec `--apply --expected-head SHA_CIBLE` à la place de
`--dry-run`. Puis, depuis le répertoire `asf-agent-kits` :

```sh
python3 bin/asf-agentkit status --repo cedricmenec/asf-agentkit-qualification \
  --checkout ../asf-agentkit-qualification
python3 bin/asf-agentkit doctor --repo cedricmenec/asf-agentkit-qualification \
  --checkout ../asf-agentkit-qualification --config ../qualification-config.json
```

Vérifier les empreintes des **9 fichiers gérés**, les **5 prérequis locaux**,
puis `npm ci --ignore-scripts` et `npm run check` sur la cible.
Ce diagnostic local **ne prouve pas** les permissions GitHub.

## 4. Publier et installer seulement après revue

La CLI propose `install --pr` depuis un **checkout propre** : branche distante
nouvelle, PR **brouillon** seulement. Il faut confirmer le SHA de base, le
digest du plan et l'App ID, et fournir un **JWT court de GitHub App** via
`GITHUB_APP_JWT`, obtenu hors des prompts et logs. Lire
[le contrat exact de publication](ak-mvp-03-controlled-pr.md).
La présence de `APP_PRIVATE_KEY` dans les Secrets GitHub Actions **ne fournit
pas automatiquement un JWT au terminal local**.

Pour le banc de test, la [PR #2](https://github.com/cedricmenec/asf-agentkit-qualification/pull/2)
existe déjà et sa CI est verte : **ne pas créer une PR en doublon et ne pas
fusionner/activer #2 sans autorisation spécifique**. La publication par la
vraie App/JWT reste à prouver, indépendamment de cette PR créée via connecteur.

## 5. Première tâche OpenCode + OpenSpec, après autorisations

Après revue du workflow, fusion **explicitement autorisée** de la PR
d'installation, contrôle de `main` et configuration propriétaire des
variables/secrets, déclencher manuellement la tâche synthétique `AQ-009`.
Enchaîner `plan`, revue OpenSpec, `apply`, puis `finalize`, avec **une
autorisation de dépense distincte pour chaque phase** et aucun retry payant
automatique. Vérifier la branche, la PR brouillon, le check indépendant au
**SHA exact** et les critères de la tâche avant toute fusion.

**Frontière de réussite :** une CI verte sur la PR d'installation ne prouve
ni une authentification GitHub App via JWT, ni une tâche réalisée par OpenCode.
