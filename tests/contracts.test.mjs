import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSchema, configSemantics, lockSemantics, releaseSemantics, readJson } from '../tools/contract-validation.mjs';

const configSchema = await readJson('schemas/agentkit-config.schema.json');
const lockSchema = await readJson('schemas/agentkit-lock.schema.json');
const releaseSchema = await readJson('schemas/release.schema.json');
const good = await readJson('examples/valid-config.json');
const copy = x => structuredClone(x);
const problems = x => [...evaluateSchema(configSchema,x),...configSemantics(x)];

test('R0 example is structurally valid, not an installed release', () => {
  assert.deepEqual(problems(good), []);
  assert.equal(good.kits['opencode-openspec'].enabled, true);
  assert.equal(good.kits['opencode-direct'].enabled, false);
  assert.equal(good.execution.trigger, 'manual');
  assert.equal(good.publication.autoMerge, false);
});

test('unknown fields rejected', () => {
  const x=copy(good);x.unreviewed='yes';
  assert.match(problems(x).join('; '),/unexpected property/);
});

test('runtime latest and automatic trigger rejected', () => {
  const x=copy(good);x.execution.openCodeVersion='latest';x.execution.trigger='schedule';
  assert.match(problems(x).join('; '),/pattern mismatch/);
  assert.match(problems(x).join('; '),/required constant/);
});

test('configured model must be in explicit allowlist', () => {
  const x=copy(good);x.execution.defaultModel='other/model';
  assert.match(problems(x).join('; '),/allowedModels/);
});

test('protected default paths cannot be removed', () => {
  const x=copy(good);x.paths.protected=['src/'];
  assert.match(problems(x).join('; '),/baseline protected paths/);
});

test('path traversal and absolute paths rejected', () => {
  for (const bad of ['/tmp/dir','../../secret','src/../secrets','src\\secrets']) {
    const x=copy(good);x.tasks.root=bad;
    assert.notDeepEqual(problems(x),[],bad);
  }
});

test('branch target mismatch rejected', () => {
  const x=copy(good);x.publication.targetBranch='main';
  assert.match(problems(x).join('; '),/targetBranch/);
});

test('missing independent CI and malformed task contract rejected', () => {
  const x=copy(good);x.validation.requireIndependentCi=false;x.tasks.filename='../../{taskId}.md';
  assert.notDeepEqual(problems(x),[]);
});

test('locked release requires actual-format SHA and matching tag', () => {
  const l={schemaVersion:1,kits:[{id:'opencode-openspec',version:'1.0.0',sourceRepository:'cedricmenec/asf-agent-kits',releaseTag:'kits/opencode-openspec/v1.0.0',sourceCommitSha:'a'.repeat(40),coreVersion:'1.0.0',configSchemaVersion:1,managedFiles:{'docs/agentkit/README.md':'b'.repeat(64)}}]};
  assert.deepEqual([...evaluateSchema(lockSchema,l),...lockSemantics(l)],[]);
  l.kits[0].sourceCommitSha='PLACEHOLDER';
  assert.notDeepEqual(evaluateSchema(lockSchema,l),[]);
  l.kits[0].sourceCommitSha='a'.repeat(40);
  l.kits[0].releaseTag='kits/opencode-direct/v1.0.0';
  assert.match(lockSemantics(l).join('; '),/mismatching/);
});

test('release needs immutable-format origin and distinct artifact paths', () => {
  const r={schemaVersion:1,kitId:'opencode-openspec',kitVersion:'1.0.0',coreVersion:'1.0.0',sourceRepository:'cedricmenec/asf-agent-kits',sourceCommitSha:'a'.repeat(40),releaseTag:'kits/opencode-openspec/v1.0.0',runtime:{nodeVersion:'22.16.0',openCodeVersion:'1.0.0',openSpecVersion:'1.14.1'},artifacts:[{path:'agent.yml',sha256:'b'.repeat(64)}]};
  assert.deepEqual([...evaluateSchema(releaseSchema,r),...releaseSemantics(r)],[]);
  r.artifacts.push({...r.artifacts[0]});
  assert.match(releaseSemantics(r).join('; '),/duplicate/);
});
