/**
 * R0 offline implementation of only the JSON Schema keywords used in our own
 * provisional schemas. This is NOT a general-purpose JSON Schema validator.
 * R1 should replace it with a standards-compliant, independently audited engine.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function readJson(relPath) {
  return JSON.parse(await readFile(path.join(rootDir, relPath), 'utf8'));
}

export function evaluateSchema(schema, value, current = schema, pointer = '$', issues = []) {
  if (current.$ref) {
    if (!current.$ref.startsWith('#/$defs/')) throw new Error(`Unsupported schema reference at ${pointer}`);
    const name = current.$ref.slice('#/$defs/'.length);
    if (!Object.hasOwn(schema.$defs || {}, name)) throw new Error(`Unknown $ref definition ${name}`);
    return evaluateSchema(schema, value, schema.$defs[name], pointer, issues);
  }
  if (current.type) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (actual !== current.type) {
      issues.push(`${pointer}: expected ${current.type}, got ${actual}`);
      return issues;
    }
  }
  if ('const' in current && value !== current.const) issues.push(`${pointer}: does not match required constant`);
  if (current.enum && !current.enum.includes(value)) issues.push(`${pointer}: not one of allowed values`);
  if (typeof value === 'string') {
    if (current.minLength !== undefined && value.length < current.minLength) issues.push(`${pointer}: too short`);
    if (current.maxLength !== undefined && value.length > current.maxLength) issues.push(`${pointer}: too long`);
    if (current.pattern && !new RegExp(current.pattern).test(value)) issues.push(`${pointer}: pattern mismatch`);
  }
  if (Array.isArray(value)) {
    if (current.minItems !== undefined && value.length < current.minItems) issues.push(`${pointer}: too few items`);
    if (current.maxItems !== undefined && value.length > current.maxItems) issues.push(`${pointer}: too many items`);
    if (current.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) issues.push(`${pointer}: repeated items`);
    if (current.items) value.forEach((v, i) => evaluateSchema(schema, v, current.items, `${pointer}[${i}]`, issues));
  }
  if (value !== null && !Array.isArray(value) && typeof value === 'object') {
    for (const key of current.required || []) if (!Object.hasOwn(value, key)) issues.push(`${pointer}: missing ${key}`);
    if (current.minProperties !== undefined && Object.keys(value).length < current.minProperties) issues.push(`${pointer}: too few properties`);
    for (const [key, v] of Object.entries(value)) {
      if (current.propertyNames) evaluateSchema(schema, key, current.propertyNames, `${pointer} key`, issues);
      if (Object.hasOwn(current.properties || {}, key)) evaluateSchema(schema, v, current.properties[key], `${pointer}.${key}`, issues);
      else if (current.additionalProperties === false) issues.push(`${pointer}: unexpected property ${key}`);
      else if (current.additionalProperties && typeof current.additionalProperties === 'object') evaluateSchema(schema, v, current.additionalProperties, `${pointer}.${key}`, issues);
    }
  }
  return issues;
}

/** Constraints not expressible (or not enforced) by our provisional JSON Schema. */
export function configSemantics(config) {
  const issues = [];
  if (!config?.execution || !config?.project || !config?.publication || !config?.paths || !config?.kits) return ['missing required configuration sections'];
  if (!config.execution.allowedModels?.includes(config.execution.defaultModel)) issues.push('default model must be included in allowedModels');
  if (config.publication.targetBranch !== config.project.baseBranch) issues.push('targetBranch must match baseBranch');
  if (!config.paths.protected?.includes('.github/') || !config.paths.protected?.includes('.asf/') || !config.paths.protected?.includes('AGENTS.md')) issues.push('baseline protected paths are required');
  if (!config.kits['opencode-openspec']?.enabled && !config.kits['opencode-direct']?.enabled) issues.push('at least one kit must be enabled');
  if (config.execution.trigger !== 'manual') issues.push('automatic execution is not part of R0');
  if (!config.validation?.requireIndependentCi) issues.push('independent CI must be required');
  for (const [field, text] of [['tasks.root',config.tasks?.root], ...['protected','additionalProtected','allowedProductPrefixes'].flatMap(group => (config.paths[group] || []).map((x,i)=> [`paths.${group}[${i}]`, x]))]) {
    if (typeof text !== 'string' || text.startsWith('/') || text.includes('\\') || text.split('/').includes('..') || text.split('/').includes('.') || text.includes('\0')) issues.push(`${field} is not a safe relative path`);
  }
  // Never evaluate arbitrary regex patterns supplied by a task at runtime;
  // they are policy loaded from a protected ref and bounded at authoring.
  return issues;
}

export function lockSemantics(lock) {
  const issues = [];
  const seen = new Set();
  for (const [i,k] of (lock.kits || []).entries()) {
    if (seen.has(k.id)) issues.push(`duplicate kit id ${k.id}`);
    seen.add(k.id);
    if (k.releaseTag !== `kits/${k.id}/v${k.version}`) issues.push(`kits[${i}]: mismatching releaseTag`);
    for (const managed of Object.keys(k.managedFiles || {})) {
      if (managed.startsWith('/') || managed.includes('\\') || managed.split('/').includes('..') || managed.split('/').includes('.')) issues.push(`kits[${i}]: unsafe managed path`);
    }
  }
  return issues;
}

export function releaseSemantics(release) {
  const issues = [];
  if (release.releaseTag !== `kits/${release.kitId}/v${release.kitVersion}`) issues.push('releaseTag must equal kitId and kitVersion');
  const seen = new Set();
  for (const a of (release.artifacts || [])) {
    if (seen.has(a.path)) issues.push(`duplicate artifact path ${a.path}`);
    seen.add(a.path);
    if (typeof a.path !== 'string' || a.path.startsWith('/') || a.path.includes('\\') || a.path.split('/').includes('..')) issues.push('unsafe artifact path');
  }
  return issues;
}
