"""R5a-01: read-only installation state, never a provenance attestation."""
import argparse
import json
import sys
from pathlib import Path

from plan_install import status, PlanError


class StatusPreviewError(ValueError):
    def __init__(self):
        super().__init__('R5a DENY: installation status cannot be trusted')


def preview_installation_status(target_dir):
    """Interpret R2a local hashes with explicit missing provenance.

    Never emit verified; independent GitHub release provenance is absent.
    No writes, credentials, model, GitHub network, or installer operations.
    """
    if type(target_dir) not in (str, Path):
        raise StatusPreviewError()
    try:
        observed = status(target_dir)
        states = {'hash-match': 'unknown', 'drifted': 'drifted',
                  'unmanaged-or-legacy': 'unmanaged-legacy'}
        if observed.get('status') not in states or observed.get('provenanceVerified') is not False:
            raise StatusPreviewError()
        kits = observed.get('kits')
        if type(kits) is not list or (not kits) != (observed['status'] == 'unmanaged-or-legacy'):
            raise StatusPreviewError()
        summary = []
        for kit in kits:
            if kit['state'] not in ('hash-match', 'drifted'):
                raise StatusPreviewError()
            paths = kit['files']
            if type(paths) is not list or not paths:
                raise StatusPreviewError()
            if any(item.get('state') not in ('hash-match', 'missing', 'drifted') for item in paths):
                raise StatusPreviewError()
            summary.append({'kitId': kit['id'], 'kitVersion': kit['version'],
                            'fileCount': len(paths),
                            'nonMatchingFiles': sum(i['state'] != 'hash-match' for i in paths)})
        return {'kind': 'r5a-read-only-installation-status',
                'classification': states[observed['status']],
                'kits': summary, 'filesystemSnapshotAtomic': False,
                'sourceProvenanceVerified': False,
                'trustEvidenceIndependentlyVerified': False,
                'authorizedToExecute': False, 'promotionAllowed': False,
                'writesPerformed': False, 'paidApprovalRequired': True}
    except (PlanError, StatusPreviewError, OSError, ValueError, TypeError, KeyError):
        raise StatusPreviewError() from None


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only R5a local installation state')
    parser.add_argument('--target', required=True)
    args = parser.parse_args(argv)
    try:
        result = preview_installation_status(args.target)
    except StatusPreviewError as err:
        print(str(err), file=sys.stderr)
        return 3
    print(json.dumps(result, sort_keys=True, separators=(',', ':')))
    return 2 if result['classification'] == 'drifted' else 0


if __name__ == '__main__':
    sys.exit(main())
