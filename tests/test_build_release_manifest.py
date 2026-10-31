import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from build_release_manifest import (KIT, RELEASE_PATHS, REPOSITORY,
                                    build_release_manifest)
from build_candidate import PlanError


class BuildReleaseManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='release-manifest-')
        self.source = Path(self.tmp.name)/'source'
        self.source.mkdir()
        self.git('init', '-q')
        self.git('remote', 'add', 'origin', 'https://github.com/' + REPOSITORY + '.git')
        for relative in RELEASE_PATHS:
            origin = ROOT/relative
            target = self.source/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origin, target)
        self.commit()
        self.sha = self.git('rev-parse', 'HEAD')

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        result = subprocess.run(['git', '-C', str(self.source), *args],
                                check=True, capture_output=True, text=True)
        return result.stdout.strip()

    def commit(self):
        self.git('add', '.')
        subprocess.run(['git', '-C', str(self.source), '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'],
                       check=True)

    def test_manifest_is_complete_deterministic_and_bound_to_exact_commit(self):
        first = build_release_manifest(self.source, self.sha)
        second = build_release_manifest(self.source, self.sha)
        self.assertEqual(first, second)
        self.assertEqual(first['kitVersion'], '1.0.0')
        self.assertEqual(first['releaseTag'], 'kits/opencode-openspec/v1.0.0')
        self.assertEqual(first['sourceCommitSha'], self.sha)
        self.assertEqual({x['path'] for x in first['artifacts']}, set(RELEASE_PATHS))
        self.assertEqual(len(first['artifacts']), 27)
        self.assertTrue(all(len(x['sha256']) == 64 for x in first['artifacts']))

    def test_development_source_and_wrong_remote_are_refused(self):
        version = self.source/f'kits/{KIT}/version.json'
        metadata = json.loads(version.read_text())
        metadata['releaseStatus'] = 'development-unreleased'
        version.write_text(json.dumps(metadata) + '\n')
        self.commit()
        with self.assertRaisesRegex(PlanError, 'not a stable SemVer'):
            build_release_manifest(self.source, self.git('rev-parse', 'HEAD'))

        self.git('remote', 'set-url', 'origin', 'https://github.com/example/not-agentkit.git')
        with self.assertRaisesRegex(PlanError, 'remote does not match'):
            build_release_manifest(self.source, self.sha)

    def test_missing_distribution_file_is_refused(self):
        (self.source/'tools/asf_agentkit_cli.py').unlink()
        self.commit()
        with self.assertRaises(PlanError):
            build_release_manifest(self.source, self.git('rev-parse', 'HEAD'))


if __name__ == '__main__':
    unittest.main()
