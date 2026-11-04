/**
 * R3g-05: disposable Git commit + fd-relative bytes + mock OpenSpec cycle.
 * Integration tests only. Never run against an actual user repository.
 */
import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inventory_fdrelative } from '../tools/inventory_fdrelative.mjs';
import { verify_local_git_fixture } from '../tools/verify_local_git_fixture.mjs';
import { openRoot } from '../tools/node/secure-fs.mjs';
import { closeSync } from 'node:fs';
import { previewIntegratedOpenSpecCycle } from '../core/openspec-offline-cycle.mjs';
import { previewLocalFixtureQualification } from '../core/local-fixture-qualification.mjs';

let procfsAvailable=false;try{const fd=openRoot(process.cwd());closeSync(fd);procfsAvailable=true;}catch{}
function test(name, options, fn) {
  if (typeof options === 'function') { fn=options; options={}; }
  return nativeTest(name, options, t=> {
    if (!procfsAvailable) {
      assert.notEqual(process.env.CI, 'true', 'Linux procfs required in CI');
      t.skip('Local filesystem broker lacks procfs descriptors'); return;
    }
    return fn(t);
  });
}
const A='a'.repeat(40), B='b'.repeat(40), D='d'.repeat(40);
const TASK='TS-123', P='openspec/changes/ts-123/';
const S='openspec/specs/widgets/spec.md', PRODUCT='docs/product/guide.md';
const DATE='2026-10-23', ARCH='openspec/changes/archive/'+DATE+'-ts-123/';
const old={ [PRODUCT]:'Product overlay\n', [P+'proposal.md']:'Proposal body\n',
  [P+'tasks.md']:'- [x] implemented\n', [S]:'Canonical v1\n' };
const changed={...old,[S]:'Canonical v2\n'};
const archived={ [PRODUCT]:old[PRODUCT], [S]:changed[S],
  [ARCH+'proposal.md']:old[P+'proposal.md'],
  [ARCH+'tasks.md']:old[P+'tasks.md'] };
const sha256=x=>createHash('sha256').update(x).digest('hex');
const CHECK_APP=15368;
const GIT_ENV={...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_TERMINAL_PROMPT:'0', GIT_NO_REPLACE_OBJECTS:'1'};
function git(repo,...args){
  return execFileSync('git',['-C',repo,...args],{
    encoding:'utf8',env:GIT_ENV,timeout:5000,maxBuffer:1048576}).trim();
}
async function stage(root,files){
  for(const [path,body] of Object.entries(files)){
    const location=join(root,path);
    await mkdir(dirname(location),{recursive:true});
    await writeFile(location,body,{mode:0o600});
  }
}
async function fixture(callback){
  const root=await mkdtemp(join(tmpdir(),'asf-r3g05-'));
  try {
    const repo=join(root,'git-fixture');
    await mkdir(repo);
    git(repo,'init','-q');
    await stage(repo,old);
    git(repo,'add','--','.');
    git(repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
      'commit','-qm','disposable OpenSpec snapshot');
    const head=git(repo,'rev-parse','HEAD');
    for(const [dir,files] of [['before',old],['after',changed],['archived',archived]])
      await stage(join(root,dir),files);
    const paths={before:Object.keys(old),after:Object.keys(changed),archived:Object.keys(archived)};
    const input={fixtureRoot:root,headSha:head,expectedPaths:paths,
      lock:{headSha:head,files:Object.entries(old).map(([path,body])=>
        ({path,sha256:sha256(body)}))},
      syncPolicy:{taskId:TASK,headSha:head,canonicalPaths:[S]},
      checkpoint:null,archiveDate:DATE};
    return await callback({root,repo,head,paths,input});
  } finally { await rm(root,{recursive:true,force:true}); }
}
// Descriptor-anchored Node inspection, independently of the advisory previews.
function nodeProof({repo,root,head,paths}) {
  const proof=verify_local_git_fixture(join(repo,'.git'),join(root,'before'),head,paths.before);
  const shots=Object.fromEntries(['before','after','archived'].map(stage=>[stage,inventory_fdrelative(join(root,stage),head,paths[stage])]));
  return {proof,shots};
}
const checklist=done=>['## Implementation checklist',
  '- ['+(done?'x':' ')+'] Implement safely','- [x] Check unit tests',
  '## Manual acceptance','- Manual review remains pending',
  '## Post-sync review','- Independent review remains pending'].join('\n');
const checks=final=>({planStrict:true,projectTests:true,scopeGuard:true,
  checklistGate:true,semanticSync:final,archiveStrict:final,independentCi:false});
function phase(stage,head){
  const from=stage==='plan'?A:stage==='apply'?B:head;
  const to=stage==='plan'?B:stage==='apply'?head:D;
  return {phase:stage,expectedHeadSha:from,observedHeadSha:from,
    nextHeadSha:to,intermediatePlanSha:null,
    changedPaths:stage==='plan'?[P+'proposal.md',P+'design.md',P+'tasks.md',
      P+'specs/widgets/spec.md']:stage==='apply'?[P+'tasks.md','site/feature.js']:
      [S,ARCH+'proposal.md',ARCH+'tasks.md'],
    checklist:checklist(stage!=='plan'),verifications:checks(stage==='finalize')};
}
function observed(stage,head){
  const apply=stage==='apply',sha=apply?head:B;
  return {repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:sha,parentSha:apply?B:A,
    subject:apply?'agent(TS-123): verified implementation checkpoint':
      'agent(TS-123): validated OpenSpec plan checkpoint',
    refExists:true,observedAtSeconds:1000,nowSeconds:1010,
    activeWorkflowRuns:0,openFinalPullRequests:0,
    check:{name:'check',headSha:sha,appId:CHECK_APP,
      status:'completed',conclusion:'success'}};
}
function cycleInput(head,shots){
  return {hostPolicy:{repository:'demo/sandbox',taskId:TASK,
    branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/']},
    phaseInputs:{plan:phase('plan',head),apply:phase('apply',head),
      finalize:phase('finalize',head)},
    remoteObservations:{plan:observed('plan',head),apply:observed('apply',head)},
    independentCheckAppId:CHECK_APP,
    syncPolicy:{taskId:TASK,headSha:head,canonicalPaths:[S]},
    syncSnapshots:{before:shots.before,after:shots.after,archived:shots.archived},
    archiveDate:DATE};
}
async function recipe(f,mutate=()=>{}){
  const inspected=nodeProof(f);
  const cycle=cycleInput(f.head,inspected.shots);
  const plan=(await import('../core/openspec-offline-phases.mjs'))
    .previewOpenSpecTransition(cycle.hostPolicy,null,cycle.phaseInputs.plan);
  const applied=(await import('../core/openspec-offline-phases.mjs'))
    .previewOpenSpecTransition(cycle.hostPolicy,plan.checkpoint,cycle.phaseInputs.apply);
  const local={...f.input,checkpoint:{hostPolicy:cycle.hostPolicy,
    chain:[plan.checkpoint,applied.checkpoint],observed:cycle.remoteObservations.apply,
    checkAppId:CHECK_APP}};
  await mutate({f,cycle,local,inspected});
  const integrated=previewIntegratedOpenSpecCycle(cycle);
  const qualified=await previewLocalFixtureQualification(local);
  assert.equal(qualified.headSha,inspected.proof.observedLocalGitHeadSha);
  assert.equal(qualified.headSha,cycle.syncPolicy.headSha);
  assert.equal(qualified.taskId,integrated.taskId);
  assert.equal(qualified.archivedFilesReviewed,integrated.archivedFilesReviewed);
  assert.deepEqual(qualified.changedCanonicalPaths,[S]);
  return {integrated,qualified,inspected};
}
function assertNoGrants(value){
  for(const key of ['authorizedToExecute','sourceProvenanceVerified',
    'promotionAllowed','writesPerformed'])assert.equal(value[key],false,key);
  assert.equal(value.paidApprovalRequired,true);
}
test('R3g-05: actual local Git HEAD and fd-inventoried bytes match complete mock lifecycle',
  {skip:process.platform!=='linux'},async()=>fixture(async f=>{
    const before=await readFile(join(f.root,'before',S),'utf8');
    const result=await recipe(f);
    assert.equal(result.inspected.proof.localGitObjectsMatchSnapshot,true);
    assert.equal(result.inspected.proof.filesReviewed,Object.keys(old).length);
    assert.equal(result.integrated.checkpointSequence,3);
    assert.equal(result.integrated.canonicalFilesReviewed,1);
    assert.equal(result.qualified.localLockMatched,true);
    assert.equal(result.qualified.syntheticCheckpointMatched,true);
    assertNoGrants(result.integrated);
    assertNoGrants(result.qualified);
    assertNoGrants(result.inspected.proof);
    assert.equal(await readFile(join(f.root,'before',S),'utf8'),before);
    assert.deepEqual(nodeProof(f),result.inspected);
  }));
const negative=[
  ['checklist pending at apply',async({cycle})=>{cycle.phaseInputs.apply.checklist=checklist(false);}],
  ['checkpoint SHA altered',async({local})=>{local.checkpoint.chain[1]={...local.checkpoint.chain[1],headSha:A};}],
  ['lock SHA changed',async({local})=>{local.lock.headSha=A;}],
  ['lock bytes changed',async({local})=>{local.lock.files[0].sha256='0'.repeat(64);}],
  ['wrong mock CI app',async({local})=>{local.checkpoint.observed.check.appId=7;}],
  ['unexpected paid retry',async({cycle})=>{cycle.retryPaid=true;}],
  ['provider extra output',async({cycle})=>{cycle.providerResponse='unreviewed';}],
  ['self declared authority',async({cycle})=>{cycle.remoteObservations.apply.authorizedToExecute=true;}],
  ['overlay mutated after Git proof',async({f})=>{
    await writeFile(join(f.root,'after',PRODUCT),'Unexpected overlay\n');}],
  ['archive file missing',async({f})=>{await rm(join(f.root,'archived',ARCH+'tasks.md'));}],
  ['unmanaged extra file',async({f})=>{await writeFile(join(f.root,'after','extra.txt'),'unmanaged');}],
  ['symlink substitution',async({f})=>{
    await symlink('/etc/passwd',join(f.root,'after','unapproved-link'));}],
];
for(const [label,mutate] of negative){
  test('R3g-05 fail-closed: '+label,{skip:process.platform!=='linux'},async()=>fixture(async f=>{
    await assert.rejects(recipe(f,mutate));
  }));
}
test('R3g-05 rejects moved actual Git HEAD even if snapshots still match',
  {skip:process.platform!=='linux'},async()=>fixture(async f=>{
    await recipe(f);
    await writeFile(join(f.repo,S),'changed committed Git HEAD\n');
    git(f.repo,'add','--',S);
    git(f.repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
      'commit','-qm','move disposable HEAD');
    assert.throws(()=>nodeProof(f));
  }));
test('R3g-05 rejects Git object byte mismatch and untracked snapshot extras',
  {skip:process.platform!=='linux'},async()=>fixture(async f=>{
    await writeFile(join(f.root,'before',S),'tampered bytes\n');
    assert.throws(()=>nodeProof(f));
  }));
