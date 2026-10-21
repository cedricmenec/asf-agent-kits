#!/usr/bin/env python3
"""R2a read-only, deterministic preview of an AgentKit candidate release.

No install, no mutation, no GitHub authentication, and NO claim that a synthetic
release manifest proves a remote GitHub release's provenance.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from validate_contracts import read_json, unsafe_path, validate

LOCK_RELATIVE = ".asf/agentkit.lock.json"


class PlanError(Exception):
    """Fail-closed local audit error."""


def safe_root(path):
    root = Path(path).absolute()
    if root.is_symlink() or not root.is_dir():
        raise PlanError(f"directory root not available or symlink: {root}")
    return root


def safe_member(root, relative):
    """Reject traversal or any observed symlink, including parents.

    Read-only TOCTOU protection is deliberately not a write-security claim;
    future apply must use secure directory-fd operations.
    """
    if unsafe_path(relative) or relative.startswith(".git/"):
        raise PlanError(f"unsafe path: {relative!r}")
    dest = root
    for part in relative.rstrip("/").split("/"):
        dest = dest / part
        if dest.is_symlink():
            raise PlanError(f"symlink at path component: {relative!r}")
    if not dest.resolve().is_relative_to(root.resolve()):
        raise PlanError(f"path escapes root: {relative!r}")
    return dest


def file_hash(path):
    if not path.is_file():
        raise PlanError(f"expected regular file: {path}")
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def maybe_file_hash(root, relative):
    path = safe_member(root, relative)
    if not path.exists():
        return None
    return file_hash(path)


def load_lock(target):
    lock_path = safe_member(target, LOCK_RELATIVE)
    if not lock_path.exists():
        return None
    document = read_json(lock_path)
    errors = validate("lock", document)
    if errors:
        raise PlanError("invalid local lock: " + "; ".join(errors))
    return document


def status(target_dir):
    target = safe_root(target_dir)
    lock = load_lock(target)
    if lock is None:
        return {"status": "unmanaged-or-legacy", "provenanceVerified": False, "kits": []}
    result = []
    for kit in sorted(lock["kits"], key=lambda k: k["id"]):
        checks = []
        for rel, digest in sorted(kit["managedFiles"].items()):
            actual = maybe_file_hash(target, rel)
            state = "missing" if actual is None else "hash-match" if actual == digest else "drifted"
            checks.append({"path": rel, "state": state})
        overall = "drifted" if any(x["state"] != "hash-match" for x in checks) else "hash-match"
        result.append({"id": kit["id"], "version": kit["version"], "sourceCommitSha": kit["sourceCommitSha"], "state": overall, "files": checks})
    return {"status": "hash-match" if all(k["state"] == "hash-match" for k in result) else "drifted", "provenanceVerified": False, "kits": result}


def plan(target_dir, source_dir, manifest_path):
    target = safe_root(target_dir)
    source = safe_root(source_dir)
    # Manifests are read as explicit local paths, not inferred from Git tags.
    manifest_file = Path(manifest_path).absolute()
    if manifest_file.is_symlink() or not manifest_file.is_file():
        raise PlanError("missing or symlink release manifest")
    release = read_json(manifest_file)
    errors = validate("release", release)
    if errors:
        raise PlanError("invalid release manifest: " + "; ".join(errors))
    lock = load_lock(target)
    existing = next((k for k in lock["kits"] if k["id"] == release["kitId"]), None) if lock else None
    other_owners = {rel: k["id"] for k in (lock["kits"] if lock else []) if k["id"] != release["kitId"] for rel in k["managedFiles"]}
    candidate = {}
    for artifact in release["artifacts"]:
        rel = artifact["path"]
        if rel == LOCK_RELATIVE or rel.startswith(".git/"):
            raise PlanError(f"release cannot own reserved path: {rel}")
        actual_digest = maybe_file_hash(source, rel)
        if actual_digest != artifact["sha256"]:
            raise PlanError(f"candidate file missing or SHA-256 mismatch: {rel}")
        candidate[rel] = actual_digest
    original = existing["managedFiles"] if existing else {}
    operations = []
    for rel in sorted(set(original) | set(candidate)):
        desired = candidate.get(rel)
        observed = maybe_file_hash(target, rel)
        old = original.get(rel)
        reason = None
        if rel in other_owners:
            action, reason = "conflict", f"owned by another kit: {other_owners[rel]}"
        elif desired is None:
            action, reason = "conflict", "managed file absent from candidate; explicit removal not supported in R2a"
        elif observed is None and old is not None:
            action, reason = "conflict", "previously managed file is missing"
        elif observed is None:
            action = "create"
        elif old is None:
            action, reason = "conflict", "unmanaged existing file"
        elif observed != old:
            action, reason = "conflict", "local drift from locked SHA-256"
        elif observed == desired:
            action = "unchanged"
        else:
            action = "update"
        item = {"path": rel, "action": action}
        if reason is not None:
            item["reason"] = reason
        operations.append(item)
    conflicts = sum(1 for o in operations if o["action"] == "conflict")
    return {
        "kind": "dry-run-only", "kitId": release["kitId"],
        "candidateVersion": release["kitVersion"], "sourceCommitSha": release["sourceCommitSha"],
        "sourceProvenanceVerified": False, "writesPerformed": False,
        "status": "blocked" if conflicts else "proposed", "conflicts": conflicts,
        "operations": operations,
    }


def main():
    ap = argparse.ArgumentParser(description="ASF AgentKit R2a read-only preview; no apply")
    commands = ap.add_subparsers(dest="command", required=True)
    s = commands.add_parser("status", help="Compare installed lock hashes with target worktree")
    s.add_argument("--target", type=Path, required=True)
    p = commands.add_parser("plan", help="Compare candidate release manifest with target (dry-run)")
    p.add_argument("--target", type=Path, required=True)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    args = ap.parse_args()
    try:
        result = status(args.target) if args.command == "status" else plan(args.target, args.source, args.manifest)
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 2 if result.get("status") == "blocked" else 0
    except (PlanError, OSError, ValueError, json.JSONDecodeError, KeyError) as exc:
        print(f"R2a FAIL-CLOSED: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
