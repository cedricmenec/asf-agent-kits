import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateSchema, configSemantics, readJson, rootDir } from './contract-validation.mjs';

const schemaFiles = ['agentkit-config.schema.json','agentkit-lock.schema.json','release.schema.json'];
for (const name of schemaFiles) {
  const schema = await readJson(`schemas/${name}`);
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${name}: unsupported draft`);
  if (!schema.$id || schema.additionalProperties !== false || !schema.properties || !schema.required?.length) throw new Error(`${name}: missing required schema invariants`);
  // Compile every regex within the provisional schema to catch invalid patterns.
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.pattern) new RegExp(node.pattern);
    for (const v of Object.values(node)) walk(v);
  };
  walk(schema);
}
const config = await readJson('examples/valid-config.json');
const errors = [...evaluateSchema(await readJson('schemas/agentkit-config.schema.json'), config), ...configSemantics(config)];
if (errors.length) throw new Error(`Example contract errors: ${errors.join('; ')}`);
const dirs = await readdir(path.join(rootDir, 'kits'));
for (const dir of dirs) {
  const descriptor = JSON.parse(await readFile(path.join(rootDir, 'kits',dir,'kit.json'),'utf8'));
  const allowedStatus = dir === 'opencode-openspec'
    ? ['design-only', 'runnable-local-template-unqualified']
    : ['design-only'];
  if (descriptor.id !== dir || !allowedStatus.includes(descriptor.status) ||
      descriptor.release !== null || descriptor.requiresControllerV3 !== false) {
    throw new Error(`Kit ${dir}: metadata exceeds the non-released scope`);
  }
}
console.log(`Supplemental smoke checks passed (NOT a full schema validator): ${schemaFiles.length} provisional schemas, ${dirs.length} non-released kit descriptors, 1 example (no LLM execution)`);
