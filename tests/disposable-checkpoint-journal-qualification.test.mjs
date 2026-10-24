import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { previewCheckpointJournalAppend } from '../core/checkpoint-journal-preview.mjs';
import { qualifyDisposableCheckpointJournal, DisposableJournalFixtureError } from
  '../core/disposable-checkpoint-journal-qualification.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const policy=()=>({repository:'demo/sandbox',taskId:'TS-123',
  branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/']});
const prefix='openspec/changes/ts-123/';
const planPaths=[prefix+'proposal.md',prefix+'design.md',prefix+'tasks.md',
  prefix+'specs/demo/spec.md'];
const applyPaths=[prefix+'tasks.md','site/product.js'];
const checklist=done=>['## Implementation checklist',
  '- ['+(done?'x':' ')+'] Implement','- [x] Tests',
  '## Manual acceptance','- Owner pending',
  '## Post-sync review','- Owner pending'].join('\n');
function event(phase) {
  const plan=phase==='plan';
  return {phase,expectedHeadSha:plan?A:B,observedHeadSha:plan?A:B,
    nextHeadSha:plan?B:C,intermediatePlanSha:null,
    changedPaths:plan?[...planPaths]:[...applyPaths],
    checklist:checklist(!plan),verifications:{planStrict:true,
      projectTests:true,scopeGuard:true,checklistGate:true,
      semanticSync:false,archiveStrict:false,independentCi:false}};
}
const plan=()=>previewCheckpointJournalAppend(policy(),[],event('plan')).entry;
function chain(phase='plan') {
  const p=plan();
  return phase==='apply'?[p,previewCheckpointJournalAppend(policy(),[p],event('apply')).entry]:[p];
}
function observation(entries) {
  const x=entries.at(-1);
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:x.headSha,parentSha:x.parentSha,journalDigest:x.digest,
    mutexGroup:'demo-paid',activePaidJobs:0,runAttempt:1,openFinalPullRequests:0};
}
const denied=e=>e instanceof DisposableJournalFixtureError &&
  e.message==='R3h-03 DENY: disposable checkpoint journal bytes inconsistent';
const fixtureNames=()=>new Set(readdirSync(tmpdir()).filter(s=>s.startsWith('asf-r3h03-')));
test('actual temporary bytes checked after fsync, read and JSON replay for plan and apply',()=>{
  const before=fixtureNames();
  for(const phase of ['plan','apply']){
    const entries=chain(phase);const copy=JSON.parse(JSON.stringify(entries));
    const result=qualifyDisposableCheckpointJournal(policy(),entries,
      observation(entries),'demo-paid');
    assert.equal(result.disposableByteReadMatched,true);
    assert.equal(result.fileFsyncCompleted,true);
    assert.equal(result.disposableLocalWritesPerformed,true);
    assert.equal(result.temporaryFileRetained,false);
    for(const flag of ['targetRepositoryWritesPerformed','gitRefsWritten',
      'checkpointBytesDurablyStored','independentlyAuthenticatedHost',
      'mutexIndependentlyVerified','resumeAuthorized','authorizedToExecute',
      'sourceProvenanceVerified','trustEvidenceIndependentlyVerified','promotionAllowed'])
      assert.equal(result[flag],false,flag);
    assert.equal(result.paidApprovalRequired,true);
    assert.equal(result.inspectedEntries,entries.length);
    assert.deepEqual(JSON.parse(JSON.stringify(entries)),copy);
  }
  assert.deepEqual(fixtureNames(),before,'all owned temp directories removed');
});
for(const fault of ['truncate','flip','replace','symlink',
  'world-readable','hardlink','extra-file']){
  test('real-byte mutation rejected and temporary root cleaned: '+fault,()=>{
    const before=fixtureNames(),entries=chain();
    assert.throws(()=>qualifyDisposableCheckpointJournal(policy(),entries,
      observation(entries),'demo-paid',fault),denied);
    assert.deepEqual(fixtureNames(),before);
  });
}
test('synthetic Git SHA, mutex, retry, and unauthorized path injection fail before filesystem I/O',()=>{
  const before=fixtureNames(),entries=chain();
  for(const mutate of [
    o=>o.headSha=C,o=>o.journalDigest='0'.repeat(64),
    o=>o.mutexGroup='wrong',o=>o.runAttempt=2,
    o=>o.activePaidJobs=1,o=>o.token='SENSITIVE_TOKEN',
  ]) {
    const o=observation(entries);mutate(o);
    assert.throws(()=>qualifyDisposableCheckpointJournal(policy(),entries,o,
      'demo-paid'),denied);
  }
  assert.throws(()=>qualifyDisposableCheckpointJournal(policy(),entries,
    observation(entries),'demo-paid','/tmp/evil'),denied);
  assert.deepEqual(fixtureNames(),before);
});
test('plain serialized journal input accepted without changing the caller data',()=>{
  const original=chain('apply'),copies=JSON.parse(JSON.stringify(original));
  const output=qualifyDisposableCheckpointJournal(policy(),copies,
    observation(copies),'demo-paid','none');
  assert.equal(output.syntheticHeadSha,C);
  assert.deepEqual(copies,JSON.parse(JSON.stringify(original)));
});
