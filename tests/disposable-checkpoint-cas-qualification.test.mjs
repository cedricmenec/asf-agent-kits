import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { previewCheckpointJournalAppend } from '../core/checkpoint-journal-preview.mjs';
import {
  qualifyDisposableCheckpointCas, DisposableCasError
} from '../core/disposable-checkpoint-cas-qualification.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const policy=()=>({repository:'demo/sandbox',taskId:'TS-123',
  branch:'agent/openspec/TS-123',baseSha:A,
  allowedProductPrefixes:['site/']});
const change='openspec/changes/ts-123/';
const planPaths=[change+'proposal.md',change+'design.md',
  change+'tasks.md',change+'specs/demo/spec.md'];
const applyPaths=[change+'tasks.md','site/product.js'];
const checklist=done=>['## Implementation checklist',
  '- ['+(done?'x':' ')+'] Implement','- [x] Test',
  '## Manual acceptance','- human pending','## Post-sync review',
  '- review pending'].join('\n');
function event(phase) {
  const plan=phase==='plan';
  return {phase,expectedHeadSha:plan?A:B,observedHeadSha:plan?A:B,
    nextHeadSha:plan?B:C,intermediatePlanSha:null,
    changedPaths:plan?[...planPaths]:[...applyPaths],
    checklist:checklist(!plan),verifications:{planStrict:true,
      projectTests:true,scopeGuard:true,checklistGate:true,
      semanticSync:false,archiveStrict:false,independentCi:false}};
}
function entries() {
  const first=previewCheckpointJournalAppend(policy(),[],event('plan')).entry;
  const second=previewCheckpointJournalAppend(policy(),[first],event('apply')).entry;
  return [first,second];
}
function observation(chain) {
  const last=chain.at(-1);
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:last.headSha,parentSha:last.parentSha,journalDigest:last.digest,
    mutexGroup:'demo-paid',activePaidJobs:0,runAttempt:1,
    openFinalPullRequests:0};
}
const denied=e=>e instanceof DisposableCasError &&
  e.message==='R3h-04 DENY: isolated local checkpoint CAS inconsistent';
const roots=()=>new Set(readdirSync(tmpdir()).filter(s=>s.startsWith('asf-r3h04-')));
test('plan to apply uses single local CAS with exact stored journal and cleans root',()=>{
  const before=roots(),chain=entries(),copy=JSON.parse(JSON.stringify(chain));
  const out=qualifyDisposableCheckpointCas(policy(),chain,observation(chain),'demo-paid');
  assert.equal(out.localCompareAndSwapExercised,true);
  assert.equal(out.localCasCompleted,true);
  assert.equal(out.simulatedInterruptedWriteRetainedPrevious,false);
  assert.equal(out.disposableLocalWritesPerformed,true);
  assert.equal(out.temporaryFileRetained,false);
  assert.equal(out.syntheticAppliedHeadSha,C);
  for(const flag of ['targetRepositoryWritesPerformed','gitRefsWritten',
    'checkpointBytesDurablyStored','independentlyAuthenticatedHost',
    'mutexIndependentlyVerified','resumeAuthorized','authorizedToExecute',
    'sourceProvenanceVerified','trustEvidenceIndependentlyVerified','promotionAllowed'])
    assert.equal(out[flag],false,flag);
  assert.equal(out.paidApprovalRequired,true);
  assert.deepEqual(JSON.parse(JSON.stringify(chain)),copy);
  assert.deepEqual(roots(),before);
});
test('simulated process crash before rename preserves last coherent plan (no retry)',()=>{
  const before=roots(),chain=entries();
  const out=qualifyDisposableCheckpointCas(policy(),chain,observation(chain),
    'demo-paid','crash-before-rename');
  assert.equal(out.localCasCompleted,false);
  assert.equal(out.simulatedInterruptedWriteRetainedPrevious,true);
  assert.equal(out.syntheticAppliedHeadSha,null);
  assert.equal(out.resumeAuthorized,false);
  assert.equal(out.paidApprovalRequired,true);
  assert.deepEqual(roots(),before);
});
for(const fault of ['stale-version','replay','symlink','hardlink',
  'world-readable','interprocess-orphan-lock','corrupt-current','missing-current']) {
  test('fail closed on local CAS/lock/file fault: '+fault,()=>{
    const before=roots(),chain=entries();
    assert.throws(()=>qualifyDisposableCheckpointCas(policy(),chain,
      observation(chain),'demo-paid',fault),denied);
    assert.deepEqual(roots(),before,'no isolated fixture leaked');
  });
}
for(const [name,change] of [
  ['wrong head SHA',o=>o.headSha=A],
  ['wrong mutex group',o=>o.mutexGroup='another-paid'],
  ['concurrent paid run',o=>o.activePaidJobs=1],
  ['paid retry',o=>o.runAttempt=2],
  ['extra injected authority',o=>o.authorizedToExecute=true],
]) {
  test('observation is invalid before FS access: '+name,()=>{
    const before=roots(),chain=entries(),obs=observation(chain);change(obs);
    assert.throws(()=>qualifyDisposableCheckpointCas(policy(),chain,obs,
      'demo-paid'),denied);
    assert.deepEqual(roots(),before);
  });
}
test('reject arbitrary fault string and malformed chain before FS I/O',()=>{
  const before=roots(),chain=entries();
  assert.throws(()=>qualifyDisposableCheckpointCas(policy(),chain,
    observation(chain),'demo-paid','/tmp/repo'),denied);
  const wrong=JSON.parse(JSON.stringify(chain));
  wrong[1].previousDigest='0'.repeat(64);
  assert.throws(()=>qualifyDisposableCheckpointCas(policy(),wrong,
    observation(chain),'demo-paid'),denied);
  assert.deepEqual(roots(),before);
});
test('reject an accessor before it is evaluated',()=>{
  const before=roots(),chain=entries();let called=false;
  Object.defineProperty(chain[0].event,'phase',{get(){called=true;return 'plan';}});
  assert.throws(()=>qualifyDisposableCheckpointCas(policy(),chain,
    observation(entries()),'demo-paid'),denied);
  assert.equal(called,false);
  assert.deepEqual(roots(),before);
});
