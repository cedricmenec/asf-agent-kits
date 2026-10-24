"""Offline GitHub-API publication fixtures: no network, token or PR writes."""
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from asf_agentkit_github_read import ReadUnavailable
from asf_agentkit_cli import ALLOWED
from asf_agentkit_publish import (GitHubAppIssuer, GitHubDraftWriter, PublishRefused,
                                  mint_target_writer,
                                  publish_draft, remote_tree_is_create_only)

BASE = '1' * 40
TREE = '2' * 40
NEW = '3' * 40
BRANCH = 'asf-agentkit/install-qualification-a'
REPO = 'example/qualification-repository'
FILES = {path: b'fixture bytes\n' for path in ALLOWED}
LOCK = json.dumps({'sourceCommitSha': '4' * 40,
                   'targetRepository': REPO,
                   'sourceTrust': 'user-pinned-git-object-unattested',
                   'managedFiles': {path: hashlib.sha256(content).hexdigest()
                                    for path, content in FILES.items()}}).encode()
PLAN = '5' * 64


class FakeWriter:
    def __init__(self, overrides=None):
        self.requests = []
        self.overrides = overrides or {}
        self.branch_checks = 0

    def request(self, method, path, payload=None):
        self.requests.append((method, path, payload))
        if (method, path) in self.overrides:
            value = self.overrides[(method, path)]
            if isinstance(value, Exception):
                raise value
            return value
        if path == '':
            return {'id': 777, 'full_name': REPO, 'default_branch': 'main'}
        if path == '/installation/repositories?per_page=100':
            return {'total_count': 1, 'repositories': [{'id': 777, 'full_name': REPO}]}
        if path == '/branches/main':
            self.branch_checks += 1
            return {'commit': {'sha': BASE}}
        if path == '/git/ref/heads/' + BRANCH:
            if any(method == 'POST' and p == '/git/refs' for method, p, _ in self.requests):
                return {'object': {'sha': NEW}}
            raise ReadUnavailable('http-404')
        if path.startswith('/pulls?'):
            return []
        if path == '/git/commits/' + BASE:
            return {'tree': {'sha': TREE}}
        if path == '/git/trees/' + TREE + '?recursive=1':
            return {'truncated': False, 'tree': [{'path': 'README.md', 'type': 'blob'}]}
        if path in ('/git/blobs', '/git/trees', '/git/commits'):
            return {'sha': NEW}
        if path == '/git/refs':
            return {'ref': 'refs/heads/' + BRANCH}
        if path == '/pulls':
            return {'number': 123, 'draft': True,
                    'head': {'ref': BRANCH}, 'base': {'ref': 'main'}}
        raise AssertionError((method, path))


def publish(writer, **kwargs):
    return publish_draft(writer, REPO, 'main', BASE, BRANCH,
                         PLAN, PLAN, FILES, LOCK, **kwargs)


class FakeIssuer:
    def __init__(self, overrides=None):
        self.requests = []
        self.overrides = overrides or {}

    def request(self, method, path, payload=None):
        self.requests.append((method, path, payload))
        if (method, path) in self.overrides:
            response = self.overrides[(method, path)]
            if isinstance(response, Exception):
                raise response
            return response
        if method == 'GET':
            return {'id': 42, 'app_id': 12345,
                    'permissions': {'contents': 'write', 'pull_requests': 'write'}}
        return {'token': 'NEVER_OUTPUT_TOKEN',
                'permissions': {'contents': 'write', 'pull_requests': 'write'}}


class PublishTests(unittest.TestCase):
    def test_complete_draft_creation_exact_create_only_and_no_settings(self):
        writer = FakeWriter()
        result = publish(writer)
        self.assertEqual(result['status'], 'draft-pr-created')
        self.assertTrue(result['draft'])
        self.assertFalse(result['paidModelInvoked'])
        self.assertEqual(writer.branch_checks, 3)
        posts = [(path, payload) for method, path, payload in writer.requests if method == 'POST']
        self.assertEqual([p for p, _ in posts].count('/git/blobs'), 10)
        self.assertEqual([p for p, _ in posts][-4:],
                         ['/git/trees', '/git/commits', '/git/refs', '/pulls'])
        self.assertTrue(posts[-1][1]['draft'])
        self.assertEqual(posts[-2][1]['ref'], 'refs/heads/' + BRANCH)
        self.assertEqual({p['path'] for p in posts[-4][1]['tree']},
                         set(FILES) | {'.asf/agentkit.lock.json'})

    def test_digest_mismatch_rejects_before_any_remote_request(self):
        writer = FakeWriter()
        with self.assertRaisesRegex(PublishRefused, 'digest differs'):
            publish_draft(writer, REPO, 'main', BASE, BRANCH,
                          '9' * 64, PLAN, FILES, LOCK)
        self.assertEqual(writer.requests, [])

    def test_lock_must_bind_every_published_byte_before_any_api_operation(self):
        writer = FakeWriter()
        tampered = dict(FILES)
        path = next(iter(tampered))
        tampered[path] = b'altered without a new approved lock'
        with self.assertRaisesRegex(PublishRefused, 'Invalid source lock or managed file bytes'):
            publish_draft(writer, REPO, 'main', BASE, BRANCH,
                          PLAN, PLAN, tampered, LOCK)
        self.assertEqual(writer.requests, [])

    def test_denied_token_scope_is_closed_no_post(self):
        for overrides in (
            {('GET', '/installation/repositories?per_page=100'): ReadUnavailable('http-403')},
            {('GET', '/installation/repositories?per_page=100'): {'total_count': 2,
                'repositories': [{'id': 777, 'full_name': REPO}, {'id': 888, 'full_name': 'example/other'}]}},
        ):
            writer = FakeWriter(overrides)
            with self.assertRaises(PublishRefused):
                publish(writer)
            self.assertTrue(all(method == 'GET' for method, _, _ in writer.requests))

    def test_issue_token_from_exact_app_only_narrowed_to_one_repo(self):
        issuer = FakeIssuer()
        writer = mint_target_writer(issuer, REPO, 12345)
        self.assertIsInstance(writer, GitHubDraftWriter)
        self.assertEqual(len(issuer.requests), 2)
        self.assertEqual(issuer.requests[1][1], '/app/installations/42/access_tokens')
        self.assertEqual(issuer.requests[1][2], {
            'repositories': ['qualification-repository'],
            'permissions': {'contents': 'write', 'pull_requests': 'write'}})
        self.assertNotIn('NEVER_OUTPUT_TOKEN', json.dumps(issuer.requests))

    def test_wrong_app_or_missing_write_grants_refuses_token_mint(self):
        for overrides in (
            {('GET', '/repos/' + REPO + '/installation'): ReadUnavailable('http-403')},
            {('GET', '/repos/' + REPO + '/installation'): {'id': 42, 'app_id': 999,
                'permissions': {'contents': 'write', 'pull_requests': 'write'}}},
            {('GET', '/repos/' + REPO + '/installation'): {'id': 42, 'app_id': 12345,
                'permissions': {'contents': 'read', 'pull_requests': 'write'}}},
        ):
            issuer = FakeIssuer(overrides)
            with self.assertRaises(PublishRefused):
                mint_target_writer(issuer, REPO, 12345)
            self.assertTrue(all(method == 'GET' for method, _, _ in issuer.requests))

    def test_base_moved_existing_branch_duplicate_pr_and_truncated_tree(self):
        for path, response in (
            ('/branches/main', {'commit': {'sha': '9' * 40}}),
            ('/git/ref/heads/' + BRANCH, {'ref': 'refs/heads/' + BRANCH}),
            ('/pulls?state=open&head=example%3A' + BRANCH.replace('/', '%2F') + '&per_page=100',
             [{'number': 89}]),
            ('/git/trees/' + TREE + '?recursive=1', {'truncated': True, 'tree': []}),
        ):
            writer = FakeWriter({('GET', path): response})
            with self.assertRaises(PublishRefused):
                publish(writer)
            self.assertTrue(all(method == 'GET' for method, _, _ in writer.requests))

    def test_remote_target_collision_and_symlink_parent_refused(self):
        for entries in (
            [{'path': '.github/workflows/asf-agentkit-openspec.yml', 'type': 'blob'}],
            [{'path': '.GITHUB', 'type': 'tree'}],
            [{'path': '.asf', 'type': 'blob'}],
            [{'path': '.asf/agentkit', 'type': 'blob'}],
        ):
            with self.assertRaises(PublishRefused):
                remote_tree_is_create_only({'truncated': False, 'tree': entries},
                                           set(FILES) | {'.asf/agentkit.lock.json'})

    def test_api_403_after_creating_ref_reports_ambiguity_no_pr(self):
        writer = FakeWriter({('POST', '/pulls'): ReadUnavailable('http-403')})
        with self.assertRaisesRegex(PublishRefused, 'inspect branch/PR state'):
            publish(writer)
        self.assertEqual(len([p for p in writer.requests if p[1] == '/git/refs']), 1)

    def test_created_ref_movement_is_refused_before_pr(self):
        class MovedWriter(FakeWriter):
            def request(self, method, path, payload=None):
                result = super().request(method, path, payload)
                if path == '/git/ref/heads/' + BRANCH and result:
                    return {'object': {'sha': '9' * 40}}
                return result
        writer = MovedWriter()
        with self.assertRaisesRegex(PublishRefused, 'Created branch moved'):
            publish(writer)
        self.assertFalse(any(path == '/pulls' for _, path, _ in writer.requests))

    def test_strict_transport_only_get_and_reviewed_post_endpoints(self):
        client = GitHubDraftWriter(REPO, 'FAKE_SECRET_TOKEN')
        for method, path in [('PATCH', '/git/refs'), ('DELETE', '/git/refs'),
                             ('POST', '/actions/secrets'), ('POST', '/rulesets'),
                             ('GET', 'https://evil.example/'), ('GET', '/private-key')]:
            with self.assertRaises(PublishRefused):
                client.request(method, path, {})
        with patch('urllib.request.build_opener') as mocked:
            mocked.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"full_name":"example/qualification-repository"}'
            self.assertEqual(client.request('GET', '')['full_name'], REPO)
            request = mocked.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), 'GET')
            self.assertEqual(request.full_url, 'https://api.github.com/repos/' + REPO)
            self.assertNotIn('FAKE_SECRET_TOKEN', repr(request.full_url))

        app_client = GitHubAppIssuer(REPO, 'FAKE_JWT')
        with self.assertRaises(PublishRefused):
            app_client.request('POST', '/actions/secrets', {})


if __name__ == '__main__':
    unittest.main()
