/**
 * R3f-04: end-to-end MOCK composition of R3f-01/02/03.
 * Pure function, no I/O or model provider. Synthetic inputs are NOT
 * authenticated GitHub evidence and NEVER authorize execution or payment.
 */
import { previewOpenSpecTransition } from './openspec-offline-phases.mjs';
import { previewOfflineResume } from './openspec-offline-resume.mjs';
import { previewOfflineOpsxSync, previewOfflineOpsxArchive } from './opsx-offline-guard.mjs';
export class OfflineHarnessError extends Error {
  constructor(reason) { super('R3f-04 DENY: '+reason);this.name='OfflineHarnessError'; }
}
const deny=x=>{throw new OfflineHarnessError(x);};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function exact(input,keys,label) {
  if(!plain(input)||Reflect.ownKeys(input).length!==keys.length)deny('invalid '+label);
  const out=Object.create(null);
  for(const key of keys){
    const p=Object.getOwnPropertyDescriptor(input,key);
    if(!p||!Object.hasOwn(p,'value'))deny('missing/accessor '+label);
    out[key]=p.value;
  }
  return out;
}
/**
 * Composes validated mock modules without swallowing failures. A success
 * only proves internal fixture consistency; NEVER enables a real operation.
 */
export function previewIntegratedOpenSpecCycle(input) {
  const data=exact(input,['hostPolicy','phaseInputs','remoteObservations',
    'independentCheckAppId','syncPolicy','syncSnapshots','archiveDate'],'cycle');
  const phases=exact(data.phaseInputs,['plan','apply','finalize'],'phases');
  const remote=exact(data.remoteObservations,['plan','apply'],'remote mock observations');
  const snapshots=exact(data.syncSnapshots,['before','after','archived'],'file inventories');
  const syncPolicy=exact(data.syncPolicy,['taskId','headSha','canonicalPaths'],'sync policy');
  // Checks do not attest the host; they merely prevent incoherent mocks.
  try {
    const plan=previewOpenSpecTransition(data.hostPolicy,null,phases.plan);
    const inspectedPlan=previewOfflineResume(data.hostPolicy,[plan.checkpoint],
      remote.plan,data.independentCheckAppId);
    if(inspectedPlan.suggestedManualPhase!=='apply')deny('plan did not require apply');
    const apply=previewOpenSpecTransition(data.hostPolicy,plan.checkpoint,phases.apply);
    const inspectedApply=previewOfflineResume(data.hostPolicy,
      [plan.checkpoint,apply.checkpoint],remote.apply,data.independentCheckAppId);
    if(inspectedApply.suggestedManualPhase!=='finalize')deny('code checkpoint not suitable for finalize');
    if(syncPolicy.taskId!==plan.checkpoint.taskId||
      syncPolicy.headSha!==apply.checkpoint.headSha)deny('sync policy is not bound to implementation head');
    const sync=previewOfflineOpsxSync(data.syncPolicy,snapshots.before,snapshots.after);
    const archived=previewOfflineOpsxArchive(data.syncPolicy,sync,
      snapshots.after,snapshots.archived,data.archiveDate);
    const finalChanged=phases.finalize?.changedPaths;
    if(!Array.isArray(finalChanged)||
      !sync.changedCanonicalPaths.every(path=>finalChanged.includes(path))||
      !finalChanged.some(path=>typeof path==='string'&&path.startsWith(archived.archiveDirectory)))
      deny('finalize delta disagrees with reviewed sync/archive');
    const finalize=previewOpenSpecTransition(data.hostPolicy,apply.checkpoint,phases.finalize);
    if(finalize.to!=='complete')deny('unexpected offline final state');
    return Object.freeze({
      kind:'r3f04-integrated-mock-cycle',taskId:plan.checkpoint.taskId,
      branch:plan.checkpoint.branch,finalMockHeadSha:finalize.checkpoint.headSha,
      simulatedPhases:Object.freeze(['plan','apply','sync-preview','archive-preview','finalize']),
      checkpointSequence:finalize.checkpoint.sequence,
      canonicalFilesReviewed:sync.changedCanonicalPaths.length,
      archivedFilesReviewed:archived.archivedFiles,
      simulatedOnly:true,remoteEvidenceIndependentlyAuthenticated:false,
      semanticRequirementsIndependentlyVerified:false,
      opsxCommandInvoked:false,authorizedToExecute:false,
      trustEvidenceIndependentlyVerified:false,sourceProvenanceVerified:false,
      promotionAllowed:false,writesPerformed:false,paidApprovalRequired:true,
    });
  } catch(error) {
    if(error instanceof OfflineHarnessError)throw error;
    // Hostile fixture details and any future secrets never leave this boundary.
    deny('offline integration gate failed closed');
  }
}
