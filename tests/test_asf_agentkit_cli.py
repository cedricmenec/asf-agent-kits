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
                              read_lock, observed, main, apply_upgrade,
                              desired_lock, plan, rendered_source, replace_managed)
from build_candidate import build_git_candidate, manifest_bytes
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
        version.write_text(json.dumps({
            'schemaVersion': 1, 'kitVersion': '0.1.0',
            'distribution': 'user-pinned-git-commit',
            'releaseStatus': 'development-unreleased',
        }, sort_keys=True) + '\n')
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

    def test_stable_1_0_0_source_is_installable_from_exact_commit(self):
        version = self.source/'kits/opencode-openspec/version.json'
        metadata = json.loads(version.read_text())
        metadata.update({'kitVersion': '1.0.0', 'releaseStatus': 'stable'})
        version.write_text(json.dumps(metadata, sort_keys=True) + '\n')
        self.commit(self.source, 'stable source v1.0.0')
        sha = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        args = self.baseargs.copy()
        args[args.index('--version')+1] = '1.0.0'
        args[args.index('--source-commit')+1] = sha
        preview = self.cli('install', args + ['--dry-run'])
        self.assertEqual(preview['status'], 'proposed')
        self.assertEqual(preview['sourceCommitSha'], sha)
        self.assertEqual(preview['sourceTrust'], 'user-pinned-git-object-unattested')
        self.assertFalse(preview['releaseProvenanceVerified'])
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')

    def test_unknown_release_status_is_refused(self):
        version = self.source/'kits/opencode-openspec/version.json'
        metadata = json.loads(version.read_text())
        metadata['releaseStatus'] = 'published-without-gates'
        version.write_text(json.dumps(metadata, sort_keys=True) + '\n')
        self.commit(self.source, 'invalid release status')
        sha = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        args = self.baseargs.copy()
        args[args.index('--source-commit')+1] = sha
        self.cli('install', args + ['--dry-run'], expected=3)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')

    def test_candidate_manifest_preview_is_bounded_and_not_release_trust(self):
        paths = ['kits/opencode-openspec/templates/' + name for name, _ in FILES]
        metadata = {
            'schemaVersion': 1, 'kitId': 'opencode-openspec', 'kitVersion': '0.1.0',
            'coreVersion': '0.1.0', 'sourceRepository': 'cedricmenec/asf-agent-kits',
            'sourceCommitSha': self.source_sha,
            'releaseTag': 'kits/opencode-openspec/v0.1.0',
            'runtime': {'nodeVersion': '22.23.3', 'openCodeVersion': '1.19.0',
                        'openSpecVersion': '1.14.1'}, 'paths': paths,
        }
        manifest = self.config.parent/'release-manifest.json'
        candidate = build_git_candidate(self.source, self.source_sha, metadata)
        manifest.write_bytes(manifest_bytes(candidate))
        args = self.baseargs + ['--candidate-manifest', str(manifest)]
        preview = self.cli('install', args + ['--dry-run'])
        self.assertTrue(preview['candidateBytesMatchPinnedGit'])
        self.assertFalse(preview['releaseProvenanceVerified'])
        self.assertEqual(len(preview['candidateManifestCanonicalSha256']), 64)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')
        self.cli('install', args + ['--apply', '--expected-head', self.default_sha], expected=3)
        self.assertFalse((self.target/LOCK_PATH).exists())

        tampered = json.loads(manifest.read_text())
        tampered['artifacts'][0]['sha256'] = '0' * 64
        manifest.write_text(json.dumps(tampered))
        self.cli('install', args + ['--dry-run'], expected=3)
        manifest.write_bytes(manifest_bytes(candidate))

        missing_template = dict(candidate)
        missing_template['artifacts'] = candidate['artifacts'][1:]
        manifest.write_text(json.dumps(missing_template))
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

    def test_reviewed_upgrade_apply_and_git_revert_restore_prior_lock(self):
        self.install()
        self.commit(self.target, 'installed v0.1.0')
        installed_head = cmd(self.target, 'git', 'rev-parse', 'HEAD')
        original_lock = (self.target/LOCK_PATH).read_bytes()
        original_workflow = (self.target/'.github/workflows/asf-agentkit-openspec.yml').read_bytes()

        version = self.source/'kits/opencode-openspec/version.json'
        content = json.loads(version.read_text())
        content['kitVersion'] = '0.2.0'
        version.write_text(json.dumps(content))
        template = self.source/'kits/opencode-openspec/templates/manual-acceptance.md.tmpl'
        template.write_text(template.read_text() + '\nUpgraded acceptance note.\n')
        self.commit(self.source, 'pinned source v0.2.0')
        newer = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        args = self.baseargs.copy()
        args[args.index('--version')+1] = '0.2.0'
        args[args.index('--source-commit')+1] = newer
        preview = self.cli('upgrade', args + ['--dry-run'])
        self.assertEqual(preview['status'], 'proposed')
        self.assertIn('update', [item['action'] for item in preview['operations']])
        approved = args + ['--apply', '--expected-head', installed_head,
                           '--expected-plan-sha', preview['planSha256']]
        incorrect = approved.copy()
        incorrect[-1] = '0' * 64
        self.cli('upgrade', incorrect, expected=3)
        self.assertEqual((self.target/LOCK_PATH).read_bytes(), original_lock)

        applied = self.cli('upgrade', approved)
        self.assertEqual(applied['status'], 'applied-locally-uncommitted')
        self.assertTrue(applied['writesPerformed'])
        self.assertGreaterEqual(applied['updatedFiles'], 2)
        self.assertEqual(applied['createdFiles'], 0)
        self.assertEqual(read_lock(self.target)['version'], '0.2.0')
        self.assertEqual(self.cli('status', args[:4])['status'], 'hash-match')
        unchanged = self.cli('install', args + ['--dry-run'])
        self.assertEqual({item['action'] for item in unchanged['operations']}, {'unchanged'})
        self.assertNotEqual((self.target/LOCK_PATH).read_bytes(), original_lock)
        self.assertEqual((self.target/'.github/workflows/asf-agentkit-openspec.yml').read_bytes(),
                         original_workflow)
        self.assertEqual(set(cmd(self.target, 'git', 'diff', '--name-only').splitlines()),
                         {LOCK_PATH, '.asf/agentkit/manual-acceptance.md'})
        self.commit(self.target, 'reviewed upgrade v0.2.0')
        cmd(self.target, 'git', '-c', 'user.name=Fixture',
            '-c', 'user.email=fixture@example.invalid', 'revert', '--no-edit', 'HEAD')
        self.assertEqual((self.target/LOCK_PATH).read_bytes(), original_lock)
        self.assertEqual(read_lock(self.target)['version'], '0.1.0')
        self.assertEqual(self.cli('status', args[:4])['status'], 'hash-match')

    def test_upgrade_apply_refuses_overlay_and_wrong_branch_without_writes(self):
        self.install()
        self.commit(self.target, 'installed')
        installed_head = cmd(self.target, 'git', 'rev-parse', 'HEAD')
        version = self.source/'kits/opencode-openspec/version.json'
        content = json.loads(version.read_text())
        content['kitVersion'] = '0.2.0'
        version.write_text(json.dumps(content))
        self.commit(self.source, 'next version')
        newer = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        args = self.baseargs.copy()
        args[args.index('--version')+1] = '0.2.0'
        args[args.index('--source-commit')+1] = newer
        preview = self.cli('upgrade', args + ['--dry-run'])
        approved = args + ['--apply', '--expected-head', installed_head,
                           '--expected-plan-sha', preview['planSha256']]
        self.cli('upgrade', approved[:-3] + ['0' * 40] + approved[-2:], expected=3)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')
        cmd(self.target, 'git', 'switch', '-q', '-c', 'main')
        self.cli('upgrade', approved, expected=3)
        cmd(self.target, 'git', 'switch', '-q', 'feature/agentkit-install')
        existing = self.target/'.asf/agentkit/manual-acceptance.md'
        existing.write_text(existing.read_text() + '\nUnmanaged local note.\n')
        self.cli('upgrade', approved, expected=3)
        self.assertEqual(read_lock(self.target)['version'], '0.1.0')
        self.assertIn('Unmanaged local note.', existing.read_text())

    def test_upgrade_rolls_back_earlier_files_if_lock_update_fails(self):
        self.install()
        self.commit(self.target, 'installed')
        installed_head = cmd(self.target, 'git', 'rev-parse', 'HEAD')
        original_lock = (self.target/LOCK_PATH).read_bytes()
        original_doc = (self.target/'.asf/agentkit/manual-acceptance.md').read_bytes()
        version = self.source/'kits/opencode-openspec/version.json'
        metadata = json.loads(version.read_text())
        metadata['kitVersion'] = '0.2.0'
        version.write_text(json.dumps(metadata))
        template = self.source/'kits/opencode-openspec/templates/manual-acceptance.md.tmpl'
        template.write_text(template.read_text() + '\nChanged for upgraded kit.\n')
        self.commit(self.source, 'next pinned version')
        newer = cmd(self.source, 'git', 'rev-parse', 'HEAD')
        config = json.loads(self.config.read_text())
        files = rendered_source(self.source, newer, '0.2.0', config)
        old = read_lock(self.target)
        new = desired_lock(files, config, '0.2.0', newer)
        preview = plan(self.target, config, files, old, new, 'upgrade')
        original_replace = replace_managed

        def fail_lock(root, relative, previous, replacement):
            if relative == LOCK_PATH:
                raise CliError('Injected lock replacement failure')
            return original_replace(root, relative, previous, replacement)

        with patch('asf_agentkit_cli.replace_managed', side_effect=fail_lock):
            with self.assertRaisesRegex(CliError, 'Injected lock replacement failure'):
                apply_upgrade(self.target, files, old, new, preview, installed_head, 'main')
        self.assertEqual((self.target/LOCK_PATH).read_bytes(), original_lock)
        self.assertEqual((self.target/'.asf/agentkit/manual-acceptance.md').read_bytes(), original_doc)
        self.assertEqual(cmd(self.target, 'git', 'status', '--porcelain'), '')

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
