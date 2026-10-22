/**
 * R3a: portable, PURE preflight checks for manual OpenCode kit requests.
 * This is NOT a runner, provenance verifier, payment authorization or GitHub policy engine.
 * The calling code must independently authenticate github.actor, protected config/commit,
 * branch SHA and checks. Merely passing `trusted` does not prove any of those facts.
 *
 * Adapted safety invariants after reading ThreadStep at
 * a94106f6a3205db51e7cd188a6ba461326d6cec3, NOT a code copy.
 */
const OBJECT = Object.prototype;
const SHA = /^[a-f0-9]{40}$/;
const DEFAULT_TASK_PATTERN = '^[A-Z][A-Z0-9]{1,9}-[0-9]{1,6}$';
const TASK = /^[A-Z][A-Z0-9]{1,9}-(?:0*[1-9][0-9]{0,5})$/;
const MODEL = /^openrouter\/[a-z0-9][a-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PHASES = new Set(['plan', 'apply', 'auto', 'finalize']);
const KITS = new Set(['opencode-openspec', 'opencode-direct']);
const RESERVED_DIRS = ['.git/', '.github/', '.asf/', '.agents/', '.opencode/', 'node_modules/', '.cache/', '.venv/', '__pycache__/', 'coverage/'];
const RESERVED_FILES = ['AGENTS.md', 'ChatGPT.md', '.gitmodules', '.gitattributes', '.gitconfig', '.npmrc', '.netrc', 'opencode.json'];
const SIMPLE_COMMANDS = new Set(['npm run check', 'npm test', 'node --test']);

export class PolicyError extends Error {
  constructor(reason) { super(`R3a DENY: ${reason}`); this.name = 'PolicyError'; }
}
const deny = (reason) => { throw new PolicyError(reason); };
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === OBJECT || Object.getPrototypeOf(x) === null);
function exactly(x, keys, where) {
  if (!record(x) || Object.keys(x).length !== keys.length || keys.some(k => !OBJECT.hasOwnProperty.call(x, k))) deny(`${where} has missing or unknown fields`);
}
function pathIsSafe(path, directory = false) {
  if (typeof path !== 'string' || !path || path.length > 320 || path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return false;
  const value = directory ? path.replace(/\/$/, '') : path;
  if (!value || (!directory && value.endsWith('/'))) return false;
  const parts = value.split('/');
  return parts.every(p => p && p !== '.' && p !== '..' && !p.endsWith(':')) && !/^[A-Za-z]:/.test(value);
}
function norm(path) { if (typeof path !== 'string') deny('expected a path string'); return path.toLowerCase(); }
function inScope(file, rule) { const p = norm(file), r = norm(rule); return r.endsWith('/') ? p.startsWith(r) : p === r; }
function secretPath(path) {
  return path.split('/').some(part => {
    const p = part.toLowerCase();
    return /^\.env(?:\.|$)/.test(p) || ['.npmrc', '.netrc', 'dexie-cloud.json', 'dexie-cloud.key', 'id_rsa', 'id_ed25519', 'id_rsa.pub', 'id_ed25519.pub'].includes(p) || /\.(?:pem|p12|pfx|key|log)$/.test(p);
  });
}
function validatePrefixRules(config) {
  const paths = config.paths;
  exactly(paths, ['protected', 'additionalProtected', 'allowedProductPrefixes'], 'paths policy');
  for (const field of ['protected', 'additionalProtected', 'allowedProductPrefixes']) {
    if (!Array.isArray(paths[field]) || (field === 'protected' && !paths[field].length)) deny(`invalid ${field}`);
    if (new Set(paths[field].map(norm)).size !== paths[field].length) deny(`duplicate ${field}`);
    if (paths[field].some(x => !pathIsSafe(x, true))) deny(`unsafe ${field}`);
  }
  for (const entry of paths.allowedProductPrefixes) {
    if (!entry.endsWith('/')) deny('product prefix must end with slash');
    if (RESERVED_DIRS.some(d => inScope(entry, d) || inScope(d, entry)) ||
        [...paths.protected, ...paths.additionalProtected].some(d => inScope(entry, d) || inScope(d, entry))) deny('product scope overlaps protected paths');
  }
  return paths;
}
function validateConfig(config) {
  exactly(config, ['schemaVersion', 'project', 'kits', 'tasks', 'execution', 'validation', 'paths', 'publication'], 'config');
  if (config.schemaVersion !== 1) deny('unsupported schemaVersion');
  exactly(config.project, ['id', 'repository', 'baseBranch'], 'project');
  if (typeof config.project.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.project.repository) || !/^[a-z][a-z0-9-]{1,63}$/.test(config.project.id)) deny('invalid project identity');
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]{0,159}$/.test(config.project.baseBranch) || config.project.baseBranch.includes('..') || config.project.baseBranch.includes('//') || config.project.baseBranch.endsWith('/')) deny('unsafe base branch');
  exactly(config.kits, ['opencode-openspec', 'opencode-direct'], 'kits');
  for (const value of Object.values(config.kits)) {
    exactly(value, ['enabled'], 'kit');
    if (typeof value.enabled !== 'boolean') deny('invalid kit switch');
  }
  exactly(config.tasks, ['source', 'root', 'idPattern', 'filename', 'allowNumericAlias'], 'tasks');
  if (config.tasks.source !== 'files' || config.tasks.idPattern !== DEFAULT_TASK_PATTERN || config.tasks.filename !== '{taskId}.md' || config.tasks.allowNumericAlias !== false || !pathIsSafe(config.tasks.root, true)) deny('unsupported task format (requires explicit migration)');
  exactly(config.execution, ['trigger','runner','paidConcurrencyGroup','modelProvider','allowedModels','defaultModel','openCodeVersion','openSpecVersion'], 'execution');
  const ex=config.execution;
  if (ex.trigger !== 'manual' || ex.modelProvider !== 'openrouter' || typeof ex.runner !== 'string' || !/^[a-zA-Z0-9_-]{3,100}$/.test(ex.paidConcurrencyGroup)) deny('invalid manual execution policy');
  if (!Array.isArray(ex.allowedModels) || ex.allowedModels.length < 1 || ex.allowedModels.length > 20 || new Set(ex.allowedModels).size !== ex.allowedModels.length || ex.allowedModels.some(x => typeof x !== 'string' || !MODEL.test(x)) || !ex.allowedModels.includes(ex.defaultModel)) deny('invalid model allowlist');
  const pinned = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
  if (typeof ex.openCodeVersion !== 'string' || typeof ex.openSpecVersion !== 'string' || !pinned.test(ex.openCodeVersion) || !pinned.test(ex.openSpecVersion)) deny('unpinned runtime');
  exactly(config.validation,['projectCommands','requiredCheckContexts','requireIndependentCi'],'validation');
  const v=config.validation;
  if (v.requireIndependentCi !== true || !Array.isArray(v.projectCommands) || v.projectCommands.length === 0 || v.projectCommands.some(x => !SIMPLE_COMMANDS.has(x)) || !Array.isArray(v.requiredCheckContexts) || !v.requiredCheckContexts.includes('check') || v.requiredCheckContexts.some(x=>typeof x!=='string'|| !/^[A-Za-z0-9_. -]{1,80}$/.test(x)) || new Set(v.requiredCheckContexts).size!==v.requiredCheckContexts.length) deny('unapproved validation command or independent check');
  validatePrefixRules(config);
  exactly(config.publication,['createPullRequest','draftPlanPr','autoMerge','targetBranch','requireHeadShaMatch'],'publication');
  const p=config.publication;
  if (p.createPullRequest!==true || p.draftPlanPr!==true || p.autoMerge!==false || p.requireHeadShaMatch!==true || p.targetBranch!==config.project.baseBranch) deny('unsafe publication policy');
}
/**
 * `evidence` is an assertion supplied by a future *trusted* loader, not proof.
 * It prevents missing/mismatched fields but cannot authenticate GitHub on its own.
 */
function checkEvidence(config, evidence) {
  exactly(evidence, ['repository','protectedRef','policySha','expectedPolicySha','refProtectionChecked'], 'trusted policy evidence');
  if (evidence.repository !== config.project.repository || evidence.protectedRef !== `refs/heads/${config.project.baseBranch}` || !SHA.test(evidence.policySha) || evidence.policySha !== evidence.expectedPolicySha || evidence.refProtectionChecked !== true) deny('missing or inconsistent trusted policy evidence');
}
function checkRequest(config, r) {
  exactly(r,['trigger','repository','actor','profile','taskId','phase','model','targetBranch','expectedHeadSha','observedHeadSha','requiredCheckContexts','changedPaths'], 'request');
  if (r.trigger !== 'manual' || r.repository !== config.project.repository) deny('only manual dispatch on configured repository');
  if (typeof r.actor !== 'string' || r.actor.toLowerCase() !== config.project.repository.split('/')[0].toLowerCase()) deny('caller must match repository owner (independent GitHub authentication required)');
  if (!KITS.has(r.profile) || config.kits[r.profile]?.enabled !== true) deny('kit profile disabled');
  if (typeof r.taskId !== 'string' || !TASK.test(r.taskId) || !r.taskId.match(new RegExp(DEFAULT_TASK_PATTERN))) deny('invalid canonical task ID');
  if (!PHASES.has(r.phase) || (r.profile === 'opencode-direct' && r.phase !== 'auto')) deny('unsupported phase/profile pairing');
  if (!MODEL.test(r.model) || !config.execution.allowedModels.includes(r.model)) deny('model not on allowlist');
  if (r.targetBranch !== config.project.baseBranch) deny('publication target differs from trusted base');
  if (!SHA.test(r.expectedHeadSha) || r.expectedHeadSha !== r.observedHeadSha) deny('missing or mismatched head SHA');
  if (!Array.isArray(r.requiredCheckContexts) || r.requiredCheckContexts.length !== config.validation.requiredCheckContexts.length || new Set(r.requiredCheckContexts).size !== r.requiredCheckContexts.length || !config.validation.requiredCheckContexts.every(x=>r.requiredCheckContexts.includes(x))) deny('independent check mismatch');
  if (!Array.isArray(r.changedPaths) || r.changedPaths.length === 0 || r.changedPaths.some(p=>!pathIsSafe(p)) || new Set(r.changedPaths.map(norm)).size!==r.changedPaths.length) deny('missing, duplicate or unsafe candidate paths');
}
export function allowedCandidatePath(config, request, path) {
  if (!pathIsSafe(path) || secretPath(path)) return false;
  if (RESERVED_DIRS.some(d => inScope(path,d)) || RESERVED_FILES.some(f=>inScope(path,f))) return false;
  const components = path.toLowerCase().split('/');
  if (components.some(part => RESERVED_DIRS.some(d => d.slice(0,-1) === part))) return false;
  if ([...config.paths.protected,...config.paths.additionalProtected].some(x=>inScope(path,x))) return false;
  if (request.profile === 'opencode-direct') return config.paths.allowedProductPrefixes.some(x => inScope(path,x));
  const plan = `openspec/changes/${request.taskId.toLowerCase()}/`;
  if (request.phase === 'plan') return inScope(path,plan);
  if (request.phase === 'apply' || request.phase === 'auto') return inScope(path,plan) || config.paths.allowedProductPrefixes.some(x=>inScope(path,x));
  if (request.phase === 'finalize') return inScope(path,'openspec/specs/') ||
    /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-[a-z][a-z0-9]{1,9}-[0-9]{1,6}\//.test(path) && path.includes(`-${request.taskId.toLowerCase()}/`);
  return false;
}
/** Validate a *candidate request* only. Absolutely no IO and NO paid permission. */
export function evaluateManualRequest(config, request, evidence) {
  validateConfig(config);
  checkEvidence(config, evidence);
  checkRequest(config, request);
  const forbidden=request.changedPaths.filter(p=>!allowedCandidatePath(config,request,p));
  if (forbidden.length) deny('forbidden candidate paths: '+forbidden.join(', '));
  const branch = request.profile === 'opencode-openspec' ? `agent/openspec/${request.taskId}` : `agent/${request.taskId}`;
  const taskFile=`${config.tasks.root.replace(/\/$/,'')}/${request.taskId}.md`;
  if (!pathIsSafe(taskFile) || RESERVED_DIRS.some(d => taskFile.toLowerCase().split('/').includes(d.slice(0,-1)))) deny('unsafe task file');
  return Object.freeze({kind:'r3a-preflight-preview',taskId:request.taskId,taskFile,branch,profile:request.profile,
    phase:request.phase,modelPolicy:Object.freeze({model:request.model,small_model:request.model,agent:{title:{disable:true}}}),
    targetBranch:request.targetBranch,requiredCheckContexts:[...config.validation.requiredCheckContexts].sort(),
    paidConcurrencyGroup:config.execution.paidConcurrencyGroup,
    paidApprovalRequired:true,authorizedToExecute:false,sourceProvenanceVerified:false,
    trustEvidenceIndependentlyVerified:false,writesPerformed:false});
}
