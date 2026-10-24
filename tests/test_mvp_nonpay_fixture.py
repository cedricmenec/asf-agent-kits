"""No-provider fixture: exercise rendered shell phases and Git scope boundaries.

Fake binaries are intentionally NOT evidence that OpenSpec/OpenCode or GitHub
execute successfully. This proves routing and fail-closed filesystem behavior.
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from render_mvp_kit import render_mvp

FAKE_BIN = '''#!/usr/bin/env python3
import os, sys, shutil
from pathlib import Path
name=Path(sys.argv[0]).name
args=sys.argv[1:]
with open(os.environ['MOCK_LOG'], 'a') as out:
    out.write(name+' '+(' '.join(args[:4]))+'\\n')
if os.environ.get('REQUIRE_ESBUILD') == '1' and not Path('node_modules/esbuild/package.json').is_file():
    sys.exit(91)
change=Path('openspec/changes/ts-009')
if name == 'npm':
    sys.exit(0)
if name == 'openspec':
    if args[:1] == ['init']:
        for file in ('.opencode/commands/opsx-sync.md',
                     '.opencode/skills/openspec-sync-specs/SKILL.md'):
            path=Path(file);path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text('generated\\n')
    elif args[:2] == ['new','change']:
        change.mkdir(parents=True,exist_ok=True)
    elif args[:1] == ['archive']:
        archive=Path('openspec/changes/archive/2026-10-24-ts-009')
        archive.parent.mkdir(parents=True,exist_ok=True)
        shutil.move(str(change),str(archive))
    sys.exit(0)
if name == 'opencode':
    if '--command' in args:
        spec=Path('openspec/specs/demo/spec.md')
        spec.parent.mkdir(parents=True,exist_ok=True)
        spec.write_text('Canonical semantic sync output\\n')
    elif not (change/'proposal.md').exists():
        for file,content in {
            'proposal.md':'Proposal\\n', 'design.md':'Design\\n',
            'tasks.md':'## Implementation checklist\\n- [ ] Implement feature\\n',
            'specs/demo/spec.md':'## Requirement: feature\\n#### Scenario: works\\n',
        }.items():
            path=change/file;path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(content)
    else:
        (change/'tasks.md').write_text('## Implementation checklist\\n- [x] Implement feature\\n')
        path=Path('src/new-feature.txt')
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('implemented\\n')
    sys.exit(0)
sys.exit(127)
'''


def command(cwd, *args, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f'{args}: exit={result.returncode} stdout={result.stdout} stderr={result.stderr}')
    return result


class NonPayingPhaseFixture(unittest.TestCase):
    def test_node22_clean_phase_runners_bootstrap_dev_esbuild_before_each_check(self):
        # Unlike the cheap phase-routing fixture, npm is REAL here. Only the
        # OpenSpec and OpenCode/provider executables are mocked, so a missing
        # project npm ci or omitted devDependency fails deterministically.
        version = command(ROOT, 'node', '--version').stdout.strip()
        if not version.startswith('v22.'):
            if os.environ.get('CI', '').lower() == 'true':
                self.fail('AgentKit dependency qualification CI must run on Node 22')
            self.skipTest('Real fresh npm regression is qualified on pinned Node 22 CI')
        cfg = json.loads((ROOT/'kits/opencode-openspec/mvp-config.example.json').read_text())
        preview = render_mvp(ROOT, cfg)
        shell = base64.b64decode(next(f['contentBase64'] for f in preview['files']
            if f['path'] == '.asf/agentkit/runtime/phase.sh')).decode()
        install = shell.index('npm ci --ignore-scripts')
        self.assertLess(install, shell.index('if [[ "$PHASE" == plan ]]'))
        self.assertLess(install, shell.index('openspec init --tools'))
        self.assertEqual(shell.count('npm ci --ignore-scripts'), 1)
        self.assertEqual(shell.count('npm run check'), 4)  # apply prompt + 3 actual phases

        with tempfile.TemporaryDirectory(prefix='mvp-node22-deps-') as tmp:
            target = Path(tmp)/'target'
            target.mkdir()
            for item in preview['files']:
                path = target/item['path']
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(base64.b64decode(item['contentBase64']))
            fixture = ROOT/'tests/fixtures/node22-esbuild'
            for name in ('package.json', 'package-lock.json', 'check-esbuild.mjs'):
                shutil.copyfile(fixture/name, target/name)
            (target/'openspec').mkdir()
            (target/'openspec/config.yaml').write_text('schema: spec-driven\n')
            task = target/'backlog/tasks/TS-009.md'
            task.parent.mkdir(parents=True)
            task.write_text('# Task 009\nBuild a safe feature.\n')
            command(target, 'git', 'init', '-q')
            (target/'.git/info/exclude').write_text('/node_modules/\n')
            command(target, 'git', 'add', '.')
            command(target, 'git', '-c', 'user.name=Fixture',
                    '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline')
            bin_dir = Path(tmp)/'mock-bin'
            bin_dir.mkdir()
            for name in ('openspec', 'opencode'):
                file = bin_dir/name
                file.write_text(FAKE_BIN)
                file.chmod(0o700)
            runtime = target/'.asf/agentkit/runtime'
            (Path(tmp)/'checklist.mjs').write_bytes((runtime/'checklist.mjs').read_bytes())
            env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'],
                RUNNER_TEMP=str(tmp), MOCK_LOG=str(Path(tmp)/'calls.log'),
                REQUIRE_ESBUILD='1', GITHUB_REPOSITORY=cfg['targetRepository'],
                TASK_ID='TS-009', CHANGE_ID='ts-009',
                OPENCODE_MODEL='model-is-never-called')
            for key in ('OPENROUTER_API_KEY', 'NODE_ENV', 'npm_config_omit', 'NPM_CONFIG_OMIT'):
                env.pop(key, None)
            for phase in ('plan', 'apply', 'finalize'):
                # Simulate a fresh Node 22 Actions runner on each phase:
                # keep only tracked project bytes/checkpoints, no node_modules.
                self.assertFalse((target/'node_modules').exists(), phase)
                env['PHASE'] = phase
                result = command(target, 'bash', str(runtime/'phase.sh'), env=env)
                self.assertIn('AgentKit Node 22 project check: esbuild available', result.stdout)
                self.assertTrue((target/'node_modules/esbuild/package.json').is_file())
                self.assertTrue((target/'node_modules/@esbuild').is_dir())
                self.assertEqual(command(target, 'git', 'diff', '--',
                    'package.json', 'package-lock.json').stdout.strip(), '')
                command(target, 'git', 'add', '-A')
                command(target, 'git', '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', phase)
                shutil.rmtree(target/'node_modules')
            calls = (Path(tmp)/'calls.log').read_text()
            self.assertEqual(calls.count('opencode run'), 3)
            self.assertEqual(calls.count('openspec init'), 3)
            self.assertTrue((target/'openspec/changes/archive/2026-10-24-ts-009/tasks.md').is_file())

    def test_plan_apply_finalize_and_protected_scope(self):
        cfg = json.loads((ROOT/'kits/opencode-openspec/mvp-config.example.json').read_text())
        preview = render_mvp(ROOT, cfg)
        with tempfile.TemporaryDirectory(prefix='mvp-qualification-') as tmp:
            target = Path(tmp)/'target'
            target.mkdir()
            for item in preview['files']:
                path = target/item['path']
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(base64.b64decode(item['contentBase64']))
            (target/'openspec').mkdir()
            (target/'openspec/config.yaml').write_text('schema: spec-driven\n')
            (target/'package-lock.json').write_text('{}\n')
            (target/'package.json').write_text('{"scripts":{"check":"true"}}\n')
            task = target/'backlog/tasks/TS-009.md'
            task.parent.mkdir(parents=True)
            task.write_text('# Task 009\nBuild a safe feature.\n')
            command(target, 'git', 'init', '-q')
            command(target, 'git', 'add', '.')
            command(target, 'git', '-c', 'user.name=Fixture',
                    '-c', 'user.email=fixture@example.invalid',
                    'commit', '-qm', 'initial fixture')
            bin_dir = Path(tmp)/'bin'
            bin_dir.mkdir()
            for name in ('npm', 'openspec', 'opencode'):
                file = bin_dir/name
                file.write_text(FAKE_BIN)
                file.chmod(0o700)
            runtime = target/'.asf/agentkit/runtime'
            (Path(tmp)/'checklist.mjs').write_bytes((runtime/'checklist.mjs').read_bytes())
            env = dict(os.environ, PATH=str(bin_dir)+os.pathsep+os.environ['PATH'],
                       RUNNER_TEMP=str(tmp), MOCK_LOG=str(Path(tmp)/'calls.log'),
                       GITHUB_REPOSITORY=cfg['targetRepository'], TASK_ID='TS-009',
                       CHANGE_ID='ts-009', OPENCODE_MODEL='openrouter/deepseek/deepseek-v4.1-flash')
            # No real provider secret is present: every call is a local fake.
            env.pop('OPENROUTER_API_KEY', None)
            for phase in ('plan', 'apply', 'finalize'):
                env['PHASE'] = phase
                command(target, 'bash', str(runtime/'phase.sh'), env=env)
                command(target, 'node', str(runtime/'scope.mjs'),
                        'all', phase, 'ts-009', env=env)
                command(target, 'git', 'add', '-A')
                command(target, 'node', str(runtime/'scope.mjs'),
                        'staged', phase, 'ts-009', env=env)
                command(target, 'git', '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.invalid',
                        'commit', '-qm', phase)
            self.assertTrue((target/'openspec/changes/archive/2026-10-24-ts-009/tasks.md').exists())
            self.assertEqual((target/'openspec/specs/demo/spec.md').read_text(),
                             'Canonical semantic sync output\n')
            calls = (Path(tmp)/'calls.log').read_text()
            self.assertEqual(calls.count('opencode run'), 3)
            self.assertIn('openspec archive ts-009', calls)
            self.assertNotIn('gh ', calls)

    def test_request_refuses_unapproved_paid_phase_before_network(self):
        cfg = json.loads((ROOT/'kits/opencode-openspec/mvp-config.example.json').read_text())
        preview = render_mvp(ROOT, cfg)
        request = base64.b64decode(next(
            f['contentBase64'] for f in preview['files'] if f['path'].endswith('/request.mjs')))
        with tempfile.TemporaryDirectory(prefix='mvp-denied-') as tmp:
            script = Path(tmp)/'request.mjs'
            script.write_bytes(request)
            env = dict(os.environ, GITHUB_REPOSITORY=cfg['targetRepository'],
                       GITHUB_REPOSITORY_OWNER='example', GITHUB_ACTOR='example',
                       GITHUB_REF='refs/heads/main', GITHUB_EVENT_NAME='workflow_dispatch',
                       GITHUB_RUN_ATTEMPT='1', PHASE='plan', PAID_APPROVAL='NO',
                       OPENCODE_MODEL='openrouter/deepseek/deepseek-v4.1-flash',
                       RAW_TASK_ID='9', GITHUB_OUTPUT=str(Path(tmp)/'output'))
            result = subprocess.run(['node', str(script)], cwd=tmp, env=env,
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('approval is missing', result.stderr)
            self.assertFalse((Path(tmp)/'output').exists())


if __name__ == '__main__':
    unittest.main()
