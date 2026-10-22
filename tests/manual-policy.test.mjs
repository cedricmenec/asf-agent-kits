import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateManualRequest, allowedCandidatePath, PolicyError } from '../core/manual-policy.mjs';

const shaA = 'a'.repeat(40), shaB = 'b'.repeat(40);
const baseline = JSON.parse(readFileSync(new URL('../examples/valid-config.json', import.meta.url), 'utf8'));
const copy = v => structuredClone(v);
const request = () => ({
  trigger:'manual', repository:'example-owner/example-project',actor:'example-owner',profile:'opencode-openspec',
  taskId:'TS-009',phase:'plan',model:'openrouter/example/model-id-not-approved',targetBranch:'trunk',
  expectedHeadSha:shaA,observedHeadSha:shaA,requiredCheckContexts:['check'],
  changedPaths:['openspec/changes/ts-009/proposal.md']
});
const evidence = () => ({repository:'example-owner/example-project',protectedRef:'refs/heads/trunk',policySha:shaB,expectedPolicySha:shaB,refProtectionChecked:true});
const run = (c=copy(baseline),r=request(),e=evidence()) => evaluateManualRequest(c,r,e);
const rejected = fn => assert.throws(fn, PolicyError);

test('fresh repository plan is a pure preview and never authorizes a paid call', () => {
  const c=copy(baseline),r=request(),e=evidence();
  const before=JSON.stringify([c,r,e]);
  const result=run(c,r,e);
  assert.equal(result.taskFile,'backlog/tasks/TS-009.md');
  assert.equal(result.branch,'agent/openspec/TS-009');
  assert.deepEqual(result.modelPolicy,{model:r.model,small_model:r.model,agent:{title:{disable:true}}});
  assert.equal(result.authorizedToExecute,false);
  assert.equal(result.sourceProvenanceVerified,false);
  assert.equal(result.trustEvidenceIndependentlyVerified,false);
  assert.equal(result.paidApprovalRequired,true);
  assert.equal(result.writesPerformed,false);
  assert.equal(JSON.stringify([c,r,e]),before);
});
test('existing repo safe apply to reviewed task and product code',()=>{
  const r=request();r.phase='apply';r.changedPaths=['src/service/index.ts','openspec/changes/ts-009/tasks.md'];
  assert.equal(run(copy(baseline),r).phase,'apply');
});
test('direct kit can be enabled independently, no ThreadStep IDs hardcoded',()=>{
  const c=copy(baseline); c.kits['opencode-direct'].enabled=true;
  const r=request();r.profile='opencode-direct';r.phase='auto';r.taskId='ABC9-987';r.changedPaths=['src/new.ts'];
  assert.equal(run(c,r).branch,'agent/ABC9-987');
});
test('finalize allows canonical spec changes but is still pay-gated',()=>{
  const r=request();r.phase='finalize';r.changedPaths=['openspec/specs/integration/spec.md','openspec/changes/archive/2026-10-22-ts-009/tasks.md'];
  assert.equal(run(copy(baseline),r).authorizedToExecute,false);
});
test('R3a output deterministic byte-for-byte',()=>assert.equal(JSON.stringify(run()),JSON.stringify(run())));

test('unverified policy evidence is denied; a claim never becomes proven provenance',()=>{
  for(const mutation of [e=>{e.refProtectionChecked=false},e=>{e.expectedPolicySha=shaA},e=>{e.protectedRef='refs/heads/feature'} ,e=>{e.repository='other/repo'} ,e=>{e.policySha='not-a-sha'}]){
    const e=evidence();mutation(e);rejected(()=>run(copy(baseline),request(),e));
  }
  rejected(()=>run(copy(baseline),request(),null));
});
test('injected V3 wave metadata and unknown request keys fail closed',()=>{
  for (const key of ['wave_id','reservation_sha','parent_run_id','workflow_call','apiToken','shell']){
    const r=request();r[key]='attacker';rejected(()=>run(copy(baseline),r));
  }
});
test('caller, repository, and manual trigger are validated',()=>{
  for(const mutation of [r=>{r.actor='bad-bot'},r=>{r.repository='evil/repo'},r=>{r.trigger='push'}]){
    const r=request();mutation(r);rejected(()=>run(copy(baseline),r));
  }
});
test('phase and kit pairing fail closed',()=>{
  for(const phase of ['shell','execute','publish','PLAN',undefined]){
    const r=request();r.phase=phase;rejected(()=>run(copy(baseline),r));
  }
  const c=copy(baseline);c.kits['opencode-direct'].enabled=true;const r=request();r.profile='opencode-direct';r.phase='finalize';rejected(()=>run(c,r));
});
test('task ids cannot contain traversal, aliases, blank IDs, zero or shell payloads',()=>{
  for(const taskId of ['9','TS-000','TS-9','ts-009','TS-009/../x','TS-009;rm -rf /','X-000000','ABC-1234567','TS-009\n']){
    const r=request();r.taskId=taskId;rejected(()=>run(copy(baseline),r));
  }
});
test('model must belong to explicit allowlist and be a simple provider ID',()=>{
  for(const model of ['openrouter/example/not-allowed','openrouter/example/model-id-not-approved; curl example.com','latest','openrouter/deepseek/ok\n',null]){
    const r=request();r.model=model;rejected(()=>run(copy(baseline),r));
  }
});
test('branch/commit SHA mismatch blocks preflight',()=>{
  for(const change of [r=>{r.targetBranch='main'},r=>{r.observedHeadSha=shaB},r=>{r.expectedHeadSha='abc'}]){
    const r=request();change(r);rejected(()=>run(copy(baseline),r));
  }
});
test('required independent CI context must match exactly',()=>{
  for(const values of [[],['test'],['check','fake-green'],['check','check']]){
    const r=request();r.requiredCheckContexts=values;rejected(()=>run(copy(baseline),r));
  }
});
test('candidate path traversal, secrets, policy, CI and factory files refused',()=>{
  for(const p of ['../secrets','/etc/passwd','src/../.github/workflows/evil.yml','src//file.ts','src\\file.ts','src/.env','src/keys.pem','src/.npmrc','src/nested/.env.production','src/output.log','src/.git/config','.github/workflows/new.yml','AGENTS.md','backlog/tasks/TS-009.md','src/\n.sh','src/app.js/']){
    const r=request();r.phase='apply';r.changedPaths=[p];rejected(()=>run(copy(baseline),r));
  }
});
test('plan phase cannot modify source code or another change',()=>{
  for(const path of ['src/app.js','openspec/changes/ts-010/tasks.md','openspec/config.yaml']){
    const r=request();r.changedPaths=[path];rejected(()=>run(copy(baseline),r));
  }
});
test('apply cannot modify canonical specs or archived changes',()=>{
  for(const path of ['openspec/specs/core/spec.md','openspec/changes/archive/2026-10-22-ts-009/proposal.md']){
    const r=request();r.phase='apply';r.changedPaths=[path];rejected(()=>run(copy(baseline),r));
  }
});
test('finalize only publishes specs and task-owned archive',()=>{
  for(const path of ['openspec/changes/ts-009/tasks.md','openspec/changes/archive/2026-10-22-ts-010/tasks.md','src/app.js']){
    const r=request();r.phase='finalize';r.changedPaths=[path];rejected(()=>run(copy(baseline),r));
  }
});
test('disabled profile and autotrigger config cannot run',()=>{
  const r=request();r.profile='opencode-direct';r.phase='auto';r.changedPaths=['src/app.js'];rejected(()=>run(copy(baseline),r));
  const c=copy(baseline);c.execution.trigger='push';rejected(()=>run(c));
});
test('model allowlist and independent checks config must be complete',()=>{
  for(const mutate of [c=>{c.execution.allowedModels=['openrouter/evil/model','openrouter/evil/model']},c=>{c.execution.allowedModels=['openrouter/evil/model']},c=>{c.execution.allowedModels=['openrouter/evil/model;ls'];c.execution.defaultModel='openrouter/evil/model;ls'},c=>{c.validation.requiredCheckContexts=['something-else']},c=>{c.validation.requireIndependentCi=false}]){
    const c=copy(baseline);mutate(c);rejected(()=>run(c));
  }
});
test('arbitrary commands, auto-merge and mutable runtime rejected',()=>{
  for(const mutate of [c=>{c.validation.projectCommands=['npm run check && curl evil']},c=>{c.publication.autoMerge=true},c=>{c.execution.openCodeVersion='latest'},c=>{c.publication.targetBranch='main'}]){
    const c=copy(baseline);mutate(c);rejected(()=>run(c));
  }
});
test('hostile regex idPattern and unknown config fields rejected',()=>{
  for(const mutate of [c=>{c.tasks.idPattern='(a+)+$'},c=>{c.tasks.allowNumericAlias=true},c=>{c.extraV3={wave:true}},c=>{c.execution.workflowCall=true}]){
    const c=copy(baseline);mutate(c);rejected(()=>run(c));
  }
});
test('case-insensitive protected and prefix overlaps denied',()=>{
  const c=copy(baseline);c.paths.allowedProductPrefixes=['.GiThUb/workflows/'];rejected(()=>run(c));
  const d=copy(baseline);d.paths.additionalProtected=['SRC/'];rejected(()=>run(d));
  const r=request();r.phase='apply';r.changedPaths=['src/app.js','src/APP.js'];rejected(()=>run(copy(baseline),r));
});
test('empty paths, unknown path arrays and arbitrary prefixes refused',()=>{
  const r=request();r.changedPaths=[];rejected(()=>run(copy(baseline),r));
  const c=copy(baseline);c.paths.allowedProductPrefixes=['src'];rejected(()=>run(c));
  const d=copy(baseline);d.paths.allowedProductPrefixes=['../src/'];rejected(()=>run(d));
});
test('single path helper does not claim trust or execute anything',()=>{
  const c=copy(baseline),r=request();
  assert.equal(allowedCandidatePath(c,r,'openspec/changes/ts-009/tasks.md'),true);
  assert.equal(allowedCandidatePath(c,r,'src/main.js'),false);
});
