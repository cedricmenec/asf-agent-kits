"""R5b-01: compose an advisory draft-PR preview without any I/O.

All received release, R2d ownership and R5a transition values are caller
supplied and NOT authenticated. This tool cannot create a branch, commit or PR.
"""
from __future__ import annotations

import re

from validate_contracts import validate
from plan_ownership import canonical_owned, RenderError

_STABLE_VERSION = re.compile(r'(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\Z')


class PrPreviewError(ValueError):
    def __init__(self):
        super().__init__('R5b DENY: inconsistent or untrusted draft-PR preview')


def _deny():
    raise PrPreviewError()


def _closed(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        _deny()
    return value


def _paths(items):
    if type(items) is not list or not 1 <= len(items) <= 250:
        _deny()
    seen = set()
    for item in items:
        if type(item) is not str or not item.isascii() or len(item) > 320:
            _deny()
        try:
            canonical_owned(item)
        except RenderError:
            _deny()
        if item.endswith('/') or any(not x for x in item.split('/')):
            _deny()
        lowered = item.casefold()
        if lowered in seen or any(lowered.startswith(x + '/') or x.startswith(lowered + '/')
                                  for x in seen):
            _deny()
        seen.add(lowered)
    return seen


def _validate_ownership(ownership, manifest):
    _closed(ownership, ('kind','kitId','status','conflicts','operations',
                        'sourceProvenanceVerified','promotionAllowed','writesPerformed'))
    if (ownership['kind'] != 'r2d-read-only-ownership-preview' or
        ownership['kitId'] != manifest['kitId'] or
        ownership['status'] not in ('blocked', 'proposed') or
        type(ownership['conflicts']) is not int or ownership['conflicts'] < 0 or
        any(ownership[k] is not False for k in
            ('sourceProvenanceVerified','promotionAllowed','writesPerformed'))):
        _deny()
    raw = ownership['operations']
    if type(raw) is not list or len(raw) < 1 or len(raw) > 250:
        _deny()
    paths = []
    out = {}
    for item in raw:
        if type(item) is not dict or set(item) not in (
                {'path','action'}, {'path','action','reason'}):
            _deny()
        action = item['action']
        if (action not in ('create', 'unchanged', 'conflict') or
            ('reason' in item) != (action == 'conflict')):
            _deny()
        if action == 'conflict' and (type(item['reason']) is not str or
                                     not 0 < len(item['reason']) <= 256):
            _deny()
        paths.append(item['path'])
        out[item['path']] = action
    _paths(paths)
    conflicts = sum(action == 'conflict' for action in out.values())
    if (conflicts != ownership['conflicts'] or
        (ownership['status'] == 'blocked') != (conflicts > 0)):
        _deny()
    return out


def _validate_transition(transition, manifest):
    _closed(transition, ('kind','kitId','fromVersion','toVersion','fromCommitSha',
                         'toCommitSha','status','conflicts','changes',
                         'independentlyVerifiedRelease','sourceProvenanceVerified',
                         'trustEvidenceIndependentlyVerified','authorizedToExecute',
                         'promotionAllowed','writesPerformed','paidApprovalRequired'))
    if (transition['kind'] != 'r5a02-untrusted-transition-preview' or
        transition['kitId'] != manifest['kitId'] or
        transition['toVersion'] != manifest['kitVersion'] or
        transition['toCommitSha'] != manifest['sourceCommitSha'] or
        transition['status'] not in ('blocked','preview-only') or
        type(transition['conflicts']) is not int or transition['conflicts'] < 0 or
        any(transition[k] is not False for k in (
            'independentlyVerifiedRelease','sourceProvenanceVerified',
            'trustEvidenceIndependentlyVerified','authorizedToExecute',
            'promotionAllowed','writesPerformed')) or
        transition['paidApprovalRequired'] is not True):
        _deny()
    changes = transition['changes']
    if type(changes) is not list or not 1 <= len(changes) <= 250:
        _deny()
    paths = []
    mapped = {}
    for item in changes:
        _closed(item, ('path','action'))
        if item['action'] not in ('unchanged','review-update','propose-create',
                                 'conflict-removal'):
            _deny()
        paths.append(item['path'])
        mapped[item['path']] = item['action']
    _paths(paths)
    conflicts = sum(action == 'conflict-removal' for action in mapped.values())
    if conflicts != transition['conflicts'] or (
            transition['status'] == 'blocked') != (conflicts > 0):
        _deny()
    return mapped


def preview_draft_pr(manifest, ownership, transition=None):
    """Return a deterministic preview with NO source, write or merge authority."""
    try:
        if (type(manifest) is not dict or validate('release', manifest) or
            _STABLE_VERSION.fullmatch(manifest['kitVersion']) is None):
            _deny()
        release_files = {item['path']: item['sha256'] for item in manifest['artifacts']}
        _paths(list(release_files))
        owned = _validate_ownership(ownership, manifest)
        expected = set(release_files)
        if not expected.issubset(set(owned)):
            _deny()
        if transition is None:
            mode = 'new-install'
            # A new installation may not claim an already present unmanaged file.
            if any(action not in ('create', 'conflict') for action in owned.values()):
                _deny()
            if set(owned) != expected:
                _deny()
        else:
            mode = 'upgrade'
            changes = _validate_transition(transition, manifest)
            if set(changes) != set(owned):
                _deny()
            for path, operation in changes.items():
                owner_action = owned[path]
                permitted = {
                    'unchanged': ('unchanged',),
                    'propose-create': ('create',),
                    'review-update': ('conflict',),
                    'conflict-removal': ('conflict',),
                }[operation]
                if owner_action not in permitted:
                    _deny()
            if {p for p, act in changes.items() if act != 'conflict-removal'} != expected:
                _deny()
        entries = [
            {'path': path, 'action': owned[path],
             'declaredSha256': release_files.get(path)}
            for path in sorted(owned)
        ]
        return {
            'kind': 'r5b01-untrusted-draft-pr-plan',
            'mode': mode, 'kitId': manifest['kitId'],
            'candidateVersion': manifest['kitVersion'],
            'candidateCommitSha': manifest['sourceCommitSha'],
            'draftTitlePreview': 'AgentKit (UNVERIFIED): ' + manifest['kitId'] +
                                 ' v' + manifest['kitVersion'],
            'status': 'blocked' if ownership['conflicts'] else 'review-preview-only',
            'conflicts': ownership['conflicts'],
            'files': entries,
            'githubPrCreated': False, 'filesystemSnapshotAtomic': False,
            'independentlyVerifiedRelease': False,
            'sourceProvenanceVerified': False,
            'trustEvidenceIndependentlyVerified': False,
            'authorizedToExecute': False, 'promotionAllowed': False,
            'writesPerformed': False, 'paidApprovalRequired': True,
        }
    except (PrPreviewError, KeyError, TypeError, ValueError, RenderError):
        raise PrPreviewError() from None
