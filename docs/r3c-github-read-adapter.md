# R3c — Adaptateur GitHub GET restreint (étape consultative)

**État : code de préqualification non opérationnel.** Le module `core/github-read-adapter.mjs` complète le préflight consultatif R3b, sans fournir de token, de droit d'écriture, de preuve signée de provenance ni de permission d'exécuter un modèle payant.

## Interface

```js
import { createRestrictedGithubGet } from './core/github-read-adapter.mjs';
import { inspectGithubManualGate } from './core/github-gates.mjs';

// `trustedTransport` MUST be supplied by the independently authenticated
// execution host; do not read it, or credentials, from a task or model output.
const get = createRestrictedGithubGet({
  repository: 'owner/repo',
  branch: 'main',
  expectedSha: 'a'.repeat(40), // actual pinned SHA from trusted host
  transport: trustedTransport,
});
const preview = await inspectGithubManualGate(spec, get);
// preview.authorizedToExecute === false ; no promotion or payment permission
```

Le `transport(url, options)` doit être fourni par une autorité **indépendante** qui assure HTTPS/TLS, identité GitHub, origine du token éventuel, et droits de lecture. **Cette librairie ne peut pas authentifier un transport injecté**. Un indicateur tel que `hostAuthenticated=true`, fourni par l'appelant, n'est ni accepté comme argument, ni une preuve cryptographique. Des réponses synthétiques peuvent être forgées ; même lorsque R3b confirme leur cohérence, `trustEvidenceIndependentlyVerified` et `sourceProvenanceVerified` restent `false`.

## Bornes et refus fermés

- Cible HTTPS constante `https://api.github.com` ; dépôt/branche/SHA complets figés à la création, aucun URL ou token arbitrable par une tâche.
- **GET uniquement**, `redirect: manual`, aucune tentative de retry ; chemins autorisés : objet dépôt, branche attendue, liste/détail rulesets, checks au commit attendu, `AGENTS.md` ou `.asf/agentkit.yaml` ancrés sur ce SHA. Tout chemin, encodage, query ou fragment différent est refusé **avant transport**.
- HTTP 200, absence de redirection, URL de réponse identique, type JSON, taille du corps **bornée durant sa lecture en streaming** (2 Mio par défaut), durée maximum 5 s par lecture, annulation sur dépassement. Les erreurs et détails internes du transport ne sont pas propagés, pour limiter les fuites.
- Refus d'une pagination `rel=next`, de listes de rulesets trop grandes, de `total_count` des checks incohérent avec leur nombre reçu, des objets JSON mal formés et de l'absence de corps lisible.
- Ne jamais confondre SHA épinglé et garantie atomique : les deux lectures R3b détectent seulement certains changements de ref ; une écriture future exigerait sa propre condition CAS après autorisation.

## Limites restant à qualifier

1. **Authentification réelle de l'hôte** : aucun binding authentifié à une GitHub App ni vérification des permissions d'installation n'est implémenté. Le `transport` doit venir d'une autorité de confiance vérifiée hors de ce module ; avant cela l'outil reste consultatif.
2. **HTTP mocké** : les tests Node exercent des flux, délais, refus réseau et pagination **sans requête GitHub réelle**. Une réponse JSON correcte n'atteste pas sa provenance.
3. **Signatures/release** : pas de signature, attestation, vérification de tag protégé ou authentification d'artefact. Le projet SEC-02 doit les qualifier séparément.
4. **API GitHub** : les listes et checks dépassant les premières pages sont refusés, pas paginés. Les quotas et erreurs 403/404/429 entraînent un arrêt, sans retry automatique.
5. **Untrusted transport** : la bibliothèque ne peut pas détecter un hôte qui falsifierait `response.url`, l'origine réseau ou les octets, pas plus qu'une API transactionnelle GitHub à partir de doubles lectures.

## Qualification

`node --test tests/github-read-adapter.test.mjs` ; puis `npm run check` et `actionlint` via CI GitHub sur SHA exact. Les essais utilisent des transports et réponses synthétiques : aucun secret, aucune GitHub App, aucun LLM ou workflow payant, aucune modification de rulesets ou tags.

Suivi : [issue R3c #16](https://github.com/cedricmenec/asf-agent-kits/issues/16), [SEC-02 #9](https://github.com/cedricmenec/asf-agent-kits/issues/9).
