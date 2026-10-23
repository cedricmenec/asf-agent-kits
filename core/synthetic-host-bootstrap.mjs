/**
 * R3e-02: synthetic host identity/permission preflight with R3d composition.
 * The embedding test host supplies both observations and transport. Neither
 * this module nor mocked observations authenticate a real GitHub installation.
 * NO secrets, privileged calls, execution grants, writes or paid provider calls.
 */
import { createHostBoundGithubInspector } from './host-bound-github-gate.mjs';

export class SyntheticHostError extends Error {
  constructor(code) { super('R3e-02 DENIED: ' + code); this.name = 'SyntheticHostError'; }
}
const deny = code => { throw new SyntheticHostError(code); };
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;
const HOST_KEYS = ['repository', 'branch', 'expectedSha', 'rulesetName', 'checkContexts',
  'checkAppId', 'policyPath', 'expectedPolicyBlobSha'];
const ID_KEYS = ['appId', 'installationId', 'repositoryId', 'permissions'];
const TASK_KEYS = ['repository', 'branch', 'expectedSha'];
const OBS_KEYS = ['appId', 'installationId', 'repositoryId', 'repository',
  'permissions', 'issuedAtSeconds', 'expiresAtSeconds'];
const SERVICE_KEYS = ['observeInstallation', 'transport', 'nowSeconds'];
const PERMISSIONS = new Set(['metadata', 'contents', 'checks', 'administration']);
const isPlain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

/** Reject inherited, accessor, symbol, missing and unknown keys, without reading getters. */
function exact(obj, keys, label) {
  if (!isPlain(obj)) deny('invalid ' + label);
  if (Reflect.ownKeys(obj).length !== keys.length) deny('unexpected ' + label + ' fields');
  const out = Object.create(null);
  for (const key of keys) {
    const p = Object.getOwnPropertyDescriptor(obj, key);
    if (!p || !Object.hasOwn(p, 'value')) deny('missing or accessor ' + label + ' field');
    out[key] = p.value;
  }
  return out;
}
const positive = n => Number.isSafeInteger(n) && n > 0;

/** Only explicitly named read permissions; exact scope comparison, no writes. */
function readPermissions(input) {
  if (!isPlain(input)) deny('invalid read permission map');
  const names = Reflect.ownKeys(input);
  if (names.length < 3 || names.length > 4 ||
      names.some(key => typeof key !== 'string' || !PERMISSIONS.has(key)) ||
      !['metadata', 'contents', 'checks'].every(x => names.includes(x)))
    deny('missing or unexpected permission names');
  const out = Object.create(null);
  for (const name of names) {
    const p = Object.getOwnPropertyDescriptor(input, name);
    if (!p || !Object.hasOwn(p, 'value') || p.value !== 'read')
      deny('permission missing, privileged or ambiguous');
    out[name] = 'read';
  }
  return Object.freeze(out);
}

function snapshot(config) {
  const root = exact(config, ['hostPolicy', 'installation'], 'host config');
  const host = exact(root.hostPolicy, HOST_KEYS, 'host policy');
  const id = exact(root.installation, ID_KEYS, 'installation anchor');
  if (!REPO.test(host.repository) || host.repository.includes('..') ||
      !SHA.test(host.expectedSha) || !SHA.test(host.expectedPolicyBlobSha) ||
      !positive(id.appId) || !positive(id.installationId) || !positive(id.repositoryId) ||
      !positive(host.checkAppId)) deny('invalid pinned host identity');
  const ctx = host.checkContexts;
  if (!Array.isArray(ctx) || Object.getPrototypeOf(ctx) !== Array.prototype ||
      ctx.length < 1 || ctx.length > 20 ||
      Reflect.ownKeys(ctx).length !== ctx.length + 1) deny('invalid check contexts');
  const contexts = [];
  for (let i = 0; i < ctx.length; i++) {
    const p = Object.getOwnPropertyDescriptor(ctx, String(i));
    if (!p || !Object.hasOwn(p, 'value') || typeof p.value !== 'string')
      deny('invalid check context');
    contexts.push(p.value);
  }
  const policy = Object.freeze({...host, checkContexts: Object.freeze(contexts)});
  return Object.freeze({hostPolicy: policy, installation: Object.freeze({
    appId: id.appId, installationId: id.installationId, repositoryId: id.repositoryId,
    permissions: readPermissions(id.permissions),
  })});
}

function validateObservation(raw, pinned, repo, now) {
  const found = exact(raw, OBS_KEYS, 'installation observation');
  if (found.repository !== repo || found.appId !== pinned.appId ||
      found.installationId !== pinned.installationId ||
      found.repositoryId !== pinned.repositoryId) deny('unexpected installation or repository identity');
  const perms = readPermissions(found.permissions);
  const wanted = Object.keys(pinned.permissions).sort();
  if (JSON.stringify(Object.keys(perms).sort()) !== JSON.stringify(wanted))
    deny('observed permissions differ from host policy');
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(found.issuedAtSeconds) ||
      !Number.isSafeInteger(found.expiresAtSeconds) ||
      found.issuedAtSeconds > now || found.expiresAtSeconds <= now ||
      found.expiresAtSeconds <= found.issuedAtSeconds ||
      found.expiresAtSeconds - now > 3600) deny('invalid, stale or excessive identity lifetime');
  return found.expiresAtSeconds;
}

/**
 * All arguments are host-only: never call with agent/task-provided config or adapters.
 * 'observeInstallation' MUST eventually be backed by independent authentication
 * outside the LLM process (R3e-03), not by an untrusted JSON or boolean.
 * Synthetic tests explicitly inject mocks. Success is only simulated coherence.
 */
export function createSyntheticHostBootstrap(config, services) {
  const pinned = snapshot(config);
  const svc = exact(services, SERVICE_KEYS, 'host services');
  if (typeof svc.observeInstallation !== 'function' || typeof svc.transport !== 'function' ||
      typeof svc.nowSeconds !== 'function') deny('missing test host capabilities');
  const inspect = createHostBoundGithubInspector(pinned.hostPolicy, svc.transport);
  let active = false;
  return async function inspectTask(request) {
    const task = exact(request, TASK_KEYS, 'task request');
    for (const field of TASK_KEYS)
      if (task[field] !== pinned.hostPolicy[field]) deny('task target differs from pinned host');
    if (active) deny('concurrent synthetic read inspection');
    active = true;
    try {
      const before = svc.nowSeconds();
      const observation = await svc.observeInstallation();
      const expiry = validateObservation(observation, pinned.installation,
        pinned.hostPolicy.repository, before);
      // Existing R3b/R3c/R3d checks, but not authentication of the transport.
      const result = await inspect(task);
      const after = svc.nowSeconds();
      if (!Number.isSafeInteger(after) || after < before || after >= expiry)
        deny('identity expired or clock became invalid during preflight');
      // Never spread arbitrary data, token fields, or a claimed grant into output.
      return Object.freeze({
        kind: 'r3e02-synthetic-host-preview', repository: result.repository,
        observedSha: result.observedSha, apiObservationsConsistent: result.apiObservationsConsistent,
        syntheticInstallationMatched: true, independentlyAuthenticatedHost: false,
        trustEvidenceIndependentlyVerified: false, sourceProvenanceVerified: false,
        authorizedToExecute: false, promotionAllowed: false, writesPerformed: false,
        paidApprovalRequired: true,
      });
    } catch (error) {
      if (error instanceof SyntheticHostError) throw error;
      // Never leak upstream response bodies or possible credentials into errors.
      deny('host identity or GET preflight failed closed');
    } finally { active = false; }
  };
}
