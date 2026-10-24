import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckpointJournalError, previewCheckpointJournalAppend,
  previewCheckpointJournalRecovery
} from '../core/checkpoint-journal-preview.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const policy=()=>({repository:'demo/sandbox',taskId:'TS-123',
  branch:'agent/openspec/TS-123',baseSha:A,
  allowedProductPrefixes:['site/']});
const change='openspec/changes/ts-123/';
const planned=[change+'proposal.md',change+'design.md',change+'tasks.md',
  change+'specs/demo/spec.md'];
const implemented=[change+'tasks.md','site/product.js'];
const finalized=['openspec/specs/demo/spec.md',
  'openspec/changes/archive/2026-10-24-ts-123/tasks.md'];
const checklist=done=>['## Implementation checklist',
  '- ['+(done?'x':' ')+'] Ship implementation','- [x] Test',
  '## Manual acceptance','- Owner acceptance pending',
  '## Post-sync review','- Owner review pending'].join('\n');
function event(phase) {
  const at={plan:[A,B,planned],apply:[B,C,implemented],
    finalize:[C,D,finalized]}[phase];
  const finalize=phase==='finalize';
  return {phase,expectedHeadSha:at[0],observedHeadSha:at[0],
    nextHeadSha:at[1],intermediatePlanSha:null,
    changedPaths:[...at[2]],checklist:checklist(phase!=='plan'),
    verifications:{planStrict:true,projectTests:true,scopeGuard:true,
      checklistGate:true,semanticSync:finalize,archiveStrict:finalize,
      independentCi:false}};
}
const write=(entries,phase)=>
  previewCheckpointJournalAppend(policy(),entries,event(phase)).entry;
const plan=()=>write([],'plan');
const applied=()=>write([plan()],'apply');
function journal2(){const p=plan();return [p,write([p],'apply')];}
function observation(last) {
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:last.headSha,parentSha:last.parentSha,
    journalDigest:last.digest,mutexGroup:'sandbox-paid',
    activePaidJobs:0,runAttempt:1,openFinalPullRequests:0};
}
const denied = err => err instanceof CheckpointJournalError &&
  err.message==='R3h-02 DENY: invalid, stale or untrusted checkpoint journal';
const roundTrip=x=>JSON.parse(JSON.stringify(x));
test('plan journal is versioned, hash chained, JSON serializable, non-authorizing',()=>{
  const input=event('plan'); const before=structuredClone(input);
  const output=previewCheckpointJournalAppend(policy(),[],input);
  const entry=output.entry;
  assert.equal(entry.version,1); assert.equal(entry.phase,'plan');
  assert.equal(entry.sequence,1);assert.equal(entry.parentSha,A);assert.equal(entry.headSha,B);
  assert.equal(entry.previousDigest,null);
  assert.match(entry.digest,/^[a-f0-9]{64}$/);
  assert.deepEqual(roundTrip(entry),roundTrip(plan()));
  assert.equal(Object.isFrozen(entry),true);
  assert.equal(Object.isFrozen(entry.event.changedPaths),true);
  assert.equal(Object.isFrozen(entry.checkpoint),true);
  assert.deepEqual(input,before);
  for(const key of ['checkpointBytesDurablyStored','hostEvidenceIndependentlyAuthenticated',
    'resumeAuthorized','authorizedToExecute','writesPerformed','sourceProvenanceVerified',
    'trustEvidenceIndependentlyVerified','promotionAllowed'])
    assert.equal(output[key],false,key);
  assert.equal(output.paidApprovalRequired,true);
});
test('apply and finalize bind plan checkpoint digest and previous receipt exactly',()=>{
  const p=plan(), a=write([p],'apply'), f=write([p,a],'finalize');
  assert.equal(a.sequence,2);assert.equal(a.previousDigest,p.digest);
  assert.equal(a.planCheckpointDigest,p.checkpoint.digest);
  assert.equal(a.parentSha,B);assert.equal(a.headSha,C);
  assert.equal(f.sequence,3);assert.equal(f.previousDigest,a.digest);
  assert.equal(f.planCheckpointDigest,p.checkpoint.digest);
  assert.equal(f.parentSha,C);assert.equal(f.headSha,D);
  assert.deepEqual(roundTrip(f),roundTrip(write(roundTrip([p,a]),'finalize')));
});
test('serialized journal suggests only manually approved apply and finalize',()=>{
  const p=plan(), a=write([p],'apply');
  const r1=previewCheckpointJournalRecovery(policy(),roundTrip([p]),
    observation(p),'sandbox-paid');
  assert.equal(r1.suggestedNextManualPhase,'apply');
  assert.equal(r1.inspectedEntries,1);
  const r2=previewCheckpointJournalRecovery(policy(),roundTrip([p,a]),
    observation(a),'sandbox-paid');
  assert.equal(r2.suggestedNextManualPhase,'finalize');
  for(const x of [r1,r2]) {
    assert.equal(x.resumeAuthorized,false);
    assert.equal(x.mutexIndependentlyVerified,false);
    assert.equal(x.hostEvidenceIndependentlyAuthenticated,false);
    assert.equal(x.paidApprovalRequired,true);
  }
});
for(const [name,alter] of [
  ['replayed plan',l=>l.push(l[0])],
  ['missing plan',l=>l.shift()],
  ['duplicate apply',l=>l.push(l[1])],
  ['rollback first stage',l=>l[0].phase='apply'],
  ['bad version',l=>l[1].version=2],
  ['wrong repository',l=>l[1].repository='attacker/repo'],
  ['changed policy digest',l=>l[1].policyDigest='0'.repeat(64)],
  ['changed plan checkpoint digest',l=>l[1].planCheckpointDigest='0'.repeat(64)],
  ['changed next Git SHA',l=>l[1].headSha=D],
  ['changed parent SHA',l=>l[1].parentSha=A],
  ['changed step digest',l=>l[1].previousDigest='f'.repeat(64)],
  ['changed receipt hash',l=>l[1].digest='f'.repeat(64)],
  ['tampered R3f checkpoint',l=>l[1].checkpoint.headSha=D],
  ['changed implementation path',l=>l[1].event.changedPaths[1]='.github/workflows/ci.yml'],
  ['unknown authority grant',l=>l[1].authorizedToExecute=true],
  ['replayed phase event',l=>l[1].event.phase='plan'],
  ['injected token',l=>l[1].event.token='secret'],
]){
  test('deny corrupted, replayed or injected serialized journal: '+name,()=>{
    const entries=roundTrip(journal2());alter(entries);
    assert.throws(()=>previewCheckpointJournalRecovery(policy(),entries,
      observation(journal2()[1]),'sandbox-paid'),denied);
    assert.throws(()=>previewCheckpointJournalAppend(policy(),entries,event('finalize')),denied);
  });
}
test('no skip, auto phase, finalize without apply, or further paid phase',()=>{
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[],event('apply')),denied);
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[plan()],event('finalize')),denied);
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[],{...event('plan'),phase:'auto'}),denied);
  const p=plan(),a=write([p],'apply'),f=write([p,a],'finalize');
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[p,a,f],event('plan')),denied);
  assert.throws(()=>previewCheckpointJournalRecovery(policy(),[p,a,f],
    observation(f),'sandbox-paid'),denied);
});
for(const [name,change] of [
  ['head changed',o=>o.headSha=D],
  ['parent changed',o=>o.parentSha=C],
  ['journal changed',o=>o.journalDigest='f'.repeat(64)],
  ['wrong repository',o=>o.repository='malicious/repo'],
  ['branch moved',o=>o.branch='agent/openspec/TS-999'],
  ['wrong mutex group',o=>o.mutexGroup='wrong'],
  ['paid concurrent work',o=>o.activePaidJobs=1],
  ['paid retry',o=>o.runAttempt=2],
  ['ambiguous final PR',o=>o.openFinalPullRequests=1],
  ['fabricated independent authorization',o=>o.authorizedToExecute=true],
  ['extra credential',o=>o.token='TOPSECRET'],
]){
  test('deny untrusted recovery observation: '+name,()=>{
    const p=plan(),obs=observation(p);change(obs);
    assert.throws(()=>previewCheckpointJournalRecovery(policy(),[p],obs,'sandbox-paid'),denied);
  });
}
test('policy changes, even allowed path scope, invalidate all old journals',()=>{
  const p=plan(),policy2=policy();policy2.allowedProductPrefixes=['src/'];
  assert.throws(()=>previewCheckpointJournalRecovery(policy2,[p],observation(p),
    'sandbox-paid'),denied);
});
test('reject nested accessors without running their getter',()=>{
  const p=roundTrip(plan());let invoked=false;
  Object.defineProperty(p.event,'phase',{get(){invoked=true;return 'plan';}});
  assert.throws(()=>previewCheckpointJournalRecovery(policy(),[p],
    observation(plan()),'sandbox-paid'),denied);
  assert.equal(invoked,false);
});
test('reject cycles, symbols, polluted keys, array holes, and unserializable values',()=>{
  const p=roundTrip(plan());p.event.cycle=p.event;
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[p],event('apply')),denied);
  const s=roundTrip(plan());s[Symbol('admin')]=true;
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[s],event('apply')),denied);
  const e=event('plan');delete e.changedPaths[0];
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[],e),denied);
  const n=event('plan');n.verifications.planStrict=()=>true;
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[],n),denied);
  const b=roundTrip(plan());Object.defineProperty(b,'__proto__',{value:{isAdmin:true},enumerable:true});
  assert.throws(()=>previewCheckpointJournalAppend(policy(),[b],event('apply')),denied);
});
test('refusal hides fake secret in error messages',()=>{
  const o=observation(plan());o.token='SENSITIVE_DO_NOT_ECHO';
  assert.throws(()=>previewCheckpointJournalRecovery(policy(),[plan()],o,'sandbox-paid'),
    err=>denied(err)&&!err.message.includes('SENSITIVE_DO_NOT_ECHO'));
});
