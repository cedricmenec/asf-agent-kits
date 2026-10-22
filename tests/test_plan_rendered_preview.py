"""Adversarial offline R2d-03 target worktree preview tests."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from render_templates import RenderError, render
from plan_rendered_preview import plan_preview


class PlanRenderedPreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'; self.source.mkdir()
        self.target = self.root / 'target'; self.target.mkdir()
        (self.source / 'content.md').write_text('A={{KIT_ID}}\n', encoding='utf8')
        desc = self.root / 'desc.json'
        desc.write_text(json.dumps({'schemaVersion': 1, 'kitId': 'opencode-openspec',
            'targetRepository': 'example/test', 'files': [
                {'template': 'content.md', 'path': '.asf/agentkit/README.md'}]}), encoding='utf8')
        self.preview = render(self.source, desc)
        self.meta = {'schemaVersion': 1, 'kitId': 'opencode-openspec', 'kitVersion': '0.0.1',
            'coreVersion': '0.0.1', 'sourceRepository': 'example/catalogue',
            'sourceCommitSha': '0' * 40, 'releaseTag': 'kits/opencode-openspec/v0.0.1',
            'runtime': {'nodeVersion': '22.0.0', 'openCodeVersion': '1.0.0', 'openSpecVersion': '1.0.0'}}

    def test_read_only_create_on_empty_target(self):
        before = sorted(str(p) for p in self.target.rglob('*'))
        value = plan_preview(self.target, self.preview, self.meta)
        self.assertEqual(value['status'], 'proposed')
        self.assertEqual(value['operations'][0]['action'], 'create')
        self.assertEqual(value['conflicts'], 0)
        for key in ('sourceProvenanceVerified', 'writesPerformed', 'promotionAllowed'):
            self.assertIs(value[key], False)
        self.assertEqual(sorted(str(p) for p in self.target.rglob('*')), before)

    def test_existing_identical_file_unchanged(self):
        dest = self.target / '.asf/agentkit'; dest.mkdir(parents=True)
        (dest / 'README.md').write_text('A=opencode-openspec\n')
        value = plan_preview(self.target, self.preview, self.meta)
        self.assertEqual(value['operations'][0]['action'], 'unchanged')

    def test_existing_modified_file_conflict_not_overwritten(self):
        dest = self.target / '.asf/agentkit'; dest.mkdir(parents=True)
        file = dest / 'README.md'; file.write_text('personal overlay\n')
        value = plan_preview(self.target, self.preview, self.meta)
        self.assertEqual(value['status'], 'blocked')
        self.assertEqual(value['conflicts'], 1)
        self.assertEqual(value['operations'][0]['action'], 'conflict')
        self.assertEqual(file.read_text(), 'personal overlay\n')

    def test_refuse_symlinked_root_parent_and_file(self):
        rootlink = self.root / 'rootlink'; rootlink.symlink_to(self.target, target_is_directory=True)
        with self.assertRaises(RenderError): plan_preview(rootlink, self.preview, self.meta)
        (self.target / '.asf').symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)
        (self.target / '.asf').unlink()
        (self.target / '.asf/agentkit').mkdir(parents=True)
        (self.target / '.asf/agentkit/README.md').symlink_to(self.source / 'content.md')
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)

    def test_refuse_non_directory_parent_and_non_regular_destination(self):
        (self.target / '.asf').write_text('not a directory')
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)
        (self.target / '.asf').unlink()
        (self.target / '.asf/agentkit/README.md').mkdir(parents=True)
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)

    def test_refuse_case_collision_in_target(self):
        (self.target / '.ASF').mkdir()
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)
        (self.target / '.ASF').rmdir()
        (self.target / '.asf/agentkit').mkdir(parents=True)
        (self.target / '.asf/agentkit/readme.MD').write_text('different case')
        with self.assertRaises(RenderError): plan_preview(self.target, self.preview, self.meta)

    def test_refuse_forged_hash_and_authority(self):
        forged = copy.deepcopy(self.preview)
        forged['files'][0]['sha256'] = '0' * 64
        with self.assertRaises(RenderError): plan_preview(self.target, forged, self.meta)
        forged = copy.deepcopy(self.preview)
        forged['sourceProvenanceVerified'] = True
        with self.assertRaises(RenderError): plan_preview(self.target, forged, self.meta)

    def test_determinism_and_negative_cli_exit_codes(self):
        a = plan_preview(self.target, self.preview, self.meta)
        b = plan_preview(self.target, self.preview, self.meta)
        self.assertEqual(a, b)
        inp = self.root / 'preview.json'; inp.write_text(json.dumps(self.preview))
        metadata = self.root / 'metadata.json'; metadata.write_text(json.dumps(self.meta))
        cmd = [sys.executable, str(ROOT / 'tools/plan_rendered_preview.py'), '--target', str(self.target),
               '--preview', str(inp), '--metadata', str(metadata)]
        process = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout), a)
        dest = self.target / '.asf/agentkit'; dest.mkdir(parents=True)
        (dest / 'README.md').write_text('collision')
        process = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(process.returncode, 2, process.stderr)
        self.assertEqual(json.loads(process.stdout)['status'], 'blocked')


if __name__ == '__main__':
    unittest.main()
