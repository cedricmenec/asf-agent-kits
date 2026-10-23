import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewOpenSpecTransition } from '../core/openspec-offline-phases.mjs';
import { previewManualPhaseHandoff, ManualPhaseHandoffError } from
  '../core/manual-phase-handoff-preview.mjs';

const config = () => JSON.parse(readFileSync(new URL('../examples/valid-config.json',
  import.meta.url),'utf8'));
const A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40);
const change='openspec/changes/ts-009/';
const planPaths=[change+'proposal.md',change+'design.md',
  change+'tasks.md',change+'specs/example/spec.md'];
const applyPaths=[change+'tasks.md','src/app.js'];
const checklist=(done=false)=>[
  '## Implementation checklist',
  '- ['+(done?'x':' ')+'] Implement',
  '- [x] Verify tests',
  '## Manual acceptance','- human verification pending',
  '## Post-sync review','- manual review pending',
].join('\n');
function event(phase='plan') {
  const plan=phase==='plan';
  return {phase,expectedHeadSha:plan?A:B,observedHeadSha:plan?A:B,
    nextHeadSha:plan?B:C,intermediatePlanSha:null,
    changedPaths:plan?[...planPaths]:[...applyPaths],
    checklist:checklist(!plan),
    verifications:{planStrict:true,projectTests:true,scopeGuard:true,
      checklistGate:true,semanticSync:false,archiveStrict:false,independentCi:false}};
}
function policy(){
  return {repository:'example-owner/example-project',taskId:'TS-009',
    branch:'agent/openspec/TS-009',baseSha:A,allowedProductPrefixes:['src/']};
}
function request(phase='plan'){
  const plan=phase==='plan';
  return {trigger:'manual',repository:'example-owner/example-project',
    actor:'example-owner',profile:'opencode-openspec',taskId:'TS-009',
    phase,model:'openrouter/example/model-id-not-approved',
    targetBranch:'trunk',expectedHeadSha:plan?A:B,observedHeadSha:plan?A:B,
    requiredCheckContexts:['check'],
    changedPaths:plan?[...planPaths]:[...applyPaths]};
}
const evidence=()=>({repository:'example-owner/example-project',
  protectedRef:'refs/heads/trunk',policySha:A,expectedPolicySha:A,
  refProtectionChecked:true});
const slot=()=>({group:'example-agentkit-paid',activePaidJobs:0,
  runAttempt:1,openFinalPullRequests:0});
function fixture(phase='plan') {
  return {config:config(),request:request(phase),evidence:evidence(),
    phasePolicy:policy(),previousCheckpoint:phase==='plan'?null:
      previewOpenSpecTransition(policy(),null,event('plan')).checkpoint,
    event:event(phase),syntheticSlot:slot()};
}
const denied=e=>e instanceof ManualPhaseHandoffError &&
  e.message==='R3h-01 DENY: untrusted or inconsistent manual phase handoff';

test('R3a and R3f plan composed only as read-only mock, no paid grant',()=>{
  const input=fixture();const before=structuredClone(input);
  const out=previewManualPhaseHandoff(input);
  assert.equal(out.phase,'plan');assert.equal(out.nextCheckpointStage,'planned');
  assert.equal(out.checkpointSequence,1);
  assert.equal(out.paidConcurrencyGroup,'example-agentkit-paid');
  assert.equal(out.proposedSyntheticNextSha,B);
  assert.equal(Object.isFrozen(out),true);
  for(const field of ['paidExecutionStarted','independentlyAuthenticatedHost',
    'sourceProvenanceVerified','trustEvidenceIndependentlyVerified',
    'authorizedToExecute','promotionAllowed','writesPerformed'])
    assert.equal(out[field],false,field);
  assert.equal(out.paidApprovalRequired,true);
  assert.deepEqual(input,before);
  assert.deepEqual(previewManualPhaseHandoff(input),out);
});
test('plan checkpoint -> apply is consistent only on exact mocked Git SHA',()=>{
  const out=previewManualPhaseHandoff(fixture('apply'));
  assert.equal(out.phase,'apply');assert.equal(out.nextCheckpointStage,'implemented');
  assert.equal(out.checkpointSequence,2);
  assert.equal(out.observedSyntheticHeadSha,B);
  assert.equal(out.proposedSyntheticNextSha,C);
  assert.equal(out.authorizedToExecute,false);
});
for(const [name,mutate,phase='plan'] of [
  ['concurrent paid job',f=>f.syntheticSlot.activePaidJobs=1],
  ['paid retry attempt',f=>f.syntheticSlot.runAttempt=2],
  ['unexpected final PR',f=>f.syntheticSlot.openFinalPullRequests=1],
  ['different mutex',f=>f.syntheticSlot.group='other-paid'],
  ['slot authority field',f=>f.syntheticSlot.authorizedToExecute=true],
  ['request paid approval',f=>f.request.paidApproved=true],
  ['extra mock observation',f=>f.evidence.githubToken='TOPSECRET'],
  ['injected workflow',f=>f.request.workflow_call=true],
  ['direct kit',f=>{f.config.kits['opencode-direct'].enabled=true;
    f.request.profile='opencode-direct';}],
  ['wrong phase policy branch',f=>f.phasePolicy.branch='agent/openspec/TS-100'],
  ['wrong task',f=>f.phasePolicy.taskId='TS-010'],
  ['wrong repo',f=>f.phasePolicy.repository='another/repo'],
  ['changed policy prefixes',f=>f.phasePolicy.allowedProductPrefixes=['tests/']],
  ['phase mismatched',f=>f.event.phase='apply'],
  ['path mismatched',f=>f.event.changedPaths.push('src/extra.js')],
  ['request path mismatched',f=>f.request.changedPaths.pop()],
  ['wrong event SHA',f=>f.event.expectedHeadSha=B],
  ['stale observed ref',f=>f.request.observedHeadSha=B],
  ['phantom prior plan',f=>f.previousCheckpoint={
    stage:'planned',headSha:B}],
  ['forged next head',f=>f.event.nextHeadSha=A],
  ['fake independent CI',f=>f.event.verifications.independentCi=true],
  ['unchecked apply checklist',f=>f.event.checklist=checklist(false),'apply'],
  ['tampered prior digest',f=>{f.previousCheckpoint={...f.previousCheckpoint,digest:'0'.repeat(64)};},'apply'],
  ['stale apply SHA',f=>f.request.expectedHeadSha=A,'apply'],
  ['moved apply event SHA',f=>f.event.expectedHeadSha=A,'apply'],
  ['unknown top-level override',f=>f.modelToken='TOPSECRET'],
]){
  test('R3h fail closed: '+name,()=>{
    const f=fixture(phase);mutate(f);
    assert.throws(()=>previewManualPhaseHandoff(f),denied);
  });
}
test('malicious getters are rejected before side effects',()=>{
  const f=fixture();let invoked=false;
  Object.defineProperty(f.request,'actor',{get(){invoked=true;throw Error('TOPSECRET');}});
  assert.throws(()=>previewManualPhaseHandoff(f),denied);assert.equal(invoked,false);
});
test('nested symbol/extra array properties and cyclic objects refused',()=>{
  const f=fixture();f.event.changedPaths.extra='x';
  assert.throws(()=>previewManualPhaseHandoff(f),denied);
  const g=fixture();g.config[Symbol('credential')]='TOPSECRET';
  assert.throws(()=>previewManualPhaseHandoff(g),denied);
  const h=fixture();h.cycle=h;
  assert.throws(()=>previewManualPhaseHandoff(h),denied);
});
test('refusal never leaks model/provider credentials',()=>{
  const f=fixture();f.request.token='VERY_SECRET_API_KEY';
  assert.throws(()=>previewManualPhaseHandoff(f),
    error=>denied(error)&&!error.message.includes('VERY_SECRET_API_KEY'));
});
