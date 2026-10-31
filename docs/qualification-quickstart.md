# Installer ASF AgentKit OpenCode + OpenSpec sur un autre dépôt

**Objectif :** équiper un dépôt GitHub contenant déjà une application
testable, puis confier une tâche à OpenCode. Ce kit réutilise le workflow
manuel issu de ThreadStep. Il **n'installe pas ASF V3** et ne crée pas
l'application du développeur.

Cette recette décrit le candidat `opencode-openspec@0.1.0`, épinglé au
commit `3c0932d31234f48c6d8b644d2318e8bcab67bc99`.
Ce n'est pas une release signée.

## 1. Vérifier que le projet est prêt

Pour le premier profil qualifié (Node 22), le dépôt cible possède déjà :

- `package.json`, `package-lock.json` et une commande `npm run check` ;
- une CI GitHub indépendante exposant le check `check` ;
- `openspec/config.yaml` et une tâche, par exemple `backlog/tasks/AQ-009.md` ;
- un premier commit sur `main` et la possibilité de créer une branche/PR.

Le kit ne doit pas créer artificiellement une application ou remplacer
les tests et workflows métier. **Un dépôt réellement vide peut recevoir
les fichiers AgentKit, mais ne peut pas encore exécuter une tâche.**
Le diagnostic `doctor` indique les prérequis locaux manquants.

## 2. Installer localement, puis utiliser une PR Git normale

Le parcours recommandé **ne nécessite aucun JWT GitHub App pour installer** :
on utilise les droits Git habituels du développeur pour publier la PR
d'installation. La voie avancée `install --pr` existe, mais n'est pas
nécessaire pour démarrer.

```bash
git clone https://github.com/cedricmenec/asf-agent-kits.git
git clone https://github.com/OWNER/REPO.git
cd asf-agent-kits
git switch --detach 3c0932d31234f48c6d8b644d2318e8bcab67bc99
cp kits/opencode-openspec/mvp-config.example.json ../agentkit-config.json
```

Modifier uniquement `../agentkit-config.json` pour renseigner le dépôt,
la branche par défaut, le préfixe de tâches, le script de tests et le
groupe de concurrence. Les noms des variables/secrets peuvent conserver
leurs valeurs par défaut. **Ne placer aucun secret dans ce fichier.**

```bash
git -C ../REPO switch -c chore/install-agentkit
BASE_SHA="$(git -C ../REPO rev-parse HEAD)"
ARGS=(--repo OWNER/REPO --checkout ../REPO --kit opencode-openspec \
  --version 0.1.0 --source . \
  --source-commit 3c0932d31234f48c6d8b644d2318e8bcab67bc99 \
  --config ../agentkit-config.json)
python3 bin/asf-agentkit install "${ARGS[@]}" --dry-run
# Lire les chemins et conflits. Si le plan est acceptable :
python3 bin/asf-agentkit install "${ARGS[@]}" --apply --expected-head "$BASE_SHA"
python3 bin/asf-agentkit status --repo OWNER/REPO --checkout ../REPO
python3 bin/asf-agentkit doctor --repo OWNER/REPO --checkout ../REPO \
  --config ../agentkit-config.json
```

Remplacer `OWNER/REPO` et `REPO` par le vrai dépôt et son répertoire.
Le `dry-run` doit être relu avant toute écriture ; `--apply` n'écrit
que des fichiers nouveaux sur une branche ordinaire. `status` doit
indiquer les empreintes conformes. Vérifier aussi `npm run check`
dans le dépôt cible.

Depuis le dépôt cible, committer les fichiers installés, pousser la branche
et ouvrir **une PR brouillon ordinaire** avec GitHub. Attendre sa CI,
la faire relire et fusionner seulement après l'autorisation applicable.
Aucun mécanisme de publication privilégiée n'est requis pour cette étape.

## 3. Configurer l'exécution, puis lancer une tâche

**Seulement après installation et revue**, le propriétaire vérifie :

- le secret `OPENROUTER_API_KEY` du dépôt ;
- une GitHub App autorisée sur ce dépôt pour publier des branches/PR,
  la variable `APP_ID` et le secret `APP_PRIVATE_KEY` ;
- les protections et le check indépendant adaptés au dépôt.

Une même App peut être réutilisée si son installation et ses permissions
sont autorisées : **aucune App supplémentaire par dépôt n'est imposée**.

Ouvrir [AgentKit OpenSpec (manual)](https://github.com/cedricmenec/asf-agentkit-qualification/actions/workflows/asf-agentkit-openspec.yml)
sur le dépôt de qualification, ou le workflow équivalent du dépôt cible,
puis `Run workflow` sur `main` :

- `task_id=AQ-009` (adapter à la tâche existante) ;
- `phase=plan`, puis `apply` après revue ;
- `model=openrouter/deepseek/deepseek-v4.1-flash-1017` ;
- `paid_approval=I_AUTHORIZE_ONE_PAID_PHASE` **uniquement après
  autorisation explicite de cette phase payante**.

Ne pas relancer un job payant automatiquement. Le résultat attendu est
une branche `agent/openspec/...`, une PR brouillon et une CI indépendante
sur le SHA exact. Ni `finalize` ni la fusion ne sont automatiques.

## Preuves et limites du pilote

- [Installation cible PR #2](https://github.com/cedricmenec/asf-agentkit-qualification/pull/2)
  fusionnée avec [CI post-fusion verte](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40431533508).
  La publication avait utilisé le connecteur GitHub, **pas** `install --pr`
  avec un véritable JWT App.
- [Plan réel #40436794279](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40436794279)
  et [apply réel #40437399230](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437399230)
  réussis avec OpenCode + OpenSpec.
- [PR de développement #4](https://github.com/cedricmenec/asf-agentkit-qualification/pull/4)
  en brouillon et [CI indépendante #40437506108](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437506108)
  verte sous Node 22, avec 6 tests, sur
  `78c368a9f4860e583739a960d6890ba52ed0c8e1`.

**Encore à démontrer :** un nouveau développeur suit seul ce parcours
sans assistance, puis la voie avancée `install --pr` si elle apporte
une valeur réelle. `finalize`, fusion et release sont hors de cette
première démonstration. Suivi :
[issue #91](https://github.com/cedricmenec/asf-agent-kits/issues/91).
