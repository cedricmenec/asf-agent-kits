/**
 * R3f-03. Pure byte-inventory checks for MOCK OPSX semantic sync + archive.
 * No OpenCode, OpenSpec, OPSX, git, filesystem I/O, network or paid calls.
 * Matching invented hashes is NOT semantic equivalence or provenance.
 */
import { createHash } from 'node:crypto';
export class OfflineOpsxError extends Error {
  constructor(reason){super('R3f-03 DENY: '+reason);this.name='OfflineOpsxError';}
}
const deny=x=>{throw new OfflineOpsxError(x);};
const SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/;
const TASK=/^[A-Z][A-Z0-9]{1,9}-[0-9]{1,6}$/;
const exact=(o,keys,label)=>{
  if(o===null||typeof o!=='object'||Array.isArray(o)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(o))||
    Reflect.ownKeys(o).length!==keys.length)deny('invalid '+label);
  const result=Object.create(null);
  for(const k of keys){
    const p=Object.getOwnPropertyDescriptor(o,k);
    if(!p||!Object.hasOwn(p,'value'))deny('missing or accessor '+label);
    result[k]=p.value;
  }
  return result;
};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function vector(a,label,max=500){
  if(!Array.isArray(a)||Object.getPrototypeOf(a)!==Array.prototype||
    a.length<1||a.length>max||Reflect.ownKeys(a).length!==a.length+1)
    deny('invalid '+label);
  return Array.from({length:a.length},(_,index)=>{
    const p=Object.getOwnPropertyDescriptor(a,String(index));
    if(!p||!Object.hasOwn(p,'value'))deny('accessor or sparse '+label);
    return p.value;
  });
}
function path(value){
  if(typeof value!=='string'||!value||value.length>320||
     value.normalize('NFC')!==value||value.startsWith('/')||value.includes('\\')||
     /^[A-Za-z]:/.test(value)||/[\x00-\x1f\x7f]/.test(value)||
     value.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith(':')))
    deny('unsafe inventory path');
  return value;
}
function policy(input){
  const p=exact(input,['taskId','headSha','canonicalPaths'],'host sync policy');
  if(!TASK.test(p.taskId)||/-0+$/.test(p.taskId)||!SHA.test(p.headSha))
    deny('invalid host task/HEAD');
  const paths=vector(p.canonicalPaths,'canonical allowlist',100).map(path);
  const aliases=new Set();
  for(const item of paths){
    const fold=item.toLowerCase();
    if(!item.startsWith('openspec/specs/')||!item.endsWith('/spec.md')||
      aliases.has(fold))deny('unsafe or duplicate canonical allowlist');
    aliases.add(fold);
  }
  return Object.freeze({taskId:p.taskId,headSha:p.headSha,canonicalPaths:Object.freeze(paths.sort())});
}
function inventory(input,p) {
  const value=exact(input,['headSha','files'],'inventory');
  if(value.headSha!==p.headSha)deny('semantic sync/archive changed HEAD');
  const raw=vector(value.files,'inventory files');
  const mapped=new Map(),folds=new Set();
  for(const element of raw){
    const e=exact(element,['path','mode','sha256','type'],'inventory entry');
    const key=path(e.path).toLowerCase();
    if(folds.has(key))deny('case collision or duplicate inventory path');
    folds.add(key);
    if(e.type!=='file'||e.mode!=='100644'||!HEX.test(e.sha256))
      deny('symlink, executable mode or invalid file digest');
    mapped.set(e.path,Object.freeze({sha256:e.sha256,mode:e.mode,type:e.type}));
  }
  return mapped;
}
function signature(p,files){
  return hash([p.taskId,p.headSha,[...files].sort((a,b)=>a[0].localeCompare(b[0]))]);
}
function delta(a,b){
  return [...new Set([...a.keys(),...b.keys()])].sort().filter(k=>
    JSON.stringify(a.get(k)??null)!==JSON.stringify(b.get(k)??null));
}
const safeFlags=Object.freeze({semanticRequirementsIndependentlyVerified:false,
  independentlyAuthenticatedHost:false,authorizedToExecute:false,
  sourceProvenanceVerified:false,trustEvidenceIndependentlyVerified:false,
  promotionAllowed:false,writesPerformed:false,paidApprovalRequired:true,
  opsxCommandInvoked:false});
/**
 * Snapshot fingerprints are checksums, never a signed or independent proof.
 * Real OPSX is an out-of-process, separately authorized paid operation.
 */
export function previewOfflineOpsxSync(hostPolicy,before,after){
  const p=policy(hostPolicy),b=inventory(before,p),a=inventory(after,p);
  const changed=delta(b,a),allow=new Set(p.canonicalPaths);
  if(!changed.length)deny('no canonical spec changed');
  for(const name of changed) {
    if(!allow.has(name))deny('sync changed outside reviewed canonical paths');
    if(!a.has(name))deny('sync deleted a canonical spec without separate review');
  }
  return Object.freeze({kind:'r3f03-offline-sync-preview',headSha:p.headSha,
    policyDigest:hash(p),afterFingerprint:signature(p,a),
    changedCanonicalPaths:Object.freeze(changed),
    ...safeFlags});
}
function normalizedDate(x){
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||
    Number.isNaN(Date.parse(x))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)
    deny('invalid archive date');
  return x;
}
/**
 * Archive --skip-specs is only a copy/move consistency preview. It cannot
 * prove semantic correctness, real validation or a successful remote push.
 */
export function previewOfflineOpsxArchive(hostPolicy,syncResult,beforeArchive,afterArchive,date){
  const p=policy(hostPolicy),s=exact(syncResult,
    ['kind','headSha','policyDigest','afterFingerprint','changedCanonicalPaths',
      ...Object.keys(safeFlags)],'synthetic sync preview');
  if(s.kind!=='r3f03-offline-sync-preview'||s.headSha!==p.headSha||
    s.policyDigest!==hash(p)||s.semanticRequirementsIndependentlyVerified!==false||
    s.authorizedToExecute!==false||s.opsxCommandInvoked!==false)
    deny('mismatched or privileged sync preview');
  const b=inventory(beforeArchive,p),a=inventory(afterArchive,p);
  if(signature(p,b)!==s.afterFingerprint)deny('archive input differs from checked sync output');
  const id=p.taskId.toLowerCase(),active='openspec/changes/'+id+'/';
  const archived='openspec/changes/archive/'+normalizedDate(date)+'-'+id+'/';
  const old=[...b.keys()].filter(x=>x.startsWith(active));
  if(!old.length)deny('no active change to archive');
  const required=new Set(old.map(x=>archived+x.slice(active.length)));
  const changed=delta(b,a);
  if(changed.length!==old.length*2)deny('archive missing or extra file changes');
  for(const file of old){
    const copied=archived+file.slice(active.length);
    if(a.has(file)||b.has(copied)||JSON.stringify(a.get(copied))!==JSON.stringify(b.get(file)))
      deny('archive did not preserve active change bytes');
  }
  for(const item of changed)
    if(!(old.includes(item)||required.has(item)))deny('archive mutated unrelated or canonical specs');
  for(const item of required)if(!a.has(item))deny('archive file missing');
  return Object.freeze({kind:'r3f03-offline-archive-preview',
    headSha:p.headSha,archiveDirectory:archived,archivedFiles:old.length,
    ...safeFlags});
}
