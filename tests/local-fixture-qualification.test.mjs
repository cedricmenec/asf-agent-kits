import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,chmod,readFile,stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {previewOpenSpecTransition} from '../core/openspec-offline-phases.mjs';
import {previewLocalFixtureQualification,LocalQualificationError} from '../core/local-fixture-qualification.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const P='openspec/changes/ts-123/', S='openspec/specs/widgets/spec.md';
const PRODUCT='docs/product/guide.md',DATE='2026-10-23';
const ARCH='openspec/changes/archive/'+DATE+'-ts-123/';
const old={ [PRODUCT]:'Product overlay\n', [P+'proposal.md']:'Proposal body\n',
  [P+'tasks.md']:'- [x] implemented\n', [S]:'Canonical v1\n'};
const modified={...old,[S]:'Canonical v2\n'};
const archived={ [PRODUCT]:old[PRODUCT],[S]:modified[S],
  [ARCH+'proposal.md']:old[P+'proposal.md'],
  [ARCH+'tasks.md']:old[P+'tasks.md']};
const sha=s=>createHash('sha256').update(s).digest('hex');
const denied=e=>e instanceof LocalQualificationError&&
  e.message==='R3g-02 DENY: untrusted or inconsistent local fixture';

function checklist(done){return ['## Implementation checklist',
  '- ['+(done?'x':' ')+'] Implement','- [x] Test',
  '## Manual acceptance','- Pending user testing',
  '## Post-sync review','- Pending independent review'].join('\n');}
function step(phase){
  const plan=phase==='plan';
  return {phase,expectedHeadSha:plan?A:B,observedHeadSha:plan?A:B,
    nextHeadSha:plan?B:C,intermediatePlanSha:null,
    changedPaths:plan?[P+'proposal.md',P+'design.md',P+'tasks.md',
      P+'specs/widgets/spec.md']:[P+'tasks.md','site/widget.js'],
    checklist:checklist(!plan),
    verifications:{planStrict:true,projectTests:true,scopeGuard:true,
      checklistGate:true,semanticSync:false,archiveStrict:false,independentCi:false}};
}
function checkpoint(){
  const hostPolicy={repository:'demo/sandbox',taskId:'TS-123',
    branch:'agent/openspec/TS-123',baseSha:A,allowedProductPrefixes:['site/']};
  const plan=previewOpenSpecTransition(hostPolicy,null,step('plan'));
  const apply=previewOpenSpecTransition(hostPolicy,plan.checkpoint,step('apply'));
  const observed={repository:'demo/sandbox',branch:'agent/openspec/TS-123',
    headSha:C,parentSha:B,
    subject:'agent(TS-123): verified implementation checkpoint',
    refExists:true,observedAtSeconds:1000,nowSeconds:1010,
    activeWorkflowRuns:0,openFinalPullRequests:0,
    check:{name:'check',headSha:C,appId:15368,status:'completed',conclusion:'success'}};
  return {hostPolicy,chain:[plan.checkpoint,apply.checkpoint],observed,checkAppId:15368};
}
async function save(root,stage,files){
  for(const [path,data] of Object.entries(files)){
    const location=join(root,stage,path);
    await mkdir(dirname(location),{recursive:true});
    await writeFile(location,data,{mode:0o600});
  }
}
async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'asf-r3g02-'));
  try {
    await save(root,'before',old);
    await save(root,'after',modified);
    await save(root,'archived',archived);
    const spec={fixtureRoot:root,headSha:C,
      expectedPaths:{before:Object.keys(old),after:Object.keys(modified),
        archived:Object.keys(archived)},
      lock:{headSha:C,files:Object.entries(old).map(([path,body])=>
        ({path,sha256:sha(body)}))},
      syncPolicy:{taskId:'TS-123',headSha:C,canonicalPaths:[S]},
      checkpoint:checkpoint(),archiveDate:DATE};
    return await fn(root,spec);
  }finally{await rm(root,{recursive:true,force:true});}
}
test('three REAL temporary byte trees, lock, checkpoint and archive qualify only as a mock',async()=>{
  await fixture(async(root,input)=>{
    const r=await previewLocalFixtureQualification(input);
    assert.equal(r.kind,'r3g02-disposable-local-qualification-preview');
    assert.equal(r.localLockMatched,true);
    assert.equal(r.syntheticCheckpointMatched,true);
    assert.equal(r.archivedFilesReviewed,2);
    assert.deepEqual(r.changedCanonicalPaths,[S]);
    assert.equal(r.localLockFingerprint.length,64);
    assert.ok(Object.isFrozen(r));
    for(const field of ['localSourceAuthenticated','realGitHeadVerified','filesystemRaceFree',
      'remoteEvidenceIndependentlyAuthenticated','semanticRequirementsIndependentlyVerified',
      'opsxCommandInvoked','authorizedToExecute','trustEvidenceIndependentlyVerified',
      'sourceProvenanceVerified','promotionAllowed','writesPerformed'])
      assert.equal(r[field],false,field);
    assert.equal(r.paidApprovalRequired,true);
    assert.equal(await readFile(join(root,'before',S),'utf8'),old[S]);
    assert.equal(await readFile(join(root,'after',S),'utf8'),modified[S]);
  });
});
test('stable local lock checksum and no writes',async()=>fixture(async(root,input)=>{
  const first=await previewLocalFixtureQualification(input);
  const second=await previewLocalFixtureQualification(input);
  assert.deepEqual(first,second);
  assert.ok((await stat(join(root,'before',S))).isFile());
}));
for(const [label,modify] of [
  ['lock digest mismatch',x=>x.lock.files[0].sha256='0'.repeat(64)],
  ['lock incomplete',x=>x.lock.files.pop()],
  ['lock wrong HEAD',x=>x.lock.headSha=B],
  ['lock extra authority claim',x=>x.lock.authenticated=true],
  ['lock duplicate path alias',x=>x.lock.files[1].path=x.lock.files[0].path.toUpperCase()],
  ['lock invalid SHA',x=>x.lock.files[0].sha256='bad'],
  ['request injection',x=>x.paidRetry=true],
  ['unknown checkpoint grant',x=>x.checkpoint.authorizedToExecute=true],
  ['forged checkpoint',x=>{x.checkpoint.chain[1]={...x.checkpoint.chain[1],digest:'0'.repeat(64)};}],
  ['stale checkpoint HEAD',x=>x.checkpoint.observed.headSha=B],
  ['failed independent synthetic CI',x=>x.checkpoint.observed.check.conclusion='failure'],
  ['concurrent workflow run',x=>x.checkpoint.observed.activeWorkflowRuns=1],
  ['wrong synchronization HEAD',x=>x.syncPolicy.headSha=B],
  ['unchecked task identity',x=>x.syncPolicy.taskId='TS-555'],
  ['invalid archive date',x=>x.archiveDate='2026-02-30'],
]) test('fail closed on '+label,async()=>fixture(async(root,input)=>{
  modify(input);
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject local overlay modification instead of overwriting',async()=>fixture(async(root,input)=>{
  await writeFile(join(root,'after',PRODUCT),'Local divergent overlay\n');
  await assert.rejects(previewLocalFixtureQualification(input),denied);
  assert.equal(await readFile(join(root,'after',PRODUCT),'utf8'),'Local divergent overlay\n');
}));
test('reject incomplete archive (one missing moved task)',async()=>fixture(async(root,input)=>{
  await rm(join(root,'archived',ARCH+'tasks.md'));
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject byte-corrupted archive, not just missing filenames',async()=>fixture(async(root,input)=>{
  await writeFile(join(root,'archived',ARCH+'proposal.md'),'Corrupted proposal\n');
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject unreviewed file in real filesystem tree',async()=>fixture(async(root,input)=>{
  await writeFile(join(root,'after','extra'),'untracked');
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject link in fixture tree',async()=>fixture(async(root,input)=>{
  await symlink(join(root,'before',S),join(root,'after','linked'));
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject local executable file mode',async()=>fixture(async(root,input)=>{
  await chmod(join(root,'after',S),0o755);
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
test('reject accessor input without invoking it, sanitized error',async()=>fixture(async(root,input)=>{
  let invoked=false;
  Object.defineProperty(input,'archiveDate',{get(){invoked=true;throw Error('TOPSECRET');}});
  await assert.rejects(previewLocalFixtureQualification(input),e=>
    denied(e)&&!e.message.includes('TOPSECRET'));
  assert.equal(invoked,false);
}));
test('reject temporary tree scope confusion, no real repository reads',async()=>fixture(async(root,input)=>{
  input.expectedPaths.after=['../outside'];
  await assert.rejects(previewLocalFixtureQualification(input),denied);
}));
