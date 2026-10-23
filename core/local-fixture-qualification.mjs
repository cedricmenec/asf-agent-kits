/**
 * R3g-02: consultative integration of disposable local byte snapshots,
 * a MOCK lock and a MOCK phase checkpoint with pure R3f OPSX guards.
 * No Git authentication, filesystem sandbox, installer, OPSX, provider or writes.
 */
import { resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { inventoryLocalFixture } from './local-fixture-inventory.mjs';
import { previewOfflineOpsxSync, previewOfflineOpsxArchive } from './opsx-offline-guard.mjs';
import { previewOfflineResume } from './openspec-offline-resume.mjs';

export class LocalQualificationError extends Error {
  constructor() { super('R3g-02 DENY: untrusted or inconsistent local fixture'); this.name='LocalQualificationError'; }
}
const deny=()=>{throw new LocalQualificationError();};
const HEX=/^[a-f0-9]{64}$/, SHA=/^[a-f0-9]{40}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function exact(input,keys){
  if(!plain(input)||Reflect.ownKeys(input).length!==keys.length)deny();
  const result=Object.create(null);
  for(const key of keys){
    const entry=Object.getOwnPropertyDescriptor(input,key);
    if(!entry||!Object.hasOwn(entry,'value'))deny();
    result[key]=entry.value;
  }
  return result;
}
function vector(source,max){
  if(!Array.isArray(source)||Object.getPrototypeOf(source)!==Array.prototype||
    source.length<1||source.length>max||
    Reflect.ownKeys(source).length!==source.length+1)deny();
  return Array.from({length:source.length},(_,i)=>{
    const p=Object.getOwnPropertyDescriptor(source,String(i));
    if(!p||!Object.hasOwn(p,'value'))deny();
    return p.value;
  });
}
function matchMockLock(raw,inventory,expectedSha){
  const lock=exact(raw,['headSha','files']);
  if(!SHA.test(lock.headSha)||lock.headSha!==expectedSha)deny();
  const expected=vector(lock.files,500);
  if(expected.length!==inventory.files.length)deny();
  const known=new Map(inventory.files.map(x=>[x.path,x.sha256]));
  const names=new Set();
  for(const rawEntry of expected){
    const e=exact(rawEntry,['path','sha256']);
    if(typeof e.path!=='string'||typeof e.sha256!=='string'||!HEX.test(e.sha256)||
      names.has(e.path.toLowerCase())||known.get(e.path)!==e.sha256)deny();
    names.add(e.path.toLowerCase());
  }
  if(names.size!==known.size)deny();
  // A checksum of user-supplied mock data is NOT a signed or Git-authenticated lock.
  return createHash('sha256').update(JSON.stringify([...expected]
    .map(entry=>[entry.path,entry.sha256]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)))
    .digest('hex');
}
/**
 * Caller must own a DISPOSABLE, isolated fixtureRoot containing before/,
 * after/ and archived/ snapshots. This function only READS those trees.
 * It MUST NOT be called with an actual target repository or agent-owned root.
 * Pathname reads remain non-atomic against privileged concurrent swaps.
 */
export async function previewLocalFixtureQualification(input){
  try {
    const spec=exact(input,['fixtureRoot','headSha','expectedPaths','lock',
      'syncPolicy','checkpoint','archiveDate']);
    if(typeof spec.fixtureRoot!=='string'||!isAbsolute(spec.fixtureRoot)||
      !SHA.test(spec.headSha))deny();
    const paths=exact(spec.expectedPaths,['before','after','archived']);
    const pin=exact(spec.syncPolicy,['taskId','headSha','canonicalPaths']);
    if(pin.headSha!==spec.headSha)deny();
    const phase=exact(spec.checkpoint,['hostPolicy','chain','observed','checkAppId']);
    const root=resolve(spec.fixtureRoot);
    const before=await inventoryLocalFixture(resolve(root,'before'),spec.headSha,paths.before);
    const lockFingerprint=matchMockLock(spec.lock,before,spec.headSha);
    const resume=previewOfflineResume(phase.hostPolicy,phase.chain,
      phase.observed,phase.checkAppId);
    if(resume.suggestedManualPhase!=='finalize'||
       resume.headSha!==pin.headSha||resume.taskId!==pin.taskId)deny();
    const after=await inventoryLocalFixture(resolve(root,'after'),spec.headSha,paths.after);
    const archived=await inventoryLocalFixture(resolve(root,'archived'),spec.headSha,paths.archived);
    const sync=previewOfflineOpsxSync(spec.syncPolicy,before,after);
    const archive=previewOfflineOpsxArchive(spec.syncPolicy,sync,after,archived,spec.archiveDate);
    return Object.freeze({
      kind:'r3g02-disposable-local-qualification-preview',
      taskId:pin.taskId,headSha:pin.headSha,localLockFingerprint:lockFingerprint,
      localLockMatched:true,syntheticCheckpointMatched:true,
      changedCanonicalPaths:sync.changedCanonicalPaths,
      archivedFilesReviewed:archive.archivedFiles,
      simulatedOnly:true,localSourceAuthenticated:false,
      realGitHeadVerified:false,filesystemRaceFree:false,
      remoteEvidenceIndependentlyAuthenticated:false,
      semanticRequirementsIndependentlyVerified:false,
      opsxCommandInvoked:false,authorizedToExecute:false,
      trustEvidenceIndependentlyVerified:false,sourceProvenanceVerified:false,
      promotionAllowed:false,writesPerformed:false,paidApprovalRequired:true,
    });
  }catch{
    // Mock errors and future credentials must never be reflected in the output.
    deny();
  }
}
