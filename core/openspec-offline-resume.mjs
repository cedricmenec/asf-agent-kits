/**
 * R3f-02: read-only synthetic resume diagnostics from Git checkpoint snapshots.
 * The caller supplies all observations; matching mock fields NEVER authenticate
 * GitHub, authorize a paid retry, or constitute a CAS/reference update.
 */
import { inspectOfflineCheckpoint, OfflinePhaseError } from './openspec-offline-phases.mjs';
export class OfflineResumeError extends Error {
  constructor(reason) { super('R3f-02 DENY: '+reason); this.name='OfflineResumeError'; }
}
const deny = why => { throw new OfflineResumeError(why); };
const SHA=/^[a-f0-9]{40}$/;
const plain = value => value!==null && typeof value==='object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const OBS=['repository','branch','headSha','parentSha','subject','refExists',
  'observedAtSeconds','nowSeconds','activeWorkflowRuns','openFinalPullRequests','check'];
const CHECK=['name','headSha','appId','status','conclusion'];
function exact(o,keys,label) {
  if(!plain(o)||Reflect.ownKeys(o).length!==keys.length)deny('invalid '+label);
  const result=Object.create(null);
  for(const k of keys) {
    const p=Object.getOwnPropertyDescriptor(o,k);
    if(!p||!Object.hasOwn(p,'value'))deny('missing or accessor '+label);
    result[k]=p.value;
  }
  return result;
}
function snapshots(policy,raw) {
  if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||
     ![1,2].includes(raw.length)||Reflect.ownKeys(raw).length!==raw.length+1)
    deny('expected one plan checkpoint or plan+implementation chain');
  const list=[];
  for(let index=0;index<raw.length;index++) {
    const p=Object.getOwnPropertyDescriptor(raw,String(index));
    if(!p||!Object.hasOwn(p,'value'))deny('accessor checkpoint');
    let checked;
    try{checked=inspectOfflineCheckpoint(policy,p.value);}
    catch(e){if(e instanceof OfflinePhaseError)deny('checkpoint digest or identity invalid');throw e;}
    list.push(checked);
  }
  if(list[0].stage!=='planned'||list[0].sequence!==1||
    list[0].previousDigest!==null||list[0].headSha===policy.baseSha)
    deny('missing distinct plan checkpoint');
  if(list.length===2 && (list[1].stage!=='implemented'||list[1].sequence!==2||
    list[1].previousDigest!==list[0].digest||list[1].headSha===list[0].headSha))
    deny('implementation did not descend from plan digest');
  return list;
}
/**
 * requiredCheckAppId is a host-controlled expectation, not a task field.
 * Even a positive result is just a suggested manual phase with NO authority.
 */
export function previewOfflineResume(hostPolicy, chain, observation, requiredCheckAppId) {
  const list=snapshots(hostPolicy,chain);
  if(!Number.isSafeInteger(requiredCheckAppId)||requiredCheckAppId<1)
    deny('invalid expected independent CI app');
  const observed=exact(observation,OBS,'remote observation');
  const check=exact(observed.check,CHECK,'check run observation');
  const newest=list.at(-1),previous=list.length===2?list[0]:null;
  const parent=previous?.headSha??hostPolicy.baseSha;
  const expectedSubject=list.length===1?
    'agent('+newest.taskId+'): validated OpenSpec plan checkpoint':
    'agent('+newest.taskId+'): verified implementation checkpoint';
  if(observed.repository!==hostPolicy.repository||observed.branch!==newest.branch||
    observed.refExists!==true||observed.headSha!==newest.headSha||
    !SHA.test(observed.parentSha)||observed.parentSha!==parent||
    observed.subject!==expectedSubject)
    deny('remote branch/commit did not match durable checkpoint');
  if(!Number.isSafeInteger(observed.nowSeconds)||!Number.isSafeInteger(observed.observedAtSeconds)||
    observed.observedAtSeconds>observed.nowSeconds||
    observed.nowSeconds-observed.observedAtSeconds>300)
    deny('stale or inconsistent host observation clock');
  if(observed.activeWorkflowRuns!==0||observed.openFinalPullRequests!==0)
    deny('concurrent run or ambiguous final PR');
  if(check.name!=='check'||check.headSha!==newest.headSha||
    check.appId!==requiredCheckAppId||check.status!=='completed'||
    check.conclusion!=='success')
    deny('missing exact independent CI evidence');
  // NO command to resume, no retry, no token, no write or paid permission.
  return Object.freeze({
    kind:'r3f02-offline-resume-preview',
    taskId:newest.taskId,branch:newest.branch,headSha:newest.headSha,
    inspectedCheckpointCount:list.length,
    suggestedManualPhase:list.length===1?'apply':'finalize',
    remoteEvidenceIndependentlyAuthenticated:false,
    resumeAuthorized:false,authorizedToExecute:false,paidApprovalRequired:true,
    opsxSemanticSyncInvoked:false,sourceProvenanceVerified:false,
    trustEvidenceIndependentlyVerified:false,promotionAllowed:false,
    writesPerformed:false,
  });
}
