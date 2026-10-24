/**
 * R3h-04: isolated Linux-only local CAS QUALIFICATION, not GitHub persistence.
 * Only a new private OS temp directory is touched; no target path accepted.
 * Uses one mkdir-exclusive lock and one read-compare-rename CAS per update.
 * No LLM, credentials, network, protected Git ref or paid retry.
 */
import {
  mkdtempSync, mkdirSync, rmdirSync, readdirSync, lstatSync, fstatSync,
  openSync, readFileSync, writeFileSync, fsyncSync, closeSync,
  renameSync, rmSync, unlinkSync, chmodSync, symlinkSync, linkSync
} from 'node:fs';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { previewCheckpointJournalRecovery } from './checkpoint-journal-preview.mjs';

export class DisposableCasError extends Error {
  constructor() {
    super('R3h-04 DENY: isolated local checkpoint CAS inconsistent');
    this.name='DisposableCasError';
  }
}
const deny=()=>{throw new DisposableCasError();};
const faults=new Set(['none','crash-before-rename','stale-version',
  'replay','symlink','hardlink','world-readable','interprocess-orphan-lock',
  'corrupt-current','missing-current']);
const MAX=1048576;
const mode=st=>st.mode & 0o777;
function privateRoot(root) {
  const st=lstatSync(root);
  if(!st.isDirectory()||st.isSymbolicLink()||mode(st)!==0o700)deny();
  if(!Number.isInteger(constants.O_NOFOLLOW)||
    !Number.isInteger(constants.O_DIRECTORY))deny();
}
function syncDir(root) {
  const fd=openSync(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
function regular(path) {
  const before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||mode(before)!==0o600||
      before.nlink!==1||before.size<16||before.size>MAX)deny();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const after=fstatSync(fd);
    if(!after.isFile()||after.dev!==before.dev||after.ino!==before.ino||
      after.nlink!==1||mode(after)!==0o600||after.size!==before.size)deny();
    const bytes=readFileSync(fd);
    if(bytes.length!==after.size)deny();
    const serialized=bytes.toString('utf8');
    if(!Buffer.from(serialized,'utf8').equals(bytes)||
      !serialized.endsWith('\n'))deny();
    const parsed=JSON.parse(serialized);
    if(JSON.stringify(parsed)+'\n'!==serialized)deny();
    return parsed;
  }finally{closeSync(fd);}
}
function writeExclusive(file,bytes) {
  if(bytes.length<16||bytes.length>MAX)deny();
  const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {
    const st=fstatSync(fd);
    if(!st.isFile()||mode(st)!==0o600||st.nlink!==1)deny();
    writeFileSync(fd,bytes);
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function snapshot(policy,entries,observed,mutexGroup) {
  return previewCheckpointJournalRecovery(policy,entries,observed,mutexGroup);
}
function obsFor(observed,latest) {
  return {...observed,headSha:latest.headSha,parentSha:latest.parentSha,
    journalDigest:latest.digest};
}
function withLock(root,execute) {
  const lock=join(root,'.cas-lock');
  mkdirSync(lock,{mode:0o700}); // atomic interprocess acquisition; no lock stealing
  try {
    const st=lstatSync(lock);
    if(!st.isDirectory()||st.isSymbolicLink()||mode(st)!==0o700)deny();
    return execute();
  }finally{rmdirSync(lock);}
}
function cas(root,policy,desired,expected,observed,mutexGroup,interrupt=false) {
  privateRoot(root);
  return withLock(root,()=>{
    const journal=join(root,'journal.json');
    const existing=readdirSync(root).filter(name=>name!=='.cas-lock');
    let previous=null;
    if(expected===null) {
      if(existing.length!==0||desired.length!==1)deny();
    } else {
      if(existing.length!==1||existing[0]!=='journal.json')deny();
      previous=regular(journal);
      if(!Array.isArray(previous)||previous.length<1||previous.length>2||
        previous.at(-1)?.digest!==expected||
        desired.length!==previous.length+1)deny();
      if(JSON.stringify(previous)!==JSON.stringify(desired.slice(0,-1)))deny();
    }
    const verified=snapshot(policy,desired,observed,mutexGroup);
    if(verified.inspectedEntries!==desired.length)deny();
    const bytes=Buffer.from(JSON.stringify(desired)+'\n','utf8');
    const staged=join(root,'.pending.json');
    if(interrupt) {
      const cut=bytes.subarray(0,Math.floor(bytes.length/2));
      writeExclusive(staged,cut);
      syncDir(root);
      // Simulated process interruption: no rename, committed journal untouched.
      return Object.freeze({interrupted:true,verified});
    }
    writeExclusive(staged,bytes);
    if(!regular(staged) || !readFileSync(staged).equals(bytes))deny();
    renameSync(staged,journal); // same-dir rename only under exclusive lock
    syncDir(root);
    const checked=regular(journal);
    if(JSON.stringify(checked)!==JSON.stringify(desired))deny();
    return Object.freeze({interrupted:false,verified});
  });
}
/**
 * Mock fixture only: the caller cannot select a path, command, token or actor.
 * On interruption we inspect the intact old checkpoint, NEVER auto-retry.
 */
export function qualifyDisposableCheckpointCas(
  policy,entries,observed,expectedMutexGroup,fault='none') {
  let root=null;
  try {
    if(typeof fault!=='string'||!faults.has(fault)||
       !Array.isArray(entries)||entries.length!==2)deny();
    const current=JSON.parse(JSON.stringify(entries));
    const final=snapshot(policy,current,observed,expectedMutexGroup);
    const planned=current.slice(0,1);
    const initial=snapshot(policy,planned,obsFor(observed,planned[0]),
      expectedMutexGroup);
    if(final.inspectedEntries!==2||initial.inspectedEntries!==1)deny();
    root=mkdtempSync(join(tmpdir(),'asf-r3h04-'));
    privateRoot(root);
    const created=cas(root,policy,planned,null,
      obsFor(observed,planned[0]),expectedMutexGroup);
    if(created.interrupted)deny();
    const journal=join(root,'journal.json');
    let attempted=false,priorIntact=false,casCompleted=false,
      foreignProcessLockDetected=false;
    if(fault==='interprocess-orphan-lock') {
      const lock=join(root,'.cas-lock');
      // Path is generated here, never accepted from the caller.
      const script="require('node:fs').mkdirSync(process.argv[1],{mode:0o700})";
      const child=spawnSync(process.execPath,['-e',script,lock],
        {timeout:4000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
      if(child.status!==0||child.error)deny();
      foreignProcessLockDetected=true;
    } else if(fault==='symlink') {
      unlinkSync(journal);
      symlinkSync('invalid-local-target',journal);
    } else if(fault==='hardlink') {
      linkSync(journal,join(root,'untrusted-alias'));
    } else if(fault==='world-readable') {
      chmodSync(journal,0o644);
    } else if(fault==='corrupt-current') {
      writeFileSync(journal,'not json\n');
    } else if(fault==='missing-current') {
      unlinkSync(journal);
    }
    const expected=fault==='stale-version'?'0'.repeat(64):planned[0].digest;
    const desired=fault==='replay'?planned:current;
    attempted=true;
    const result=cas(root,policy,desired,expected,observed,
      expectedMutexGroup,fault==='crash-before-rename');
    casCompleted=!result.interrupted;
    if(fault==='crash-before-rename') {
      // The partial pending file is never accepted as the committed snapshot.
      const old=regular(journal);
      if(JSON.stringify(old)!==JSON.stringify(planned))deny();
      priorIntact=true;
      const pending=join(root,'.pending.json');
      if(!lstatSync(pending).isFile())deny();
      unlinkSync(pending); // cleanup in an isolated fixture, not a retry
      syncDir(root);
    } else {
      const stored=regular(journal);
      if(JSON.stringify(stored)!==JSON.stringify(current))deny();
    }
    const names=readdirSync(root);
    if(names.length!==1||names[0]!=='journal.json')deny();
    return Object.freeze({
      kind:'r3h04-disposable-local-cas-qualification',
      expectedPlanDigest:planned[0].digest,
      syntheticAppliedHeadSha:casCompleted?current.at(-1).headSha:null,
      localCompareAndSwapExercised:attempted,
      localCasCompleted:casCompleted,
      simulatedInterruptedWriteRetainedPrevious:priorIntact,
      interprocessOrphanLockRejected:foreignProcessLockDetected,
      temporaryFileRetained:false,disposableLocalWritesPerformed:true,
      targetRepositoryWritesPerformed:false,gitRefsWritten:false,
      checkpointBytesDurablyStored:false,independentlyAuthenticatedHost:false,
      mutexIndependentlyVerified:false,resumeAuthorized:false,
      authorizedToExecute:false,sourceProvenanceVerified:false,
      trustEvidenceIndependentlyVerified:false,promotionAllowed:false,
      paidApprovalRequired:true,
    });
  }catch{deny();}
  finally{
    if(root!==null){try{rmSync(root,{recursive:true,force:true});}catch{deny();}}
  }
}
