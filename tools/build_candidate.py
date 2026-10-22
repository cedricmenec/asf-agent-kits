#!/usr/bin/env python3
"""R2c deterministic, read-only release *candidate* manifest generator.

Inputs are LOCAL and untrusted. This does not verify a GitHub tag, signature,
commit provenance or ownership, install anything, or grant promotion authority.
"""
import argparse
import hashlib
import json
import os
import stat
import sys
import unicodedata
from pathlib import Path

from plan_install import PlanError, safe_root, safe_member
from validate_contracts import unsafe_path, validate

MAX_FILE = 1024 * 1024
MAX_TOTAL = 10 * MAX_FILE
MAX_DESCRIPTOR = 64 * 1024
RELEASE_KEYS = frozenset(('schemaVersion', 'kitId', 'kitVersion', 'coreVersion',
                          'sourceRepository', 'sourceCommitSha', 'releaseTag', 'runtime'))


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise PlanError('duplicate JSON key: ' + key)
        result[key] = value
    return result


def strict_json(path, maximum=MAX_DESCRIPTOR):
    file = Path(path).absolute()
    if file.is_symlink() or not file.is_file() or file.stat().st_size > maximum:
        raise PlanError('descriptor/manifest must be a small regular file')
    try:
        return json.loads(file.read_text('utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(PlanError('non-finite JSON number')))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise PlanError('invalid UTF-8 JSON') from exc


def manifest_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                       allow_nan=False) + '\n').encode('utf-8')


def validate_artifact_path(path):
    if unsafe_path(path) or path.endswith('/') or path == '.git' or '.git' in path.split('/'):
        raise PlanError('unsafe artifact path: ' + repr(path))
    if path in ('.asf/agentkit.yaml', '.asf/agentkit.lock.json'):
        raise PlanError('installer-owned config or lock cannot be a release artifact')
    if unicodedata.normalize('NFC', path) != path:
        raise PlanError('artifact path must be normalized Unicode NFC')


def artifact_digest(root, relative):
    file = safe_member(root, relative)  # rejects observed links in every parent
    if not file.is_file():
        raise PlanError('missing source artifact: ' + relative)
    before = file.stat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_FILE:
        raise PlanError('oversized or non-regular source artifact: ' + relative)
    with file.open('rb') as stream:
        digest = hashlib.sha256()
        length = 0
        for chunk in iter(lambda: stream.read(65536), b''):
            length += len(chunk)
            if length > MAX_FILE:
                raise PlanError('source artifact exceeded size limit: ' + relative)
            digest.update(chunk)
        after = os.fstat(stream.fileno())
    if before.st_dev != after.st_dev or before.st_ino != after.st_ino or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise PlanError('source artifact changed during read: ' + relative)
    return digest.hexdigest(), length


def build_candidate(source, descriptor):
    root = safe_root(source)
    document = strict_json(descriptor)
    if not isinstance(document, dict) or set(document) != RELEASE_KEYS | {'paths'}:
        raise PlanError('descriptor must contain exactly release metadata and paths')
    paths = document['paths']
    if not isinstance(paths, list) or not paths or len(paths) > 250 or not all(isinstance(p, str) for p in paths):
        raise PlanError('paths must be a non-empty array of at most 250 strings')
    if len(set(paths)) != len(paths) or len({p.casefold() for p in paths}) != len(paths):
        raise PlanError('duplicate or case-colliding artifact paths')
    artifacts = []
    total = 0
    for path in sorted(paths):
        validate_artifact_path(path)
        digest, size = artifact_digest(root, path)
        total += size
        if total > MAX_TOTAL:
            raise PlanError('source artifacts exceed overall size limit')
        artifacts.append({'path': path, 'sha256': digest})
    result = {k: document[k] for k in RELEASE_KEYS}
    result['artifacts'] = artifacts
    errors = validate('release', result)
    if errors:
        raise PlanError('invalid candidate release contract: ' + '; '.join(errors))
    return result


def main():
    parser = argparse.ArgumentParser(description='Read-only deterministic AgentKit release candidate manifest (UNVERIFIED)')
    parser.add_argument('--source', required=True, help='Local artifact tree (never modified)')
    parser.add_argument('--descriptor', required=True, help='JSON metadata and explicit selected paths')
    parser.add_argument('--verify-manifest', help='Optional local manifest to compare byte-for-byte; never write')
    args = parser.parse_args()
    try:
        result = build_candidate(args.source, args.descriptor)
        generated = manifest_bytes(result)
        if args.verify_manifest:
            expected = strict_json(args.verify_manifest)
            if expected != result:
                raise PlanError('local manifest differs from candidate artifacts/metadata')
        sys.stdout.buffer.write(generated)
        return 0
    except (PlanError, OSError, ValueError, KeyError) as exc:
        print('R2c FAIL-CLOSED: ' + str(exc), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
