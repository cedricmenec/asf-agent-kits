import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, strictFile } from '../tools/node/common.mjs';
import { render_mvp } from '../tools/render_mvp_kit.mjs';

const template = fs.readFileSync(path.join(ROOT,
  'kits/opencode-openspec/templates/checklist.mjs.tmpl'), 'utf8');
const good = '- [ ] Implement the selector with aria-pressed and automated DOM tests.';
const acceptance = '## Manual acceptance\n- Verify visually on a real device.\n';
const post = '## Post-sync review\n- Review independent PR CI later.\n';

function run(source) {
  const temp = fs.mkdtempSync(path.join(process.env.ASF_TEST_TEMP_ROOT || os.tmpdir(),
    'agentkit-checklist-'));
  try {
    const script = path.join(temp, 'checklist.mjs');
    fs.writeFileSync(script, template);
    const tasks = path.join(temp, 'tasks.md');
    fs.writeFileSync(tasks, source);
    return spawnSync(process.execPath, [script, tasks], {
      encoding: 'utf8', timeout: 10000,
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function accepted(source) {
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /statically admissible entries/);
}

function refused(source, code, line) {
  const result = run(source);
  assert.equal(result.status, 1, `Expected ${code} rejection`);
  assert.match(result.stderr, new RegExp(`ASF-OPSX-${code}`));
  assert.match(result.stderr, line ? new RegExp(`line ${line}`) : /tasks\.md/);
  assert.match(result.stderr, /move|remove|add|write|keep/i);
  return result.stderr;
}

test('#126 accepts executable code and deterministic tests with manual prose', () => {
  accepted(`## Implementation checklist\n${good}\n\n${acceptance}\n${post}`);
  accepted('## Tasks\n- [x] Implement visually hidden labels and automated accessibility tests.\n');
  accepted('## Tasks\n- [ ] Build manual mode selector with Jest assertions.\n');
  accepted('## Tasks\n- [ ] Run automated Playwright screenshot comparisons in CI.\n');
  accepted('## Tasks\n- [ ] Test visually hidden labels. GIVEN a DOM label, WHEN the unit test runs, THEN it asserts the accessible name.\n');
});

test('#126 rejects a mixed code plus subjective visual acceptance checkbox', () => {
  const mixed = '- [ ] Implement an accessible status selector with aria-pressed and tests. Verify: GIVEN the UI renders, WHEN a user observes the selector, THEN the active option is visually distinguishable.';
  const message = refused(`## Implementation checklist\n${mixed}\n`, 'MIXED', 2);
  assert.match(message, /Manual acceptance/);
  assert.doesNotMatch(message, /aria-pressed|distinguishable/);
  refused(`## Tasks\n- [ ] Implement a selector. GIVEN it renders, WHEN a person sees it, THEN it is visually distinguishable.\n`, 'MIXED', 2);
});

test('#126 rejects manual acceptance checkboxes, including nested headings', () => {
  refused(`## Implementation checklist\n${good}\n## Manual acceptance\n### Visual\n- [ ] Inspect the color manually.\n`, 'SECTION', 5);
  refused(`## Tasks\n- [ ] Verify manually on a phone.\n`, 'MANUAL', 2);
  refused(`## Tasks\n- [ ] Inspect the color manually.\n`, 'MANUAL', 2);
  refused(`## Tasks\n- [ ] Run a human review.\n`, 'MANUAL', 2);
  refused(`## Tasks\n- [ ] Check the menu in a real browser.\n`, 'MANUAL', 2);
  refused(`## Tasks\n- [ ] Vérifier manuellement sur téléphone.\n`, 'MANUAL', 2);
});

test('#126 refuses independent post-sync/CI/PR/merge checkboxes', () => {
  refused(`## Tasks\n${good}\n## Post-sync review\n- [ ] Review CI.\n`, 'SECTION', 4);
  for (const item of [
    'Review the PR', 'Approve the pull request', 'Merge PR',
    'Run CI after archive', 'Run CI', 'Archive the change',
    'Sync specs', 'Validate after OPSX sync', 'Publish after merge',
  ]) {
    refused(`## Tasks\n- [ ] ${item}\n`, 'DEFERRED', 2);
  }
});

test('#126 ignores code examples, requires a real executable checkbox', () => {
  accepted('## Tasks\n~~~md\n- [ ] Inspect visually.\n~~~\n' + good + '\n');
  accepted('## Tasks\n```md\n- [ ] Manual review\n```\n' + good + '\n');
  refused('## Tasks\n```md\n- [ ] Example only\n```\n', 'EMPTY', 0);
  refused('## Tasks\n- [ ] \n', 'EMPTY', 2);
});

test('#126 refusal never echoes untrusted task content to CI logs', () => {
  const secret = 'DO-NOT-LEAK-SENTINEL';
  const message = refused(`## Tasks\n- [ ] Human review ${secret}\n`, 'MANUAL', 2);
  assert.doesNotMatch(message, new RegExp(secret));
  assert.match(message, /::error file=tasks\.md,line=2,title=ASF-OPSX-MANUAL::/);
});

test('#126 renders updated OpenSpec guard without changing co-installed Direct', () => {
  const config = strictFile(path.join(ROOT, 'kits/opencode-openspec/mvp-config.example.json'));
  const openspec = render_mvp(ROOT, config, 'opencode-openspec').files;
  const guard = openspec.find(f => f.path === '.asf/agentkit/runtime/checklist.mjs');
  assert.ok(guard);
  assert.equal(Buffer.from(guard.contentBase64, 'base64').toString('utf8'), template);
  const contract = openspec.find(f => f.path === '.asf/agentkit/openspec-checklist.md');
  assert.match(Buffer.from(contract.contentBase64, 'base64').toString('utf8'), /Bad mixed checkbox/);
  const direct = render_mvp(ROOT, config, 'opencode-direct').files;
  assert.ok(direct.some(f => f.path === '.github/workflows/asf-agentkit-direct.yml'));
  assert.ok(direct.every(f => !f.path.endsWith('/checklist.mjs')));
});
