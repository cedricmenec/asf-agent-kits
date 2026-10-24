/**
 * R3h-03: disposable LOCAL BYTE qualification only, never operational persistence.
 * The only filesystem location is a newly allocated private OS temp directory.
 * No target-repository path, remote token, URL, ref update or model execution.
 * Linux-only fd no-follow; all temporary bytes are removed after the check.
 */
import {
  mkdtempSync, openSync, closeSync, fsyncSync, writeFileSync, readFileSync,
  lstatSync, fstatSync, readdirSync, truncateSync, chmodSync, unlinkSync,
  symlinkSync, linkSync, rmSync
} from 'node:fs';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCheckpointJournalRecovery } from './checkpoint-journal-preview.mjs';

export class DisposableJournalFixtureError extends Error {
  constructor() {
    super('R3h-03 DENY: disposable checkpoint journal bytes inconsistent');
    this.name='DisposableJournalFixtureError';
  }
}
const deny=()=>{ throw new DisposableJournalFixtureError(); };
const faults=new Set(['none','truncate','flip','replace','symlink',
  'world-readable','hardlink','extra-file']);
const mode=x=>x.mode & 0o777;
function inspectPrivateRoot(root) {
  const st=lstatSync(root);
  if(!st.isDirectory() || st.isSymbolicLink() || mode(st)!==0o700)
    deny();
}
function openNofollow(file,modeBits) {
  if(!Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_DIRECTORY)) deny();
  return openSync(file,modeBits|constants.O_NOFOLLOW,0o600);
}
function syncDirectory(root) {
  const fd=openNofollow(root,constants.O_RDONLY|constants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function corrupt(root,file,bytes,fault) {
  switch(fault) {
    case 'none': break;
    case 'truncate': truncateSync(file,Math.max(1,Math.floor(bytes.length/2)));break;
    case 'flip': {
      // Replace one valid ASCII byte without changing the total byte length.
      const altered=Buffer.from(bytes);
      altered[0]=altered[0]===0x7b?0x5b:0x7b;
      writeFileSync(file,altered);break;
    }
    case 'replace':
      unlinkSync(file);writeFileSync(file,'[]\n',{mode:0o600});break;
    case 'symlink':
      unlinkSync(file);symlinkSync('nonexistent-target',file);break;
    case 'world-readable': chmodSync(file,0o644);break;
    case 'hardlink': linkSync(file,join(root,'alias.json'));break;
    case 'extra-file': writeFileSync(join(root,'unexpected.txt'),'x',{mode:0o600});break;
    default: deny();
  }
}
/**
 * "fault" is a closed test-only fault-injection enumerator, not a path/callback.
 * No caller-supplied path is accepted. The root is removed on any outcome.
 */
export function qualifyDisposableCheckpointJournal(
  policy, entries, observed, expectedMutexGroup, fault='none') {
  let root=null,fd=null;
  try {
    if(typeof fault!=='string'||!faults.has(fault)) deny();
    // Gate all input BEFORE any temporary file I/O.
    const preflight=previewCheckpointJournalRecovery(
      policy,entries,observed,expectedMutexGroup);
    const source=JSON.stringify(entries)+'\n';
    const bytes=Buffer.from(source,'utf8');
    if(bytes.length<16||bytes.length>1048576) deny();
    root=mkdtempSync(join(tmpdir(),'asf-r3h03-'));
    inspectPrivateRoot(root);
    const file=join(root,'journal.json');
    fd=openNofollow(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL);
    const created=fstatSync(fd);
    if(!created.isFile()||mode(created)!==0o600||created.nlink!==1) deny();
    writeFileSync(fd,bytes);
    fsyncSync(fd);
    closeSync(fd);fd=null;
    syncDirectory(root);
    corrupt(root,file,bytes,fault);

    if(readdirSync(root).length!==1||readdirSync(root)[0]!=='journal.json') deny();
    const before=lstatSync(file);
    if(!before.isFile()||before.isSymbolicLink()||
      mode(before)!==0o600||before.nlink!==1||
      before.size!==bytes.length) deny();
    fd=openNofollow(file,constants.O_RDONLY);
    const opened=fstatSync(fd);
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
      opened.nlink!==1||opened.size!==bytes.length) deny();
    const reread=readFileSync(fd);
    closeSync(fd);fd=null;
    if(!reread.equals(bytes)) deny();
    const recovered=JSON.parse(reread.toString('utf8'));
    const inspected=previewCheckpointJournalRecovery(
      policy,recovered,observed,expectedMutexGroup);
    if(inspected.journalDigest!==preflight.journalDigest||
      inspected.syntheticHeadSha!==preflight.syntheticHeadSha) deny();
    return Object.freeze({
      kind:'r3h03-disposable-checkpoint-byte-qualification',
      inspectedEntries:inspected.inspectedEntries,
      syntheticHeadSha:inspected.syntheticHeadSha,
      disposableByteReadMatched:true,
      fileFsyncCompleted:true,
      temporaryFileRetained:false,
      disposableLocalWritesPerformed:true,
      targetRepositoryWritesPerformed:false,
      gitRefsWritten:false,
      checkpointBytesDurablyStored:false,
      independentlyAuthenticatedHost:false,
      mutexIndependentlyVerified:false,
      resumeAuthorized:false,authorizedToExecute:false,
      sourceProvenanceVerified:false,trustEvidenceIndependentlyVerified:false,
      promotionAllowed:false,paidApprovalRequired:true,
    });
  } catch { deny(); }
  finally {
    if(fd!==null){try{closeSync(fd);}catch{deny();}}
    if(root!==null){try{rmSync(root,{recursive:true,force:true});}catch{deny();}}
  }
}
