import base64
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from render_mvp_kit import FILES, checked_config, render_mvp
from render_templates import RenderError


def config():
    return json.loads((ROOT / 'kits/opencode-openspec/mvp-config.example.json').read_text())


class RenderMvpKitTests(unittest.TestCase):
    def test_real_workflow_and_all_transitive_files_have_exact_owned_paths(self):
        preview = render_mvp(ROOT, config())
        self.assertFalse(preview['sourceProvenanceVerified'])
        self.assertFalse(preview['writesPerformed'])
        self.assertEqual({x['path'] for x in preview['files']}, {p for _, p in FILES})
        workflow = next(x for x in preview['files'] if x['path'].startswith('.github/'))
        text = base64.b64decode(workflow['contentBase64']).decode()
        self.assertIn('workflow_dispatch:', text)
        self.assertEqual(text.count("node-version: '22.23.3'"), 2)
        self.assertNotIn("node-version: '22'", text)
        self.assertNotIn('workflow_call:', text)
        self.assertIn('I_AUTHORIZE_ONE_PAID_PHASE', text)
        self.assertIn('actions/create-github-app-token@d72941d797fd3113feb6b93fd0dec494b13a2547', text)
        self.assertIn('secrets.APP_PRIVATE_KEY', text)
        self.assertIn('secrets.OPENROUTER_API_KEY', text)
        self.assertIn('agentkit-paid-development-v1', text)
        self.assertNotIn('threadstep-paid-development-v1', text)
        self.assertIn('GH_TOKEN:', text)
        self.assertLess(text.index('  publish:'), text.index('GH_TOKEN:'))
        self.assertNotIn('GH_TOKEN:', text[:text.index('  publish:')])
        for item in preview['files']:
            data = base64.b64decode(item['contentBase64'], validate=True)
            self.assertEqual(item['sha256'], hashlib.sha256(data).hexdigest())
            self.assertNotIn(b'@@', data)

    def test_deterministic_and_target_configurable(self):
        cfg = config()
        a = render_mvp(ROOT, cfg)
        self.assertEqual(a, render_mvp(ROOT, cfg))
        cfg.update(targetRepository='another/repo', defaultBranch='develop',
                   taskPrefix='AK', taskDirectory='tasks', checkScript='ci',
                   mutexGroup='independent-mutex')
        b = render_mvp(ROOT, cfg)
        self.assertNotEqual(a, b)
        workflow = next(x for x in b['files'] if x['path'].startswith('.github/'))
        text = base64.b64decode(workflow['contentBase64']).decode()
        self.assertIn('refs/heads/develop', text)
        self.assertIn('independent-mutex', text)
        self.assertIn('npm run ci', base64.b64decode(next(
            x['contentBase64'] for x in b['files'] if x['path'].endswith('phase.sh'))).decode())

    def test_bad_values_and_unknown_fields_refused(self):
        for key, value in (
            ('targetRepository', 'a/../b'), ('defaultBranch', 'main; echo test'),
            ('defaultBranch', 'refs//heads'), ('taskDirectory', '../backlog'),
            ('checkScript', 'check && env'), ('taskPrefix', 'inject'),
            ('appIdVar', 'ABC }}'), ('openRouterSecret', 'NAME-OTHER'),
            ('mutexGroup', 'a/b'),
        ):
            with self.subTest(key=key, value=value):
                cfg = config()
                cfg[key] = value
                with self.assertRaises(RenderError):
                    checked_config(cfg)
        cfg = config()
        cfg['unexpected'] = 'anything'
        with self.assertRaises(RenderError):
            render_mvp(ROOT, cfg)

    def test_symlink_source_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            template = root / 'kits/opencode-openspec/templates'
            template.mkdir(parents=True)
            (template / FILES[0][0]).symlink_to(ROOT / 'README.md')
            with self.assertRaises(RenderError):
                render_mvp(root, config())


if __name__ == '__main__':
    unittest.main()
