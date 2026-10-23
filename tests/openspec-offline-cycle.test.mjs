import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewIntegratedOpenSpecCycle as cycle, OfflineHarnessError } from '../core/openspec-offline-cycle.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const H=x=>x.repeat(64),P='openspec/changes/ts-123/';
const S='openspec/specs/widgets/spec.md',ARCH='openspec/changes/archive/2026-10-23-ts-123/';
const f=(path,sha)=>({path,sha256:H(sha),mode:'100644',type:'file'});
const checklist=done=>['## Implementation checklist','- ['+(done?'x':' ')+'] Implement safely',
  '- [x] Check unit tests','## Manual acceptance','- Human keyboard test pending',
  '## Post-sync review','- Review actual PR CI later'].join('\n');
const checks=finalize=>({planStrict:true,projectTests:true,scopeGuard:true,
  checklistGate:true,semanticSync:finalize,archiveStrict:finalize,independentCi:false});
const changedPlan=()=>[P+'proposal.md',P+'design.md',P+'tasks.md',P+'specs/widgets/spec.md'];
const phase=kind=>{
  const from=kind==='plan'?A:kind==='apply'?B:C;
  return {phase:kind,expectedHeadSha:from,observedHeadSha:from,
    nextHeadSha:kind==='plan'?B:kind==='apply'?C:D,intermediatePlanSha:null,
    changedPaths:kind==='plan'?changedPlan():kind==='apply'?[P+'tasks.md','site/feature.js']:
      [S,ARCH+'proposal.md',ARCH+'tasks.md'],
    checklist:checklist(kind!=='plan'),verifications:checks(kind==='finalize')};
};
function observed(stage){
  const apply=stage==='apply',head=apply?C:B;
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:head,parentSha:apply?B:A,
    subject:apply?'agent(TS-123): verified implementation checkpoint':
      'agent(TS-123): validated OpenSpec plan checkpoint',
    refExists:true,observedAtSeconds:1000,nowSeconds:1010,
    activeWorkflowRuns:0,openFinalPullRequests:0,
    check:{name:'check',headSha:head,appId:15368,status:'completed',conclusion:'success'}};
}
const before=()=>({headSha:C,files:[f('docs/product/README.md','1'),
  f(P+'proposal.md','2'),f(P+'tasks.md','3'),f(S,'4')]});
const after=()=>({headSha:C,files:[f('docs/product/README.md','1'),
  f(P+'proposal.md','2'),f(P+'tasks.md','3'),f(S,'5')]});
const archive=()=>({headSha:C,files:[f('docs/product/README.md','1'),
  f(S,'5'),f(ARCH+'proposal.md','2'),f(ARCH+'tasks.md','3')]});
function fixture(){
  return {hostPolicy:{repository:'demo/sandbox',taskId:'TS-123',
    branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/']},
    phaseInputs:{plan:phase('plan'),apply:phase('apply'),finalize:phase('finalize')},
    remoteObservations:{plan:observed('plan'),apply:observed('apply')},
    independentCheckAppId:15368,syncPolicy:{taskId:'TS-123',headSha:C,canonicalPaths:[S]},
    syncSnapshots:{before:before(),after:after(),archived:archive()},archiveDate:'2026-10-23'};
}
const denied=e=>e instanceof OfflineHarnessError&&e.message.startsWith('R3f-04 DENY:');

test('entire mock cycle composes and never authorizes a model or write',()=>{
  const input=fixture(),output=cycle(input);
  assert.deepEqual(output.simulatedPhases,['plan','apply','sync-preview','archive-preview','finalize']);
  assert.equal(output.checkpointSequence,3);
  assert.equal(output.finalMockHeadSha,D);
  assert.equal(output.archivedFilesReviewed,2);
  assert.equal(output.canonicalFilesReviewed,1);
  assert.equal(Object.isFrozen(output),true);
  for(const key of ['remoteEvidenceIndependentlyAuthenticated',
    'semanticRequirementsIndependentlyVerified','opsxCommandInvoked',
    'authorizedToExecute','trustEvidenceIndependentlyVerified','sourceProvenanceVerified',
    'promotionAllowed','writesPerformed'])assert.equal(output[key],false,key);
  assert.equal(output.paidApprovalRequired,true);
});
test('stable deterministic output and no mutations to fixture',()=>{
  const input=fixture(),original=structuredClone(input);
  assert.deepEqual(cycle(input),cycle(input));
  assert.deepEqual(input,original);
});
for(const [name,change] of [
  ['plan artifact missing',x=>x.phaseInputs.plan.changedPaths.shift()],
  ['apply checklist incomplete',x=>x.phaseInputs.apply.checklist=checklist(false)],
  ['stale apply commit',x=>x.phaseInputs.apply.expectedHeadSha=A],
  ['mismatched task identity',x=>x.hostPolicy.taskId='TS-222'],
  ['different sync head',x=>x.syncPolicy.headSha=B],
  ['unreviewed canonical mutation',x=>x.syncSnapshots.after.files.push(f('openspec/specs/foreign/spec.md','7'))],
  ['changed product during sync',x=>x.syncSnapshots.after.files[0].sha256=H('8')],
  ['archive missing file',x=>x.syncSnapshots.archived.files.pop()],
  ['wrong parent in plan proof',x=>x.remoteObservations.plan.parentSha=D],
  ['CI rejected',x=>x.remoteObservations.apply.check.conclusion='failure'],
  ['parallel paid run',x=>x.remoteObservations.plan.activeWorkflowRuns=1],
  ['finalize unrelated path',x=>x.phaseInputs.finalize.changedPaths.push('site/extra.js')],
  ['wrong date',x=>x.archiveDate='2026-99-99'],
  ['untrusted model field',x=>x.providerToken='TOPSECRET'],
  ['unexpected paid retry',x=>x.retryPaid=true],
  ['mock forged authority claim',x=>x.remoteObservations.apply.authorizedToExecute=true],
  ['unapproved check app',x=>x.independentCheckAppId=2],
]){
  test('mock integration rejects '+name,()=>{
    const input=fixture();change(input);
    assert.throws(()=>cycle(input),denied);
  });
}
test('returned error never includes potential credentials from bad fixture',()=>{
  const input=fixture();
  input.phaseInputs.apply.apiKey='TOPSECRET';
  assert.throws(()=>cycle(input),error=>denied(error)&&!error.message.includes('TOPSECRET'));
});
