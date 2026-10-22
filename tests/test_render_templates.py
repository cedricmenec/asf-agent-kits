"""Adversarial, offline checks for R2d-01 preview-only rendering."""
import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from render_templates import RenderError, render


class TemplateRendererTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.source = self.base / 'source'
        self.source.mkdir()
        (self.source / 'one.tmpl').write_text('kit={{KIT_ID}} repo={{TARGET_REPOSITORY}}\n', encoding='utf-8')
        (self.source / 'two.tmpl').write_text('second\n', encoding='utf-8')
        self.descriptor = self.base / 'descriptor.json'
        self.body = {'schemaVersion': 1, 'kitId': 'opencode-openspec', 'targetRepository': 'demo/sandbox', 'files': [
            {'template': 'one.tmpl', 'path': '.asf/agentkit/one.md'},
            {'template': 'two.tmpl', 'path': '.asf/agentkit/two.md'},
        ]}

    def run_render(self):
        self.descriptor.write_text(json.dumps(self.body), encoding='utf-8')
        return render(self.source, self.descriptor)

    def test_deterministic_order_hashes_and_no_writes(self):
        value = self.run_render()
        assert value['sourceProvenanceVerified'] is False
        assert value['writesPerformed'] is False
        assert [x['path'] for x in value['files']] == ['.asf/agentkit/one.md', '.asf/agentkit/two.md']
        data = base64.b64decode(value['files'][0]['contentBase64'])
        assert data == b'kit=opencode-openspec repo=demo/sandbox\n'
        assert value['files'][0]['sha256'] == hashlib.sha256(data).hexdigest()
        self.body['files'].reverse()
        assert self.run_render() == value
        assert sorted(p.name for p in self.base.iterdir()) == ['descriptor.json', 'source']

    def test_reject_unsafe_destinations(self):
        for value in ['../escape', '/absolute', '.github/workflows/run.yml', 'AGENTS.md', '.asf/agentkit.lock.json', '.asf/agentkit/../escape', '.asf/agentkit//x', '.asf/agentkit/e\u0301.md', '.asf/agentkit\\x']:
            with self.subTest(value=value):
                self.body['files'][0]['path'] = value
                with self.assertRaises(RenderError): self.run_render()

    def test_reject_case_collisions(self):
        self.body['files'][1]['path'] = '.asf/agentkit/ONE.md'
        with self.assertRaises(RenderError): self.run_render()

    def test_reject_template_traversal_and_symlinks(self):
        for value in ['../external', '/etc/passwd', '.git/objects/x', 'bad//name']:
            with self.subTest(value=value):
                self.body['files'][0]['template'] = value
                with self.assertRaises(RenderError): self.run_render()
        self.body['files'][0]['template'] = 'link.tmpl'
        (self.source / 'link.tmpl').symlink_to(self.source / 'one.tmpl')
        with self.assertRaises(RenderError): self.run_render()
        (self.source / 'link.tmpl').unlink()
        (self.source / 'sub').symlink_to(self.source, target_is_directory=True)
        self.body['files'][0]['template'] = 'sub/one.tmpl'
        with self.assertRaises(RenderError): self.run_render()

    def test_reject_unknown_or_incomplete_placeholder(self):
        for value in ['{{SECRET}}', '{{INCOMPLETE', 'ORPHAN}}']:
            (self.source / 'one.tmpl').write_text(value, encoding='utf-8')
            with self.subTest(value=value), self.assertRaises(RenderError): self.run_render()

    def test_reject_invalid_encoding_and_size(self):
        (self.source / 'one.tmpl').write_bytes(b'\xff')
        with self.assertRaises(RenderError): self.run_render()
        (self.source / 'one.tmpl').write_bytes(b'x' * (1024 * 1024 + 1))
        with self.assertRaises(RenderError): self.run_render()

    def test_reject_unknown_fields_and_duplicate_keys(self):
        self.body['unexpected'] = True
        with self.assertRaises(RenderError): self.run_render()
        del self.body['unexpected']
        self.descriptor.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding='utf-8')
        with self.assertRaises(RenderError): render(self.source, self.descriptor)

    def test_reject_invalid_repo_kit_and_files(self):
        for field, value in [('targetRepository', 'a/../../b'), ('kitId', 'unknown'), ('files', []), ('schemaVersion', True)]:
            with self.subTest(field=field):
                previous = self.body[field]
                self.body[field] = value
                with self.assertRaises(RenderError): self.run_render()
                self.body[field] = previous

    def test_cli_no_write(self):
        self.descriptor.write_text(json.dumps(self.body), encoding='utf-8')
        cmd = [sys.executable, str(ROOT / 'tools' / 'render_templates.py'), '--source', str(self.source), '--descriptor', str(self.descriptor)]
        process = subprocess.run(cmd, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(process.stdout), self.run_render())


if __name__ == '__main__':
    unittest.main()
