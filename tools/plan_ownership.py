#!/usr/bin/env python3
"""R2d-04 offline, read-only preview of explicit AgentKit ownership.

No source authenticity, installation authority, target mutation, or paid call.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from compose_preview import compose, strict_file, MAX_INPUT
from plan_rendered_preview import inspect_target
from render_templates import RenderError, safe_path
from validate_contracts import validate


def canonical_owned(path):
    safe_path(path)
    if not path.startswith('.asf/agentkit/'):
        raise RenderError('ownership outside confined namespace')
    return path


def check_policy(policy, kit_id, paths):
    if (not isinstance(policy, dict) or set(policy) != {'schemaVersion', 'kitId', 'managedFiles'}
            or type(policy['schemaVersion']) is not int or policy['schemaVersion'] != 1
            or policy['kitId'] != kit_id):
        raise RenderError('invalid or mismatched ownership contract')
    files = policy['managedFiles']
    if not isinstance(files, list) or len(files) != len(paths):
        raise RenderError('ownership must list every candidate path exactly once')
    mapped = set()
    originals = set()
    for entry in files:
        if not isinstance(entry, dict) or set(entry) != {'path', 'overlayPolicy'} or entry['overlayPolicy'] != 'preserve-and-block':
            raise RenderError('unsupported ownership entry or overwrite policy')
        path = canonical_owned(entry['path'])
        folded = path.casefold()
        if folded in mapped:
            raise RenderError('ambiguous case-colliding ownership')
        mapped.add(folded)
        originals.add(path)
    if mapped != {path.casefold() for path in paths} or originals != set(paths):
        raise RenderError('ownership and candidate paths mismatch')


def check_lock(lock):
    if lock is None:
        return {}
    if not isinstance(lock, dict):
        raise RenderError('invalid lock object')
    errors = validate('lock', lock)
    if errors:
        raise RenderError('invalid local lock: ' + '; '.join(errors))
    result = {}
    for kit in lock['kits']:
        for path, digest in kit['managedFiles'].items():
            canonical_owned(path)
            key = path.casefold()
            if key in result:
                raise RenderError('ambiguous ownership across kits or case alias')
            result[key] = (path, kit['id'], digest)
    return result


def plan_ownership(target_dir, preview, metadata, policy, lock=None):
    root = Path(target_dir).absolute()
    if root.is_symlink() or not root.is_dir():
        raise RenderError('target must be an ordinary existing directory')
    checked = compose(preview, metadata)
    paths = [item['path'] for item in checked['release']['artifacts']]
    kit_id = checked['release']['kitId']
    check_policy(policy, kit_id, paths)
    previous = check_lock(lock)
    operations = []
    proposed_paths = {path.casefold() for path in paths}
    for item in checked['release']['artifacts']:
        path = item['path']; key = path.casefold()
        prior = previous.get(key)
        actual = inspect_target(root, path)
        if prior and prior[1] != kit_id:
            action, reason = 'conflict', 'path already owned by another kit'
        elif prior and prior[0] != path:
            action, reason = 'conflict', 'existing lock path differs in case'
        elif prior and actual is None:
            action, reason = 'conflict', 'previously managed path missing'
        elif prior and hashlib.sha256(actual).hexdigest() != prior[2]:
            action, reason = 'conflict', 'local overlay differs from locked content'
        elif actual is None:
            action, reason = 'create', None
        elif prior is None:
            action, reason = 'conflict', 'existing unmanaged path cannot be claimed silently'
        elif hashlib.sha256(actual).hexdigest() == item['sha256']:
            action, reason = 'unchanged', None
        else:
            action, reason = 'conflict', 'candidate differs from installed content; update needs explicit review'
        op = {'path': path, 'action': action}
        if reason:
            op['reason'] = reason
        operations.append(op)
    for key, (path, owner, _) in previous.items():
        if owner == kit_id and key not in proposed_paths:
            operations.append({'path': path, 'action': 'conflict', 'reason': 'removal of previously managed path is not allowed'})
    operations.sort(key=lambda item: item['path'])
    conflicts = sum(op['action'] == 'conflict' for op in operations)
    return {'kind': 'r2d-read-only-ownership-preview', 'kitId': kit_id,
            'status': 'blocked' if conflicts else 'proposed', 'conflicts': conflicts,
            'operations': operations, 'sourceProvenanceVerified': False,
            'promotionAllowed': False, 'writesPerformed': False}


def main():
    parser = argparse.ArgumentParser(description='Read-only R2d-04 ownership preview: no writes')
    parser.add_argument('--target', required=True)
    parser.add_argument('--preview', required=True)
    parser.add_argument('--metadata', required=True)
    parser.add_argument('--policy', required=True)
    parser.add_argument('--lock')
    args = parser.parse_args()
    try:
        result = plan_ownership(args.target, strict_file(args.preview, MAX_INPUT),
            strict_file(args.metadata, 64 * 1024), strict_file(args.policy, 64 * 1024),
            strict_file(args.lock, 64 * 1024) if args.lock else None)
        print(json.dumps(result, sort_keys=True, separators=(',', ':'), ensure_ascii=True))
        return 2 if result['status'] == 'blocked' else 0
    except (RenderError, OSError, ValueError, TypeError) as exc:
        print('R2d-04 FAIL-CLOSED: ' + str(exc), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
