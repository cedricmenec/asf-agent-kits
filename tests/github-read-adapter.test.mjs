import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestrictedGithubGet, GithubReadError } from '../core/github-read-adapter.mjs';

const SHA = 'a'.repeat(40);
const BASE = '/repos/example/agent-kits';
const REPO = { full_name: 'example/agent-kits', default_branch: 'main', archived: false };
const allowed = [
  BASE, BASE + '/branches/main', BASE + '/rulesets', BASE + '/rulesets/12',
  BASE + '/commits/' + SHA + '/check-runs',
  BASE + '/contents/AGENTS.md?ref=' + SHA,
  BASE + '/contents/.asf/agentkit.yaml?ref=' + SHA,
];
const caseResponse = kind => kind === 'rulesets' ? [{id: 12, name: 'test'}] :
  kind === 'checks' ? { total_count: 1, check_runs: [{name:'check'}] } : REPO;
function response(url, value = REPO, options = {}) {
  const headers = new Headers({ 'content-type': 'application/json', ...(options.headers ?? {}) });
  const bytes = options.bytes ?? Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  const body = options.body ?? new ReadableStream({
    start(controller) { controller.enqueue(bytes); controller.close(); },
  });
  return {url:options.url ?? url, status:options.status ?? 200,
    redirected:options.redirected ?? false, headers, body};
}
function configured(transport, overrides = {}) {
  return createRestrictedGithubGet({repository:'example/agent-kits',branch:'main',expectedSha:SHA,
    transport, ...overrides});
}
const isDenied = error => error instanceof GithubReadError && /R3c READ DENIED/.test(error.message);

test('accepted exact REST routes, read-only method, HTTPS origin, no auth bytes in adapter', async () => {
  const calls=[];
  const get=configured(async(url, options)=>{
    calls.push({url, options});
    const kind=url.endsWith('/rulesets')?'rulesets':url.includes('/check-runs')?'checks':'other';
    return response(url,caseResponse(kind));
  });
  for (const path of allowed) assert.ok(await get(path));
  assert.equal(calls.length, allowed.length);
  for (const call of calls) {
    assert.ok(call.url.startsWith('https://api.github.com/repos/example/agent-kits'));
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.redirect,'manual');
    assert.equal(call.options.headers.Accept,'application/vnd.github+json');
    assert.equal(call.options.headers['X-GitHub-Api-Version'],'2022-11-28');
    assert.equal('Authorization' in call.options.headers, false);
    assert.equal('body' in call.options,false);
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test('canonical branch with slash can use one percent-encoded component', async()=>{
  const get=createRestrictedGithubGet({repository:'example/agent-kits',branch:'release/one',expectedSha:SHA,
    transport: async url => response(url,{name:'release/one',protected:true,commit:{sha:SHA}})});
  assert.equal((await get(BASE+'/branches/release%2Fone')).name,'release/one');
  await assert.rejects(get(BASE+'/branches/release/one'),isDenied);
  await assert.rejects(get(BASE+'/branches/release%2fone'),isDenied);
});

for(const [name, options] of [
  ['missing transport',{transport:null}], ['invalid repo',{repository:'example/agent-kits/other'}],
  ['parent repo',{repository:'../agent-kits'}], ['trailing owner dot',{repository:'example./agent-kits'}],
  ['invalid sha',{expectedSha:'ab'}], ['upper sha',{expectedSha:'A'.repeat(40)}],
  ['unsafe branch',{branch:'main/../admin'}], ['double slash branch',{branch:'foo//bar'}],
  ['extra token field',{token:'user-injected-secret'}], ['base URL override',{baseUrl:'https://evil.invalid'}],
  ['spoof host boolean',{hostAuthenticated:true}], ['invalid max bytes',{maxBytes:4}],
  ['unbounded max bytes',{maxBytes:9000000}], ['zero timeout',{timeoutMs:0}],
]) test('reject configuration: '+name,()=>{
  assert.throws(()=>configured(async url=>response(url),options),isDenied);
});

for(const path of [
  'https://api.github.com'+BASE, 'http://api.github.com'+BASE, BASE+'/other',
  BASE+'/branches/other', BASE+'/branches/main/..', BASE+'/branches/main?foo=1',
  BASE+'/contents/AGENTS.md',BASE+'/contents/AGENTS.md?ref='+'b'.repeat(40),
  BASE+'/contents/.github/workflows/ci.yml?ref='+SHA,
  BASE+'/contents/AGENTS.md?ref='+SHA+'&token=example',
  BASE+'/commits/'+'b'.repeat(40)+'/check-runs',
  BASE+'/rulesets/0',BASE+'/rulesets/-1',BASE+'/rulesets/1/extra',
  BASE+'/rulesets?per_page=999',
  '/repos/example/agent-kits-evil', '/repos/evil/agent-kits',
  BASE+'/branches/%6dain', BASE+'/branches/main%2fother',
  BASE+'/branches/main%252fother',BASE+'/branches/main#frag',
  BASE+'/%2E%2E/secrets',BASE+'/rulesets/1?redirect=https://evil.invalid',
  BASE+'/rulesets\n',BASE+'/branches/ma\\in',BASE+'/rulesets/1234567890123456',
]) test('fail closed path: '+path.replaceAll('\n','\\n'), async()=>{
  let calls=0;
  const get=configured(async url=>{ calls++; return response(url); });
  await assert.rejects(get(path), isDenied);
  assert.equal(calls,0);
});

for(const status of [201,206,301,302,307,308,401,403,404,429,500,503])
  test('refuse HTTP status '+status,async()=>{
    const get=configured(async url=>response(url,REPO,{status}));
    await assert.rejects(get(BASE),isDenied);
  });

test('refuse redirected response even if 200',async()=>{
  const get=configured(async url=>response(url,REPO,{redirected:true}));
  await assert.rejects(get(BASE),isDenied);
});
test('refuse response with unexpected URL, including different origin',async()=>{
  const get=configured(async url=>response(url,REPO,{url:'https://evil.invalid/redirect'}));
  await assert.rejects(get(BASE),isDenied);
});
test('refuse redirect location without trusting status',async()=>{
  const get=configured(async url=>response(url,REPO,{status:302,headers:{location:'https://evil.invalid'}}));
  await assert.rejects(get(BASE),isDenied);
});
for (const type of ['text/html','application/javascript','', 'application/octet-stream'])
  test('refuse unsupported content-type '+type,async()=>{
    const get=configured(async url=>response(url,REPO,{headers:{'content-type':type}}));
    await assert.rejects(get(BASE),isDenied);
  });
for (const length of ['999999999','bogus','-1','01'])
  test('refuse invalid content-length '+length,async()=>{
    const get=configured(async url=>response(url,REPO,{headers:{'content-length':length}}));
    await assert.rejects(get(BASE),isDenied);
  });
test('hard stream byte cap, even if Content-Length is absent',async()=>{
  const get=configured(async url=>response(url,REPO,{bytes:Buffer.alloc(257,65)}),{maxBytes:256});
  await assert.rejects(get(BASE),isDenied);
});
test('hard stream cap despite understated Content-Length',async()=>{
  const get=configured(async url=>response(url,REPO,{bytes:Buffer.alloc(300,65),headers:{'content-length':'1'}}),{maxBytes:256});
  await assert.rejects(get(BASE),isDenied);
});
test('reject missing readable stream',async()=>{
  const get=configured(async url=>({...response(url),body:null}));
  await assert.rejects(get(BASE),isDenied);
});
test('reject malformed JSON and non-UTF8',async()=>{
  const cases=[Buffer.from('{broken'),Buffer.from([0xff,0xfe]),Buffer.from('"scalar"')];
  for(const bytes of cases){
    const get=configured(async url=>response(url,undefined,{bytes}));
    await assert.rejects(get(BASE),isDenied);
  }
});
test('reject pagination link next for rulesets',async()=>{
  const get=configured(async url=>response(url,[],{headers:{link:'<https://api.github.com/next>; rel="next"'}}));
  await assert.rejects(get(BASE+'/rulesets'),isDenied);
});
test('reject paginated check-runs with mismatch total_count',async()=>{
  const get=configured(async url=>response(url,{total_count:9,check_runs:[{name:'check'}]}));
  await assert.rejects(get(BASE+'/commits/'+SHA+'/check-runs'),isDenied);
});
test('reject check-runs with missing total_count',async()=>{
  const get=configured(async url=>response(url,{check_runs:[]}));
  await assert.rejects(get(BASE+'/commits/'+SHA+'/check-runs'),isDenied);
});
test('reject oversized rulesets collection',async()=>{
  const get=configured(async url=>response(url,Array.from({length:101},(_,i)=>({id:i}))));
  await assert.rejects(get(BASE+'/rulesets'),isDenied);
});
test('transport failure refused, no retries',async()=>{
  let calls=0;
  const get=configured(async()=>{ calls++; throw Error('secret in low-level transport error'); });
  await assert.rejects(get(BASE), e=>isDenied(e)&&!e.message.includes('secret'));
  assert.equal(calls,1);
});
test('hung transport times out and aborts; no retries',async()=>{
  let calls=0;
  let sawSignal;
  const get=configured(async(_url, opts)=>{calls++;sawSignal=opts.signal;return await new Promise(()=>{});},{timeoutMs:20});
  await assert.rejects(get(BASE), e=>isDenied(e)&&/deadline/.test(e.message));
  assert.equal(calls,1);
  assert.equal(sawSignal.aborted,true);
});
test('hung stream read times out and aborts',async()=>{
  let sawSignal;
  const get=configured(async(url,opts)=>{
    sawSignal=opts.signal;
    return response(url,REPO,{body:new ReadableStream({start(){}})});
  },{timeoutMs:20});
  await assert.rejects(get(BASE),isDenied);
  assert.equal(sawSignal.aborted,true);
});
