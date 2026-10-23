/**
 * R3h-01: tie manual R3a preflight to R3f OpenSpec mock checkpoints.
 *
 * This is a PURE consultative adapter, not a runtime or paid-run permit.
 * The caller can forge its evidence, SHA, CI and mutex observations.
 */
import { evaluateManualRequest } from './manual-policy.mjs';
import { previewOpenSpecTransition } from './openspec-offline-phases.mjs';

export class ManualPhaseHandoffError extends Error {
  constructor() {
    super('R3h-01 DENY: untrusted or inconsistent manual phase handoff');
    this.name = 'ManualPhaseHandoffError';
  }
}
const deny = () => { throw new ManualPhaseHandoffError(); };
const plain = x => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
function exact(input, keys) {
  if (!plain(input) || Reflect.ownKeys(input).length !== keys.length) deny();
  const out = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) deny();
    out[key] = descriptor.value;
  }
  return out;
}
// Inspect the ENTIRE input before calling legacy validators, preventing getters,
// symbols, prototype confusion, functions and cyclic structures from escaping.
function verifyPlainTree(root) {
  const seen = new Set();
  let count = 0;
  function inspect(node, depth) {
    if (++count > 2000 || depth > 14) deny();
    if (node === null || typeof node === 'boolean') return;
    if (typeof node === 'string') { if (node.length > 65536) deny(); return; }
    if (typeof node === 'number') { if (!Number.isSafeInteger(node)) deny(); return; }
    if (typeof node !== 'object' || seen.has(node)) deny();
    if (!plain(node) && !(Array.isArray(node) &&
      Object.getPrototypeOf(node) === Array.prototype)) deny();
    seen.add(node);
    const keys = Reflect.ownKeys(node);
    if (keys.length > 500) deny();
    if (Array.isArray(node)) {
      if (keys.length !== node.length + 1 || node.length > 250) deny();
      for (let i = 0; i < node.length; i++) {
        const p = Object.getOwnPropertyDescriptor(node, String(i));
        if (!p || !Object.hasOwn(p, 'value')) deny();
        inspect(p.value, depth + 1);
      }
    } else {
      for (const key of keys) {
        if (typeof key !== 'string' || ['__proto__','constructor','prototype'].includes(key)) deny();
        const p = Object.getOwnPropertyDescriptor(node, key);
        if (!p || !Object.hasOwn(p, 'value')) deny();
        inspect(p.value, depth + 1);
      }
    }
    seen.delete(node);
  }
  inspect(root, 0);
}
const samePaths = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((x, i) => x === right[i]);
};

/** Create a mock handoff, NEVER a runnable or authenticated execution plan. */
export function previewManualPhaseHandoff(input) {
  try {
    verifyPlainTree(input);
    const data = exact(input, ['config','request','evidence','phasePolicy',
      'previousCheckpoint','event','syntheticSlot']);
    const slot = exact(data.syntheticSlot,
      ['group','activePaidJobs','runAttempt','openFinalPullRequests']);
    if (slot.activePaidJobs !== 0 || slot.runAttempt !== 1 ||
        slot.openFinalPullRequests !== 0) deny();
    const manual = evaluateManualRequest(data.config, data.request, data.evidence);
    if (slot.group !== manual.paidConcurrencyGroup ||
        manual.profile !== 'opencode-openspec') deny();

    // Phase identity/branch/source paths must agree with R3a's host policy.
    const phase = exact(data.phasePolicy,
      ['repository','taskId','branch','baseSha','allowedProductPrefixes']);
    if (phase.repository !== data.request.repository ||
        phase.taskId !== manual.taskId ||
        phase.branch !== manual.branch ||
        !samePaths(phase.allowedProductPrefixes, data.config.paths.allowedProductPrefixes))
      deny();
    const e = exact(data.event, ['phase','expectedHeadSha','observedHeadSha',
      'nextHeadSha','intermediatePlanSha','changedPaths','checklist','verifications']);
    if (e.phase !== manual.phase ||
        e.expectedHeadSha !== data.request.expectedHeadSha ||
        e.observedHeadSha !== data.request.observedHeadSha ||
        !samePaths(e.changedPaths, data.request.changedPaths)) deny();
    if (e.phase === 'plan' || e.phase === 'auto') {
      if (data.previousCheckpoint !== null ||
          phase.baseSha !== e.expectedHeadSha) deny();
    } else if (!plain(data.previousCheckpoint)) deny();
    const transition = previewOpenSpecTransition(
      data.phasePolicy, data.previousCheckpoint, data.event);
    return Object.freeze({
      kind: 'r3h01-manual-phase-handoff-preview',
      taskId: manual.taskId,
      phase: manual.phase,
      branch: manual.branch,
      targetBranch: manual.targetBranch,
      observedSyntheticHeadSha: e.expectedHeadSha,
      proposedSyntheticNextSha: transition.checkpoint.headSha,
      checkpointSequence: transition.checkpoint.sequence,
      nextCheckpointStage: transition.to,
      paidConcurrencyGroup: manual.paidConcurrencyGroup,
      mockPhaseChecksMatched: true,
      paidExecutionStarted: false,
      syntheticSlotOnly: true,
      independentlyAuthenticatedHost: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    });
  } catch {
    // Never propagate values such as tokens, model IDs or an upstream stack.
    deny();
  }
}
