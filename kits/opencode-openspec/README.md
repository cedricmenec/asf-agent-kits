# OpenCode + OpenSpec : kit de développement

Le candidat `opencode-openspec@0.1.0` fournit un workflow GitHub Actions
manuel, ses scripts de sécurité et les consignes OpenSpec. Il reprend les
capacités utiles du workflow ThreadStep **sans ASF V3**.

Son exécution `plan` puis `apply` est [démontrée sur un deuxième dépôt](https://github.com/cedricmenec/asf-agentkit-qualification/pull/4),
avec une PR brouillon et une CI indépendante verte. **Ce n'est pas une
release signée.**

Pour installer le kit dans un dépôt contenant déjà son application et ses
tests, suivre le [guide de démarrage](../../docs/qualification-quickstart.md).
Le chemin recommandé utilise la CLI en local et une PR Git ordinaire,
sans nécessiter de JWT App pour l'installation.

Le kit ne crée pas l'application, sa CI, ses tâches de backlog, la configuration
OpenSpec, les secrets ou les permissions GitHub. Les phases LLM potentiellement
payantes demandent chacune une autorisation spécifique, sans retry automatique.
Les PR de l'agent restent en brouillon et ne sont jamais fusionnées par le kit.
