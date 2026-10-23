"""R6a-01: local disposable rehearsal integrating existing R5 previews.

This module is CONSULTATIVE, reads only a caller-created temporary target and
never authenticates a GitHub release, provides installation authority or writes.
The target root MUST be an isolated disposable fixture, never a real repository.
"""
from __future__ import annotations

from pathlib import Path

from plan_install import load_lock, safe_member, safe_root, PlanError
from inspect_installation_status import preview_installation_status, StatusPreviewError
from preview_version_transition import preview_version_transition, TransitionPreviewError
from preview_draft_pr import preview_draft_pr, PrPreviewError
from preview_pr_publication import preview_pr_publication, OfflinePublisherError


class R6OfflineError(ValueError):
    def __init__(self):
        super().__init__('R6a-01 DENY: untrusted or inconsistent local qualification')


def qualify_local_installation_fixture(target_dir, installed_lock,
                                      release, ownership, host_policy, observation):
    """Compose validated read-only R5 phases against a disposable target.

    Everything beyond local current bytes remains a synthetic, forgeable mock.
    No permission to create a real PR or to install/upgrade is ever produced.
    """
    try:
        if type(target_dir) not in (str, Path):
            raise R6OfflineError()
        target = safe_root(target_dir)
        current = load_lock(target)
        if current != installed_lock:
            raise R6OfflineError()
        observed = preview_installation_status(str(target))
        if installed_lock is None:
            if observed['classification'] != 'unmanaged-legacy':
                raise R6OfflineError()
            transition = None
        else:
            if observed['classification'] != 'unknown':
                raise R6OfflineError()
            transition = preview_version_transition(
                installed_lock, release, release['kitId'])
        draft = preview_draft_pr(release, ownership, transition)
        if draft['status'] != 'review-preview-only':
            raise R6OfflineError()
        for item in draft['files']:
            path = safe_member(target, item['path'])
            # R5b-01 only allows additions or strictly unchanged files.
            # This is not an atomic filesystem snapshot: R6 must qualify TOCTOU.
            if item['action'] == 'create' and (
                    path.exists() or path.is_symlink()):
                raise R6OfflineError()
            if item['action'] == 'unchanged':
                if installed_lock is None or not path.is_file():
                    raise R6OfflineError()
        publisher = preview_pr_publication(draft, host_policy, observation)
        return {
            'kind': 'r6a01-disposable-qualification-preview',
            'installationClassification': observed['classification'],
            'mode': draft['mode'],
            'kitId': draft['kitId'],
            'plannedFileCount': len(draft['files']),
            'syntheticPublicationPreflightMatched':
                publisher['syntheticObservationsConsistent'],
            'localFileSnapshotAtomic': False,
            'releaseIndependentlyAttested': False,
            'hostIndependentlyAuthenticated': False,
            'sourceProvenanceVerified': False,
            'targetRefCasVerified': False,
            'authorizedToPublish': False,
            'authorizedToExecute': False,
            'promotionAllowed': False,
            'writesPerformed': False,
            'paidApprovalRequired': True,
        }
    except (R6OfflineError, TypeError, KeyError, ValueError, OSError,
            PlanError, StatusPreviewError, TransitionPreviewError,
            PrPreviewError, OfflinePublisherError):
        raise R6OfflineError() from None
