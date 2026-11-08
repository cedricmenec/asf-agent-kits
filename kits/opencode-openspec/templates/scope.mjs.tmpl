// Adapted from ThreadStep's agent-openspec-checkpoint.mjs and sync-guard.mjs.
// No publication decision may be made from LLM-controlled files or claims.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';

const forbidden = new Set(['AGENTS.md', 'ChatGPT.md', 'opencode.json',
  'openspec/config.yaml', '.gitmodules', '.gitattributes', '.gitconfig',
  '.npmrc', '.netrc', '.asf/agentkit.lock.json']);
const prefixes = ['.github/', '.asf/agentkit/', '.agents/', '.opencode/',
  'backlog/', 'docs/factory/'];

export function safePath(path) {
  return typeof path === 'string' && path.length > 0 &&
    !path.startsWith('/') && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
}

export function allowed(phase, change, path) {
  if (phase === 'repair-plan') phase = 'plan';
  if (!/^[a-z][a-z0-9]{1,8}-[0-9]{3}$/.test(change) || !safePath(path)) return false;
  const parts = path.split('/');
  const name = parts.at(-1).toLowerCase();
  if (parts.some(p => ['node_modules', '.git', '.cache', '__pycache__', '.venv'].includes(p)) ||
      name === '.env' || name.startsWith('.env.') ||
      /\.(?:pem|key|p12|pfx|log)$/.test(name) || forbidden.has(path)) return false;
  const plan = `openspec/changes/${change}/`;
  if (phase === 'plan') return path.startsWith(plan);
  if (phase === 'finalize' || phase === 'auto') {
    return path.startsWith('openspec/specs/') ||
      new RegExp(`^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${change}/`).test(path) ||
      path.startsWith(plan) ||
      (phase === 'auto' && allowed('apply', change, path));
  }
  if (phase !== 'apply') return false;
  if (prefixes.some(p => path.startsWith(p)) ||
      (path.startsWith('scripts/') && !path.startsWith('scripts/product/'))) return false;
  // The previously reviewed proposal/design/deltas stay immutable in apply.
  if (path.startsWith('openspec/')) return path === plan + 'tasks.md';
  return true;
}

// A checkpoint is durable and may be reviewed by other people. Reject known
// credential formats and the exact provider credential before creating even
// the untrusted patch artifact. This complements, but cannot replace, runner
// isolation and provider-side secret controls.
export function scanPlanContents(entries, providerKey = '') {
  for (const path of entries) {
    let bytes;
    try {
      if (lstatSync(path).size > 512 * 1024) throw Error('oversized');
      bytes = readFileSync(path);
    } catch {
      throw Error('Unsafe plan content or unreadable plan file');
    }
    if (bytes.includes(0) ||
        (providerKey.length >= 12 && bytes.includes(Buffer.from(providerKey))) ||
        /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-or-v1-|github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_-]{12,}/i.test(bytes.toString('utf8'))) {
      throw Error('Possible credential in plan; checkpoint publication refused');
    }
  }
  return entries.length;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'buffer', timeout: 20000 });
}
function paths(mode) {
  const sets = mode === 'staged'
    ? [['diff', '--cached', '--no-renames', '--name-only', '-z']]
    : [['diff', '--no-renames', '--name-only', '-z'], ['diff', '--cached', '--no-renames', '--name-only', '-z'], ['ls-files', '--others', '--exclude-standard', '-z']];
  return [...new Set(sets.flatMap(args => git(args).toString('utf8').split('\0').filter(Boolean)))];
}
export function checkPaths(phase, change, entries) {
  if (!entries.length) throw Error('Empty changeset');
  for (const file of entries) {
    if (!allowed(phase, change, file)) throw Error('Forbidden path: ' + file);
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1) throw Error('Non-regular or hardlinked path: ' + file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // OpenSpec archive moves the active plan under changes/archive/.
      if (!['finalize', 'auto'].includes(phase) || !file.startsWith('openspec/changes/' + change + '/')) {
        throw Error('Deleted path: ' + file);
      }
    }
  }
  return entries.length;
}

if (process.argv[1]?.endsWith('/scope.mjs')) {
  try {
    const [, , mode, phase, change] = process.argv;
    if (!['all', 'staged'].includes(mode)) throw Error('Usage: scope.mjs all|staged phase change');
    const entries = paths(mode);
    console.log('Validated ' + checkPaths(phase, change, entries) + ' changed paths');
    if (phase === 'plan' || phase === 'repair-plan') {
      scanPlanContents(entries, process.env.OPENROUTER_API_KEY ?? '');
      console.log('Plan checkpoint safety scan passed');
    }
  } catch (error) {
    console.error('::error::Scope refused: ' + error.message);
    process.exitCode = 1;
  }
}
