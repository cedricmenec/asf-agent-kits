#!/usr/bin/env python3
"""R2d-01 local, read-only AgentKit template preview (unverified source)."""
import argparse
import base64
import hashlib
import json
import os
import re
import stat
import sys
import unicodedata
from pathlib import Path

MAX_DESCRIPTOR = 64 * 1024
MAX_FILE = 1024 * 1024
MAX_TOTAL = 10 * MAX_FILE
MAX_FILES = 250
ALLOWED_KITS = frozenset(('opencode-openspec', 'opencode-direct'))
TOKEN = re.compile(r'\{\{([A-Z_]+)\}\}')
REPO = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')


class RenderError(Exception):
    """Fail-closed rendering error."""


def unique_pairs(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise RenderError('duplicate descriptor key')
        out[key] = value
    return out


def safe_path(value):
    if not isinstance(value, str) or not value or unicodedata.normalize('NFC', value) != value:
        raise RenderError('invalid or non-NFC path')
    if value.startswith(('/', '~')) or '\\' in value or '\0' in value or re.match(r'^[A-Za-z]:', value):
        raise RenderError('absolute or ambiguous path')
    if any(part in ('', '.', '..') for part in value.split('/')):
        raise RenderError('empty or traversal path component')
    if any(part == '.git' for part in value.split('/')):
        raise RenderError('git internals forbidden')
    return value


def read_regular(root, relative, maximum):
    path = root
    for part in safe_path(relative).split('/'):
        path = path / part
        if path.is_symlink():
            raise RenderError('symlink encountered')
    if not path.is_file():
        raise RenderError('missing or non-regular template')
    before = path.stat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
        raise RenderError('template exceeds limit or is not regular')
    with path.open('rb') as stream:
        data = stream.read(maximum + 1)
        fstat = os.fstat(stream.fileno())
    if len(data) > maximum or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (fstat.st_dev, fstat.st_ino, fstat.st_size, fstat.st_mtime_ns):
        raise RenderError('template changed during read or oversized')
    return data


def render(source, descriptor):
    root = Path(source).absolute()
    if root.is_symlink() or not root.is_dir():
        raise RenderError('invalid or symlink source root')
    desc_path = Path(descriptor).absolute()
    if desc_path.is_symlink() or not desc_path.is_file() or desc_path.stat().st_size > MAX_DESCRIPTOR:
        raise RenderError('invalid descriptor')
    try:
        desc = json.loads(desc_path.read_text('utf-8'), object_pairs_hook=unique_pairs)
    except (UnicodeError, ValueError, json.JSONDecodeError) as exc:
        raise RenderError('invalid descriptor JSON') from exc
    if not isinstance(desc, dict) or set(desc) != {'schemaVersion', 'kitId', 'targetRepository', 'files'} or desc['schemaVersion'] != 1 or type(desc['schemaVersion']) is not int:
        raise RenderError('invalid descriptor fields')
    kit = desc['kitId']; repo = desc['targetRepository']; entries = desc['files']
    if not isinstance(kit, str) or kit not in ALLOWED_KITS or not isinstance(repo, str) or not REPO.fullmatch(repo) or any(part in ('.', '..') for part in repo.split('/')):
        raise RenderError('invalid kit or target repository')
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_FILES:
        raise RenderError('invalid files list')
    seen = set(); total = 0; result = []
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {'template', 'path'}:
            raise RenderError('invalid file entry')
        src = safe_path(entry['template']); dest = safe_path(entry['path'])
        if not dest.startswith('.asf/agentkit/') or dest.casefold() in ('.asf/agentkit.yaml', '.asf/agentkit.lock.json'):
            raise RenderError('destination outside confined AgentKit preview namespace')
        if dest.casefold() in seen:
            raise RenderError('duplicate or case-colliding output path')
        seen.add(dest.casefold())
        raw = read_regular(root, src, MAX_FILE)
        try:
            value = raw.decode('utf-8')
        except UnicodeDecodeError as exc:
            raise RenderError('template must be UTF-8') from exc
        if '\0' in value or '\r' in value:
            raise RenderError('binary or CRLF template')
        variables = {'KIT_ID': kit, 'TARGET_REPOSITORY': repo}
        rendered = TOKEN.sub(lambda m: variables[m.group(1)] if m.group(1) in variables else _unknown(), value)
        if '{{' in rendered or '}}' in rendered:
            raise RenderError('unmatched placeholder')
        data = rendered.encode('utf-8')
        total += len(data)
        if len(data) > MAX_FILE or total > MAX_TOTAL:
            raise RenderError('rendered output exceeds limit')
        result.append({'path': dest, 'sha256': hashlib.sha256(data).hexdigest(), 'contentBase64': base64.b64encode(data).decode('ascii')})
    return {'kind': 'r2d-local-render-preview', 'kitId': kit, 'sourceProvenanceVerified': False, 'writesPerformed': False, 'files': sorted(result, key=lambda item: item['path'])}


def _unknown():
    raise RenderError('unknown placeholder')


def main():
    parser = argparse.ArgumentParser(description='R2d local template preview: NO writes, verification or install')
    parser.add_argument('--source', required=True)
    parser.add_argument('--descriptor', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(render(args.source, args.descriptor), sort_keys=True, separators=(',', ':')))
        return 0
    except (RenderError, OSError, ValueError, TypeError) as exc:
        print('R2d FAIL-CLOSED: ' + str(exc), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
