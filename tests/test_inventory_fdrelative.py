"""R3g-03: only disposable temporary directories, no network or paid calls."""
import hashlib
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from inventory_fdrelative import inventory_fdrelative, FdInventoryError

SHA = 'a' * 40
SPEC = 'openspec/specs/widgets/spec.md'


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'O_NOFOLLOW'), 'POSIX fd-relative only')
class FdRelativeFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='asf-r3g03-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'fixture'
        self.target = self.root / SPEC
        self.target.parent.mkdir(parents=True)
        self.target.write_bytes(b'# Canonical bytes\n')

    def scan(self, paths=None, root=None, sha=None):
        return inventory_fdrelative(str(root or self.root), sha or SHA, paths or [SPEC])

    def test_real_bytes_and_r3f_compatible_shape(self):
        result = self.scan()
        self.assertEqual(set(result), {'headSha', 'files'})
        self.assertEqual(result['headSha'], SHA)
        self.assertEqual(result['files'], [{'path': SPEC, 'mode': '100644',
            'sha256': hashlib.sha256(b'# Canonical bytes\n').hexdigest(), 'type': 'file'}])
        self.assertEqual(self.target.read_bytes(), b'# Canonical bytes\n')
        self.assertFalse((self.root / '.git').exists())

    def test_deterministic_scans_do_not_write(self):
        self.assertEqual(self.scan(), self.scan())
        self.assertTrue(self.target.exists())

    def test_symlink_file_rejected(self):
        self.target.unlink()
        self.target.symlink_to('/etc/passwd')
        with self.assertRaises(FdInventoryError): self.scan()

    def test_symlink_parent_directory_rejected(self):
        base = self.root / 'openspec' / 'specs'
        redirected = self.root / 'external'
        base.rename(redirected)
        base.symlink_to(redirected, target_is_directory=True)
        with self.assertRaises(FdInventoryError): self.scan()

    def test_symlink_root_rejected(self):
        link = Path(self.temp.name) / 'alias'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(FdInventoryError): self.scan(root=link)

    def test_unexpected_file_rejected(self):
        (self.root / 'stray.md').write_text('unexpected')
        with self.assertRaises(FdInventoryError): self.scan()

    def test_unexpected_link_rejected(self):
        (self.root / 'other-link').symlink_to(self.target)
        with self.assertRaises(FdInventoryError): self.scan()

    def test_executable_mode_rejected(self):
        self.target.chmod(0o755)
        with self.assertRaises(FdInventoryError): self.scan()

    def test_hardlink_rejected(self):
        external = Path(self.temp.name) / 'linked-hard'
        os.link(self.target, external)
        with self.assertRaises(FdInventoryError): self.scan()

    def test_missing_file_rejected(self):
        self.target.unlink()
        with self.assertRaises(FdInventoryError): self.scan()

    def test_invalid_paths_and_sha_rejected(self):
        for paths in [[SPEC, SPEC], [SPEC, SPEC.upper()], ['../escape'],
                      ['/etc/passwd'], ['openspec//bad'], ['openspec/./file'],
                      ['openspec/é/spec.md', 'openspec/e\u0301/spec.md'], []]:
            with self.subTest(paths=paths), self.assertRaises(FdInventoryError):
                inventory_fdrelative(str(self.root), SHA, paths)
        for head in ['bad', 'B' * 40, 'a' * 39 + 'z']:
            with self.subTest(head=head), self.assertRaises(FdInventoryError):
                inventory_fdrelative(str(self.root), head, [SPEC])

    def test_leaf_swapped_to_symlink_before_open_is_never_followed(self):
        original_open = os.open
        outside = Path(self.temp.name) / 'outside-secret.txt'
        outside.write_bytes(b'PRIVATE OUTSIDE FIXTURE\n')
        occurred = False

        def raced_open(name, flags, *args, **kwargs):
            nonlocal occurred
            if name == 'spec.md' and not occurred:
                occurred = True
                self.target.rename(self.target.with_name('spec.md.backup'))
                self.target.symlink_to(outside)
            return original_open(name, flags, *args, **kwargs)

        with patch('os.open', side_effect=raced_open):
            with self.assertRaises(FdInventoryError) as error:
                self.scan()
        self.assertTrue(occurred)
        self.assertNotIn('PRIVATE', str(error.exception))

    def test_parent_directory_swapped_to_symlink_before_open(self):
        original_open = os.open
        occurred = False
        old_dir = self.root / 'openspec' / 'specs'
        new_dir = self.root / 'quarantined'

        def raced_open(name, flags, *args, **kwargs):
            nonlocal occurred
            if name == 'specs' and not occurred:
                occurred = True
                old_dir.rename(new_dir)
                old_dir.symlink_to(new_dir, target_is_directory=True)
            return original_open(name, flags, *args, **kwargs)

        with patch('os.open', side_effect=raced_open):
            with self.assertRaises(FdInventoryError): self.scan()
        self.assertTrue(occurred)


if __name__ == '__main__':
    unittest.main()
