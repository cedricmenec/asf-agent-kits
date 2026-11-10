import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, strictFile } from '../tools/node/common.mjs';
import { RELEASE_PATHS } from '../tools/build_release_manifest.mjs';

test('1.5.1 release identity is consistent across immutable-source descriptors', () => {
  const version = strictFile(path.join(ROOT, 'kits/opencode-openspec/version.json'));
  const kit = strictFile(path.join(ROOT, 'kits/opencode-openspec/kit.json'));
  assert.equal(version.kitVersion, '1.5.1');
  assert.equal(version.releaseStatus, 'stable');
  assert.deepEqual(kit.release, {
    version: version.kitVersion,
    tag: `kits/opencode-openspec/v${version.kitVersion}`,
    distribution: version.distribution,
  });
  for (const file of ['budget.mjs.tmpl', 'publish.sh.tmpl', 'stage.sh.tmpl'])
    assert.ok(RELEASE_PATHS.includes(`kits/opencode-openspec/templates/${file}`));
  const notes = readFileSync(path.join(ROOT, 'docs/kits/opencode-openspec/RELEASE_NOTES_1.5.1.md'), 'utf8');
  assert.match(notes, /Apply publication no longer silently skips after optional jobs are skipped/);
  assert.match(notes, /PR #132/);
});

test('release evidence workflow is non-paying, read-only, SHA-bound and prepares three assets', () => {
  const file = path.join(ROOT, '.github/workflows/prepare-openspec-release-manifest.yml');
  assert.ok(existsSync(file));
  assert.equal(existsSync(path.join(ROOT, '.github/workflows/prepare-1-4-0-manifest.yml')), false);
  const source = readFileSync(file, 'utf8');
  const workflow = YAML.parse(source);
  assert.equal(workflow.permissions.contents, 'read');
  assert.ok(workflow.on.workflow_dispatch === null);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.push.paths, ['kits/opencode-openspec/version.json']);
  assert.ok(workflow.jobs.manifest.steps.some(s =>
    s.uses?.startsWith('actions/upload-artifact@')));
  assert.ok(workflow.jobs.manifest.steps.every(s =>
    !s.uses?.includes('create-github-app-token') &&
    !String(s.run || '').includes('opencode run')));
  assert.match(source, /sourceCommitSha !== process\.env\.GITHUB_SHA/);
  assert.match(source, /release-manifest\.sha256/);
  assert.match(source, /RELEASE_NOTES_\*\.md/);
  assert.doesNotMatch(source, /v1\.4\.0/);
});
