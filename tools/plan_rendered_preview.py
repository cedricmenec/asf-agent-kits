#!/usr/bin/env python3
"""R2d-03 read-only target worktree inspection from an untrusted R2d render preview.

No file writes, install, lock, privileged GitHub request, or provenance claim.
Filesystem reads are a preview only and cannot guarantee atomicity under races.
"""
import argparse
import base64
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

from compose_preview import compose, strict_file, MAX_INPUT
from render_templates import RenderError, MAX_FILE, MAX_TOTAL


def inspect_target(root, relative):
    """Inspect an existing target without following symlinks, checking case aliases.

    Returns None for an absent destination, or the current bytes for a regular
    existing file. All other existing objects and ambiguous names fail closed.
    """
    current = root
    parts = relative.split('/')
    for index, segment in enumerate(parts):
        if not current.is_dir() or current.is_symlink():
            raise RenderError('non-directory or symlink parent of output')
        # Case aliases must not become safe merely because the current OS is
        # case-sensitive. A target may later be reviewed on a different OS.
        if any(name.name.casefold() == segment.casefold() and name.name != segment
               for name in current.iterdir()):
            raise RenderError('case-colliding existing destination path')
        current = current / segment
        if current.is_symlink():
            raise RenderError('symlink in target path')
        if not current.exists():
            return None  # no directory or file may be created by this tool
        if index < len(parts) - 1 and not current.is_dir():
            raise RenderError('non-directory path component')
    before = current.stat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_FILE:
        raise RenderError('non-regular or oversized target file')
    with current.open('rb') as handle:
        value = handle.read(MAX_FILE + 1)
        observed = os.fstat(handle.fileno())
    if len(value) > MAX_FILE or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns):
        raise RenderError('target file changed during read')
    return value


def plan_preview(target_dir, preview, metadata):
    root = Path(target_dir).absolute()
    if root.is_symlink() or not root.is_dir():
        raise RenderError('target root must be an ordinary existing directory')
    checked = compose(preview, metadata)
    digest_by_path = {entry['path']: entry['sha256'] for entry in checked['release']['artifacts']}
    # Only content validated by compose() is consumed. A reported SHA is never
    # sufficient as a source authenticity claim or approval of an installation.
    operations = []
    total = 0
    for item in sorted(preview['files'], key=lambda file: file['path']):
        relative = item['path']
        candidate = base64.b64decode(item['contentBase64'], validate=True)
        total += len(candidate)
        if total > MAX_TOTAL or hashlib.sha256(candidate).hexdigest() != digest_by_path[relative]:
            raise RenderError('untrusted preview changed during planning')
        observed = inspect_target(root, relative)
        if observed is None:
            action, reason = 'create', None
        elif observed == candidate:
            action, reason = 'unchanged', None
        else:
            action, reason = 'conflict', 'existing file differs; never overwrite without explicit ownership review'
        item_out = {'path': relative, 'action': action}
        if reason:
            item_out['reason'] = reason
        operations.append(item_out)
    blocked = sum(item['action'] == 'conflict' for item in operations)
    return {'kind': 'r2d-read-only-materialization-preview',
            'kitId': checked['release']['kitId'], 'status': 'blocked' if blocked else 'proposed',
            'conflicts': blocked, 'operations': operations, 'writesPerformed': False,
            'sourceProvenanceVerified': False, 'promotionAllowed': False}


def main():
    parser = argparse.ArgumentParser(description='R2d-03 target preview only: NO writes or authorized installation')
    parser.add_argument('--target', required=True)
    parser.add_argument('--preview', required=True)
    parser.add_argument('--metadata', required=True)
    args = parser.parse_args()
    try:
        result = plan_preview(args.target, strict_file(args.preview, MAX_INPUT),
                              strict_file(args.metadata, 64 * 1024))
        print(json.dumps(result, sort_keys=True, separators=(',', ':'), ensure_ascii=True))
        return 2 if result['status'] == 'blocked' else 0
    except (RenderError, OSError, ValueError, TypeError) as exc:
        print('R2d-03 FAIL-CLOSED: ' + str(exc), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
