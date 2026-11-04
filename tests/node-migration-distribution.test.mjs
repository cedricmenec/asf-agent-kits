import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fs,path,ROOT,git,hash,strictFile} from '../tools/node/common.mjs';
import {RELEASE_PATHS,build_release_manifest} from '../tools/build_release_manifest.mjs';
import {build_git_candidate} from '../tools/build_candidate.mjs';
test('Node distribution inventory builds deterministically from exact Git objects',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'asf-node-release-'));
 try{
  for(const p of RELEASE_PATHS){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(path.join(ROOT,p),path.join(root,p));}
  git(root,'init','-q');git(root,'remote','add','origin','https://github.com/cedricmenec/asf-agent-kits');git(root,'add','.');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Node distribution');const sha=git(root,'rev-parse','HEAD').toString().trim();
  const manifest=build_release_manifest(root,sha);assert.deepEqual(build_release_manifest(root,sha),manifest);
  assert.equal(manifest.runtime.nodeVersion,'26.13.0');assert.equal(manifest.artifacts.length,RELEASE_PATHS.length);
  for(const a of manifest.artifacts)assert.equal(a.sha256,hash(fs.readFileSync(path.join(root,a.path))));
  for(const p of ['package.json','package-lock.json','tools/node/common.mjs','tools/node/secure-fs.mjs','tools/validate_contracts.mjs'])assert.ok(RELEASE_PATHS.includes(p),p);
  const doc={...manifest,paths:manifest.artifacts.map(a=>a.path)};delete doc.artifacts;
  fs.writeFileSync(path.join(root,'kits/opencode-openspec/version.json'),'{"untrusted":true}');assert.deepEqual(build_git_candidate(root,sha,doc),manifest);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('all maintained execution pins select the same reviewed Node LTS',()=>{
 assert.equal(fs.readFileSync(path.join(ROOT,'.nvmrc'),'utf8').trim(),'26.13.0');assert.equal(strictFile(path.join(ROOT,'package.json')).engines.node,'>=26.13.0 <27');
 for(const p of ['.github/workflows/ci.yml','kits/opencode-openspec/templates/agent-openspec.yml.tmpl']){const s=fs.readFileSync(path.join(ROOT,p),'utf8');assert.ok(s.includes("node-version: '26.13.0'"));assert.equal(s.includes('setup-python'),false);}
});
for(const argv of [['bogus'],['install','--unknown'],['status','--repo','example/repo','--checkout','missing','--apply']])test('CLI returns refusal for invalid invocation '+argv.join(' '),()=>{const r=spawnSync(process.execPath,[path.join(ROOT,'bin/asf-agentkit'),...argv],{encoding:'utf8'});assert.equal(r.status,3);assert.equal(r.stdout,'');assert.ok(r.stderr.startsWith('ASF-AgentKit REFUSED: '));});

test('npm engine policy rejects an incompatible runtime and accepts supported Node 26',()=>{
 assert.equal(fs.readFileSync(path.join(ROOT,'.npmrc'),'utf8').trim(),'engine-strict=true');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'asf-engine-policy-'));
 try{
  fs.copyFileSync(path.join(ROOT,'.npmrc'),path.join(root,'.npmrc'));
  const env={...process.env};
  for(const key of Object.keys(env))if(/^npm_config_engine_strict$/i.test(key))delete env[key];
  const install=engine=>{
   fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'asf-engine-policy-fixture',version:'1.0.0',private:true,engines:{node:engine}}));
   return spawnSync('npm',['install','--package-lock-only','--ignore-scripts','--offline','--no-audit','--no-fund'],{cwd:root,env,encoding:'utf8',timeout:30000});
  };
  const denied=install('<26');
  assert.notEqual(denied.status,0,'npm must reject the incompatible engine');
  assert.match(denied.stderr,/EBADENGINE/);
  const accepted=install('>=26.13.0 <27');
  assert.equal(accepted.status,0,accepted.stderr);
  assert.equal(strictFile(path.join(root,'package-lock.json')).packages[''].engines.node,'>=26.13.0 <27');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
