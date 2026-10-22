import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostBoundGithubInspector, HostBindingError } from '../core/host-bound-github-gate.mjs';
import { GithubGateError } from '../core/github-gates.mjs';
import { GithubReadError } from '../core/github-read-adapter.mjs';

const SHA='a'.repeat(40), OTHER='b'.repeat(40), APP=15368, REPO='safe-owner/safe-repo';
const policyBytes=Buffer.from('# Synthetic host-bound policy\n','utf8');
const blob=createHash('sha1').update(Buffer.from('blob '+policyBytes.length+'\0')).update(policyBytes).digest('hex');
const hostPolicy=()=>({
  repository:REPO,branch:'main',expectedSha:SHA,
  rulesetName:'agentkit-main',checkContexts:['check'],checkAppId:APP,
  policyPath:'AGENTS.md',expectedPolicyBlobSha:blob,
});
const task=()=>({repository:REPO,branch:'main',expectedSha:SHA});
const root='/repos/'+REPO;
const addr={
  branch:root+'/branches/main',
  rules:root+'/rulesets',
  detail:root+'/rulesets/99',
  checks:root+'/commits/'+SHA+'/check-runs',
  policy:root+'/contents/AGENTS.md?ref='+SHA,
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
    [addr.checks]:{total_count:1,check_runs:[{name:'check',head_sha:SHA,status:'completed',
      conclusion:'success',app:{id:APP}}]},
    [addr.policy]:{path:'AGENTS.md',type:'file',encoding:'base64',
      sha:blob,content:policyBytes.toString('base64')},
  };
}
function http(url, value, overrides={}) {
  const data=Buffer.from(JSON.stringify(value),'utf8');
  return {
    url:overrides.url??url, status:overrides.status??200, redirected:overrides.redirected??false,
    headers:new Headers({'content-type':'application/json',...overrides.headers}),
    body:new ReadableStream({start(controller){controller.enqueue(data);controller.close();}}),
  };
}
function transportFor(fixturesValue, calls=[]) {
  return async (url, options) => {
    calls.push({url,options});
    const path=url.slice('https://api.github.com'.length);
    if (!Object.prototype.hasOwnProperty.call(fixturesValue,path)) throw Error('fixture route missing');
    return http(url,structuredClone(fixturesValue[path]));
  };
}
function bound(f=fixtures(),calls=[],policy=hostPolicy()){
  return createHostBoundGithubInspector(policy,transportFor(f,calls));
}
const denied = error => error instanceof HostBindingError && error.message.startsWith('R3d BINDING DENIED');
const upstreamDenied = error => error instanceof GithubReadError || error instanceof GithubGateError;
const assertNoGrants = result => {
  for(const key of ['authorizedToExecute','promotionAllowed','writesPerformed',
    'sourceProvenanceVerified','trustEvidenceIndependentlyVerified'])
    assert.equal(result[key],false,key);
  assert.equal(result.paidApprovalRequired,true);
};

test('R3d end-to-end R3b policy + R3c REST with strict host-pinned task and no grants',async()=>{
  const calls=[],inspect=bound(fixtures(),calls);
  const result=await inspect(task());
  assert.equal(result.apiObservationsConsistent,true);
  assert.equal(result.verifiedPolicyBlobSha,blob);
  assertNoGrants(result);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(calls.length,7);
  assert.equal(calls.filter(x=>x.url.endsWith('/branches/main')).length,2);
  for(const call of calls){
    assert.ok(call.url.startsWith('https://api.github.com'+root));
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.redirect,'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(Object.hasOwn(call.options.headers,'Authorization'),false);
    assert.equal(Object.hasOwn(call.options,'body'),false);
  }
});

test('a new inspection performs fresh reads rather than caching unverified observations',async()=>{
  const calls=[],inspect=bound(fixtures(),calls);
  await inspect(task());await inspect(task());
  assert.equal(calls.length,14);
});

for(const [name,change] of [
  ['other repository',r=>{r.repository='other-owner/safe-repo';}],
  ['other branch',r=>{r.branch='develop';}],
  ['stale SHA',r=>{r.expectedSha=OTHER;}],
  ['token injection',r=>{r.githubToken='not-a-token';}],
  ['host flag injection',r=>{r.hostAuthenticated=true;}],
  ['transport override',r=>{r.transport=async()=>{};}],
  ['V3 metadata',r=>{r.waveId='evil';}],
  ['URL override',r=>{r.baseUrl='https://evil.example';}],
]) test('host binding rejects '+name+' before any network',async()=>{
  const calls=[],inspect=bound(fixtures(),calls);
  const request=task();change(request);
  await assert.rejects(inspect(request),denied);
  assert.equal(calls.length,0);
});

test('reject non-plain or inherited request before GET',async()=>{
  const calls=[],inspect=bound(fixtures(),calls);
  await assert.rejects(inspect(Object.create(task())),denied);
  await assert.rejects(inspect(null),denied);
  await assert.rejects(inspect([]),denied);
  assert.equal(calls.length,0);
});

test('reject accessor or symbol in request without calling the accessor',async()=>{
  const calls=[],inspect=bound(fixtures(),calls);
  const request=task();
  let invoked=false;
  Object.defineProperty(request,'expectedSha',{enumerable:true,get(){invoked=true;return SHA;}});
  await assert.rejects(inspect(request),denied);
  assert.equal(invoked,false);
  const symbolTask=task();symbolTask[Symbol('injected')]='x';
  await assert.rejects(inspect(symbolTask),denied);
  assert.equal(calls.length,0);
});

for(const [name,change] of [
  ['extra token',p=>{p.githubToken='secret';}],
  ['hostAuthenticated flag',p=>{p.hostAuthenticated=true;}],
  ['mock install identity',p=>{p.installationId=123;}],
  ['baseURL override',p=>{p.baseUrl='https://evil.example';}],
  ['no checks',p=>{p.checkContexts=[];}],
  ['duplicate checks',p=>{p.checkContexts=['check','check'];}],
]) test('host configuration denied if '+name,async()=>{
  const p=hostPolicy();change(p);
  if(name==='no checks'){
    assert.throws(()=>createHostBoundGithubInspector(p,transportFor(fixtures())),denied);
  }else if(name==='duplicate checks'){
    const inspect=createHostBoundGithubInspector(p,transportFor(fixtures()));
    await assert.rejects(inspect(task()),upstreamDenied);
  }else assert.throws(()=>createHostBoundGithubInspector(p,transportFor(fixtures())),denied);
});

test('reject host accessor without invoking it',()=>{
  const p=hostPolicy();let invoked=false;
  Object.defineProperty(p,'branch',{get(){invoked=true;return 'main';}});
  assert.throws(()=>createHostBoundGithubInspector(p,transportFor(fixtures())),denied);
  assert.equal(invoked,false);
});

test('reject host contexts that are sparse, accessor-backed or polluted',()=>{
  const cases=[
    Array(1),
    Object.assign(['check'],{foo:'other'}),
  ];
  const accessor=['check'];
  Object.defineProperty(accessor,'0',{get(){throw Error('not invoked');}});
  cases.push(accessor);
  for(const contexts of cases){
    const p=hostPolicy();p.checkContexts=contexts;
    assert.throws(()=>createHostBoundGithubInspector(p,transportFor(fixtures())),denied);
  }
});

test('host pins are immutable snapshots despite later policy/array mutations',async()=>{
  const p=hostPolicy(),calls=[],inspect=bound(fixtures(),calls,p);
  p.repository='evil/other';p.branch='dev';p.expectedSha=OTHER;
  p.checkContexts[0]='stolen';p.checkContexts.push('another');
  p.checkAppId=1234;p.expectedPolicyBlobSha=OTHER;
  const result=await inspect(task());
  assert.equal(result.apiObservationsConsistent,true);
  assert.equal(result.repository,REPO);
  assertNoGrants(result);
  assert.equal(calls.length,7);
});

test('missing host transport is rejected; task cannot choose one',()=>{
  assert.throws(()=>createHostBoundGithubInspector(hostPolicy(),null),denied);
  assert.throws(()=>createHostBoundGithubInspector(hostPolicy(),{get(){}}),denied);
});

test('wrong repository identity returned by transport fails closed',async()=>{
  const f=fixtures();f[root].full_name='evil/other';
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('incorrect CI app ID fails closed',async()=>{
  const f=fixtures();f[addr.checks].check_runs[0].app.id=1234;
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('checks from wrong SHA fail closed',async()=>{
  const f=fixtures();f[addr.checks].check_runs[0].head_sha=OTHER;
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('inactive protection ruleset fails closed',async()=>{
  const f=fixtures();f[addr.detail].enforcement='disabled';
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('policy bytes cannot be substituted without matching Git blob SHA',async()=>{
  const f=fixtures();f[addr.policy].content=Buffer.from('tampered','utf8').toString('base64');
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('a ref moved on second branch read fails closed',async()=>{
  const f=fixtures(),calls=[];
  let count=0;
  const transport=async(url,options)=>{
    calls.push({url,options});
    const path=url.slice('https://api.github.com'.length);
    const value=structuredClone(f[path]);
    if(path===addr.branch && ++count===2)value.commit.sha=OTHER;
    return http(url,value);
  };
  const inspect=createHostBoundGithubInspector(hostPolicy(),transport);
  await assert.rejects(inspect(task()),upstreamDenied);
  assert.equal(count,2);
});
test('HTTP 403 is refused, with no retries or payment authority',async()=>{
  let count=0;
  const inspect=createHostBoundGithubInspector(hostPolicy(),async url=>{
    count++;return http(url,fixtures()[root],{status:403});
  });
  await assert.rejects(inspect(task()),upstreamDenied);
  assert.equal(count,1);
});
test('truncated check run page fails closed',async()=>{
  const f=fixtures();f[addr.checks].total_count=20;
  await assert.rejects(bound(f)(task()),upstreamDenied);
});
test('bogus accessor host policy, missing rules and candidate fail before remote trust is assumed',async()=>{
  const bad=hostPolicy();bad.rulesetName='ignored';
  await assert.rejects(bound(fixtures(),[],bad)(task()),upstreamDenied);
});
