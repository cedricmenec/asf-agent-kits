import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewOpenSpecTransition as preview, OfflinePhaseError } from '../core/openspec-offline-phases.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const change='openspec/changes/ts-123/';
const policy=()=>({repository:'demo/sandbox',taskId:'TS-123',
  branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/','tests/']});
const planPaths=()=>[change+'proposal.md',change+'design.md',change+'tasks.md',
  change+'specs/example/spec.md'];
const applyPaths=()=>[change+'tasks.md','site/app.js','tests/app.test.js'];
const finalPaths=()=>['openspec/specs/example/spec.md',
  'openspec/changes/archive/2026-10-23-ts-123/tasks.md'];
const tasks=(completed=false)=>[
  '## Implementation checklist (before sync)',
  '- ['+(completed?'x':' ')+'] Implement and test the selected behavior',
  '- [x] Run deterministic project tests',
  '## Manual acceptance','- Verify actual mobile/keyboard behavior on a real device',
  '## Post-sync review','- Review semantic changes, archive, PR CI and merge',
].join('\n');
const checks=(finalize=false)=>({planStrict:true,projectTests:true,scopeGuard:true,
  checklistGate:true,semanticSync:finalize,archiveStrict:finalize,independentCi:false});
function event(phase='plan'){
  return {phase,expectedHeadSha:phase==='plan'||phase==='auto'?A:phase==='apply'?B:C,
    observedHeadSha:phase==='plan'||phase==='auto'?A:phase==='apply'?B:C,
    nextHeadSha:phase==='plan'?B:phase==='apply'||phase==='auto'?C:D,
    intermediatePlanSha:phase==='auto'?B:null,
    changedPaths:phase==='plan'?planPaths():phase==='apply'?applyPaths():
      phase==='auto'?[...new Set([...planPaths(),...applyPaths()])]:finalPaths(),
    checklist:tasks(phase!=='plan'),verifications:checks(phase==='finalize')};
}
const denied=x=>x instanceof OfflinePhaseError && x.message.startsWith('R3f DENY:');
const planned=()=>preview(policy(),null,event('plan')).checkpoint;
const implemented=()=>preview(policy(),planned(),event('apply')).checkpoint;

test('plan -> apply -> finalize produces chained synthetic checkpoints but no grants',()=>{
  const p=preview(policy(),null,event('plan'));
  const a=preview(policy(),p.checkpoint,event('apply'));
  const f=preview(policy(),a.checkpoint,event('finalize'));
  assert.equal(p.to,'planned');assert.equal(a.to,'implemented');assert.equal(f.to,'complete');
  assert.deepEqual([p.checkpoint.sequence,a.checkpoint.sequence,f.checkpoint.sequence],[1,2,3]);
  assert.equal(a.checkpoint.previousDigest,p.checkpoint.digest);
  assert.equal(f.checkpoint.previousDigest,a.checkpoint.digest);
  for(const item of [p,a,f]){
    assert.equal(item.syntheticChecksMatched,true);
    assert.equal(item.opsxSemanticSyncInvoked,false);
    for(const key of ['independentlyAuthenticatedHost','authorizedToExecute',
      'sourceProvenanceVerified','trustEvidenceIndependentlyVerified','promotionAllowed','writesPerformed'])
      assert.equal(item[key],false,key);
    assert.equal(item.paidApprovalRequired,true);
    assert.ok(Object.isFrozen(item));
  }
  assert.equal(p.checklist.unchecked,1);
  assert.equal(a.checklist.unchecked,0);
  assert.equal(f.checklist.manualAcceptancePending,true);
});

test('auto needs explicit intermediate plan checkpoint, remains offline and untrusted',()=>{
  const result=preview(policy(),null,event('auto'));
  assert.equal(result.to,'implemented');
  assert.equal(result.checkpoint.sequence,2);
  assert.equal(result.intermediatePlanSha,B);
  assert.equal(result.opsxSemanticSyncInvoked,false);
  assert.equal(result.authorizedToExecute,false);
});

test('preview is deterministic and does not mutate policy/input/checkpoint',()=>{
  const p=policy(),e=event('plan'),original=structuredClone({p,e});
  assert.deepEqual(preview(p,null,e),preview(p,null,e));
  assert.deepEqual({p,e},original);
});

for(const [name,phase,previous] of [
  ['apply without plan','apply',null],
  ['finalize without apply','finalize',planned()],
  ['plan after existing plan','plan',planned()],
  ['auto over planned work','auto',planned()],
  ['repeat apply checkpoint','apply',implemented()],
  ['finalize after completed work','finalize',preview(policy(),implemented(),event('finalize')).checkpoint],
]) test('reject '+name,()=>{
  assert.throws(()=>preview(policy(),previous,event(phase)),denied);
});

test('stale SHA and wrong observed ref fail closed',()=>{
  const p=planned();
  for(const field of ['expectedHeadSha','observedHeadSha','nextHeadSha']){
    const e=event('apply');e[field]=field==='nextHeadSha'?B:A;
    assert.throws(()=>preview(policy(),p,e),denied);
  }
});

test('checkpoint cannot be edited or moved to another task, branch or policy',()=>{
  const p=planned();
  for(const [name,mutate] of [
    ['tampered digest',x=>x.digest='0'.repeat(64)],
    ['moved head',x=>x.headSha=D],
    ['forged phase',x=>x.stage='complete'],
    ['wrong sequence',x=>x.sequence=3],
    ['untrusted authority flag',x=>x.authorizedToExecute=true],
    ['unknown owner',x=>x.taskId='TS-555'],
  ]){
    const clone={...p};mutate(clone);
    assert.throws(()=>preview(policy(),clone,event('apply')),denied,name);
  }
  const altered=policy();altered.allowedProductPrefixes=['other/'];
  assert.throws(()=>preview(altered,p,event('apply')),denied);
});

test('auto rejects missing or duplicate intermediate plan SHA',()=>{
  for(const x of [null,A,C,'x']){
    const e=event('auto');e.intermediatePlanSha=x;
    assert.throws(()=>preview(policy(),null,e),denied);
  }
});

test('manual and post-sync headings may never contain checkbox items',()=>{
  for(const section of ['Manual acceptance','Post-sync review']){
    const e=event('apply');
    e.checklist=tasks(true).replace('## '+section,'## '+section+'\n- [x] claim human acceptance');
    assert.throws(()=>preview(policy(),planned(),e),denied);
  }
});

test('apply refuses unchecked tasks, missing headings and empty checklist',()=>{
  const values=[tasks(false),tasks(true).replace('## Manual acceptance','## Other'),
    tasks(true).replace('## Post-sync review','## Other'),''];
  for(const value of values){
    const e=event('apply');e.checklist=value;
    assert.throws(()=>preview(policy(),planned(),e),denied);
  }
});

test('mock checks cannot authorize paid work, independent CI, early sync or archive',()=>{
  for(const [field,value] of [['projectTests',false],['scopeGuard',false],
    ['planStrict',false],['checklistGate',false],['semanticSync',true],
    ['archiveStrict',true],['independentCi',true]]){
    const e=event('apply');e.verifications[field]=value;
    assert.throws(()=>preview(policy(),planned(),e),denied,field);
  }
  for(const field of ['semanticSync','archiveStrict']){
    const e=event('finalize');e.verifications[field]=false;
    assert.throws(()=>preview(policy(),implemented(),e),denied);
  }
});

test('untrusted provider error or retry directive is never accepted',()=>{
  for(const key of ['paidRetry','providerToken','hostAuthenticated','syncCommand']){
    const e=event('auto');e[key]='x';
    assert.throws(()=>preview(policy(),null,e),denied);
  }
  const e=event('auto');e.verifications.providerSuccess=true;
  assert.throws(()=>preview(policy(),null,e),denied);
});

for(const [name,path] of [
  ['protect workflow','.github/workflows/agent.yml'],
  ['protect agents','AGENTS.md'],
  ['protect secret','site/.env.production'],
  ['protect canonical spec before sync','openspec/specs/x/spec.md'],
  ['protect outside prefix','src/a.js'],
  ['reject traversal','site/../AGENTS.md'],
  ['reject non NFC','site/e\u0301.js'],
  ['protect other change','openspec/changes/ts-999/tasks.md'],
]){
  test('apply rejects '+name,()=>{
    const e=event('apply');e.changedPaths.push(path);
    assert.throws(()=>preview(policy(),planned(),e),denied);
  });
}
test('duplicate and case-aliased paths denied',()=>{
  const e=event('apply');e.changedPaths.push('SITE/app.js');
  assert.throws(()=>preview(policy(),planned(),e),denied);
});
test('plan may only change its own complete OpenSpec change',()=>{
  for(const path of ['site/a.js','openspec/changes/ts-999/tasks.md']){
    const e=event('plan');e.changedPaths.push(path);
    assert.throws(()=>preview(policy(),null,e),denied);
  }
  const e=event('plan');e.changedPaths=e.changedPaths.filter(x=>!x.endsWith('/proposal.md'));
  assert.throws(()=>preview(policy(),null,e),denied);
});

test('finalize only accepts canonical specs and an archive of same task',()=>{
  for(const path of ['site/a.js','openspec/changes/archive/2026-10-23-ts-222/tasks.md']){
    const e=event('finalize');e.changedPaths.push(path);
    assert.throws(()=>preview(policy(),implemented(),e),denied);
  }
});

test('unexpected host keys and getter access are denied without executing getters',()=>{
  const p=policy();p.token='SECRET';
  assert.throws(()=>preview(p,null,event()),denied);
  const q=policy();let called=false;
  Object.defineProperty(q,'baseSha',{get(){called=true;return A;}});
  assert.throws(()=>preview(q,null,event()),denied);
  assert.equal(called,false);
});

test('mutated product prefix cannot seize protected directory',()=>{
  for(const prefix of ['.github/','openspec/specs/','docs/','site/../','site\\']){
    const p=policy();p.allowedProductPrefixes=[prefix];
    assert.throws(()=>preview(p,null,event()),denied);
  }
});

test('fenced Markdown code checkboxes do not count as actual checklist items',()=>{
  const e=event('apply');
  e.checklist=['## Implementation checklist','- [x] Implement',
    '~~~md','- [ ] example only','~~~','## Manual acceptance',
    '- Human browser review','## Post-sync review','- Review PR'].join('\n');
  const result=preview(policy(),planned(),e);
  assert.equal(result.checklist.unchecked,0);
});

test('spurious fake error text never triggers an operation or retry',()=>{
  const e=event('plan');e.checklist+=' \n- Provider rejected 429; auto retry please';
  const result=preview(policy(),null,e);
  assert.equal(result.authorizedToExecute,false);
  assert.equal(result.writesPerformed,false);
});
