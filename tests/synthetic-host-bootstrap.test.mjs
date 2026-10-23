import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSyntheticHostBootstrap, SyntheticHostError } from '../core/synthetic-host-bootstrap.mjs';

const SHA='a'.repeat(40), REPO='safe-owner/safe-repo', APP=15368;
const data=Buffer.from('Synthetic trusted policy\n','utf8');
const blob=createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
const hostPolicy=()=>({repository:REPO,branch:'main',expectedSha:SHA,
  rulesetName:'agentkit-main',checkContexts:['check'],checkAppId:APP,
  policyPath:'AGENTS.md',expectedPolicyBlobSha:blob});
const policy=()=>({hostPolicy:hostPolicy(),installation:{appId:411,installationId:998,
  repositoryId:12345,permissions:{metadata:'read',contents:'read',checks:'read'}}});
const task=()=>({repository:REPO,branch:'main',expectedSha:SHA});
const identity=()=>({appId:411,installationId:998,repositoryId:12345,repository:REPO,
  permissions:{metadata:'read',contents:'read',checks:'read'},
  issuedAtSeconds:1000,expiresAtSeconds:1800});
const root='/repos/'+REPO;
const paths={branch:root+'/branches/main',rules:root+'/rulesets',
  detail:root+'/rulesets/99',checks:root+'/commits/'+SHA+'/check-runs',
  policy:root+'/contents/AGENTS.md?ref='+SHA};
function fixtures(){return {
  [root]:{full_name:REPO,default_branch:'main',archived:false},
  [paths.branch]:{name:'main',protected:true,commit:{sha:SHA}},
  [paths.rules]:[{id:99,name:'agentkit-main',target:'branch',enforcement:'active'}],
  [paths.detail]:{id:99,name:'agentkit-main',source:REPO,target:'branch',enforcement:'active',
    conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},bypass_actors:[],current_user_can_bypass:'never',
    rules:[{type:'deletion'},{type:'non_fast_forward'},
      {type:'pull_request',parameters:{required_approving_review_count:0}},
      {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,
        required_status_checks:[{context:'check',integration_id:APP}]}}]},
  [paths.checks]:{total_count:1,check_runs:[{name:'check',head_sha:SHA,status:'completed',
    conclusion:'success',app:{id:APP}}]},
  [paths.policy]:{path:'AGENTS.md',type:'file',encoding:'base64',sha:blob,content:data.toString('base64')},
};}
function response(url,body,status=200,headers={}){
  const bytes=Buffer.from(JSON.stringify(body));
  return {url,status,redirected:false,
    headers:new Headers({'content-type':'application/json',...headers}),
    body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
}
function setup({conf=policy(),observation=identity(),network=fixtures(),now=1200}={}){
  const calls=[];
  let current=now;
  const svc={
    observeInstallation:async()=>{calls.push('identity');return observation;},
    nowSeconds:()=>current,
    transport:async url=>{
      calls.push(url);
      const route=url.slice('https://api.github.com'.length);
      if(!Object.hasOwn(network,route)) throw Error('missing mock route');
      return response(url,structuredClone(network[route]));
    },
  };
  return {calls,svc,inspect:createSyntheticHostBootstrap(conf,svc),setNow:v=>{current=v;}};
}
const denied=e=>e instanceof SyntheticHostError && e.message.startsWith('R3e-02 DENIED');

 test('valid synthetic identity then R3d reads, but always denies ALL operational grants',async()=>{
  const {inspect,calls}=setup();const result=await inspect(task());
  assert.equal(result.kind,'r3e02-synthetic-host-preview');
  assert.equal(result.syntheticInstallationMatched,true);
  assert.equal(result.apiObservationsConsistent,true);
  for (const key of ['independentlyAuthenticatedHost','trustEvidenceIndependentlyVerified',
    'sourceProvenanceVerified','authorizedToExecute','promotionAllowed','writesPerformed'])
    assert.equal(result[key],false,key);
  assert.equal(result.paidApprovalRequired,true);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(calls[0],'identity');assert.equal(calls.length,8);
  assert.ok(calls.slice(1).every(url=>url.startsWith('https://api.github.com'+root)));
});

for (const [label,mutate] of [
  ['wrong app ID',o=>o.appId=412],['wrong installation',o=>o.installationId=999],
  ['wrong stable repository ID',o=>o.repositoryId=1],['wrong repository name',o=>o.repository='another/repo'],
  ['read permission removed',o=>delete o.permissions.checks],
  ['unexpected admin permission',o=>o.permissions.administration='read'],
  ['write permission',o=>o.permissions.contents='write'],
  ['expired token',o=>o.expiresAtSeconds=1100],['not yet issued',o=>o.issuedAtSeconds=1400],
  ['excessive lifetime',o=>o.expiresAtSeconds=5000],
  ['self asserted authentication',o=>o.hostAuthenticated=true],
  ['credentials accidentally returned',o=>o.token='TOPSECRET'],
]) test('reject '+label+' before any GitHub transport',async()=>{
  const observation=identity();mutate(observation);
  const {inspect,calls}=setup({observation});
  await assert.rejects(inspect(task()),denied);
  assert.deepEqual(calls,['identity']);
});

for (const [label,mutate] of [
  ['wrong repo',r=>r.repository='another/repo'],
  ['wrong SHA',r=>r.expectedSha='b'.repeat(40)],
  ['untrusted token',r=>r.githubToken='TOPSECRET'],
  ['untrusted transport',r=>r.transport=async()=>{}],
  ['fake host proof',r=>r.hostAuthenticated=true],
]) test('reject task '+label+' before observations',async()=>{
  const {inspect,calls}=setup();const r=task();mutate(r);
  await assert.rejects(inspect(r),denied);assert.equal(calls.length,0);
});

test('reject accessor request without invoking getter',async()=>{
  let read=false;const {inspect,calls}=setup();const r=task();
  Object.defineProperty(r,'repository',{get(){read=true;return REPO;}});
  await assert.rejects(inspect(r),denied);assert.equal(read,false);assert.equal(calls.length,0);
});

test('reject unknown host configuration or service secret before I/O',()=>{
  const c=policy();c.token='TOPSECRET';
  assert.throws(()=>createSyntheticHostBootstrap(c,setup().svc),denied);
  const {svc}=setup();svc.authorization='Bearer TOPSECRET';
  assert.throws(()=>createSyntheticHostBootstrap(policy(),svc),denied);
});

test('reject accessor in host identity without evaluating it',()=>{
  const c=policy();let read=false;
  Object.defineProperty(c.installation,'appId',{get(){read=true;return 411;}});
  assert.throws(()=>createSyntheticHostBootstrap(c,setup().svc),denied);assert.equal(read,false);
});

test('mutating pinned config after bootstrap cannot change expected identity',async()=>{
  const p=policy();const {svc,calls}=setup();const inspect=createSyntheticHostBootstrap(p,svc);
  p.hostPolicy.repository='other/repo';p.installation.appId=10;
  p.installation.permissions.checks='write';p.hostPolicy.checkContexts[0]='injected';
  const res=await inspect(task());assert.equal(res.repository,REPO);assert.equal(calls.length,8);
});

test('deny upstream ref moved, HTTP errors, incomplete pagination, forged policy bytes',async()=>{
  for(const [label,alter] of [
    ['ref moved',f=>f[paths.branch].commit.sha='b'.repeat(40)],
    ['incomplete checks',f=>f[paths.checks].total_count=4],
    ['different check app',f=>f[paths.checks].check_runs[0].app.id=1],
    ['policy tamper',f=>f[paths.policy].content=Buffer.from('bad').toString('base64')],
    ['inactive rules',f=>f[paths.detail].enforcement='disabled'],
  ]) {const f=fixtures();alter(f);const {inspect}=setup({network:f});
    await assert.rejects(inspect(task()),denied,label);}
  let n=0;const svc=setup().svc;svc.transport=async url=>{
    n++;return response(url,{error:'blocked'},429);
  };
  const inspect=createSyntheticHostBootstrap(policy(),svc);
  await assert.rejects(inspect(task()),denied);assert.equal(n,1,'no automatic retries');
});

test('fail closed if installation observation throws or network unavailable, with sanitized errors',async()=>{
  const svc=setup().svc;svc.observeInstallation=async()=>{throw Error('TOPSECRET');};
  await assert.rejects(createSyntheticHostBootstrap(policy(),svc)(task()),e=>denied(e)&&!e.message.includes('TOPSECRET'));
  const svc2=setup().svc;svc2.transport=async()=>{throw Error('TOPSECRET');};
  await assert.rejects(createSyntheticHostBootstrap(policy(),svc2)(task()),e=>denied(e)&&!e.message.includes('TOPSECRET'));
});

test('identity expires during GitHub read and clock rolls back: deny',async()=>{
  const a=setup();const original=a.svc.transport;
  a.svc.transport=async(...args)=>{a.setNow(1800);return original(...args);};
  await assert.rejects(createSyntheticHostBootstrap(policy(),a.svc)(task()),denied);
  const b=setup();const orig=b.svc.transport;
  b.svc.transport=async(...args)=>{b.setNow(1000);return orig(...args);};
  await assert.rejects(createSyntheticHostBootstrap(policy(),b.svc)(task()),denied);
});

test('revoke/expire next observation: no cached identity, all grants remain unavailable',async()=>{
  const obs=identity();const {inspect,calls}=setup({observation:obs});
  await inspect(task());obs.expiresAtSeconds=1200;
  await assert.rejects(inspect(task()),denied);
  assert.equal(calls.filter(x=>x==='identity').length,2);
});

test('concurrent calls fail closed instead of sharing a mutable identity preflight',async()=>{
  const {svc}=setup();let release;
  svc.observeInstallation=()=>new Promise(resolve=>{release=resolve;});
  const inspect=createSyntheticHostBootstrap(policy(),svc);
  const pending=inspect(task());
  await assert.rejects(inspect(task()),denied);
  release(identity());const result=await pending;
  assert.equal(result.authorizedToExecute,false);
});
