"""R2d-02 composition and adversarial tests, entirely offline."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from compose_preview import compose, strict_file
from render_templates import RenderError, render


class ComposePreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.src = self.root / 'source'; self.src.mkdir()
        (self.src / 'first.tmpl').write_text('hello {{TARGET_REPOSITORY}}\n', encoding='utf-8')
        self.descriptor = self.root / 'descriptor.json'
        self.descriptor.write_text(json.dumps({'schemaVersion': 1, 'kitId': 'opencode-openspec',
            'targetRepository': 'example/repo', 'files': [{'template': 'first.tmpl', 'path': '.asf/agentkit/first.md'}]}), encoding='utf-8')
        self.preview = render(self.src, self.descriptor)
        self.metadata = {'schemaVersion': 1, 'kitId': 'opencode-openspec', 'kitVersion': '0.0.1',
            'coreVersion': '0.0.1', 'sourceRepository': 'example/catalogue',
            'sourceCommitSha': '0' * 40, 'releaseTag': 'kits/opencode-openspec/v0.0.1',
            'runtime': {'nodeVersion': '22.0.0', 'openCodeVersion': '1.0.0', 'openSpecVersion': '1.0.0'}}

    def test_candidate_is_deterministic_and_never_authoritative(self):
        one = compose(self.preview, self.metadata)
        self.assertEqual(one['kind'], 'r2d-unverified-release-preview')
        for key in ('sourceProvenanceVerified', 'promotionAllowed', 'writesPerformed'):
            self.assertIs(one[key], False)
        self.assertEqual(one['release']['artifacts'][0]['sha256'], self.preview['files'][0]['sha256'])
        self.assertEqual(one, compose(copy.deepcopy(self.preview), copy.deepcopy(self.metadata)))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['descriptor.json', 'source'])

    def test_reject_forged_trust_flags(self):
        for key, value in [('sourceProvenanceVerified', True), ('writesPerformed', True), ('writesPerformed', 0)]:
            forged = copy.deepcopy(self.preview); forged[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(RenderError): compose(forged, self.metadata)

    def test_reject_digest_and_bad_base64(self):
        for key, value in [('sha256', '0' * 64), ('contentBase64', '??'), ('contentBase64', 'a')]:
            forged = copy.deepcopy(self.preview); forged['files'][0][key] = value
            with self.subTest(key=key), self.assertRaises(RenderError): compose(forged, self.metadata)

    def test_reject_path_collisions_and_escape(self):
        for path in ('../bad', '.github/workflows/p.yml', '.asf/agentkit/../bad', '.asf/agentkit/e\u0301.md'):
            forged = copy.deepcopy(self.preview); forged['files'][0]['path'] = path
            with self.subTest(path=path), self.assertRaises(RenderError): compose(forged, self.metadata)
        forged = copy.deepcopy(self.preview)
        forged['files'].append({**forged['files'][0], 'path': '.asf/agentkit/FIRST.md'})
        with self.assertRaises(RenderError): compose(forged, self.metadata)

    def test_reject_invalid_schema_and_identity(self):
        for key, value in [('kitId', 'opencode-direct'), ('releaseTag', 'kits/wrong/v0.0.1'), ('sourceCommitSha', 'invalid')]:
            md = copy.deepcopy(self.metadata); md[key] = value
            with self.subTest(key=key), self.assertRaises(RenderError): compose(self.preview, md)

    def test_reject_unknown_fields_and_missing_files(self):
        forged = copy.deepcopy(self.preview); forged['extra'] = 'yes'
        with self.assertRaises(RenderError): compose(forged, self.metadata)
        forged = copy.deepcopy(self.preview); forged['files'] = []
        with self.assertRaises(RenderError): compose(forged, self.metadata)

    def test_reject_duplicate_json_keys_and_symlink(self):
        file = self.root / 'preview.json'
        file.write_text('{"kitId":"one","kitId":"two"}', encoding='utf-8')
        with self.assertRaises(RenderError): strict_file(file, 1024)
        link = self.root / 'linked.json'; link.symlink_to(file)
        with self.assertRaises(RenderError): strict_file(link, 1024)

    def test_cli(self):
        prev = self.root / 'preview.json'; meta = self.root / 'metadata.json'
        prev.write_text(json.dumps(self.preview), encoding='utf-8')
        meta.write_text(json.dumps(self.metadata), encoding='utf-8')
        run = subprocess.run([sys.executable, str(ROOT / 'tools' / 'compose_preview.py'), '--preview', str(prev), '--metadata', str(meta)], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(run.stdout), compose(self.preview, self.metadata))


if __name__ == '__main__':
    unittest.main()
