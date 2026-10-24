import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from asf_agentkit_github_read import GitHubReader, ReadUnavailable, remote_doctor

CONFIG = json.loads((ROOT/'kits/opencode-openspec/mvp-config.example.json').read_text())


class FakeReader:
    def __init__(self, data):
        self.data = data
        self.paths = []

    def get(self, path):
        self.paths.append(path)
        item = self.data.get(path)
        if isinstance(item, Exception):
            raise item
        if item is None:
            raise ReadUnavailable('http-403')
        return item


class GitHubDoctorTests(unittest.TestCase):
    def test_presence_only_and_no_values_or_claimed_ruleset_authority(self):
        sha = '1'*40
        fixtures = {
            '': {'full_name': 'example/qualification-repository',
                 'default_branch': 'main', 'permissions': {'pull': True, 'push': False, 'admin': False}},
            '/actions/variables?per_page=100': {
                'total_count': 1,
                'variables': [{'name': 'APP_ID', 'value': 'DO_NOT_PRINT_VARIABLE_VALUE'}]},
            '/actions/secrets?per_page=100': {
                'total_count': 2,
                'secrets': [{'name': 'APP_PRIVATE_KEY'}, {'name': 'OPENROUTER_API_KEY'}]},
            '/installation': {'app_id': 12345, 'permissions': {'contents': 'write'}},
            '/rulesets?includes_parents=true&per_page=100': [
                {'id': 2, 'enforcement': 'active', 'name': 'No accidental authority proof'}],
            '/actions/workflows?per_page=100': {'total_count': 1,
                'workflows': [{'name': 'AgentKit', 'path': '.github/workflows/asf-agentkit-openspec.yml'}]},
            '/branches/main': {'commit': {'sha': sha}, 'protected': True},
            '/commits/'+sha+'/check-runs?per_page=100': {
                'total_count': 1, 'check_runs': [{'name': 'check', 'conclusion': 'success'}]},
        }
        reader = FakeReader(fixtures)
        report = remote_doctor('example/qualification-repository', CONFIG, reader)
        text = json.dumps(report)
        self.assertNotIn('DO_NOT_PRINT_VARIABLE_VALUE', text)
        self.assertNotIn('OPENROUTER_API_KEY=', text)
        self.assertEqual(report['variables']['required']['APP_ID'], 'present')
        self.assertEqual(report['secrets']['required']['OPENROUTER_API_KEY'], 'present')
        self.assertEqual(report['rulesets']['state'],
                         'observed-summaries-require-manual-applicability-review')
        self.assertEqual(report['checks']['state'],
                         'observed-require-manual-required-check-review')
        self.assertFalse(report['writesPerformed'])
        self.assertFalse(report['secretsDisplayed'])
        self.assertTrue(all(p.startswith('/') or p == '' for p in reader.paths))

    def test_permission_denial_and_incomplete_pages_stay_unknown(self):
        reader = FakeReader({
            '': ReadUnavailable('http-403'),
            '/actions/variables?per_page=100': {'total_count': 200, 'variables': [{'name': 'OTHER'}]},
            '/actions/secrets?per_page=100': ReadUnavailable('http-403'),
            '/installation': ReadUnavailable('http-404'),
            '/rulesets?includes_parents=true&per_page=100': ReadUnavailable('http-403'),
            '/actions/workflows?per_page=100': ReadUnavailable('http-403'),
            '/branches/main': ReadUnavailable('http-403'),
        })
        report = remote_doctor('example/qualification-repository', CONFIG, reader)
        self.assertEqual(report['variables']['state'], 'unknown')
        self.assertEqual(report['secrets']['state'], 'unknown')
        self.assertEqual(report['githubApp']['state'], 'unknown')
        self.assertEqual(report['branch']['state'], 'unknown')
        self.assertNotIn('checks', report)

    def test_actual_client_is_get_only_with_fixed_host_and_no_redirect(self):
        captured = []

        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, _limit):
                return b'{"total_count":0,"secrets":[]}'

        class FakeOpener:
            def open(self, request, timeout):
                captured.append(request)
                self_timeout = timeout
                self_assert = self_timeout == 8
                if not self_assert:
                    raise AssertionError('Missing timeout')
                return FakeResponse()

        with patch('urllib.request.build_opener', return_value=FakeOpener()):
            client = GitHubReader('owner/repo', 'SENSITIVE_FAKE_TOKEN')
            result = client.get('/actions/secrets?per_page=100')
        self.assertEqual(result['total_count'], 0)
        self.assertEqual(captured[0].get_method(), 'GET')
        self.assertEqual(captured[0].full_url,
                         'https://api.github.com/repos/owner/repo/actions/secrets?per_page=100')
        self.assertNotIn('SENSITIVE_FAKE_TOKEN', json.dumps(result))
        with self.assertRaises(ValueError):
            client.get('https://evil.example/secret')


if __name__ == '__main__':
    unittest.main()
