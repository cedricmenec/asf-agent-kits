// Adapted from ThreadStep's agent-openspec-checkpoint.mjs and sync-guard.mjs.
// No publication decision may be made from LLM-controlled files or claims.
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';

const forbidden = new Set(['AGENTS.md', 'ChatGPT.md', 'opencode.json',
  'openspec/config.yaml', '.gitmodules', '.gitattributes', '.gitconfig',
  '.npmrc', '.netrc']);
const prefixes = ['.github/', '.asf/agentkit/', '.agents/', '.opencode/',
  'backlog/', 'docs/factory/'];

export function safePath(path) {
  return typeof path === 'string' && path.length > 0 &&
    !path.startsWith('/') && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
}

export function allowed(phase, change, path) {
  if (!/^[a-z][a-z0-9]{1,8}-[0-9]{3}$/.test(change) || !safePath(path)) return false;
  const parts = path.split('/');
  const name = parts.at(-1).toLowerCase();
  if (parts.some(p => ['node_modules', '.git', '.cache', '__pycache__', '.venv'].includes(p)) ||
      name === '.env' || name.startsWith('.env.') ||
      /\.(?:pem|key|p12|pfx|log)$/.test(name) || forbidden.has(path)) return false;
  const plan = `openspec/changes/${change}/`;
  if (phase === 'plan') return path.startsWith(plan);
  if (phase === 'finalize') {
    return path.startsWith('openspec/specs/') ||
      new RegExp(`^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${change}/`).test(path) ||
      path.startsWith(plan);
  }
  if (phase !== 'apply') return false;
  if (prefixes.some(p => path.startsWith(p)) ||
      (path.startsWith('scripts/') && !path.startsWith('scripts/product/'))) return false;
  // The previously reviewed proposal/design/deltas stay immutable in apply.
  if (path.startsWith('openspec/')) return path === plan + 'tasks.md';
  return true;
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
      if (phase !== 'finalize' || !file.startsWith('openspec/changes/' + change + '/')) {
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
    console.log('Validated ' + checkPaths(phase, change, paths(mode)) + ' changed paths');
  } catch (error) {
    console.error('::error::Scope refused: ' + error.message);
    process.exitCode = 1;
  }
}
