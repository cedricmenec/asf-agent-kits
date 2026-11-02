# ASF AgentKit OpenCode + OpenSpec 1.1.0

## Nouveautés

- Le workflow `workflow_dispatch` propose `auto` par défaut et conserve les phases individuelles `plan`, `apply` et `finalize`.
- `auto` exécute plan, apply puis synchronisation/finalisation OpenSpec OPSX dans un même run, avec contrôles entre les phases et arrêt dès le premier échec.
- Le champ de saisie `paid_approval` disparaît. Le lancement reste manuel, réservé au propriétaire sur la branche par défaut et au premier essai, avec sélection d'un modèle autorisé.
- Les contrôles de tâche, modèle, branche, SHA observé et concurrence restent actifs. Le workflow ne relance pas les phases automatiquement et ne fusionne pas les PR.

## Coûts et portée

La phase `auto` peut effectuer jusqu'à trois appels OpenCode payants : plan, apply et synchronisation OPSX. Aucun plafond de dépense n'est appliqué par le kit. Le propriétaire doit choisir explicitement `auto` dans le dispatch GitHub. Pour limiter l'exécution à une phase, choisir `plan`, `apply` ou `finalize`.

La publication se limite à une branche de travail et une PR brouillon. Les secrets, variables, permissions et rulesets de chaque dépôt restent à configurer et à vérifier séparément. Cette release ne lance aucun modèle et ne modifie aucun paramètre GitHub.

## Mise à niveau

Le kit `opencode-openspec` déjà installé en `1.0.0` peut être mis à niveau vers `1.1.0` par une branche et une PR ordinaires. Comparer le diff des fichiers gérés, contrôler le lock et attendre les tests et la CI du dépôt cible avant fusion. Ne pas exécuter le workflow payant pendant l'installation ou la validation.
