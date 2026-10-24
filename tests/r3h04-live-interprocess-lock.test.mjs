/**
 * R3h-04b: two LIVE OS child processes exercise the exact Linux mkdir-exclusive
 * lock primitive used by R3h-04, inside a fresh private temporary root.
 * They do NOT exercise a GitHub CAS, protected refs or paid-job mutex.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, lstatSync, rmSync,
  readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lockHolderScript = `
const { mkdirSync, writeFileSync, existsSync, rmdirSync } = require('node:fs');
const [lock, ready, release] = process.argv.slice(1);
mkdirSync(lock,{mode:0o700});
writeFileSync(ready,'locked',{flag:'wx',mode:0o600});
const end=Date.now()+7000;
while(!existsSync(release) && Date.now()<end)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
const released=existsSync(release);
rmdirSync(lock);
if(!released) process.exitCode=4;
`;
const contenderScript = `
const { mkdirSync, lstatSync, writeFileSync } = require('node:fs');
const [lock, result] = process.argv.slice(1);
try {
  mkdirSync(lock,{mode:0o700});
  // Unacceptable: contender acquired a lock while another process owns it.
  process.exitCode=8;
} catch(error) {
  if(error.code!=='EEXIST' || !lstatSync(lock).isDirectory())
    throw error;
  writeFileSync(result,'rejected-by-EEXIST',{flag:'wx',mode:0o600});
}
`;
const roots=()=>new Set(readdirSync(tmpdir()).filter(x=>x.startsWith('asf-r3h04b-')));
async function waitFile(path,ms=4000){
  const deadline=Date.now()+ms;
  while(!existsSync(path) && Date.now()<deadline)
    await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(existsSync(path),true,'child must acknowledge lock acquisition');
}
function exited(child,limit=6500) {
  return new Promise((resolve,reject)=>{
    if(child.exitCode!==null){resolve({code:child.exitCode,signal:null});return;}
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('fixture child timed out'));},limit);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
  });
}
function child(script,args) {
  return spawn(process.execPath,['-e',script,...args],
    {stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
}
test('two simultaneous processes: contender is denied while lock owner alive',
  {skip:process.platform!=='linux',timeout:12000},async()=>{
    const before=roots(),root=mkdtempSync(join(tmpdir(),'asf-r3h04b-'));
    const lock=join(root,'.cas-lock'),ready=join(root,'holder-ready'),
      release=join(root,'release'),denied=join(root,'contender-denied');
    let holder,contender;
    try {
      assert.equal(lstatSync(root).mode&0o777,0o700);
      holder=child(lockHolderScript,[lock,ready,release]);
      await waitFile(ready);
      assert.equal(holder.exitCode,null,'holder remains alive during contention');
      contender=child(contenderScript,[lock,denied]);
      const result=await exited(contender);
      assert.deepEqual(result,{code:0,signal:null});
      assert.equal(existsSync(denied),true);
      assert.equal(holder.exitCode,null,'holder was alive when EEXIST observed');
      assert.equal(lstatSync(lock).mode&0o777,0o700);
      writeFileSync(release,'release',{flag:'wx',mode:0o600});
      assert.deepEqual(await exited(holder),{code:0,signal:null});
      assert.equal(existsSync(lock),false,'holder removes its own private lock');
    }finally{
      if(holder?.exitCode===null)holder.kill('SIGKILL');
      if(contender?.exitCode===null)contender.kill('SIGKILL');
      rmSync(root,{recursive:true,force:true});
    }
    assert.deepEqual(roots(),before,'fixture root is removed');
  });
test('orphan lock survives child death and refuses another child, never stolen',
  {skip:process.platform!=='linux',timeout:12000},async()=>{
    const before=roots(),root=mkdtempSync(join(tmpdir(),'asf-r3h04b-'));
    const lock=join(root,'.cas-lock'),ready=join(root,'holder-ready'),
      release=join(root,'release'),denied=join(root,'contender-denied');
    let holder,contender;
    try {
      holder=child(lockHolderScript,[lock,ready,release]);
      await waitFile(ready);
      holder.kill('SIGKILL');
      const killed=await exited(holder);
      assert.equal(killed.signal,'SIGKILL');
      assert.equal(existsSync(lock),true);
      contender=child(contenderScript,[lock,denied]);
      assert.deepEqual(await exited(contender),{code:0,signal:null});
      assert.equal(existsSync(denied),true);
      assert.equal(existsSync(lock),true,'lock is not automatically stolen');
    }finally{
      if(holder?.exitCode===null && holder?.signalCode===null)holder.kill('SIGKILL');
      if(contender?.exitCode===null && contender?.signalCode===null)
        contender.kill('SIGKILL');
      rmSync(root,{recursive:true,force:true});
    }
    assert.deepEqual(roots(),before);
  });
