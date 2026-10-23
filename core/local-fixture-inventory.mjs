/**
 * R3g-01: strictly read-only byte inventory of a disposable local fixture.
 * A fixture directory is host-selected, never a target repository or credential.
 * No write, Git command, provider call, semantic OPSX or execution grant.
 */
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
export class LocalFixtureError extends Error {
  constructor() { super('R3g-01 DENY: unsafe or inconsistent local fixture'); this.name='LocalFixtureError'; }
}
const deny=()=>{throw new LocalFixtureError();};
const hash=b=>createHash('sha256').update(b).digest('hex');
const valid=p=>typeof p==='string'&&p.length>0&&p.length<=320&&p.normalize('NFC')===p&&
  !p.includes('\\')&&!/[\x00-\x1f\x7f]/.test(p)&&
  p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.endsWith(':'));
/**
 * Inventory a disposable root with host-pinned expected paths and HEAD.
 * Re-open and compare file metadata around the read to detect ordinary races.
 * This is not a proof against a privileged concurrent filesystem adversary.
 */
export async function inventoryLocalFixture(root, headSha, expectedPaths) {
  if(typeof root!=='string'||!root||!Array.isArray(expectedPaths)||
    Object.getPrototypeOf(expectedPaths)!==Array.prototype||
    expectedPaths.length<1||expectedPaths.length>500||
    Reflect.ownKeys(expectedPaths).length!==expectedPaths.length+1||
    !/^[a-f0-9]{40}$/.test(headSha))deny();
  const base=resolve(root);
  try {
    const rootStat=await lstat(base);
    if(!rootStat.isDirectory()||rootStat.isSymbolicLink())deny();
    const actualRoot=await realpath(base);
    if(actualRoot!==base)deny();
    const seen=new Set(),files=[];
    for(let i=0;i<expectedPaths.length;i++){
      const descriptor=Object.getOwnPropertyDescriptor(expectedPaths,String(i));
      if(!descriptor||!Object.hasOwn(descriptor,'value')||!valid(descriptor.value))deny();
      const name=descriptor.value,key=name.toLowerCase();
      if(seen.has(key))deny();seen.add(key);
      let dir=base;
      const parts=name.split('/');
      for(const part of parts.slice(0,-1)){
        dir=resolve(dir,part);
        const stat=await lstat(dir);
        if(!stat.isDirectory()||stat.isSymbolicLink())deny();
      }
      const target=resolve(dir,parts.at(-1));
      if(!relative(base,target)||relative(base,target).startsWith('..'+sep)||
        relative(base,target)==='..')deny();
      const before=await lstat(target);
      if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
        before.size>1024*1024||before.size<0||before.mode&0o111)deny();
      const bytes=await readFile(target);
      const after=await lstat(target);
      if(bytes.length!==before.size||before.dev!==after.dev||
        before.ino!==after.ino||before.size!==after.size||
        before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||
        before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)deny();
      files.push(Object.freeze({path:name,mode:'100644',sha256:hash(bytes),type:'file'}));
    }
    // Reject any unreviewed file, including hidden files, in this disposable fixture.
    async function walk(directory,prefix=''){
      const entries=await readdir(directory,{withFileTypes:true});
      for(const entry of entries){
        const name=prefix+entry.name;
        if(!valid(name)||entry.isSymbolicLink())deny();
        if(entry.isDirectory())await walk(resolve(directory,entry.name),name+'/');
        else if(!entry.isFile()||!seen.has(name.toLowerCase())||
          !files.some(f=>f.path===name))deny();
      }
    }
    await walk(base);
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    return Object.freeze({headSha,files:Object.freeze(files)});
  }catch{deny();}
}
