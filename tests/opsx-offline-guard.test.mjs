import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewOfflineOpsxSync as sync, previewOfflineOpsxArchive as archive,
  OfflineOpsxError } from '../core/opsx-offline-guard.mjs';

const SHA='a'.repeat(40), H=x=>x.repeat(64), SP='openspec/specs/widgets/spec.md';
const ACTIVE='openspec/changes/ts-123/';
const ARCHIVE='openspec/changes/archive/2026-10-23-ts-123/';
const entry=(path,value)=>({path,mode:'100644',sha256:H(value),type:'file'});
const policy=()=>({taskId:'TS-123',headSha:SHA,canonicalPaths:[SP]});
const before=()=>({headSha:SHA,files:[
  entry('docs/product/guide.md','1'),entry(ACTIVE+'proposal.md','2'),
  entry(ACTIVE+'tasks.md','3'),entry(SP,'4')]});
const after=()=>({headSha:SHA,files:[
  entry('docs/product/guide.md','1'),entry(ACTIVE+'proposal.md','2'),
  entry(ACTIVE+'tasks.md','3'),entry(SP,'5')]});
function archived(){
  const a=after();
  a.files=a.files.filter(x=>!x.path.startsWith(ACTIVE));
  a.files.push(entry(ARCHIVE+'proposal.md','2'),entry(ARCHIVE+'tasks.md','3'));
  return a;
}
const denied=e=>e instanceof OfflineOpsxError && e.message.startsWith('R3f-03 DENY:');

test('synthetic semantic sync only changes approved canonical file, never calls OPSX',()=>{
  const result=sync(policy(),before(),after());
  assert.deepEqual(result.changedCanonicalPaths,[SP]);
  assert.equal(result.kind,'r3f03-offline-sync-preview');
  assert.equal(result.headSha,SHA);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.changedCanonicalPaths),true);
  for(const k of ['semanticRequirementsIndependentlyVerified','independentlyAuthenticatedHost',
    'authorizedToExecute','sourceProvenanceVerified','trustEvidenceIndependentlyVerified',
    'promotionAllowed','writesPerformed','opsxCommandInvoked'])assert.equal(result[k],false,k);
  assert.equal(result.paidApprovalRequired,true);
});
test('archive --skip-specs mock moves active change unchanged, no authority',()=>{
  const result=archive(policy(),sync(policy(),before(),after()),after(),archived(),'2026-10-23');
  assert.equal(result.archiveDirectory,ARCHIVE);
  assert.equal(result.archivedFiles,2);
  assert.equal(result.writesPerformed,false);
  assert.equal(result.opsxCommandInvoked,false);
  assert.equal(result.authorizedToExecute,false);
});
test('deterministic snapshots and no mutation of input',()=>{
  const p=policy(),a=before(),b=after();
  assert.deepEqual(sync(p,a,b),sync(p,a,b));
  assert.deepEqual(a,before());assert.deepEqual(b,after());
});
test('no changed canonical file is denied',()=>{
  assert.throws(()=>sync(policy(),before(),before()),denied);
});
for(const [name,edit] of [
  ['product mutation',x=>x.files.find(z=>z.path==='docs/product/guide.md').sha256=H('f')],
  ['workflow mutation',x=>x.files.push(entry('.github/workflows/agent.yml','f'))],
  ['unreviewed canonical spec',x=>x.files.push(entry('openspec/specs/other/spec.md','f'))],
  ['unexpected archive',x=>x.files.push(entry(ARCHIVE+'spec.md','f'))],
  ['removed canonical spec',x=>x.files=x.files.filter(z=>z.path!==SP)],
  ['changed HEAD',x=>x.headSha='b'.repeat(40)],
  ['symlink',x=>x.files.find(z=>z.path===SP).type='link'],
  ['executable file mode',x=>x.files.find(z=>z.path===SP).mode='100755'],
  ['duplicate case alias',x=>x.files.push(entry('OPENSPEC/specs/widgets/spec.md','f'))],
  ['traversal path',x=>x.files.push(entry('openspec/specs/../evil/spec.md','f'))],
  ['non NFC path',x=>x.files.push(entry('openspec/specs/e\u0301/spec.md','f'))],
]){
  test('sync rejects '+name,()=>{
    const b=after();edit(b);
    assert.throws(()=>sync(policy(),before(),b),denied);
  });
}
test('invalid or extra host policy canonical scopes are refused',()=>{
  const a=policy();a.canonicalPaths=['docs/product/guide.md'];
  assert.throws(()=>sync(a,before(),after()),denied);
  const b=policy();b.canonicalPaths.push('openspec/specs/widgets/SPEC.md');
  assert.throws(()=>sync(b,before(),after()),denied);
  const c=policy();c.secret='TOPSECRET';
  assert.throws(()=>sync(c,before(),after()),denied);
});
test('accessor values denied before invocation',()=>{
  const a=after();let read=false;
  Object.defineProperty(a,'headSha',{get(){read=true;return SHA;}});
  assert.throws(()=>sync(policy(),before(),a),denied);
  assert.equal(read,false);
});
for(const [name,alter] of [
  ['archive removed unrelated product',x=>x.files=x.files.filter(f=>f.path!=='docs/product/guide.md')],
  ['archive changed canonical spec',x=>x.files.find(f=>f.path===SP).sha256=H('e')],
  ['archive damaged plan artifact',x=>x.files.find(f=>f.path===ARCHIVE+'proposal.md').sha256=H('e')],
  ['archive left active task',x=>x.files.push(entry(ACTIVE+'tasks.md','3'))],
  ['archive incomplete',x=>x.files=x.files.filter(f=>f.path!==ARCHIVE+'tasks.md')],
  ['archive extra file',x=>x.files.push(entry(ARCHIVE+'unexpected.md','f'))],
  ['archive changed HEAD',x=>x.headSha='b'.repeat(40)],
]){
  test('archive refuses '+name,()=>{
    const x=archived();alter(x);
    assert.throws(()=>archive(policy(),sync(policy(),before(),after()),after(),x,'2026-10-23'),denied);
  });
}
test('archive requires valid date, no disguised path',()=>{
  for(const date of ['2026-02-30','2026-13-01','../2026-10-23','2026-1-1','']){
    assert.throws(()=>archive(policy(),sync(policy(),before(),after()),after(),archived(),date),denied);
  }
});
test('archive refuses missing active change and mismatched snapshot fingerprint',()=>{
  const result=sync(policy(),before(),after());
  const wrong=after();wrong.files.find(f=>f.path===SP).sha256=H('f');
  assert.throws(()=>archive(policy(),result,wrong,archived(),'2026-10-23'),denied);
  const empty=after();empty.files=empty.files.filter(x=>!x.path.startsWith(ACTIVE));
  assert.throws(()=>archive(policy(),result,empty,archived(),'2026-10-23'),denied);
});
test('archive rejects any forged authorization, payment or sync invocation flags',()=>{
  const original=sync(policy(),before(),after());
  for(const key of ['authorizedToExecute','writesPerformed','promotionAllowed',
    'semanticRequirementsIndependentlyVerified','opsxCommandInvoked','sourceProvenanceVerified']){
    const forged={...original,[key]:true};
    assert.throws(()=>archive(policy(),forged,after(),archived(),'2026-10-23'),denied,key);
  }
  const fake={...original,providerKey:'TOPSECRET'};
  assert.throws(()=>archive(policy(),fake,after(),archived(),'2026-10-23'),denied);
});
test('no task-supplied release claim or retry command can alter previews',()=>{
  const fake=policy();fake.runModel=true;
  assert.throws(()=>sync(fake,before(),after()),denied);
  const original=sync(policy(),before(),after());
  assert.equal(original.opsxCommandInvoked,false);
  assert.equal(original.paidApprovalRequired,true);
});
