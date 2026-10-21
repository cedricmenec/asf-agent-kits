#!/usr/bin/env python3
"""R2b experimental, fail-closed offline, READ-ONLY 3-way upgrade planner.

Never writes target; never claims remote manifest/tag provenance. Deployment and
production write-security require different implementation and approval gates.
"""
import argparse
import difflib
import hashlib
import json
import sys
from pathlib import Path

import yaml
from yaml.events import AliasEvent

from plan_install import PlanError, LOCK_RELATIVE, load_lock, safe_member, safe_root
from validate_contracts import validate, read_json, unsafe_path

MAX_MERGE_SIZE = 1024 * 1024
CONFIG = '.asf/agentkit.yaml'


class StrictLoader(yaml.SafeLoader):
    """Reject silent mapping overrides, alias references and non-safe tags."""

    def compose_node(self, parent, index):
        if self.check_event(AliasEvent) or getattr(self.peek_event(), 'anchor', None) is not None:
            raise PlanError('YAML anchors and aliases are forbidden')
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        if not isinstance(node, yaml.MappingNode):
            raise PlanError('YAML mapping expected')
        mapping = {}
        for key_node, value_node in node.value:
            if key_node.tag == 'tag:yaml.org,2002:merge':
                raise PlanError('YAML merge keys are forbidden')
            key = self.construct_object(key_node, deep=True)
            if not isinstance(key, str):
                raise PlanError('YAML mapping keys must be strings')
            if key in mapping:
                raise PlanError('duplicate YAML key: ' + key)
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def config_for(target):
    cfg_path = safe_member(target, CONFIG)
    if not cfg_path.is_file():
        raise PlanError('explicit .asf/agentkit.yaml is required')
    if cfg_path.stat().st_size > MAX_MERGE_SIZE:
        raise PlanError('oversized YAML config')
    raw = cfg_path.read_text(encoding='utf-8')
    if '\t' in raw:
        raise PlanError('ambiguous YAML tabs are forbidden')
    try:
        docs = list(yaml.load_all(raw, Loader=StrictLoader))
    except yaml.YAMLError as exc:
        raise PlanError('invalid or unsafe YAML') from exc
    if len(docs) != 1 or not isinstance(docs[0], dict):
        raise PlanError('expected exactly one YAML mapping document')
    issues = validate('config', docs[0])
    if issues:
        raise PlanError('invalid configuration: ' + '; '.join(issues))
    return docs[0]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verified_source(root, manifest):
    verified = {}
    for artifact in manifest['artifacts']:
        rel = artifact['path']
        if rel == LOCK_RELATIVE or rel == CONFIG or rel == '.git' or rel.startswith('.git/'):
            raise PlanError('reserved source artifact path: ' + rel)
        f = safe_member(root, rel)
        if not f.is_file() or f.stat().st_size > MAX_MERGE_SIZE:
            raise PlanError('missing or oversized source artifact: ' + rel)
        data = f.read_bytes()
        if sha256(data) != artifact['sha256']:
            raise PlanError('source artifact hash mismatch: ' + rel)
        verified[rel] = data
    return verified


def merge_hunks(base, value):
    matcher = difflib.SequenceMatcher(None, base, value, autojunk=False)
    return [(a, b, value[c:d]) for tag, a, b, c, d in matcher.get_opcodes() if tag != 'equal']


def overlaps(a, b):
    # Strictly conservative: inserts on boundaries of a change conflict too.
    x, y, _ = a
    u, v, _ = b
    if x == y and u == v:
        return x == u
    if x == y:
        return u <= x <= v
    if u == v:
        return x <= u <= y
    return x < v and u < y


def three_way(base_bytes, local_bytes, candidate_bytes):
    """Merge only independent UTF-8 LF text hunks; otherwise fail closed."""
    if local_bytes == base_bytes:
        return candidate_bytes, 'candidate'
    if candidate_bytes == base_bytes:
        return local_bytes, 'preserve-local'
    if local_bytes == candidate_bytes:
        return local_bytes, 'already-candidate'
    for data in (base_bytes, local_bytes, candidate_bytes):
        if len(data) > MAX_MERGE_SIZE or b'\0' in data or b'\r' in data:
            raise PlanError('binary, CRLF or oversized merge input requires explicit review')
    try:
        base, local, candidate = (data.decode('utf-8').splitlines(keepends=True) for data in (base_bytes, local_bytes, candidate_bytes))
    except UnicodeDecodeError as exc:
        raise PlanError('non-UTF-8 merge input requires explicit review') from exc
    ours = merge_hunks(base, local)
    theirs = merge_hunks(base, candidate)
    joined = list(ours)
    for changed in theirs:
        same = any(changed == other for other in ours)
        if same:
            continue
        if any(overlaps(changed, other) for other in ours):
            raise PlanError('overlapping 3-way edits require human resolution')
        joined.append(changed)
    joined.sort(key=lambda h: (h[0], h[1]))
    at = 0
    result = []
    for start, end, lines in joined:
        if start < at:
            raise PlanError('overlapping changes after normalization')
        result.extend(base[at:start]); result.extend(lines); at = end
    result.extend(base[at:])
    return ''.join(result).encode('utf-8'), 'auto-merged'


def is_protected(relative, policy):
    rules = policy['paths']['protected'] + policy['paths']['additionalProtected']
    return any(relative == rule.rstrip('/') or (rule.endswith('/') and relative.startswith(rule)) for rule in rules)


def plan_merge(target_dir, base_dir, base_manifest, new_dir, new_manifest):
    target = safe_root(target_dir)
    candidate = safe_root(new_dir)
    config = config_for(target)
    lock = load_lock(target)
    new = read_json(new_manifest)
    issues = validate('release', new)
    if issues:
        raise PlanError('invalid candidate manifest: ' + '; '.join(issues))
    if not config['kits'].get(new['kitId'], {}).get('enabled'):
        raise PlanError('candidate kit not enabled in target configuration')
    existing = None if lock is None else next((k for k in lock['kits'] if k['id'] == new['kitId']), None)
    if lock is not None and existing is None:
        # Adding another kit to a managed repository must have a separate
        # explicitly approved ownership policy, not a silently empty base.
        raise PlanError('kit not present in existing installation lock')
    new_bytes = verified_source(candidate, new)
    if existing:
        if not base_dir or not base_manifest:
            raise PlanError('an installed kit requires explicit base source and manifest')
        prior = safe_root(base_dir)
        base = read_json(base_manifest)
        issues = validate('release', base)
        if issues:
            raise PlanError('invalid base manifest: ' + '; '.join(issues))
        if base['kitId'] != new['kitId'] or base['sourceRepository'] != new['sourceRepository']:
            raise PlanError('kit identity/source does not match between manifests')
        for property_name, source_name in [('version', 'kitVersion'), ('sourceCommitSha','sourceCommitSha'),('releaseTag','releaseTag'),('sourceRepository','sourceRepository'),('coreVersion','coreVersion')]:
            if existing[property_name] != base[source_name]:
                raise PlanError('base manifest identity does not match installation lock: ' + property_name)
        old_bytes = verified_source(prior, base)
        locked = existing['managedFiles']
        if set(locked) != set(old_bytes):
            raise PlanError('base manifest paths must equal locked managed paths')
        for rel, data in old_bytes.items():
            if sha256(data) != locked[rel]:
                raise PlanError('base artifact does not match locked hash: ' + rel)
    else:
        if base_dir is not None or base_manifest is not None:
            raise PlanError('first install must not claim an existing base')
        old_bytes = {}
    other_owned = {p for k in (lock or {'kits': []})['kits'] if k['id'] != new['kitId'] for p in k['managedFiles']}
    operations = []
    for rel in sorted(set(old_bytes) | set(new_bytes)):
        if unsafe_path(rel) or rel in (CONFIG, LOCK_RELATIVE) or rel == '.git' or rel.startswith('.git/'):
            raise PlanError('unsafe or reserved artifact path: ' + rel)
        # Must never silently mutate governed files, including workflow files.
        if is_protected(rel, config) or rel in other_owned:
            operations.append({'path': rel, 'action': 'conflict', 'reason': 'protected or owned by another kit'})
            continue
        dest = safe_member(target, rel)
        local = None if not dest.exists() else dest.read_bytes() if dest.is_file() else None
        if local is None and dest.exists():
            raise PlanError('non-regular target artifact: ' + rel)
        before = old_bytes.get(rel); after = new_bytes.get(rel)
        operation = {'path': rel}
        if before is None and after is not None:
            if local is not None:
                operation.update(action='conflict', reason='existing unmanaged file')
            else:
                operation.update(action='create', sha256=sha256(after))
        elif after is None:
            # Deliberate no-deletion policy in R2b.
            operation.update(action='conflict', reason='candidate removes a previously managed file')
        elif local is None:
            operation.update(action='conflict', reason='missing previously managed file')
        else:
            try:
                merged, mode = three_way(before, local, after)
                if mode == 'preserve-local':
                    operation.update(action='preserve-overlay', sha256=sha256(merged), reason='candidate unchanged; retain local changes')
                else:
                    operation.update(action='unchanged' if merged == local else 'update', mergeMode=mode, sha256=sha256(merged))
            except PlanError as exc:
                operation.update(action='conflict', reason=str(exc))
        operations.append(operation)
    conflicts = sum(o['action'] == 'conflict' for o in operations)
    return {
        'kind': 'r2b-local-preview-only', 'kitId': new['kitId'], 'candidateVersion': new['kitVersion'],
        'sourceProvenanceVerified': False, 'promotionAllowed': False, 'writesPerformed': False,
        'status': 'blocked' if conflicts else 'proposed', 'conflicts': conflicts,
        'operations': operations,
    }


def main():
    p = argparse.ArgumentParser(description='Experimental read-only merge preview: no install, no LLM')
    p.add_argument('--target', required=True)
    p.add_argument('--base-source')
    p.add_argument('--base-manifest')
    p.add_argument('--new-source', required=True)
    p.add_argument('--new-manifest', required=True)
    args = p.parse_args()
    try:
        result = plan_merge(args.target,args.base_source,args.base_manifest,args.new_source,args.new_manifest)
        print(json.dumps(result,sort_keys=True,separators=(',', ':')))
        return 2 if result['status'] == 'blocked' else 0
    except (PlanError,OSError,KeyError,ValueError,yaml.YAMLError) as exc:
        print('R2b FAIL-CLOSED: '+str(exc),file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
