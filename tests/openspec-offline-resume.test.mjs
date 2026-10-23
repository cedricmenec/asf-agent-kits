import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewOpenSpecTransition } from '../core/openspec-offline-phases.mjs';
import { previewOfflineResume, OfflineResumeError } from '../core/openspec-offline-resume.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const policy=()=>({repository:'demo/sandbox',taskId:'TS-123',
  branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/']});
const change='openspec/changes/ts-123/';
const paths=[change+'proposal.md',change+'design.md',change+'tasks.md',change+'specs/demo/spec.md'];
const checklist=complete=>['## Implementation checklist','- ['+(complete?'x':' ')+'] Build',
  '- [x] Tests','## Manual acceptance','- Human visual review',
  '## Post-sync review','- Verify OPSX sync and CI later'].join('\n');
const evidence=()=>({planStrict:true,projectTests:true,scopeGuard:true,
  checklistGate:true,semanticSync:false,archiveStrict:false,independentCi:false});
function event(phase) {
  return {phase,expectedHeadSha:phase==='plan'?A:B,
    observedHeadSha:phase==='plan'?A:B,nextHeadSha:phase==='plan'?B:C,
    intermediatePlanSha:null,changedPaths:phase==='plan'?paths:[change+'tasks.md','site/product.js'],
    checklist:checklist(phase==='apply'),verifications:evidence()};
}
const plan=()=>previewOpenSpecTransition(policy(),null,event('plan')).checkpoint;
const applied=()=>previewOpenSpecTransition(policy(),plan(),event('apply')).checkpoint;
function observation(stage='plan'){
  const apply=stage==='apply';
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:apply?C:B,parentSha:apply?B:A,
    subject:apply?'agent(TS-123): verified implementation checkpoint':
      'agent(TS-123): validated OpenSpec plan checkpoint',
    refExists:true,observedAtSeconds:1000,nowSeconds:1020,
    activeWorkflowRuns:0,openFinalPullRequests:0,
    check:{name:'check',headSha:apply?C:B,appId:15368,
      status:'completed',conclusion:'success'}};
}
const denied=e=>e instanceof OfflineResumeError && e.message.startsWith('R3f-02 DENY:');

test('synthetic matching plan recommends a MANUAL apply, never authorizes it',()=>{
  const result=previewOfflineResume(policy(),[plan()],observation(),15368);
  assert.equal(result.suggestedManualPhase,'apply');
  assert.equal(result.inspectedCheckpointCount,1);
  assert.equal(result.headSha,B);
  assert.ok(Object.isFrozen(result));
  for(const key of ['remoteEvidenceIndependentlyAuthenticated','resumeAuthorized',
    'authorizedToExecute','opsxSemanticSyncInvoked','sourceProvenanceVerified',
    'trustEvidenceIndependentlyVerified','promotionAllowed','writesPerformed'])
    assert.equal(result[key],false,key);
  assert.equal(result.paidApprovalRequired,true);
});
test('linked plan and implementation recommend MANUAL finalize without retry',()=>{
  const value=previewOfflineResume(policy(),[plan(),applied()],observation('apply'),15368);
  assert.equal(value.suggestedManualPhase,'finalize');
  assert.equal(value.inspectedCheckpointCount,2);
  assert.equal(value.resumeAuthorized,false);
});
test('repeated calls deterministic and pure',()=>{
  const o=observation(),p=policy(),chain=[plan()];
  const a=previewOfflineResume(p,chain,o,15368);
  assert.deepEqual(a,previewOfflineResume(p,chain,o,15368));
  assert.equal(o.headSha,B);
  assert.equal(chain[0].headSha,B);
});
test('no checkpoint, extra checkpoint, and incomplete chain fail closed',()=>{
  for(const chain of [[],[applied()],[plan(),plan()],[plan(),applied(),applied()]]){
    assert.throws(()=>previewOfflineResume(policy(),chain,observation(),15368),denied);
  }
});
test('forged digest, altered policy, mismatched chained state rejected',()=>{
  const p=plan();
  const corrupted={...p,digest:'f'.repeat(64)};
  assert.throws(()=>previewOfflineResume(policy(),[corrupted],observation(),15368),denied);
  const alt=policy();alt.allowedProductPrefixes=['tests/'];
  assert.throws(()=>previewOfflineResume(alt,[p],observation(),15368),denied);
  const a={...applied(),previousDigest:'0'.repeat(64)};
  assert.throws(()=>previewOfflineResume(policy(),[plan(),a],observation('apply'),15368),denied);
});
test('unproven auto checkpoint cannot be used to resume without plan chain',()=>{
  const auto=previewOpenSpecTransition(policy(),null,{...event('plan'),phase:'auto',
    nextHeadSha:C,intermediatePlanSha:B,changedPaths:[...paths,'site/product.js'],
    checklist:checklist(true)}).checkpoint;
  assert.throws(()=>previewOfflineResume(policy(),[auto],observation('apply'),15368),denied);
});
for(const [name,alter] of [
  ['repository substitution',o=>o.repository='other/repo'],
  ['branch substitution',o=>o.branch='agent/openspec/TS-999'],
  ['moved remote SHA',o=>o.headSha=C],
  ['wrong parent SHA',o=>o.parentSha=C],
  ['unrecognized commit subject',o=>o.subject='agent(TS-123): fake plan'],
  ['missing remote branch',o=>o.refExists=false],
  ['running workflow',o=>o.activeWorkflowRuns=1],
  ['ambiguous final PR',o=>o.openFinalPullRequests=1],
  ['stale observations',o=>o.nowSeconds=1400],
  ['clock rollback',o=>o.nowSeconds=900],
  ['wrong check SHA',o=>o.check.headSha=C],
  ['wrong check source',o=>o.check.appId=54321],
  ['failed CI',o=>o.check.conclusion='failure'],
  ['CI pending',o=>o.check.status='in_progress'],
  ['extra token field',o=>o.githubToken='TOPSECRET'],
  ['spurious paid approval',o=>o.paidApproved=true],
]){
  test('reject '+name,()=>{
    const o=observation();alter(o);
    assert.throws(()=>previewOfflineResume(policy(),[plan()],o,15368),denied);
  });
}
test('app identity expectation is required, not supplied by task',()=>{
  assert.throws(()=>previewOfflineResume(policy(),[plan()],observation(),0),denied);
  assert.throws(()=>previewOfflineResume(policy(),[plan()],observation(),1234),denied);
});
test('reject observation getter without invoking it',()=>{
  const o=observation();let accessed=false;
  Object.defineProperty(o,'headSha',{get(){accessed=true;return B;}});
  assert.throws(()=>previewOfflineResume(policy(),[plan()],o,15368),denied);
  assert.equal(accessed,false);
});
test('repository source remains unchanged and no network/LLM is involved',()=>{
  const o=observation();const p=policy();const arr=[plan()];
  const result=previewOfflineResume(p,arr,o,15368);
  assert.equal(Object.keys(result).some(key=>/token|secret|transport|writeToken/i.test(key)),false);
  assert.deepEqual(o,observation());assert.equal(arr.length,1);
});
