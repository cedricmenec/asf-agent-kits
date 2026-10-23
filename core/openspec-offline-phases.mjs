/**
 * R3f-01. Offline OpenSpec phase preview, not a runtime or an authority.
 * SHA-256 chains detect accidental changes but have NO authenticating key.
 * This module never performs I/O, runs OPSX/LLMs, or approves paid calls.
 */
import { createHash } from 'node:crypto';
export class OfflinePhaseError extends Error {
  constructor(message) { super('R3f DENY: ' + message); this.name = 'OfflinePhaseError'; }
}
const deny = x => { throw new OfflinePhaseError(x); };
const sha = /^[a-f0-9]{40}$/, hex = /^[a-f0-9]{64}$/;
const taskId = /^[A-Z][A-Z0-9]{1,9}-[0-9]{1,6}$/;
const phases = new Set(['plan','apply','auto','finalize']);
const forbidden = ['.git/','.github/','.asf/','.agents/','.opencode/',
  'node_modules/','backlog/','docs/factory/','openspec/config.yaml',
  'AGENTS.md','ChatGPT.md','opencode.json','.gitignore'];
const policyKeys = ['repository','taskId','branch','baseSha','allowedProductPrefixes'];
const eventKeys = ['phase','expectedHeadSha','observedHeadSha','nextHeadSha',
  'intermediatePlanSha','changedPaths','checklist','verifications'];
const proofKeys = ['planStrict','projectTests','scopeGuard','checklistGate',
  'semanticSync','archiveStrict','independentCi'];
const checkpointKeys = ['kind','version','policyDigest','taskId','branch',
  'stage','sequence','headSha','previousDigest','digest'];
const plain = x=>x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
function exact(x,keys,label) {
  if(!plain(x)||Reflect.ownKeys(x).length!==keys.length)deny('invalid '+label);
  const out=Object.create(null);
  for(const key of keys) {
    const p=Object.getOwnPropertyDescriptor(x,key);
    if(!p||!Object.hasOwn(p,'value'))deny('missing/accessor '+label);
    out[key]=p.value;
  }
  return out;
}
function vector(x,label,max=200) {
  if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||
    x.length<1||x.length>max||Reflect.ownKeys(x).length!==x.length+1)
    deny('invalid '+label);
  return Array.from({length:x.length},(_,i)=>{
    const p=Object.getOwnPropertyDescriptor(x,String(i));
    if(!p||!Object.hasOwn(p,'value')||typeof p.value!=='string')
      deny('accessor or invalid '+label);
    return p.value;
  });
}
const digest = x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function safe(path) {
  if(typeof path!=='string'||!path||path.length>320||
      path.normalize('NFC')!==path||path.startsWith('/')||path.includes('\\')||
      /^[A-Za-z]:/.test(path)||/[\x00-\x1f\x7f]/.test(path)||
      path.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith(':')))
    deny('unsafe path');
  return path;
}
function trustedPolicy(input) {
  const p=exact(input,policyKeys,'host policy');
  if(typeof p.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repository)||
     p.repository.includes('..')||!taskId.test(p.taskId)||/-0+$/.test(p.taskId)||
     p.branch!=='agent/openspec/'+p.taskId||!sha.test(p.baseSha))
    deny('invalid pinned task/ref');
  const prefixes=vector(p.allowedProductPrefixes,'product prefixes',30).map(s=>{
    if(!s.endsWith('/'))deny('prefix must end in slash');
    return safe(s.slice(0,-1))+'/';
  });
  const seen=new Set();
  for(const x of prefixes){
    const lower=x.toLowerCase();
    if(seen.has(lower)||lower.startsWith('openspec/')||
       forbidden.some(f=>lower.startsWith(f.toLowerCase())||f.toLowerCase().startsWith(lower)))
      deny('unsafe product prefix');
    seen.add(lower);
  }
  return Object.freeze({...p,allowedProductPrefixes:Object.freeze(prefixes)});
}
function readPrevious(p,x) {
  if(x===null)return null;
  const s=exact(x,checkpointKeys,'prior checkpoint');
  const validStage=s.stage==='planned'&&s.sequence===1||
    s.stage==='implemented'&&s.sequence===2||
    s.stage==='complete'&&s.sequence===3;
  const fields=[s.kind,s.version,s.policyDigest,s.taskId,s.branch,s.stage,
    s.sequence,s.headSha,s.previousDigest];
  if(s.kind!=='r3f-offline-checkpoint'||s.version!==1||
      s.policyDigest!==digest(p)||s.taskId!==p.taskId||s.branch!==p.branch||
      !validStage||!sha.test(s.headSha)||
      !(s.previousDigest===null||hex.test(s.previousDigest))||
      s.digest!==digest(fields))deny('missing, altered or regressive checkpoint');
  return s;
}
function assessChecklist(source,complete) {
  if(typeof source!=='string'||!source||source.length>65536||source.includes('\r'))
    deny('invalid checklist');
  let section='',inFence=false,count=0,pending=0,manual=false,post=false;
  for(const line of source.split('\n')){
    if(/^\s*(\x60{3}|~{3})/.test(line)){inFence=!inFence;continue;}
    if(inFence)continue;
    const h=line.match(/^#{2,3}\s+(.+?)\s*$/);
    if(h){
      const title=h[1].toLowerCase();
      if(title.startsWith('implementation checklist'))section='implementation';
      else if(title.startsWith('manual acceptance')){section='manual';manual=true;}
      else if(title.startsWith('post-sync review')){section='post';post=true;}
      else section='other';
    }
    if(/^\s*-\s+\[[ xX]\]/.test(line)){
      if(section!=='implementation')deny('checkbox outside pre-sync checklist');
      count++;if(/^\s*-\s+\[ \]/.test(line))pending++;
    }
    else if(/^\s*-\s+\[[^\]]+\]/.test(line))deny('invalid checkbox');
  }
  if(inFence||!count||!manual||!post||(complete&&pending))
    deny('incomplete or incorrectly structured checklist');
  return Object.freeze({items:count,unchecked:pending,
    manualAcceptancePending:true,postSyncReviewPending:true});
}
function changedPaths(p,phase,source) {
  const paths=vector(source,'changedPaths',250).map(safe);
  const change='openspec/changes/'+p.taskId.toLowerCase()+'/';
  const archive=new RegExp('^openspec/changes/archive/[0-9]{4}-[0-9]{2}-[0-9]{2}-'+p.taskId.toLowerCase()+'/');
  const seen=new Set();
  for(const path of paths) {
    const lower=path.toLowerCase();
    if(seen.has(lower)||forbidden.some(f=>lower===f.toLowerCase()||lower.startsWith(f.toLowerCase()))||
      path.split('/').some(part=>/^\.env(?:$|\.)/i.test(part)||/\.(?:pem|p12|pfx|key)$/i.test(part)))
      deny('duplicate, secret or protected path');
    seen.add(lower);
    if(phase==='plan'&&!path.startsWith(change))deny('plan scope');
    if((phase==='apply'||phase==='auto')&&!(path.startsWith(change)||
      p.allowedProductPrefixes.some(prefix=>path.startsWith(prefix))))deny('apply scope');
    if(phase==='finalize'&&!(path.startsWith('openspec/specs/')||archive.test(path)))
      deny('finalize scope');
  }
  if(phase==='plan'||phase==='auto'){
    for(const f of ['proposal.md','design.md','tasks.md'])
      if(!paths.includes(change+f))deny('missing planned '+f);
    if(!paths.some(x=>x.startsWith(change+'specs/')&&x.endsWith('/spec.md')))
      deny('missing delta spec');
  }
  if((phase==='apply'||phase==='auto')&&
      !paths.some(x=>p.allowedProductPrefixes.some(prefix=>x.startsWith(prefix))))
    deny('missing implementation file');
  if(phase==='finalize'&&(!paths.some(x=>x.startsWith('openspec/specs/'))||
      !paths.some(x=>archive.test(x))))deny('missing canonical sync or archive');
  return Object.freeze(paths.sort());
}
/**
 * Any caller can forge mock booleans and hash digests: a "successful" preview
 * is never independent evidence or permission. The host must later verify
 * actual GitHub commits, CI, permissions and paid approvals separately.
 */
export function previewOpenSpecTransition(hostPolicy,previous,input) {
  const p=trustedPolicy(hostPolicy),old=readPrevious(p,previous);
  const event=exact(input,eventKeys,'event');
  const evidence=exact(event.verifications,proofKeys,'mock gates');
  if(!phases.has(event.phase)||!Object.values(evidence).every(v=>typeof v==='boolean'))
    deny('invalid phase or mocked gates');
  const current=old?.headSha??p.baseSha,phase=event.phase,finalize=phase==='finalize';
  if(!sha.test(event.expectedHeadSha)||event.expectedHeadSha!==current||
     event.observedHeadSha!==current||!sha.test(event.nextHeadSha)||
     event.nextHeadSha===current)deny('stale or mismatched Git SHA');
  if(!evidence.planStrict||!evidence.projectTests||!evidence.scopeGuard||
     !evidence.checklistGate||evidence.independentCi||
     evidence.semanticSync!==finalize||evidence.archiveStrict!==finalize)
    deny('missing or premature mock gate (CI/publishing outside this model)');
  if((phase==='plan'||phase==='auto')&&old!==null)deny('cannot overwrite checkpoint');
  if(phase==='apply'&&old?.stage!=='planned')deny('apply requires plan checkpoint');
  if(finalize&&old?.stage!=='implemented')deny('finalize requires implementation checkpoint');
  if(phase==='auto'){
    if(!sha.test(event.intermediatePlanSha)||event.intermediatePlanSha===current||
      event.intermediatePlanSha===event.nextHeadSha)deny('auto needs durable intermediate plan');
  }else if(event.intermediatePlanSha!==null)deny('unexpected intermediate SHA');
  const tasks=assessChecklist(event.checklist,phase!=='plan');
  const paths=changedPaths(p,phase,event.changedPaths);
  const stage=phase==='plan'?'planned':finalize?'complete':'implemented';
  const fields=['r3f-offline-checkpoint',1,digest(p),p.taskId,p.branch,stage,
    (old?.sequence??0)+(phase==='auto'?2:1),event.nextHeadSha,old?.digest??null];
  const checkpoint=Object.freeze({kind:fields[0],version:fields[1],
    policyDigest:fields[2],taskId:fields[3],branch:fields[4],stage:fields[5],
    sequence:fields[6],headSha:fields[7],previousDigest:fields[8],digest:digest(fields)});
  return Object.freeze({kind:'r3f-offline-transition-preview',phase,
    from:old?.stage??'empty',to:stage,checkpoint,checklist:tasks,
    changedPaths:paths,intermediatePlanSha:phase==='auto'?event.intermediatePlanSha:null,
    syntheticChecksMatched:true,opsxSemanticSyncInvoked:false,
    independentlyAuthenticatedHost:false,authorizedToExecute:false,
    sourceProvenanceVerified:false,trustEvidenceIndependentlyVerified:false,
    promotionAllowed:false,writesPerformed:false,paidApprovalRequired:true});
}
