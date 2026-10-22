"""Read-only, deterministic R2c candidate generation tests (no GitHub calls)."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from build_candidate import PlanError, build_candidate, manifest_bytes  # noqa: E402


class CandidateTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.descriptor = self.root / 'descriptor.json'
        self.paths = ['docs/second.md', 'docs/first.md']
        self.payload = {'schemaVersion': 1, 'kitId': 'opencode-openspec',
                        'kitVersion': '1.0.1', 'coreVersion': '1.0.0',
                        'sourceRepository': 'synthetic/repo', 'sourceCommitSha': 'a' * 40,
                        'releaseTag': 'kits/opencode-openspec/v1.0.1',
                        'runtime': {'nodeVersion': '22.16.0', 'openCodeVersion': '1.0.0',
                                    'openSpecVersion': '1.14.1'}, 'paths': self.paths}
        for path, data in [('docs/first.md', b'first\n'), ('docs/second.md', b'second\n')]:
            file = self.source / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
        self.save()

    def save(self):
        self.descriptor.write_text(json.dumps(self.payload), encoding='utf-8')

    def test_canonical_sorted_and_hashes(self):
        data = build_candidate(self.source, self.descriptor)
        self.assertEqual([v['path'] for v in data['artifacts']], sorted(self.paths))
        self.assertEqual(data['artifacts'][0]['sha256'], hashlib.sha256(b'first\n').hexdigest())
        self.assertNotIn('paths', data)
        self.assertTrue(manifest_bytes(data).endswith(b'\n'))
        self.assertFalse((self.source / 'release.json').exists())

    def test_order_independent_and_byte_reproducible(self):
        first = manifest_bytes(build_candidate(self.source, self.descriptor))
        self.payload['paths'] = list(reversed(self.paths))
        self.save()
        self.assertEqual(first, manifest_bytes(build_candidate(self.source, self.descriptor)))

    def test_cli_verify_same_bytes_and_no_write(self):
        manifest = self.root / 'manifest.json'
        manifest.write_bytes(manifest_bytes(build_candidate(self.source, self.descriptor)))
        cmd = [sys.executable, str(ROOT / 'tools/build_candidate.py'), '--source', str(self.source),
               '--descriptor', str(self.descriptor), '--verify-manifest', str(manifest)]
        result = subprocess.run(cmd, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, manifest.read_bytes())
        self.assertEqual(len(list(self.source.rglob('*.md'))), 2)

    def test_changed_artifact_fails_verification(self):
        manifest = self.root / 'manifest.json'
        manifest.write_bytes(manifest_bytes(build_candidate(self.source, self.descriptor)))
        (self.source / self.paths[0]).write_text('tampered\n')
        cmd = [sys.executable, str(ROOT / 'tools/build_candidate.py'), '--source', str(self.source),
               '--descriptor', str(self.descriptor), '--verify-manifest', str(manifest)]
        result = subprocess.run(cmd, capture_output=True, check=False)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stdout, b'')

    def test_duplicate_json_keys_rejected(self):
        self.descriptor.write_text(self.descriptor.read_text().replace('"kitId":', '"kitId": "opencode-direct", "kitId":'))
        with self.assertRaisesRegex(PlanError, 'duplicate JSON'):
            build_candidate(self.source, self.descriptor)

    def test_unknown_metadata_refused(self):
        self.payload['githubToken'] = 'dummy'
        self.save()
        with self.assertRaisesRegex(PlanError, 'exactly'):
            build_candidate(self.source, self.descriptor)

    def test_absolute_and_traversal_refused(self):
        for path in ('/etc/passwd', '../outside', 'docs/../first.md', '.git/config', '.asf/agentkit.lock.json'):
            with self.subTest(path=path):
                self.payload['paths'] = [path]
                self.save()
                with self.assertRaises(PlanError):
                    build_candidate(self.source, self.descriptor)

    def test_case_collision_rejected(self):
        self.payload['paths'] += ['docs/FIRST.md']
        self.save()
        with self.assertRaisesRegex(PlanError, 'case-colliding'):
            build_candidate(self.source, self.descriptor)

    def test_duplicate_path_rejected(self):
        self.payload['paths'].append('docs/first.md')
        self.save()
        with self.assertRaisesRegex(PlanError, 'duplicate'):
            build_candidate(self.source, self.descriptor)

    def test_symlink_in_source_rejected(self):
        (self.source / 'docs/first.md').unlink()
        (self.source / 'docs/first.md').symlink_to(self.source / 'docs/second.md')
        with self.assertRaisesRegex(PlanError, 'symlink'):
            build_candidate(self.source, self.descriptor)

    def test_large_file_refused(self):
        (self.source / 'docs/first.md').write_bytes(b'A' * (1024 * 1024 + 1))
        with self.assertRaisesRegex(PlanError, 'oversized'):
            build_candidate(self.source, self.descriptor)

    def test_invalid_tag_must_not_be_promoted(self):
        self.payload['releaseTag'] = 'kits/opencode-direct/v1.0.1'
        self.save()
        with self.assertRaisesRegex(PlanError, 'invalid candidate'):
            build_candidate(self.source, self.descriptor)

    def test_symlink_descriptor_rejected(self):
        original = self.root / 'original.json'
        self.descriptor.rename(original)
        self.descriptor.symlink_to(original)
        with self.assertRaisesRegex(PlanError, 'small regular file'):
            build_candidate(self.source, self.descriptor)

    def test_unsupported_nested_paths_rejected(self):
        self.payload['paths'] = ['docs//first.md']
        self.save()
        with self.assertRaises(PlanError):
            build_candidate(self.source, self.descriptor)

    def test_empty_or_non_list_paths_rejected(self):
        for paths in ([], 'docs/first.md', [1]):
            with self.subTest(paths=paths):
                self.payload['paths'] = paths
                self.save()
                with self.assertRaisesRegex(PlanError, 'non-empty array'):
                    build_candidate(self.source, self.descriptor)


if __name__ == '__main__':
    unittest.main()
