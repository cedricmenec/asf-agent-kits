import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectGithubManualGate, GithubGateError } from '../core/github-gates.mjs';

const SHA='a'.repeat(40), APP=15368, REPO='safe-owner/safe-repo';
const data=Buffer.from('# Synthetic policy\n','utf8');
const blob=createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
const spec=Object.freeze({repository:REPO,branch:'main',expectedSha:SHA,
  rulesetName:'agentkit-main',checkContexts:['check'],checkAppId:APP,
  policyPath:'AGENTS.md',expectedPolicyBlobSha:blob});
const root='/repos/'+REPO;
const addr={
  branch:root+'/branches/main',
  rules:root+'/rulesets',
  detail:root+'/rulesets/99',
  check:root+'/commits/'+SHA+'/check-runs',
  policy:root+'/contents/AGENTS.md?ref='+SHA
};
function fixtures() {
  return {
    [root]:{full_name:REPO,default_branch:'main',archived:false},
    [addr.branch]:{name:'main',protected:true,commit:{sha:SHA}},
    [addr.rules]:[{id:99,name:'agentkit-main',target:'branch',enforcement:'active'}],
    [addr.detail]:{id:99,name:'agentkit-main',source:REPO,target:'branch',enforcement:'active',
      conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},
      bypass_actors:[],current_user_can_bypass:'never',
      rules:[{type:'deletion'},{type:'non_fast_forward'},
        {type:'pull_request',parameters:{required_approving_review_count:0}},
        {type:'required_status_checks',parameters:{
          strict_required_status_checks_policy:true,
          required_status_checks:[{context:'check',integration_id:APP}]}}]},
    [addr.check]:{check_runs:[{name:'check',head_sha:SHA,status:'completed',
      conclusion:'success',app:{id:APP}}]},
    [addr.policy]:{path:'AGENTS.md',type:'file',encoding:'base64',
      sha:blob,content:data.toString('base64')}
  };
}
function reader(f, called=[]) { return async path => {
  called.push(path);
  if (!(path in f)) throw Error('missing fixture');
  return structuredClone(f[path]);
}; }
const pass=(f=fixtures(),s=spec)=>inspectGithubManualGate(s,reader(f));
const denied=async change => {
  const f=fixtures(); change(f);
  await assert.rejects(pass(f),GithubGateError);
};
test('strictly consultative result, no paid permission, and second branch read',async()=>{
  const called=[],r=await inspectGithubManualGate(spec,reader(fixtures(),called));
  assert.equal(r.kind,'r3b-github-readonly-gate-preview');
  assert.equal(r.apiObservationsConsistent,true);
  assert.equal(r.verifiedPolicyBlobSha,blob);
  assert.equal(r.paidApprovalRequired,true);
  for(const k of ['authorizedToExecute','promotionAllowed','writesPerformed',
    'trustEvidenceIndependentlyVerified','sourceProvenanceVerified']) assert.equal(r[k],false);
  assert.equal(called.filter(x=>x===addr.branch).length,2);
  assert.ok(called.every(x=>x.startsWith(root)));
});
test('missing adapter denied',async()=>assert.rejects(inspectGithubManualGate(spec,null),GithubGateError));
test('injected unknown input denied',async()=>assert.rejects(pass(fixtures(),{...spec,waveId:'x'}),GithubGateError));
test('hostile repository and branch rejected',async()=>{
  for(const s of [{...spec,repository:'../x/y'},{...spec,branch:'../main'},
    {...spec,branch:'main//other'},{...spec,expectedSha:'xyz'}])
    await assert.rejects(pass(fixtures(),s),GithubGateError);
});
test('policy path restricted',async()=>assert.rejects(pass(fixtures(),{...spec,policyPath:'.github/workflows/ci.yml'}),GithubGateError));
test('required check provider and context pinned',async()=>{
  for(const s of [{...spec,checkAppId:0},{...spec,checkContexts:[]},
    {...spec,checkContexts:['check','check']}])
    await assert.rejects(pass(fixtures(),s),GithubGateError);
});
test('wrong repo identity denied',async()=>denied(f=>{f[root].full_name='other/repo'}));
test('archived repo denied',async()=>denied(f=>{f[root].archived=true}));
test('untrusted default branch denied',async()=>denied(f=>{f[root].default_branch='evil'}));
test('unprotected branch denied',async()=>denied(f=>{f[addr.branch].protected=false}));
test('moved branch denied',async()=>denied(f=>{f[addr.branch].commit.sha='b'.repeat(40)}));
test('missing ruleset denied',async()=>denied(f=>{f[addr.rules]=[]}));
test('ambiguous duplicate ruleset denied',async()=>denied(f=>{f[addr.rules].push({...f[addr.rules][0]})}));
test('inactive ruleset denied',async()=>denied(f=>{f[addr.detail].enforcement='disabled'}));
test('other repository ruleset denied',async()=>denied(f=>{f[addr.detail].source='evil/repo'}));
test('ruleset wildcard does not prove exact protection',async()=>denied(f=>{f[addr.detail].conditions.ref_name.include=['~DEFAULT_BRANCH']}));
test('ruleset exclusion denied',async()=>denied(f=>{f[addr.detail].conditions.ref_name.exclude=['refs/heads/other']}));
test('bypass list denied',async()=>denied(f=>{f[addr.detail].bypass_actors=[{actor_id:1}]}));
test('unknown bypass denied',async()=>denied(f=>{f[addr.detail].current_user_can_bypass='always'}));
test('missing PR gate denied',async()=>denied(f=>{f[addr.detail].rules=f[addr.detail].rules.filter(x=>x.type!=='pull_request')}));
test('missing force-push restriction denied',async()=>denied(f=>{f[addr.detail].rules=f[addr.detail].rules.filter(x=>x.type!=='non_fast_forward')}));
test('branches-up-to-date required',async()=>denied(f=>{
  f[addr.detail].rules.find(x=>x.type==='required_status_checks').parameters.strict_required_status_checks_policy=false;
}));
test('ruleset check app spoof denied',async()=>denied(f=>{
  f[addr.detail].rules.find(x=>x.type==='required_status_checks').parameters.required_status_checks[0].integration_id=999;
}));
test('check app spoof denied',async()=>denied(f=>{f[addr.check].check_runs[0].app.id=999}));
test('failed check denied',async()=>denied(f=>{f[addr.check].check_runs[0].conclusion='failure'}));
test('pending check denied',async()=>denied(f=>{f[addr.check].check_runs[0].status='in_progress'}));
test('check with stale SHA denied',async()=>denied(f=>{f[addr.check].check_runs[0].head_sha='b'.repeat(40)}));
test('missing and duplicate check denied',async()=>{
  await denied(f=>{f[addr.check].check_runs=[]});
  await denied(f=>{f[addr.check].check_runs.push({...f[addr.check].check_runs[0]})});
});
test('missing policy file denied',async()=>denied(f=>{delete f[addr.policy]}));
test('policy transfer encoding denied',async()=>denied(f=>{f[addr.policy].content='invalid!!'}));
test('hash mismatch of policy bytes denied',async()=>denied(f=>{f[addr.policy].content=Buffer.from('tampered').toString('base64')}));
test('expected blob SHA cannot be changed',async()=>assert.rejects(pass(fixtures(),{...spec,expectedPolicyBlobSha:'b'.repeat(40)}),GithubGateError));
test('API errors fail closed without retry',async()=>{
  let attempts=0;
  await assert.rejects(inspectGithubManualGate(spec,async()=>{attempts++;throw Error('denied')}),GithubGateError);
  assert.equal(attempts,1);
});
test('last branch recheck catches TOCTOU movement',async()=>{
  const f=fixtures();let seen=0;
  await assert.rejects(inspectGithubManualGate(spec,async path=>{
    if(path===addr.branch && ++seen===2)return {name:'main',protected:true,commit:{sha:'b'.repeat(40)}};
    return reader(f)(path);
  }),GithubGateError);
});
