/**
 * R3h-02: deterministic, serializable checkpoint JOURNAL CONTRACT.
 * No disk/network/GitHub/model I/O. Hashes are unkeyed and NOT attestations.
 * A caller can forge every supplied observation: NEVER grant resume or payment.
 */
import { createHash } from 'node:crypto';
import { previewOpenSpecTransition } from './openspec-offline-phases.mjs';

export class CheckpointJournalError extends Error {
  constructor() {
    super('R3h-02 DENY: invalid, stale or untrusted checkpoint journal');
    this.name = 'CheckpointJournalError';
  }
}
const deny = () => { throw new CheckpointJournalError(); };
const SHA = /^[0-9a-f]{40}$/;
const HEX = /^[0-9a-f]{64}$/;
const K = ['kind','version','repository','taskId','branch','policyDigest',
  'planCheckpointDigest','phase','sequence','parentSha','headSha',
  'event','checkpoint','previousDigest','digest'];
const OBS = ['repository','branch','headSha','parentSha','journalDigest',
  'mutexGroup','activePaidJobs','runAttempt','openFinalPullRequests'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = x => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype ||
  Object.getPrototypeOf(x) === null);
function exact(x, keys) {
  if (!plain(x) || Reflect.ownKeys(x).length !== keys.length) deny();
  const result = Object.create(null);
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(x, k);
    if (!d || !Object.hasOwn(d, 'value')) deny();
    result[k] = d.value;
  }
  return result;
}
// Inspects own data descriptors BEFORE any spread/JSON.stringify/legacy validator.
// Rejects accessors, symbols, cycles, sparse arrays and non-JSON values.
function inspectTree(root) {
  const visiting = new Set();
  let count = 0;
  function visit(x, depth) {
    if (++count > 5000 || depth > 20) deny();
    if (x === null || typeof x === 'boolean') return;
    if (typeof x === 'string') { if (x.length > 65536) deny(); return; }
    if (typeof x === 'number') { if (!Number.isSafeInteger(x)) deny(); return; }
    if (typeof x !== 'object' || visiting.has(x)) deny();
    if (!(plain(x) || (Array.isArray(x) &&
      Object.getPrototypeOf(x) === Array.prototype))) deny();
    visiting.add(x);
    const keys = Reflect.ownKeys(x);
    if (keys.length > 500) deny();
    if (Array.isArray(x)) {
      if (keys.length !== x.length + 1 || x.length > 250) deny();
      for (let i = 0; i < x.length; i++) {
        const d = Object.getOwnPropertyDescriptor(x, String(i));
        if (!d || !Object.hasOwn(d, 'value')) deny();
        visit(d.value, depth+1);
      }
    } else {
      for (const key of keys) {
        if (typeof key !== 'string' ||
          ['__proto__','prototype','constructor'].includes(key)) deny();
        const d = Object.getOwnPropertyDescriptor(x, key);
        if (!d || !Object.hasOwn(d, 'value')) deny();
        visit(d.value, depth+1);
      }
    }
    visiting.delete(x);
  }
  visit(root, 0);
}
function cloneAndFreeze(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return Object.freeze(x.map(cloneAndFreeze));
  const out = Object.create(null);
  for (const key of Object.keys(x)) out[key] = cloneAndFreeze(x[key]);
  return Object.freeze(out);
}
function policyFingerprint(policy) {
  return digest(['r3h02-policy-v1', policy.repository, policy.taskId,
    policy.branch, policy.baseSha, policy.allowedProductPrefixes]);
}
function fields(x) {
  return K.slice(0,-1).map(k => x[k]);
}
function expectedEntry(policy, prior, event, transition) {
  const phase = event.phase;
  const first = prior[0];
  const previous = prior.at(-1) ?? null;
  const entry = {
    kind:'r3h02-synthetic-checkpoint-journal',
    version:1, repository:policy.repository, taskId:policy.taskId,
    branch:policy.branch, policyDigest:policyFingerprint(policy),
    planCheckpointDigest:first?.planCheckpointDigest ?? transition.checkpoint.digest,
    phase,sequence:transition.checkpoint.sequence,
    parentSha:event.expectedHeadSha,headSha:transition.checkpoint.headSha,
    event:cloneAndFreeze(event),checkpoint:cloneAndFreeze(transition.checkpoint),
    previousDigest:previous?.digest ?? null,
  };
  entry.digest = digest(fields(entry));
  return cloneAndFreeze(entry);
}
function rebuild(policy, entries, allowEmpty) {
  if (!Array.isArray(entries) || Object.getPrototypeOf(entries) !== Array.prototype ||
    Reflect.ownKeys(entries).length !== entries.length + 1 ||
    entries.length > 3 || (!allowEmpty && entries.length === 0)) deny();
  const list = [];
  for (let idx=0; idx<entries.length; idx++) {
    const supplied = exact(entries[idx], K);
    const phase = ['plan','apply','finalize'][idx];
    if (supplied.phase !== phase) deny(); // no auto, replay, skip or rollback
    const previous = list.at(-1);
    const transition = previewOpenSpecTransition(
      policy, previous?.checkpoint ?? null, supplied.event);
    if (transition.phase !== phase || transition.checkpoint.sequence !== idx+1) deny();
    const wanted = expectedEntry(policy, list, supplied.event, transition);
    if (!HEX.test(supplied.digest) ||
      JSON.stringify(K.map(k => supplied[k])) !== JSON.stringify(K.map(k => wanted[k])))
      deny();
    list.push(wanted);
  }
  return list;
}
/** Create only a NEW in-memory entry. Caller must persist it independently later. */
export function previewCheckpointJournalAppend(policy, previousEntries, event) {
  try {
    inspectTree({policy, previousEntries, event});
    const chain = rebuild(policy, previousEntries, true);
    if (chain.length >= 3 || event?.phase !== ['plan','apply','finalize'][chain.length])
      deny();
    const transition = previewOpenSpecTransition(
      policy, chain.at(-1)?.checkpoint ?? null, event);
    const appended = expectedEntry(policy, chain, event, transition);
    return Object.freeze({
      kind:'r3h02-checkpoint-append-preview', entry:appended,
      appendToExistingSequence:chain.length, resultingSequence:chain.length+1,
      checkpointBytesDurablyStored:false, hostEvidenceIndependentlyAuthenticated:false,
      resumeAuthorized:false, authorizedToExecute:false, writesPerformed:false,
      sourceProvenanceVerified:false, trustEvidenceIndependentlyVerified:false,
      promotionAllowed:false, paidApprovalRequired:true,
    });
  } catch { deny(); }
}
/**
 * Inspect an in-memory or JSON-roundtripped journal and synthetic host snapshot.
 * Matching data yields only a suggested MANUAL next phase, not a resume permit.
 */
export function previewCheckpointJournalRecovery(policy, entries, observed, expectedMutexGroup) {
  try {
    inspectTree({policy, entries, observed, expectedMutexGroup});
    const chain = rebuild(policy, entries, false);
    if (chain.length >= 3) deny(); // finalized; no paid phase may resume
    const snapshot = exact(observed, OBS);
    const last = chain.at(-1);
    if (typeof expectedMutexGroup !== 'string' || !expectedMutexGroup ||
      expectedMutexGroup.length > 160 ||
      snapshot.mutexGroup !== expectedMutexGroup ||
      snapshot.repository !== policy.repository ||
      snapshot.branch !== policy.branch ||
      snapshot.headSha !== last.headSha ||
      snapshot.parentSha !== last.parentSha ||
      snapshot.journalDigest !== last.digest ||
      !SHA.test(snapshot.headSha) || !SHA.test(snapshot.parentSha) ||
      snapshot.activePaidJobs !== 0 || snapshot.runAttempt !== 1 ||
      snapshot.openFinalPullRequests !== 0) deny();
    return Object.freeze({
      kind:'r3h02-checkpoint-recovery-preview',
      taskId:last.taskId, branch:last.branch, journalDigest:last.digest,
      syntheticHeadSha:last.headSha, inspectedEntries:chain.length,
      suggestedNextManualPhase:chain.length===1?'apply':'finalize',
      checkpointBytesDurablyStored:false, hostEvidenceIndependentlyAuthenticated:false,
      mutexIndependentlyVerified:false, resumeAuthorized:false,
      authorizedToExecute:false, writesPerformed:false,
      sourceProvenanceVerified:false, trustEvidenceIndependentlyVerified:false,
      promotionAllowed:false, paidApprovalRequired:true,
    });
  } catch { deny(); }
}
