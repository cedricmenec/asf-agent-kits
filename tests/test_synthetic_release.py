"""SEC-02b-01 adversarial fixtures: never trust simulated release identity."""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from preview_synthetic_release import inspect_synthetic_release, SyntheticReleaseError


@unittest.skipUnless(sys.platform.startswith('linux'), 'fd-relative Linux fixture')
class SyntheticReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='asf-sec02b-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'artifacts'
        self.root.mkdir()
        self.manifest = b'{"fixture":"offline-only","release":"1.2.3"}\n'
        self.source = 'a' * 40
        self.tag = 'kits/opencode-direct/v1.2.3'
        self.payloads = {'docs/hello.md': b'Hello fixture\n', 'agents/help.md': b'Offline agent\n'}
        for path, data in self.payloads.items():
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
        self.claim = {
            'schemaVersion': 1, 'kind': 'untrusted-release-claim',
            'kitId': 'opencode-direct', 'kitVersion': '1.2.3',
            'sourceRepository': 'synthetic/agent-kits',
            'sourceCommitSha': self.source, 'releaseTag': self.tag,
            'claimedTagTargetCommitSha': self.source,
            'manifestSha256': hashlib.sha256(self.manifest).hexdigest(),
            'artifacts': [{'path': path, 'sha256': hashlib.sha256(data).hexdigest()}
                          for path, data in self.payloads.items()],
        }
        self.policy = {'repository': 'synthetic/agent-kits',
                       'kitId': 'opencode-direct', 'tag': self.tag,
                       'commitSha': self.source, 'checkAppId': 15368}
        self.remote = {'repository': 'synthetic/agent-kits', 'tag': self.tag,
                       'targetCommitSha': self.source, 'mainProtected': True,
                       'tagImmutable': True, 'publisherAppId': 15368,
                       'permissions': {'contentsRead': True, 'metadataRead': True,
                                       'contentsWrite': False},
                       'manifestSha256': self.claim['manifestSha256']}

    def preview(self):
        return inspect_synthetic_release(self.claim, self.policy, self.remote,
                                         str(self.root), self.manifest)

    def test_consistent_mock_bytes_do_not_grant_provenance(self):
        result = self.preview()
        self.assertEqual(result['artifactCount'], 2)
        self.assertTrue(result['syntheticEvidenceConsistent'])
        self.assertTrue(result['disposableArtifactBytesMatched'])
        for key in ('sourceProvenanceVerified', 'trustEvidenceIndependentlyVerified',
                    'hostIndependentlyAuthenticated', 'promotionAllowed',
                    'authorizedToExecute', 'writesPerformed'):
            self.assertFalse(result[key], key)
        self.assertTrue(result['paidApprovalRequired'])
        self.assertEqual(self.preview(), result)

    def test_moved_tag_commit(self):
        self.remote['targetCommitSha'] = 'b'*40
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_disabled_tag_ruleset(self):
        self.remote['tagImmutable'] = False
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_unprotected_main(self):
        self.remote['mainProtected'] = False
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_wrong_publisher_app(self):
        self.remote['publisherAppId'] = 12
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_write_scopes_not_minimal(self):
        self.remote['permissions']['contentsWrite'] = True
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_malformed_rights(self):
        self.remote['permissions']['contentsRead'] = 1
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_manifest_tamper(self):
        self.manifest += b'changed'
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_manifest_claim_mismatch(self):
        self.remote['manifestSha256'] = '0' * 64
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_artifact_modified(self):
        (self.root / 'docs/hello.md').write_bytes(b'tampered')
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_artifact_missing(self):
        (self.root / 'docs/hello.md').unlink()
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_unmanaged_artifact(self):
        (self.root / 'extra.txt').write_bytes(b'extra')
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_symlink_rejected(self):
        (self.root / 'docs/hello.md').unlink()
        (self.root / 'docs/hello.md').symlink_to('/etc/passwd')
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_executable_rejected(self):
        (self.root / 'docs/hello.md').chmod(0o755)
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_self_declared_claim_authority(self):
        self.claim['sourceProvenanceVerified'] = True
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_extra_transport_credentials_rejected(self):
        self.remote['token'] = 'TOPSECRET'
        with self.assertRaisesRegex(SyntheticReleaseError, '^SEC-02b DENY:') as ctx:
            self.preview()
        self.assertNotIn('TOPSECRET', str(ctx.exception))

    def test_wrong_host_pin(self):
        self.policy['repository'] = 'other/repo'
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_invalid_claim_artifact_path(self):
        self.claim['artifacts'][0]['path'] = '../secret'
        with self.assertRaises(SyntheticReleaseError): self.preview()

    def test_snapshot_root_symlink(self):
        alias = Path(self.tmp.name) / 'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(SyntheticReleaseError):
            inspect_synthetic_release(self.claim, self.policy, self.remote,
                                      str(alias), self.manifest)

    def test_input_policy_forged_grant(self):
        self.policy['promotionAllowed'] = True
        with self.assertRaises(SyntheticReleaseError): self.preview()


if __name__ == '__main__':
    unittest.main()
