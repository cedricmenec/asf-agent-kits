"""R5a-01: status classifications, no false attestation or target writes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from inspect_installation_status import preview_installation_status, StatusPreviewError


class InstallationStatusTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='asf-r5a-')
        self.addCleanup(tmp.cleanup)
        self.target = Path(tmp.name) / 'target'
        self.target.mkdir()
        self.file = self.target / 'docs/kit.md'
        self.original = b'installed kit\n'
        self.digest = hashlib.sha256(self.original).hexdigest()

    def save(self, body=None):
        self.file.parent.mkdir(exist_ok=True)
        self.file.write_bytes(self.original if body is None else body)

    def lock(self):
        folder = self.target / '.asf'
        folder.mkdir(exist_ok=True)
        value = {'schemaVersion': 1, 'kits': [{
            'id': 'opencode-direct', 'version': '1.2.3',
            'sourceRepository': 'synthetic/catalogue',
            'releaseTag': 'kits/opencode-direct/v1.2.3',
            'sourceCommitSha': 'a' * 40, 'coreVersion': '1.0.0',
            'configSchemaVersion': 1,
            'managedFiles': {'docs/kit.md': self.digest}}]}
        (folder / 'agentkit.lock.json').write_text(json.dumps(value))

    def preview(self):
        return preview_installation_status(str(self.target))

    def assert_safe(self, result):
        self.assertNotEqual(result['classification'], 'verified')
        for key in ('sourceProvenanceVerified', 'trustEvidenceIndependentlyVerified',
                    'authorizedToExecute', 'promotionAllowed', 'writesPerformed',
                    'filesystemSnapshotAtomic'):
            self.assertFalse(result[key], key)
        self.assertTrue(result['paidApprovalRequired'])

    def test_empty_target_is_unmanaged_legacy(self):
        result = self.preview()
        self.assertEqual(result['classification'], 'unmanaged-legacy')
        self.assertEqual(result['kits'], [])
        self.assert_safe(result)

    def test_managed_hash_match_is_unknown_not_verified(self):
        self.lock(); self.save()
        before = self.file.read_bytes()
        result = self.preview()
        self.assertEqual(result['classification'], 'unknown')
        self.assertEqual(result['kits'][0]['nonMatchingFiles'], 0)
        self.assert_safe(result)
        self.assertEqual(self.preview(), result)
        self.assertEqual(self.file.read_bytes(), before)

    def test_mutated_managed_file_is_drifted(self):
        self.lock(); self.save(b'changed\n')
        result = self.preview()
        self.assertEqual(result['classification'], 'drifted')
        self.assertEqual(result['kits'][0]['nonMatchingFiles'], 1)
        self.assert_safe(result)

    def test_missing_managed_file_is_drifted(self):
        self.lock()
        self.assertEqual(self.preview()['classification'], 'drifted')

    def test_unmanaged_existing_file_is_not_inherited(self):
        self.save()
        self.assertEqual(self.preview()['classification'], 'unmanaged-legacy')

    def test_invalid_lock_fails_closed(self):
        self.lock()
        (self.target / '.asf/agentkit.lock.json').write_text('{"schemaVersion":99}')
        with self.assertRaises(StatusPreviewError): self.preview()

    def test_symlink_target_refused(self):
        self.lock(); self.save()
        self.file.unlink()
        self.file.symlink_to('/etc/passwd')
        with self.assertRaises(StatusPreviewError): self.preview()

    def test_invalid_type_fails_closed(self):
        with self.assertRaises(StatusPreviewError): preview_installation_status({'target':str(self.target)})

    def test_cli_no_write_and_deterministic_exit(self):
        command=[sys.executable,str(ROOT/'tools/inspect_installation_status.py'),
                 '--target',str(self.target)]
        first=subprocess.run(command,capture_output=True,text=True)
        second=subprocess.run(command,capture_output=True,text=True)
        self.assertEqual(first.returncode,0,first.stderr)
        self.assertEqual(first.stdout,second.stdout)
        self.assert_safe(json.loads(first.stdout))
        self.lock(); self.save(b'drift\n')
        changed=subprocess.run(command,capture_output=True,text=True)
        self.assertEqual(changed.returncode,2,changed.stderr)
        self.assertEqual(json.loads(changed.stdout)['classification'],'drifted')
