# R3d — Liaison consultative aux paramètres de l'hôte

> **Préflight de cohérence, pas une authentification d'hôte.** Cette étape ne déploie rien, n'accorde aucune permission de dépense ou d'écriture et n'atteste aucune provenance de release.

## Objectif

La composition `core/host-bound-github-gate.mjs` relie les deux composants existants :

- **R3b** : `inspectGithubManualGate(spec, get)` examine la cohérence des observations GitHub (règles de branche, checks de CI au SHA attendu et contenu de politique vérifié par Git blob SHA).
- **R3c** : `createRestrictedGithubGet(options)` borne les routes GET, la réponse réseau, la taille de la réponse et les délais, mais n'authentifie pas son transport.
- **R3d** : `createHostBoundGithubInspector(hostPolicy, transport)` copie et fige les valeurs d'hôte, compare la demande non fiable au dépôt, à la branche et au SHA attendus, avant toute I/O, puis délègue aux deux composants précédents.

## Interface

```js
import { createHostBoundGithubInspector } from './core/host-bound-github-gate.mjs';

// Seulement à l'intérieur du code de l'hôte préalablement approuvé.
// Les valeurs et le transport ne doivent JAMAIS provenir d'un agent ou d'une tâche.
const inspect = createHostBoundGithubInspector({
  repository: 'owner/catalogue',
  branch: 'main',
  expectedSha: 'a'.repeat(40), // exemple : vrai SHA reçu de l'hôte dans la pratique
  rulesetName: 'catalogue-protection',
  checkContexts: ['check'],
  checkAppId: 15368,
  policyPath: 'AGENTS.md',
  expectedPolicyBlobSha: 'b'.repeat(40),
}, hostOwnedAuthenticatedTransport);

// La demande ne peut pas remplacer un jeton, une origine ni les règles hôte.
const preview = await inspect({
  repository: 'owner/catalogue',
  branch: 'main',
  expectedSha: 'a'.repeat(40),
});
// Toute sortie reste consultative : preview.authorizedToExecute === false.
```

Les champs admis de la demande sont **uniquement** `repository`, `branch` et `expectedSha`. Les propriétés inattendues, getters/setters, symboles, héritages non attendus, valeurs divergentes ou champs de jeton sont rejetés avant tout accès au transport. Les tableaux de contextes sont copiés de façon défensive puis gelés ; les modifications ultérieures apportées à l'objet original de l'hôte ne changent pas le SHA figé.

## Frontière de sécurité

1. **Identité de l'hôte : non vérifiée ici.** L'appelant qui crée le binding peut toujours injecter un faux `transport`, de faux paramètres et des réponses GitHub fictives. Aucun booléen `hostAuthenticated` ne vaut preuve. Le futur jalon R3e devra définir une identité d'installation et un chemin d'obtention vérifiable du token/de l'attestation par une autorité indépendante.
2. **Transports et permissions : hors de portée de R3d.** L'hôte doit lui-même garantir HTTPS vers l'origine GitHub attendue, l'absence de credential piloté par une tâche et les permissions de lecture requises. Aucun secret ni jeton n'est utilisé dans les tests.
3. **TOCTOU :** l'inspection est consultative et non atomique. La double lecture de branche de R3b détecte certains déplacements, mais n'est ni une preuve CAS ni une permission de mutation.
4. **Release / modèle :** aucune attestation de release ni règle de tag n'est activée. Même lorsque toutes les observations sont cohérentes, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false` et `paidApprovalRequired=true`.

## Tests et validation

`node --test tests/host-bound-github-gate.test.mjs` : fixtures synthétiques, succès consultatif R3b+R3c, rejet de substitution de repo/ref/SHA, politiques mutées, chemins d'identité falsifiés, HTTP 403, mauvais checks, policy blob altéré, ref déplacée, aucun retry ni réseau réel.

La CI GitHub vérifie `npm run check` (Python et Node) et `actionlint` sur le **SHA exact** de la PR. Une CI verte prouve la conformité à ces tests, mais pas l'authenticité du runtime hôte.

## Suite

- [R3d #20](https://github.com/cedricmenec/asf-agent-kits/issues/20) : sous-lot actuel, PR brouillon, sans fusion implicite.
- **R3e** : définir les garanties d'identité/permissions de l'hôte, la révocation, les refus de quotas et les preuves de lecture sur le dépôt protégé. Tout accès privilégié ou secret exige l'autorisation du propriétaire.
- [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9) : tags immuables et preuve de provenance des releases, distincts de R3d.
