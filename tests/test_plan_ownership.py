"""R2d-04 ownership, overlay, non-destructive upgrade hostile fixtures."""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from render_templates import RenderError, render
from plan_ownership import plan_ownership


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.src = self.root / 'src'; self.src.mkdir()
        self.target = self.root / 'target'; self.target.mkdir()
        (self.src / 'info.tmpl').write_text('kit {{KIT_ID}}\n')
        descriptor = self.root / 'descriptor.json'
        descriptor.write_text(json.dumps({'schemaVersion': 1, 'kitId': 'opencode-openspec',
            'targetRepository': 'example/test', 'files': [{'template': 'info.tmpl',
            'path': '.asf/agentkit/info.md'}]}))
        self.preview = render(self.src, descriptor)
        self.meta = {'schemaVersion': 1, 'kitId': 'opencode-openspec', 'kitVersion': '0.0.1',
            'coreVersion': '0.0.1', 'sourceRepository': 'example/catalogue',
            'sourceCommitSha': '0' * 40, 'releaseTag': 'kits/opencode-openspec/v0.0.1',
            'runtime': {'nodeVersion': '22.0.0', 'openCodeVersion': '1.0.0', 'openSpecVersion': '1.0.0'}}
        self.policy = {'schemaVersion': 1, 'kitId': 'opencode-openspec', 'managedFiles': [
            {'path': '.asf/agentkit/info.md', 'overlayPolicy': 'preserve-and-block'}]}

    def run_plan(self, lock=None):
        return plan_ownership(self.target, self.preview, self.meta, self.policy, lock)

    def valid_lock(self, *, owner='opencode-openspec', digest=None, extra=None):
        if digest is None:
            digest = self.preview['files'][0]['sha256']
        installed = {'.asf/agentkit/info.md': digest}
        if extra:
            installed.update(extra)
        return {'schemaVersion': 1, 'kits': [{'id': owner, 'version': '0.0.1',
            'sourceRepository': 'example/catalogue', 'releaseTag': f'kits/{owner}/v0.0.1',
            'sourceCommitSha': '0' * 40, 'coreVersion': '0.0.1', 'configSchemaVersion': 1,
            'managedFiles': installed}]}

    def make_file(self, text):
        path = self.target / '.asf/agentkit/info.md'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def test_first_install_proposed_without_writes(self):
        out = self.run_plan()
        self.assertEqual(out['operations'][0]['action'], 'create')
        self.assertEqual(out['status'], 'proposed')
        for key in ('sourceProvenanceVerified', 'promotionAllowed', 'writesPerformed'):
            self.assertIs(out[key], False)
        self.assertEqual(list(self.target.rglob('*')), [])

    def test_existing_unmanaged_even_if_identical_never_adopted(self):
        self.make_file('kit opencode-openspec\n')
        self.assertEqual(self.run_plan()['operations'][0]['action'], 'conflict')

    def test_managed_identical_is_unchanged(self):
        self.make_file('kit opencode-openspec\n')
        self.assertEqual(self.run_plan(self.valid_lock())['operations'][0]['action'], 'unchanged')

    def test_local_overlay_preserved_and_conflicted(self):
        path = self.make_file('personal edit\n')
        out = self.run_plan(self.valid_lock())
        self.assertEqual(out['status'], 'blocked')
        self.assertIn('overlay', out['operations'][0]['reason'])
        self.assertEqual(path.read_text(), 'personal edit\n')

    def test_previously_managed_missing_is_conflict(self):
        self.assertEqual(self.run_plan(self.valid_lock())['operations'][0]['action'], 'conflict')

    def test_other_kit_ownership_cannot_transfer(self):
        self.assertEqual(self.run_plan(self.valid_lock(owner='opencode-direct'))['status'], 'blocked')

    def test_existing_candidate_update_requires_review(self):
        self.make_file('kit opencode-openspec\n')
        old = hashlib.sha256(b'kit opencode-openspec\n').hexdigest()
        self.preview['files'][0]['contentBase64'] = 'bmV3Cg=='
        self.preview['files'][0]['sha256'] = hashlib.sha256(b'new\n').hexdigest()
        self.assertEqual(self.run_plan(self.valid_lock(digest=old))['status'], 'blocked')

    def test_missing_policy_and_wrong_kit_fail(self):
        self.policy['managedFiles'] = []
        with self.assertRaises(RenderError): self.run_plan()
        self.policy['managedFiles'] = [{'path': '.asf/agentkit/info.md', 'overlayPolicy': 'preserve-and-block'}]
        self.policy['kitId'] = 'opencode-direct'
        with self.assertRaises(RenderError): self.run_plan()

    def test_unsafe_protected_path_and_overlay_policy_rejected(self):
        for key, value in [('path', '.github/workflows/x.yml'), ('path', '../x'),
                           ('overlayPolicy', 'overwrite')]:
            with self.subTest(key=key):
                old = self.policy['managedFiles'][0][key]
                self.policy['managedFiles'][0][key] = value
                with self.assertRaises(RenderError): self.run_plan()
                self.policy['managedFiles'][0][key] = old

    def test_policy_case_alias_not_exact_path_rejected(self):
        self.policy['managedFiles'][0]['path'] = '.asf/agentkit/INFO.md'
        with self.assertRaises(RenderError): self.run_plan()

    def test_removed_locked_file_requires_manual_review(self):
        extra = {'.asf/agentkit/legacy.md': '0' * 64}
        result = self.run_plan(self.valid_lock(extra=extra))
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['operations'][1]['path'], '.asf/agentkit/legacy.md')

    def test_duplicate_casefold_owners_in_lock_fail(self):
        lock = self.valid_lock(extra={'.asf/agentkit/INFO.md': '0' * 64})
        with self.assertRaises(RenderError): self.run_plan(lock)

    def test_symlinked_parent_rejected(self):
        (self.target / '.asf').symlink_to(self.src, target_is_directory=True)
        with self.assertRaises(RenderError): self.run_plan()

    def test_deterministic_no_write(self):
        self.assertEqual(self.run_plan(), self.run_plan())
        self.assertEqual(list(self.target.rglob('*')), [])

if __name__ == '__main__':
    unittest.main()
