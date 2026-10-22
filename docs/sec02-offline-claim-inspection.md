# SEC-02a — Inspection hors ligne de déclarations de release non fiables

**Statut : préfiltre syntaxique uniquement**, sans preuve de provenance, transport GitHub, signature, attestation, écriture de tag ou autorisation de dépenses.

Le schéma fermé `schemas/release-claim.schema.json` définit la *déclaration* de source, de version, de cible supposée de tag, d'empreinte de manifeste et des artefacts. Le nom `claimedTagTargetCommitSha` indique que l'information est une allégation non authentifiée.

La commande `python3 tools/check_release_claim.py ./claim.json` produit une sortie JSON déterministe et un code 0 uniquement en cas de cohérence interne ; sinon elle quitte avec 3. Le fichier d'entrée est borné à 1 MiB, les doublons de clés JSON sont refusés, ainsi que les chemins de traversal, les collisions de chemins et des secrets évidents. Aucun artefact pointé n'est lu, aucune commande n'est lancée, aucun accès GitHub n'est effectué.

Même pour une déclaration cohérente, les champs suivants valent inconditionnellement : `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `promotionAllowed=false`, `authorizedToExecute=false`, `writesPerformed=false`, `paidApprovalRequired=true`. `claimInternallyConsistent=true` **n'est jamais une preuve** de provenance.

**Limites** : cela ne vérifie ni octets réels d'artefact, ni tags protégés, ni signatures, ni identité GitHub ; la lecture d'un fichier JSON n'est pas un contrôle CAS atomique. Un runtime OpenCode ou une publication nécessite une autorisation ultérieure et une preuve indépendante. Les symlinks d'un éventuel ancêtre de l'entrée et les courses sur fichiers sont à revoir avant d'accepter des chemins non fiables comme sources de preuves.

Suivi : [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9), [R3c #16](https://github.com/cedricmenec/asf-agent-kits/issues/16). Aucun ruleset, secret, tag, release ni workflow payant n'est installé par ce lot.
