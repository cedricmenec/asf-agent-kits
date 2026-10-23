"""R5a-02: offline SemVer transition inspection of untrusted manifests.

Pure, consultative comparison only. Never read or write a target repository.
Release manifests and locks cannot authenticate their own GitHub provenance.
"""
from __future__ import annotations

import re

from validate_contracts import validate, unsafe_path

_VERSION = re.compile(r"(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\Z")
_FORBIDDEN = {'.git', '.github', '.asf', '.agents', '.opencode',
              'AGENTS.md', 'ChatGPT.md', 'opencode.json'}


class TransitionPreviewError(ValueError):
    def __init__(self):
        super().__init__('R5a-02 DENY: untrusted or incompatible version transition')


def _deny():
    raise TransitionPreviewError()


def _version(value):
    if type(value) is not str or _VERSION.fullmatch(value) is None:
        _deny()
    return tuple(int(x) for x in value.split('.'))


def _safe(path):
    if (type(path) is not str or len(path) > 320 or unsafe_path(path) or
        path.endswith('/') or any(not component for component in path.split('/')) or
        any(ord(c) < 32 or ord(c) == 127 for c in path) or
        '\\' in path or not path.isascii() or
        any(part.casefold() in {x.casefold() for x in _FORBIDDEN}
            for part in path.split('/')) or
        any(x.casefold().startswith('.env') or x.casefold().endswith(
            ('.pem', '.p12', '.pfx', '.key')) for x in path.split('/'))):
        _deny()
    return path


def _paths(names):
    if len(names) < 1 or len(names) > 250:
        _deny()
    seen = set()
    for name in names:
        key = _safe(name).casefold()
        if key in seen:
            _deny()
        seen.add(key)
    for name in names:
        if any(other != name and other.casefold().startswith(name.casefold() + '/')
               for other in names):
            _deny()
    return seen


def preview_version_transition(lock, candidate, kit_id):
    """Compare untrusted pinned release descriptors without reading any files.

    Requires an existing kit lock and a strictly later stable candidate SemVer;
    downgrade/rollback, cross-core upgrades and removal require later review.
    """
    try:
        if type(lock) is not dict or type(candidate) is not dict or type(kit_id) is not str:
            _deny()
        if validate('lock', lock) or validate('release', candidate):
            _deny()
        present = [k for k in lock['kits'] if k['id'] == kit_id]
        if len(present) != 1 or candidate['kitId'] != kit_id:
            _deny()
        installed = present[0]
        if (candidate['sourceRepository'] != installed['sourceRepository'] or
            candidate['sourceCommitSha'] == installed['sourceCommitSha'] or
            installed['coreVersion'] != candidate['coreVersion'] or
            _version(candidate['kitVersion']) <= _version(installed['version']) or
            _version(candidate['coreVersion']) != _version(installed['coreVersion'])):
            _deny()
        existing = installed['managedFiles']
        incoming = {a['path']: a['sha256'] for a in candidate['artifacts']}
        _paths(list(existing))
        _paths(list(incoming))
        other = {path.casefold() for item in lock['kits'] if item['id'] != kit_id
                 for path in item['managedFiles']}
        if other.intersection({name.casefold() for name in incoming}):
            _deny()
        # Never silently change ownership of an existing path via a case-only rename.
        if any(old.casefold() == new.casefold() and old != new
               for old in existing for new in incoming):
            _deny()
        changes = []
        for path in sorted(set(existing) | set(incoming)):
            if path not in incoming:
                action = 'conflict-removal'
            elif path not in existing:
                action = 'propose-create'
            elif existing[path] == incoming[path]:
                action = 'unchanged'
            else:
                action = 'review-update'
            changes.append({'path': path, 'action': action})
        conflicts = sum(x['action'] == 'conflict-removal' for x in changes)
        return {
            'kind': 'r5a02-untrusted-transition-preview',
            'kitId': kit_id, 'fromVersion': installed['version'],
            'toVersion': candidate['kitVersion'],
            'fromCommitSha': installed['sourceCommitSha'],
            'toCommitSha': candidate['sourceCommitSha'],
            'status': 'blocked' if conflicts else 'preview-only',
            'conflicts': conflicts, 'changes': changes,
            'independentlyVerifiedRelease': False,
            'sourceProvenanceVerified': False,
            'trustEvidenceIndependentlyVerified': False,
            'authorizedToExecute': False,
            'promotionAllowed': False, 'writesPerformed': False,
            'paidApprovalRequired': True,
        }
    except (TransitionPreviewError, KeyError, TypeError, ValueError, OverflowError):
        raise TransitionPreviewError() from None
