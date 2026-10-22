/**
 * R3c — restricted, read-only GitHub REST transport adapter.
 *
 * IMPORTANT TRUST BOUNDARY: transport MUST be supplied by the trusted host.
 * This library cannot attest that host, a token, or the underlying TLS socket.
 * An agent/task cannot supply a token, base URL, or arbitrary API route here.
 * Returning valid GitHub JSON does NOT authorize execution or publication.
 */
import { TextDecoder } from 'node:util';

export class GithubReadError extends Error {
  constructor(reason) {
    super('R3c READ DENIED: ' + reason);
    this.name = 'GithubReadError';
  }
}

const reject = reason => { throw new GithubReadError(reason); };
const SHA = /^[a-f0-9]{40}$/;
const REPO_PART = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,159}$/;
const ORIGIN = 'https://api.github.com';
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const API_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function validateOptions(options) {
  if (!plain(options)) reject('missing host-controlled configuration');
  const keys = ['repository', 'branch', 'expectedSha', 'transport', 'maxBytes', 'timeoutMs'];
  if (Object.keys(options).some(k => !keys.includes(k))) reject('unexpected option (no task credentials, host flags or URL overrides)');
  const { repository, branch, expectedSha, transport, maxBytes, timeoutMs } = options;
  if (typeof repository !== 'string' || repository.split('/').length !== 2 ||
      !repository.split('/').every(v => REPO_PART.test(v) && v !== '..' && !v.endsWith('.')))
    reject('invalid pinned repository');
  if (typeof branch !== 'string' || !BRANCH.test(branch) || branch.includes('..') ||
      branch.includes('//') || branch.endsWith('/') || branch.startsWith('/') || branch.includes('@'))
    reject('invalid pinned branch');
  if (typeof expectedSha !== 'string' || !SHA.test(expectedSha)) reject('invalid pinned commit SHA');
  if (typeof transport !== 'function') reject('missing host-supplied HTTPS transport');
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 128 || maxBytes > DEFAULT_MAX_BYTES))
    reject('unsafe response byte limit');
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000))
    reject('unsafe deadline');
}

function allowedPath(path, prefix, branch, sha) {
  if (typeof path !== 'string' || path.length > 350 || !path.startsWith(prefix) ||
      /[\\\u0000-\u001f\u007f#]/.test(path)) reject('unapproved GitHub API path');
  const tail = path.slice(prefix.length);
  if (tail === '') return 'repository';
  if (tail === '/branches/' + encodeURIComponent(branch)) return 'branch';
  if (tail === '/rulesets') return 'rulesets';
  if (/^\/rulesets\/[1-9][0-9]{0,14}$/.test(tail)) return 'ruleset';
  if (tail === '/commits/' + sha + '/check-runs') return 'checks';
  if (tail === '/contents/AGENTS.md?ref=' + sha ||
      tail === '/contents/.asf/agentkit.yaml?ref=' + sha) return 'policy';
  reject('unapproved GitHub API path');
}

function checkHeaders(response, maxBytes) {
  if (!response || !Number.isInteger(response.status) || response.status !== 200 ||
      response.redirected !== false || typeof response.headers?.get !== 'function')
    reject('HTTP error or redirect');
  const contentType = response.headers.get('content-type');
  if (typeof contentType !== 'string' || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|\s*$)/i.test(contentType))
    reject('unexpected content type');
  const length = response.headers.get('content-length');
  if (length !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)) ||
        Number(length) > maxBytes) reject('invalid or oversized declared response');
  }
  const link = response.headers.get('link');
  if (link && /rel\s*=\s*["']?next\b/i.test(link)) reject('incomplete GitHub pagination');
}

async function readBoundedJson(response, maxBytes, signal) {
  if (!response.body || typeof response.body.getReader !== 'function')
    reject('missing readable response stream');
  const reader = response.body.getReader();
  const onAbort = () => { try { void reader.cancel('deadline').catch(() => {}); } catch {} };
  signal.addEventListener('abort', onAbort, { once: true });
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) reject('non-byte response stream');
      total += value.byteLength;
      if (total > maxBytes) reject('response exceeds hard byte limit');
      chunks.push(value);
    }
  } catch (error) {
    try { void reader.cancel().catch(() => {}); } catch { /* transport is untrusted */ }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock(); } catch { /* already closed */ }
  }
  if (!total) reject('empty response');
  // Fetch runtimes can transparently decompress a response while leaving its
  // original compressed Content-Length header untouched. Only assert exact
  // transfer length for unencoded/identity responses, not for gzip/br/zstd.
  const declaredLength = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  if (declaredLength !== null &&
      (contentEncoding === null || contentEncoding.trim().toLowerCase() === 'identity') &&
      total !== Number(declaredLength)) reject('incomplete or inconsistent response length');
  let parsed;
  try {
    const data = Buffer.concat(chunks.map(c => Buffer.from(c)), total);
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch { reject('invalid UTF-8 JSON'); }
  if (!plain(parsed) && !Array.isArray(parsed)) reject('invalid JSON response shape');
  return parsed;
}

function responseShape(kind, result) {
  if (kind === 'rulesets') {
    if (!Array.isArray(result) || result.length > 100) reject('incomplete or malformed ruleset listing');
  } else if (kind === 'checks') {
    if (!plain(result) || !Number.isSafeInteger(result.total_count) || result.total_count < 0 ||
        !Array.isArray(result.check_runs) || result.total_count !== result.check_runs.length ||
        result.check_runs.length > 1000) reject('incomplete or malformed check runs');
  } else if (!plain(result)) {
    reject('malformed GitHub REST object');
  }
}

/**
 * transport(url, options) is a host-supplied fetch-compatible GET capability.
 * Authentication and TLS MUST be guaranteed outside this module; do not pass
 * transport from a task or model-generated code. This is NOT a release trust
 * oracle. Only JSON observations are returned, with no write or grant capability.
 */
export function createRestrictedGithubGet(options) {
  validateOptions(options);
  const { repository, branch, expectedSha, transport } = options;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prefix = '/repos/' + repository;
  return async function get(path) {
    const kind = allowedPath(path, prefix, branch, expectedSha);
    const url = ORIGIN + path;
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, fail) => {
      timer = setTimeout(() => {
        controller.abort();
        fail(new GithubReadError('host API read deadline exceeded'));
      }, timeoutMs);
    });
    const request = (async () => {
      // Do not consume any authentication secrets from untrusted request data.
      const response = await transport(url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { ...API_HEADERS },
      });
      if (response?.url !== url) reject('unexpected response origin or redirected URL');
      checkHeaders(response, maxBytes);
      const result = await readBoundedJson(response, maxBytes, controller.signal);
      responseShape(kind, result);
      return result;
    })();
    try {
      return await Promise.race([request, timeout]);
    } catch (error) {
      if (error instanceof GithubReadError) throw error;
      throw new GithubReadError('host GitHub GET failed closed');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
