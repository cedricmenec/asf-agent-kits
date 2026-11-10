import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, strictFile } from '../tools/node/common.mjs';
import { render_mvp } from '../tools/render_mvp_kit.mjs';
const moduleFromTemplate = async name => import('data:text/javascript;base64,' +
  readFileSync(path.join(ROOT, 'kits/opencode-openspec/templates', name + '.mjs.tmpl')).toString('base64'));
const { budgetPolicy, checkKeyBudget, verifyBudget, BudgetRefusal } = await moduleFromTemplate('budget');
const { scanPlanContents, allowed } = await moduleFromTemplate('scope');

const config = strictFile(path.join(ROOT, 'kits/opencode-openspec/mvp-config.example.json'));
const openspec = render_mvp(ROOT, config, 'opencode-openspec').files;
const direct = render_mvp(ROOT, config, 'opencode-direct').files;
const rendered = filename => Buffer.from(openspec.find(f => f.path === filename).contentBase64, 'base64').toString('utf8');
const workflow = YAML.parse(rendered('.github/workflows/asf-agentkit-openspec.yml'));

test('#127 rendered workflow publishes plan before strict quality gate and any apply call', () => {
  const jobs = workflow.jobs;
  assert.ok(jobs.publish_plan.needs.includes('execute_plan'));
  assert.ok(jobs.verify_plan.needs.includes('publish_plan'));
  assert.ok(jobs.execute_apply.needs.includes('verify_plan'));
  assert.ok(jobs.execute_apply.needs.includes('verify_repair'));
  assert.match(jobs.execute_apply.if, /quality == 'pass'/);
  assert.match(jobs.execute_apply.if, /verify_repair\.result == 'success'/);
  assert.match(jobs.execute_repair.if, /quality == 'fail'/);
  assert.match(jobs.execute_repair.if, /repair_calls == '1'/);
  assert.ok(jobs.verify_repair.needs.includes('publish_repair'));
  for (const phase of ['plan', 'repair', 'apply', 'finalize']) {
    const execute = jobs['execute_' + phase];
    const publish = jobs['publish_' + phase];
    assert.ok(execute && publish);
    assert.equal(execute['concurrency']['cancel-in-progress'], false);
    assert.ok(execute.steps.every(s => !String(s.uses || '').includes('create-github-app-token')));
    assert.ok(publish.steps.some(s => String(s.uses || '').includes('create-github-app-token')));
    assert.ok(publish.needs.includes('execute_' + phase));
    assert.match(publish.env.EXPECTED_TIP, /headSha|expectedSha|observedTip/);
  }
  assert.ok(jobs.prepare.steps.some(s => String(s.uses || '').includes('create-github-app-token')));
  assert.ok(jobs.verify_plan.steps.every(s => !JSON.stringify(s).includes('OPENROUTER_API_KEY')));
  assert.ok(jobs.verify_repair.steps.every(s => !JSON.stringify(s).includes('OPENROUTER_API_KEY')));
  assert.ok(direct.every(f => !f.path.endsWith('/budget.mjs') && !f.path.endsWith('/stage.sh')));
});

test('publisher jobs remain eligible after optional upstream jobs are skipped', () => {
  // GitHub implicitly adds success() to job-level if conditions without a
  // status function. execute_apply can succeed even when verify_repair is
  // skipped, so publish_apply must explicitly check its direct dependencies.
  const jobs = workflow.jobs;
  for (const [phase, extraRequirements] of Object.entries({
    plan: [],
    repair: ["needs.publish_plan.result == 'success'"],
    apply: [],
    finalize: []
  })) {
    const job = jobs['publish_' + phase];
    assert.match(job.if, /^always\(\) && /,
      'publish_' + phase + ' must override implicit success() on skipped ancestors');
    assert.match(job.if, /needs\.prepare\.result == 'success'/);
    assert.ok(job.if.includes("needs.execute_" + phase + ".result == 'success'"));
    for (const requirement of extraRequirements) assert.ok(job.if.includes(requirement));
  }
  assert.ok(jobs.execute_apply.if.startsWith('always()'));
  assert.ok(jobs.verify_repair.if.startsWith('always()'));
});

test('#127 repair budget must be explicit, non-resetting, provider-enforced and finite', async () => {
  assert.deepEqual(budgetPolicy('0', '0'), { repairCalls: 0, maxUsd: 0 });
  assert.deepEqual(budgetPolicy('1', '0.25'), { repairCalls: 1, maxUsd: .25 });
  for (const [calls, usd] of [['1','0'], ['0','0.01'], ['2','1'], ['1','101'], ['1','0.001'], ['1','-1']]) {
    assert.throws(() => budgetPolicy(calls,usd), BudgetRefusal);
  }
  const key = { limit: 2, limit_remaining: .25, limit_reset: null,
    is_management_key: false, include_byok_in_limit: false };
  assert.equal(checkKeyBudget(budgetPolicy('1', '0.25'), key).bounded, true);
  for (const data of [{ ...key, limit_reset: 'daily' }, { ...key, limit_remaining: .26 },
    { ...key, is_management_key: true }, { ...key, limit_remaining: null },
    { ...key, include_byok_in_limit: true }]) {
    assert.throws(() => checkKeyBudget(budgetPolicy('1', '0.25'), data), BudgetRefusal);
  }
  let calls = 0;
  const mock = async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer sentinel');
    return { ok: true, json: async () => ({ data: key }) };
  };
  assert.equal((await verifyBudget({ PHASE: 'auto', REPAIR_CALLS: '1', BUDGET_USD: '0.25', OPENROUTER_API_KEY: 'sentinel' },mock)).repairCalls,1);
  assert.equal(calls,1);
  assert.equal((await verifyBudget({ REPAIR_CALLS: '0', BUDGET_USD: '0' },mock)).bounded,false);
  assert.equal(calls,1);
  await assert.rejects(verifyBudget({ PHASE: 'auto', REPAIR_CALLS: '1', BUDGET_USD: '0.25', OPENROUTER_API_KEY: 'sentinel' },async () => ({ok:false})),BudgetRefusal);
  await assert.rejects(verifyBudget({ PHASE: 'apply', REPAIR_CALLS: '1', BUDGET_USD: '0.25', OPENROUTER_API_KEY: 'sentinel' },mock),BudgetRefusal);
});

test('#127 published plan cannot contain known credential patterns, oversized or binary files', () => {
  const tmp = mkdtempSync(path.join(process.env.ASF_TEST_TEMP_ROOT || os.tmpdir(), 'asf-plan-safety-'));
  const file = path.join(tmp,'plan.md');
  try {
    writeFileSync(file, '## Valid scoped OpenSpec plan\n');
    assert.equal(scanPlanContents([file]),1);
    for (const leak of ['sk-or-v1-12345678901234567','github_pat_12345678901234567',
      '-----BEGIN RSA PRIVATE KEY-----','hidden-provider-key-sentinel']) {
      writeFileSync(file, 'Plan\n'+leak);
      assert.throws(()=>scanPlanContents([file],'hidden-provider-key-sentinel'));
    }
    writeFileSync(file, Buffer.from([0,1,2]));
    assert.throws(()=>scanPlanContents([file]));
    writeFileSync(file,'x'.repeat(512*1024+1));
    assert.throws(()=>scanPlanContents([file]));
    assert.ok(allowed('repair-plan', 'ts-009', 'openspec/changes/ts-009/tasks.md'));
    assert.equal(allowed('repair-plan', 'ts-009', '.github/workflows/evil.yml'),false);
  } finally {rmSync(tmp,{recursive:true,force:true});}
});

test('#127 trusted guards and publisher parse as Bash, no unrendered template token', () => {
  for(const filename of ['phase.sh','stage.sh','publish.sh']) {
    const source = rendered('.asf/agentkit/runtime/'+filename);
    const tmp = mkdtempSync(path.join(process.env.ASF_TEST_TEMP_ROOT || os.tmpdir(),'asf-shell-gate-'));
    try {
      const file = path.join(tmp,filename);
      writeFileSync(file,source);
      execFileSync('bash',['-n',file]);
    } finally {rmSync(tmp,{recursive:true,force:true});}
  }
});
