# R3g-03 : inventaire fd-relative Linux en lecture seule

Cette variante de qualification, **non opérationnelle**, inspecte uniquement des fixtures locales jetables choisies par le banc de test hôte. Elle réduit les risques de suivi de liens symboliques par substitution d'un chemin intermédiaire ou d'une feuille.

## Contrat technique

`tools/inventory_fdrelative.py` expose `inventory_fdrelative(root, head_sha, expected_paths)`. Python/POSIX ouvre d'abord la racine hôte avec `O_DIRECTORY|O_NOFOLLOW`, compare ses identifiants `lstat/fstat`, puis parcourt chaque composant par `os.open(..., dir_fd=...)` et `O_NOFOLLOW`. Les fichiers sont ouverts avec `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, validés avec `fstat`, bornés à 1 Mio, lus par des descripteurs et résumés en SHA-256. L'énumération complète par fd refuse les entrées imprévues. Liens symboliques, hardlinks, exécutables, alias de casse, séquences non NFC, répertoires traversants et fichiers non réguliers sont refusés. Aucun fallback vers une ouverture par pathname.

L'API retourne seulement `{headSha, files}` compatible avec le garde mock `previewOfflineOpsxSync` de R3f. Le SHA reste **une chaîne déclarée** ; aucun commit ou tag Git n'est interrogé ni authentifié. L'inventaire n'octroie aucun droit et ne déclenche aucune écriture, commande Git/OPSX, accès réseau, modèle ou coût.

## Validations

`python3 -m unittest discover -s tests -p 'test_*.py'`. Treize nouveaux tests utilisent des `TemporaryDirectory`, dont deux substitutions de symlink au moment exact d'un `os.open` simulé avec `unittest.mock.patch`, absence de suivi de liens, liens durs, modes exécutables, fichiers inattendus, chemins dangereux et déterminisme. Les fixtures ne modifient aucun dépôt réel.

## Ce que ce jalon ne prouve pas

Cette bibliothèque cible Linux/CI POSIX ; il n'y a pas d'implémentation portable Windows et l'absence des primitives requises doit provoquer un refus. La confiance initiale accordée à la racine fournie par l'hôte, les mutations concurrentes entre deux fichiers (pas de snapshot global atomique), la provenance d'un HEAD Git réel, les permissions d'une GitHub App, l'attestation d'une release et une autorisation de payer restent **hors périmètre**.

Un futur installateur R5 devra utiliser un writer transactionnel séparé, politique protégée, provenance validée et contrôles PR/CI indépendants. Cette variante read-only ne le remplace pas.
