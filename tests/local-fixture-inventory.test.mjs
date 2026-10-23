import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inventoryLocalFixture,LocalFixtureError} from '../core/local-fixture-inventory.mjs';
import {previewOfflineOpsxSync} from '../core/opsx-offline-guard.mjs';
const HEAD='a'.repeat(40),P='openspec/specs/example/spec.md';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'asf-r3g-'));
  try{await mkdir(join(root,'openspec/specs/example'),{recursive:true});
    await writeFile(join(root,P),'# Real bytes\n',{mode:0o600});
    await fn(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
const denied=e=>e instanceof LocalFixtureError;
test('real disposable bytes produce deterministic non-authoritative OPSX inventory',async()=>{
  await fixture(async root=>{
    const before=await inventoryLocalFixture(root,HEAD,[P]);
    assert.equal(before.files[0].sha256,sha('# Real bytes\n'));
    assert.equal(before.files[0].mode,'100644');
    await writeFile(join(root,P),'# Changed bytes\n');
    const after=await inventoryLocalFixture(root,HEAD,[P]);
    const result=previewOfflineOpsxSync({taskId:'TS-009',headSha:HEAD,canonicalPaths:[P]},before,after);
    assert.deepEqual(result.changedCanonicalPaths,[P]);
    assert.equal(result.authorizedToExecute,false);
    assert.equal(result.sourceProvenanceVerified,false);
    assert.equal(result.opsxCommandInvoked,false);
    assert.equal(result.paidApprovalRequired,true);
  });
});
test('reject unmanaged file and missing inventory',async()=>fixture(async root=>{
  await writeFile(join(root,'extra.txt'),'unexpected');
  await assert.rejects(inventoryLocalFixture(root,HEAD,[P]),denied);
  await assert.rejects(inventoryLocalFixture(root,HEAD,['missing.txt']),denied);
}));
test('reject symlinked file and directory',async()=>fixture(async root=>{
  await symlink(join(root,P),join(root,'linked'));
  await assert.rejects(inventoryLocalFixture(root,HEAD,[P]),denied);
}));
test('reject executable mode and hardlink',async()=>fixture(async root=>{
  await chmod(join(root,P),0o755);
  await assert.rejects(inventoryLocalFixture(root,HEAD,[P]),denied);
}));
test('reject duplicate, traversal and untrusted HEAD',async()=>fixture(async root=>{
  for(const paths of [[P,P],[P,P.toUpperCase()],['../escape'],['/etc/passwd'],['openspec//bad'],[]])
    await assert.rejects(inventoryLocalFixture(root,HEAD,paths),denied);
  await assert.rejects(inventoryLocalFixture(root,'bad',[P]),denied);
}));
test('reject malformed array accessors without reading them',async()=>fixture(async root=>{
  const paths=[P];let invoked=false;
  Object.defineProperty(paths,'0',{get(){invoked=true;return P;}});
  await assert.rejects(inventoryLocalFixture(root,HEAD,paths),denied);
  assert.equal(invoked,false);
}));
