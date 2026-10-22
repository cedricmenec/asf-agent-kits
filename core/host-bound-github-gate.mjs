/**
 * R3d: host-bound composition of R3b's consultative gate and R3c's GET-only
 * adapter. The trusted host MUST own the transport and pinned policy values.
 *
 * This is an input-isolation and consistency boundary, NOT host authentication.
 * Any caller capable of constructing the host binding can forge responses.
 * No result from this module authorizes a model, a write or a release.
 */
import { inspectGithubManualGate } from './github-gates.mjs';
import { createRestrictedGithubGet } from './github-read-adapter.mjs';

export class HostBindingError extends Error {
  constructor(reason) {
    super('R3d BINDING DENIED: ' + reason);
    this.name = 'HostBindingError';
  }
}
const deny = reason => { throw new HostBindingError(reason); };
const HOST_KEYS = Object.freeze([
  'repository', 'branch', 'expectedSha', 'rulesetName', 'checkContexts',
  'checkAppId', 'policyPath', 'expectedPolicyBlobSha',
]);
const REQUEST_KEYS = Object.freeze(['repository', 'branch', 'expectedSha']);
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/** Reject symbols, inherited/unexpected keys, getters and setters. */
function exactDataRecord(input, keys, label) {
  if (!plain(input)) deny('invalid ' + label);
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length ||
      own.some(key => typeof key !== 'string' || !keys.includes(key)))
    deny('unexpected ' + label + ' fields');
  const result = Object.create(null);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(input, key);
    if (!desc || !Object.prototype.hasOwnProperty.call(desc, 'value'))
      deny('accessor or missing ' + label + ' field');
    result[key] = desc.value;
  }
  return result;
}

function immutableContexts(input) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype ||
      input.length < 1 || input.length > 20 ||
      Reflect.ownKeys(input).length !== input.length + 1)
    deny('invalid host check contexts');
  const values = [];
  for (let i = 0; i < input.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(input, String(i));
    if (!desc || !Object.prototype.hasOwnProperty.call(desc, 'value') ||
        typeof desc.value !== 'string')
      deny('invalid host check context element');
    values.push(desc.value);
  }
  return Object.freeze(values);
}

/**
 * Call only in host-owned code. Host policy MUST come from a protected,
 * host-controlled source; transport MUST be injected by that host, never
 * from task JSON. There is no cryptographic host/installation proof here.
 *
 * The returned function accepts an untrusted repository/branch/expectedSha
 * request, compares it to the host's immutable pinned values before I/O,
 * then performs R3b/R3c's consultative reads. It cannot accept new routes,
 * credentials, privileged actions or a different trust configuration.
 */
export function createHostBoundGithubInspector(hostPolicy, transport) {
  const values = exactDataRecord(hostPolicy, HOST_KEYS, 'host policy');
  if (typeof transport !== 'function') deny('missing host transport');
  if (typeof values.repository !== 'string' ||
      typeof values.branch !== 'string' ||
      typeof values.expectedSha !== 'string')
    deny('invalid host repository, branch or SHA');
  const spec = Object.freeze({
    repository: values.repository, branch: values.branch,
    expectedSha: values.expectedSha, rulesetName: values.rulesetName,
    checkContexts: immutableContexts(values.checkContexts),
    checkAppId: values.checkAppId, policyPath: values.policyPath,
    expectedPolicyBlobSha: values.expectedPolicyBlobSha,
  });
  // R3c refuses unexpected paths/options before any network calls. It does
  // not perform authentication of the caller or transport.
  const get = createRestrictedGithubGet({
    repository: spec.repository, branch: spec.branch,
    expectedSha: spec.expectedSha, transport,
  });

  return async function inspectUntrustedRequest(request) {
    const wanted = exactDataRecord(request, REQUEST_KEYS, 'task request');
    for (const key of REQUEST_KEYS)
      if (wanted[key] !== spec[key]) deny('task request disagrees with pinned host ' + key);
    // R3b validates rules/checks/policy SHA and always returns no authority.
    return inspectGithubManualGate(spec, get);
  };
}
