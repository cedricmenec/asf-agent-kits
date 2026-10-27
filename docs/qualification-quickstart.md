# ASF AgentKit OpenCode + OpenSpec : démarrage de qualification

Cette recette décrit le **candidat de développement** `opencode-openspec@0.1.0`,
épinglé au commit `3c0932d31234f48c6d8b644d2318e8bcab67bc99`.
Ce n'est **pas une release signée**. Le pilote OpenCode + OpenSpec a réussi
les phases `plan` et `apply` : [PR #4](https://github.com/cedricmenec/asf-agentkit-qualification/pull/4)
brouillon et [CI indépendante](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437506108)
verte sur le SHA `78c368a9f4860e583739a960d6890ba52ed0c8e1`.
La publication CLI `install --pr` avec JWT réel, la phase `finalize`
et la fusion restent non qualifiées. Suivi :
[issue #91](https://github.com/cedricmenec/asf-agent-kits/issues/91).

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
a été **fusionnée avec autorisation explicite** au commit
`0abc166db3035486e84acc3f0412e7cb03424508`, et sa
[CI post-fusion](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40431533508)
est verte. **Ne pas créer une PR en doublon.** La publication initiale a
utilisé le connecteur GitHub : `install --pr` avec vraie App/JWT reste à prouver.

## 5. Première tâche OpenCode + OpenSpec, après autorisations

Le workflow du kit est présent sur `main`. Après configuration de
l'App, des secrets et du ruleset par le propriétaire, ouvrir
[AgentKit OpenSpec (manual)](https://github.com/cedricmenec/asf-agentkit-qualification/actions/workflows/asf-agentkit-openspec.yml)
dans GitHub Actions et sélectionner **Run workflow**, branche `main`.
Pour ce pilote, les champs sont :

- `task_id` : `AQ-009` ;
- `phase` : `plan` (puis `apply` après revue, `finalize` seulement après nouvel accord) ;
- `model` : `openrouter/deepseek/deepseek-v4.1-flash-1017` ;
- `paid_approval` : `I_AUTHORIZE_ONE_PAID_PHASE`, uniquement pour la phase
  dont la dépense a été explicitement autorisée.

**Un dispatch par phase, aucun retry payant automatique.** Ne jamais
utiliser « Re-run jobs » sans nouvel accord. Vérifier le statut et la CI
sur le SHA exact, puis conserver la PR en brouillon jusqu'à la revue.

**Preuve obtenue le 27 octobre 2026 :**
[plan #40436794279](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40436794279)
et [apply #40437399230](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437399230)
réussis avec DeepSeek V4.1 Flash 1017. La GitHub App a publié la
[branche et PR #4](https://github.com/cedricmenec/asf-agentkit-qualification/pull/4)
brouillon. La [CI indépendante #40437506108](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437506108)
est verte sous Node 22, avec **6 tests réussis** et bundle esbuild valide,
sur `78c368a9f4860e583739a960d6890ba52ed0c8e1`.

Cette preuve couvre la tâche de développement réelle, **pas**
la publication CLI `install --pr` via JWT réel, ni `finalize`,
ni la fusion. Ces étapes conservent leurs gates distincts.
