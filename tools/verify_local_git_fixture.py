"""Read-only consistency preview of a host-controlled disposable local Git commit.

The Git database and filesystem snapshot are local test fixtures, not a remote
GitHub identity or independent release provenance. Never pass untrusted repos.
"""
import hashlib
import os
from pathlib import Path
import re
import subprocess

from inventory_fdrelative import inventory_fdrelative, FdInventoryError

HEX40 = re.compile(rb'[a-f0-9]{40}\Z')
MAX_OUTPUT = 1024 * 1024 + 1024


class LocalGitFixtureError(Exception):
    def __init__(self):
        super().__init__('R3g-04 DENY: local Git fixture does not match pinned bytes')


def _deny():
    raise LocalGitFixtureError()


def _git(gitdir, *args, output_limit=MAX_OUTPUT):
    # An explicitly selected local Git directory only. No shell, network,
    # filters, remotes or commands that change a reference or working tree.
    env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'HOME': '/nonexistent',
        'GIT_CONFIG_NOSYSTEM': '1',
        'GIT_CONFIG_GLOBAL': os.devnull,
        'GIT_NO_REPLACE_OBJECTS': '1',
        'GIT_OPTIONAL_LOCKS': '0',
        'GIT_TERMINAL_PROMPT': '0',
    }
    command = ['git', '--git-dir=' + gitdir, *args]
    completed = subprocess.run(command, cwd='/', env=env, input=b'',
                               capture_output=True, timeout=5, check=True)
    if len(completed.stdout) > output_limit or completed.stderr:
        _deny()
    return completed.stdout


def verify_local_git_fixture(git_dir, snapshot_root, pinned_sha, expected_paths):
    """Verify a local commit tree's blob bytes equal a separate fd inventory.

    Git directory and snapshot root MUST be host-owned temporary fixtures.
    The result is only local consistency, never proof of GitHub/ref protection.
    """
    if (type(git_dir) is not str or not os.path.isabs(git_dir) or
        type(snapshot_root) is not str or not os.path.isabs(snapshot_root) or
        type(pinned_sha) is not str or
        re.fullmatch('[a-f0-9]{40}', pinned_sha) is None):
        _deny()
    try:
        if os.path.islink(git_dir) or not os.path.isdir(git_dir):
            _deny()
        inventory = inventory_fdrelative(snapshot_root, pinned_sha, expected_paths)
        local = {e['path']: e['sha256'] for e in inventory['files']}
        first_head = _git(git_dir, 'rev-parse', '--verify', 'HEAD^{commit}').strip()
        if first_head != pinned_sha.encode('ascii'):
            _deny()
        raw_tree = _git(git_dir, 'ls-tree', '-r', '-z', '--full-tree', pinned_sha)
        if not raw_tree.endswith(b'\0'):
            _deny()
        items = raw_tree[:-1].split(b'\0')
        if len(items) != len(local) or not items or len(items) > 500:
            _deny()
        seen = set()
        for raw in items:
            match = re.fullmatch(rb'100644 blob ([a-f0-9]{40})\t([^\0]+)', raw)
            if match is None:
                _deny()
            path = match.group(2).decode('utf-8', 'strict')
            if path not in local or path in seen:
                _deny()
            seen.add(path)
            object_sha = match.group(1).decode('ascii')
            size_bytes = _git(git_dir, 'cat-file', '-s', object_sha, output_limit=32).strip()
            if not size_bytes.isdigit() or int(size_bytes) > 1024 * 1024:
                _deny()
            data = _git(git_dir, 'cat-file', 'blob', object_sha)
            if len(data) != int(size_bytes) or hashlib.sha256(data).hexdigest() != local[path]:
                _deny()
        if _git(git_dir, 'rev-parse', '--verify', 'HEAD^{commit}').strip() != first_head:
            _deny()
        if inventory_fdrelative(snapshot_root, pinned_sha, expected_paths) != inventory:
            _deny()
        return {
            'kind': 'r3g04-disposable-git-object-preview',
            'observedLocalGitHeadSha': pinned_sha,
            'localGitObjectsMatchSnapshot': True,
            'filesReviewed': len(seen),
            'remoteGitHubEvidenceVerified': False,
            'sourceProvenanceVerified': False,
            'authorizedToExecute': False,
            'promotionAllowed': False,
            'writesPerformed': False,
            'paidApprovalRequired': True,
        }
    except (OSError, ValueError, UnicodeError, subprocess.SubprocessError, FdInventoryError, LocalGitFixtureError):
        raise LocalGitFixtureError() from None
