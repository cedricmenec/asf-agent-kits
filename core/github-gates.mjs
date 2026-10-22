import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

// R3b consultative observations; the injected GET adapter is NOT authenticated here.
// No grant of payment, deployment, token or model invocation is possible.
export class GithubGateError extends Error {
  constructor(reason) { super('R3b DENY: ' + reason); this.name = 'GithubGateError'; }
}
const deny = x => { throw new GithubGateError(x); };
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,159}$/;
const CHECK = /^[A-Za-z0-9_. -]{1,80}$/;
const RULE = /^[A-Za-z0-9._-]{1,120}$/;
const POLICY = new Set(['AGENTS.md', '.asf/agentkit.yaml']);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
function object(x, where) { if (!plain(x)) deny('malformed ' + where); return x; }
function validate(s, get) {
  const keys = ['repository','branch','expectedSha','rulesetName','checkContexts','checkAppId','policyPath','expectedPolicyBlobSha'];
  if (!plain(s) || Object.keys(s).length !== keys.length ||
      keys.some(k => !Object.prototype.hasOwnProperty.call(s,k))) deny('unexpected input fields');
  if (typeof get !== 'function') deny('missing read-only GitHub GET adapter');
  if (typeof s.repository !== 'string' || !REPO.test(s.repository) || s.repository.includes('..')) deny('untrusted repository');
  if (typeof s.branch !== 'string' || !BRANCH.test(s.branch) || s.branch.includes('..') ||
      s.branch.includes('//') || s.branch.endsWith('/')) deny('untrusted branch');
  if (typeof s.expectedSha !== 'string' || !SHA.test(s.expectedSha)) deny('invalid head SHA');
  if (typeof s.rulesetName !== 'string' || !RULE.test(s.rulesetName)) deny('untrusted ruleset');
  if (!Array.isArray(s.checkContexts) || !s.checkContexts.length || s.checkContexts.length > 20 ||
      s.checkContexts.some(x => typeof x !== 'string' || !CHECK.test(x)) ||
      !s.checkContexts.includes('check') || new Set(s.checkContexts).size !== s.checkContexts.length) deny('invalid checks');
  if (!Number.isSafeInteger(s.checkAppId) || s.checkAppId <= 0) deny('invalid independent CI app');
  if (!POLICY.has(s.policyPath) || typeof s.expectedPolicyBlobSha !== 'string' ||
      !SHA.test(s.expectedPolicyBlobSha)) deny('untrusted policy location or hash');
}
function inspectRuleset(r, s, id) {
  object(r,'ruleset details');
  if (r.id !== id || r.name !== s.rulesetName || r.source !== s.repository ||
      r.target !== 'branch' || r.enforcement !== 'active') deny('ruleset identity mismatch');
  const refs = r.conditions?.ref_name;
  if (!plain(refs) || !Array.isArray(refs.include) || refs.include.length !== 1 ||
      refs.include[0] !== 'refs/heads/' + s.branch ||
      !Array.isArray(refs.exclude) || refs.exclude.length) deny('ruleset target is ambiguous');
  if (!Array.isArray(r.bypass_actors) || r.bypass_actors.length ||
      r.current_user_can_bypass !== 'never') deny('unknown or permitted bypass');
  if (!Array.isArray(r.rules)) deny('missing protection rules');
  for (const t of ['deletion','non_fast_forward','pull_request','required_status_checks'])
    if (r.rules.filter(x => x?.type === t).length !== 1) deny('missing or duplicate ' + t);
  const pr = r.rules.find(x => x.type === 'pull_request').parameters;
  if (!plain(pr) || !Number.isSafeInteger(pr.required_approving_review_count) ||
      pr.required_approving_review_count < 0) deny('missing PR gate');
  const checks = r.rules.find(x => x.type === 'required_status_checks').parameters;
  if (!plain(checks) || checks.strict_required_status_checks_policy !== true ||
      !Array.isArray(checks.required_status_checks)) deny('CI gate is not strict');
  for (const name of s.checkContexts)
    if (checks.required_status_checks.filter(x => x?.context === name &&
        x?.integration_id === s.checkAppId).length !== 1) deny('CI source mismatch');
}
// The caller MUST authenticate the GitHub API transport and runtime actor.
// This intentionally has no trusted-execution output and no mutation path.
export async function inspectGithubManualGate(s, get) {
  validate(s,get);
  const base='/repos/' + s.repository;
  async function read(path) {
    let v;
    try { v=await get(base+path); } catch { deny('GitHub GET failed closed'); }
    if (v === undefined || v === null) deny('empty GitHub response');
    return v;
  }
  const readObject=async path=>object(await read(path),'GitHub response');
  const repository = await readObject('');
  if (repository.full_name !== s.repository || repository.default_branch !== s.branch ||
      repository.archived !== false) deny('repository identity mismatch');
  const br='/branches/'+encodeURIComponent(s.branch);
  const branch=await readObject(br);
  if (branch.name !== s.branch || branch.protected !== true ||
      branch.commit?.sha !== s.expectedSha) deny('protected ref mismatch');
  const listed=await read('/rulesets');
  if (!Array.isArray(listed) || !listed.length || listed.length > 100) deny('ambiguous ruleset list');
  const matches=listed.filter(x => x?.name === s.rulesetName &&
      x?.enforcement === 'active' && x?.target === 'branch');
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) ||
      matches[0].id < 1) deny('required ruleset missing');
  const rules=await readObject('/rulesets/'+matches[0].id);
  inspectRuleset(rules,s,matches[0].id);
  const runs=await readObject('/commits/'+s.expectedSha+'/check-runs');
  if (!Array.isArray(runs.check_runs) || runs.check_runs.length > 1000) deny('unknown check runs');
  for (const context of s.checkContexts) {
    const hits=runs.check_runs.filter(x => x?.name === context &&
        x?.head_sha === s.expectedSha && x?.app?.id === s.checkAppId);
    if (hits.length !== 1 || hits[0].status !== 'completed' ||
        hits[0].conclusion !== 'success') deny('required check not successful at SHA');
  }
  const f=await readObject('/contents/'+s.policyPath+'?ref='+s.expectedSha);
  if (f.path !== s.policyPath || f.type !== 'file' || f.encoding !== 'base64' ||
      f.sha !== s.expectedPolicyBlobSha || typeof f.content !== 'string') deny('policy is not pinned');
  const encoded=f.content.replace(/\s/g,'');
  if (!encoded.length || encoded.length > 1400000 || encoded.length%4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) deny('invalid policy transfer');
  const bytes=Buffer.from(encoded,'base64');
  if (!bytes.length || bytes.length > 1048576) deny('invalid policy size');
  const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0'))
    .update(bytes).digest('hex');
  if (hash !== f.sha) deny('policy bytes do not match Git SHA');
  try { new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { deny('policy is not UTF-8'); }
  const last=await readObject(br);
  if (last.name !== s.branch || last.protected !== true ||
      last.commit?.sha !== s.expectedSha) deny('protected ref changed mid-inspection');
  return Object.freeze({
    kind:'r3b-github-readonly-gate-preview',repository:s.repository,
    observedSha:s.expectedSha,protectedBranch:s.branch,
    verifiedPolicyBlobSha:hash,rulesetId:rules.id,
    validatedCheckContexts:Object.freeze([...s.checkContexts].sort()),
    apiObservationsConsistent:true,sourceProvenanceVerified:false,
    trustEvidenceIndependentlyVerified:false,authorizedToExecute:false,
    paidApprovalRequired:true,promotionAllowed:false,writesPerformed:false
  });
}
