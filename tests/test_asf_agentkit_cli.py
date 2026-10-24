import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from asf_agentkit_cli import (CliError, LOCK_PATH, origin, safe_member,
                              read_lock, observed, main)
from render_mvp_kit import FILES


def cmd(root, *args):
    result = subprocess.run(args, cwd=root, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f'{args}: {result.stdout} {result.stderr}')
    return result.stdout.strip()


class CliLocalCheckout(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='agentkit-cli-')
        root = Path(self.tmp.name)
        self.source = root/'source'
        self.target = root/'target'
        self.source.mkdir()
        self.target.mkdir()
        cmd(self.source, 'git', 'init', '-q')
        cmd(self.source, 'git', 'remote', 'add', 'origin',
            'https://github.com/cedricmenec/asf-agent-kits.git')
        templates = ROOT/'kits/opencode-openspec/templates'
        for name, _ in FILES:
            dest = self.source/'kits/opencode-openspec/templates'/name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(templates/name, dest)
        version = self.source/'kits/opencode-openspec/version.json'
        shutil.copyfile(ROOT/'kits/opencode-openspec/version.json', version)
        self.commit(self.source, 'pinned source v0.1.0')
        self.source_sha = cmd(self.source, 'git', 'rev-parse', 'HEAD')

        cmd(self.target, 'git', 'init', '-q')
        cmd(self.target, 'git', 'remote', 'add', 'origin',
            'https://github.com/example/qualification-repository.git')
        (self.target/'openspec').mkdir()
        (self.target/'openspec/config.yaml').write_text('schema: spec-driven\n')
        (self.target/'package.json').write_text('{"scripts":{"check":"node --test"}}\n')
        (self.target/'package-lock.json').write_text('{"lockfileVersion":3}\n')
        task = self.target/'backlog/tasks/TS-001.md'
        task.parent.mkdir(parents=True)
        task.write_text('Qualification task\n')
        self.commit(self.target, 'target baseline')
        self.default_sha = cmd(self.target, 'git', 'rev-parse', 'HEAD')
        cmd(self.target, 'git', 'switch', '-q', '-c', 'feature/agentkit-install')
        self.config = root/'config.json'
        cfg = json.loads((ROOT/'kits/opencode-openspec/mvp-config.example.json').read_text())
        cfg['targetRepository'] = 'example/qualification-repository'
        self.config.write_text(json.dumps(cfg))
        self.baseargs = [
            '--repo', 'example/qualification-repository',
            '--checkout', str(self.target), '--kit', 'opencode-openspec',
            '--version', '0.1.0', '--source', str(self.source),
            '--source-commit', self.source_sha, '--config', str(self.config),
        ]

    def tearDown(self):
        self.tmp.cleanup()

    def commit(self, directory, message):
        cmd(directory, 'git', 'add', '.')
        cmd(directory, 'git', '-c', 'user.name=Fixture',
            '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message)

    def cli(self, command, args=None, expected=0):
        result = subprocess.run(
            [sys.executable, str(ROOT/'bin/asf-agentkit'), command] + (args or self.baseargs),
            cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(result.returncode, expected, result.stderr + result.stdout)
        return json.loads(result.stdout) if expected in (0, 2) else result.stderr

    def install(self):
        self.cli('install', self.baseargs + ['--apply', '--expected-head', self.default_sha])

    def test_install_dry_run_is_read_only_and_exact(self):
        plan = self.cli('install', self.baseargs + ['--dry-run'])
        self.assertEqual(plan['status'], 'proposed')
        self.assertEqual(sum(x['action'] == 'create' for x in plan['operations']), 10)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')
        self.assertFalse((self.target/LOCK_PATH).exists())
        self.assertFalse(plan['releaseProvenanceVerified'])
        self.assertEqual(plan['sourceCommitSha'], self.source_sha)

    def test_apply_on_explicit_ordinary_branch_then_idempotent(self):
        self.install()
        lock = read_lock(self.target)
        self.assertEqual(lock['version'], '0.1.0')
        self.assertEqual(lock['sourceCommitSha'], self.source_sha)
        self.assertEqual(len(lock['managedFiles']), 9)
        self.assertEqual(self.cli('status', self.baseargs[:4])['status'], 'hash-match')
        self.commit(self.target, 'installed by reviewed local branch')
        plan = self.cli('install', self.baseargs + ['--dry-run'])
        self.assertEqual(set(x['action'] for x in plan['operations']), {'unchanged'})
        report = self.cli('doctor', self.baseargs[:4] + ['--config', str(self.config)])
        self.assertTrue(report['localChecks']['managedWorkflowPresent'])
        self.assertEqual(report['githubAppStatus'], 'unknown-not-queried')
        self.assertEqual(report['secretsStatus'], 'unknown-not-queried')

    def test_wrong_pin_and_version_refused_without_write(self):
        bad_pin = self.baseargs.copy()
        bad_pin[bad_pin.index('--source-commit')+1] = 'deadbeef'
        bad_version = self.baseargs.copy()
        bad_version[bad_version.index('--version')+1] = '9.9.9'
        for args in (
            bad_pin, bad_version,
        ):
            self.cli('install', args + ['--dry-run'], expected=3)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')

    def test_unmanaged_collision_symlink_and_case_alias_refused(self):
        path = self.target/'.github/workflows/asf-agentkit-openspec.yml'
        path.parent.mkdir(parents=True)
        path.write_text('other workflow\n')
        conflict = self.cli('install', self.baseargs + ['--dry-run'], expected=2)
        self.assertEqual(conflict['status'], 'blocked')
        self.assertTrue(any(x['path'] == '.github/workflows/asf-agentkit-openspec.yml' and
                            x['action'] == 'conflict' for x in conflict['operations']))
        path.unlink()
        path.symlink_to(self.target/'package.json')
        self.cli('install', self.baseargs + ['--dry-run'], expected=3)
        path.unlink()
        path.parent.joinpath('ASF-AgentKit-OpenSpec.yml').write_text('case collision\n')
        self.cli('install', self.baseargs + ['--dry-run'], expected=3)

    def test_apply_denied_on_default_branch_and_dirty_checkout(self):
        cmd(self.target, 'git', 'switch', '-q', 'master')
        self.cli('install', self.baseargs + ['--apply', '--expected-head', self.default_sha], expected=3)
        cmd(self.target, 'git', 'switch', '-q', 'feature/agentkit-install')
        (self.target/'unrelated.txt').write_text('dirty\n')
        self.cli('install', self.baseargs + ['--apply', '--expected-head', self.default_sha], expected=3)
        self.assertFalse((self.target/LOCK_PATH).exists())

    def test_pinned_git_objects_immune_to_worktree_template_drift(self):
        template = self.source/'kits/opencode-openspec/templates/phase.sh.tmpl'
        template.write_text('changed uncommitted local template\n')
        plan = self.cli('install', self.baseargs + ['--dry-run'])
        self.assertEqual(plan['status'], 'proposed')
        self.assertEqual(plan['sourceCommitSha'], self.source_sha)

    def test_upgrade_dry_run_reports_changes_and_overlay_conflicts(self):
        self.install()
        self.commit(self.target, 'installed')
        version = self.source/'kits/opencode-openspec/version.json'
        data = json.loads(version.read_text())
        data['kitVersion'] = '0.2.0'
        version.write_text(json.dumps(data))
        template = self.source/'kits/opencode-openspec/templates/manual-acceptance.md.tmpl'
        template.write_text(template.read_text() + '\nUpgrade note.\n')
        self.commit(self.source, 'new pinned source v0.2.0')
        newer = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        args = self.baseargs.copy()
        args[args.index('--version')+1] = '0.2.0'
        args[args.index('--source-commit')+1] = newer
        result = self.cli('upgrade', args + ['--dry-run'])
        self.assertEqual(result['status'], 'proposed')
        self.assertIn('update', [x['action'] for x in result['operations']])
        target_doc = self.target/'.asf/agentkit/manual-acceptance.md'
        target_doc.write_text(target_doc.read_text() + '\nLocal overlay.\n')
        blocked = self.cli('upgrade', args + ['--dry-run'], expected=2)
        self.assertEqual(blocked['status'], 'blocked')

    def test_target_remote_mismatch_and_untrusted_lock_refused(self):
        wrong = self.baseargs.copy()
        wrong[wrong.index('--repo')+1] = 'someone/else'
        self.cli('install', wrong + ['--dry-run'], expected=3)
        lock = self.target/LOCK_PATH
        lock.parent.mkdir()
        lock.write_text('{"schemaVersion":1,"kits":[]}')
        self.cli('status', self.baseargs[:4], expected=3)

    def test_explicit_pr_requires_exact_reviewed_plan_and_app_jwt(self):
        dry = self.cli('install', self.baseargs + ['--dry-run'])
        self.assertEqual(len(dry['planSha256']), 64)
        args = self.baseargs + [
            '--pr', '--base-branch', 'main', '--new-branch', 'asf-agentkit/install-a',
            '--expected-base-sha', self.default_sha,
            '--expected-plan-sha', dry['planSha256'], '--expected-app-id', '12345']
        with patch.dict(os.environ, {'GITHUB_APP_JWT': ''}):
            self.cli('install', args, expected=3)
        bad_plan = args.copy()
        bad_plan[bad_plan.index('--expected-plan-sha')+1] = '0' * 64
        with patch.dict(os.environ, {'GITHUB_APP_JWT': 'FAKE_JWT'}):
            self.cli('install', bad_plan, expected=3)
            with patch('asf_agentkit_cli.mint_target_writer', return_value='FAKE_WRITER') as mint, \
                 patch('asf_agentkit_cli.publish_draft', return_value={'status': 'draft-pr-created'}) as publisher:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(main(['install'] + args), 0)
                self.assertEqual(json.loads(out.getvalue())['status'], 'draft-pr-created')
                self.assertEqual(mint.call_args.args[1:], ('example/qualification-repository', 12345))
                self.assertEqual(publisher.call_args.args[0], 'FAKE_WRITER')
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')
        cfg = json.loads(self.config.read_text())
        cfg['appIdVar'] = 'REVIEWED_DIFFERENT_APP_ID'
        self.config.write_text(json.dumps(cfg))
        changed = self.cli('install', self.baseargs + ['--dry-run'])
        self.assertNotEqual(dry['planSha256'], changed['planSha256'],
                            'A changed rendered workflow/config needs a new explicit approval')
        self.assertNotEqual(dry['configurationSha256'], changed['configurationSha256'])


class Helpers(unittest.TestCase):
    def test_remote_parsing(self):
        self.assertEqual(origin('https://github.com/cedricmenec/asf-agent-kits.git'),
                         'cedricmenec/asf-agent-kits')
        self.assertEqual(origin('git@github.com:owner/repo.git'), 'owner/repo')
        self.assertIsNone(origin('file:///untrusted/repo'))
        self.assertIsNone(origin('https://evil.example/owner/repo'))


if __name__ == '__main__':
    unittest.main()
