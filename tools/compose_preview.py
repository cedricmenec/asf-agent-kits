#!/usr/bin/env python3
"""R2d-02: compose an UNVERIFIED release preview from in-memory render output."""
import argparse
import base64
import binascii
import hashlib
import json
import sys
from pathlib import Path

from render_templates import MAX_FILE, MAX_FILES, MAX_TOTAL, RenderError, safe_path, unique_pairs
from validate_contracts import validate

METADATA_KEYS = frozenset(('schemaVersion', 'kitId', 'kitVersion', 'coreVersion',
                           'sourceRepository', 'sourceCommitSha', 'releaseTag', 'runtime'))
PREVIEW_KEYS = frozenset(('kind', 'kitId', 'sourceProvenanceVerified', 'writesPerformed', 'files'))
MAX_INPUT = 16 * 1024 * 1024


def strict_file(path, limit):
    src = Path(path).absolute()
    if src.is_symlink() or not src.is_file() or src.stat().st_size > limit:
        raise RenderError('missing, symlinked or oversized JSON file')
    try:
        return json.loads(src.read_text('utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(RenderError('non-finite JSON number')))
    except (UnicodeError, ValueError) as exc:
        raise RenderError('invalid JSON file') from exc


def compose(preview, metadata):
    if not isinstance(preview, dict) or set(preview) != PREVIEW_KEYS or preview['kind'] != 'r2d-local-render-preview':
        raise RenderError('invalid R2d render preview')
    if type(preview['sourceProvenanceVerified']) is not bool or preview['sourceProvenanceVerified'] is not False or type(preview['writesPerformed']) is not bool or preview['writesPerformed'] is not False:
        raise RenderError('preview must not claim authority or writes')
    if not isinstance(metadata, dict) or set(metadata) != METADATA_KEYS or not isinstance(metadata.get('kitId'), str) or preview['kitId'] != metadata['kitId']:
        raise RenderError('release metadata or kit identity mismatch')
    files = preview['files']
    if not isinstance(files, list) or not 1 <= len(files) <= MAX_FILES:
        raise RenderError('invalid preview files')
    artifacts = []
    seen = set()
    total = 0
    for file in files:
        if not isinstance(file, dict) or set(file) != {'path', 'sha256', 'contentBase64'}:
            raise RenderError('invalid preview entry')
        path = safe_path(file['path'])
        if not path.startswith('.asf/agentkit/') or path.casefold() in seen:
            raise RenderError('unsafe, duplicate or case-colliding preview path')
        seen.add(path.casefold())
        encoded = file['contentBase64']
        if not isinstance(encoded, str) or len(encoded) > 4 * ((MAX_FILE + 2) // 3):
            raise RenderError('invalid or oversized Base64')
        try:
            raw = base64.b64decode(encoded, validate=True)
            if base64.b64encode(raw).decode('ascii') != encoded:
                raise RenderError('non-canonical Base64')
            text = raw.decode('utf-8')
        except (binascii.Error, UnicodeError, ValueError) as exc:
            raise RenderError('invalid Base64 or UTF-8') from exc
        if '\0' in text or '\r' in text or len(raw) > MAX_FILE:
            raise RenderError('binary, CRLF or oversized preview artifact')
        total += len(raw)
        if total > MAX_TOTAL:
            raise RenderError('preview size exceeds aggregate limit')
        sha = hashlib.sha256(raw).hexdigest()
        if file['sha256'] != sha:
            raise RenderError('preview SHA-256 mismatch')
        artifacts.append({'path': path, 'sha256': sha})
    manifest = {**metadata, 'artifacts': sorted(artifacts, key=lambda x: x['path'])}
    problems = validate('release', manifest)
    if problems:
        raise RenderError('invalid unverified candidate manifest: ' + '; '.join(problems))
    return {'kind': 'r2d-unverified-release-preview', 'release': manifest,
            'sourceProvenanceVerified': False, 'promotionAllowed': False, 'writesPerformed': False}


def main():
    parser = argparse.ArgumentParser(description='Compose offline unverified R2d candidate preview (NO writes)')
    parser.add_argument('--preview', required=True)
    parser.add_argument('--metadata', required=True)
    args = parser.parse_args()
    try:
        result = compose(strict_file(args.preview, MAX_INPUT), strict_file(args.metadata, 64 * 1024))
        print(json.dumps(result, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False))
        return 0
    except (RenderError, OSError, ValueError, TypeError) as exc:
        print('R2d-02 FAIL-CLOSED: ' + str(exc), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
