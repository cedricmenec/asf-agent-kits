#!/usr/bin/env python3
"""Draft 2020-12 validation for AgentKit's *untrusted* configuration documents.

Uses standards-compliant jsonschema; semantic cross-field checks and path
safety are separately enforced. A successful schema validation cannot grant
execution authority, GitHub write permissions, or a paid-provider approval.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = {
    "config": "agentkit-config.schema.json",
    "lock": "agentkit-lock.schema.json",
    "release": "release.schema.json",
}
PROTECTED = {".github/", ".asf/", "AGENTS.md"}


def read_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def unsafe_path(value):
    """Reject ambiguous paths before filesystem operations; no realpath checks yet."""
    return (
        not isinstance(value, str) or not value or
        value.startswith(("/", "~")) or value.endswith("//") or "\\" in value or "\0" in value or
        any(part in ("", ".", "..") for part in value.rstrip("/").split("/")) or
        re.match(r"^[A-Za-z]:", value) is not None
    )


def check_semantics(kind, value):
    issues = []
    if kind == "config":
        execution = value["execution"]
        if execution["defaultModel"] not in execution["allowedModels"]:
            issues.append("defaultModel must be included in allowedModels")
        if value["publication"]["targetBranch"] != value["project"]["baseBranch"]:
            issues.append("publication.targetBranch must match project.baseBranch")
        if not PROTECTED.issubset(set(value["paths"]["protected"])):
            issues.append("baseline protected paths missing")
        if not any(k["enabled"] for k in value["kits"].values()):
            issues.append("at least one kit must be enabled")
        candidates = [value["tasks"]["root"]]
        for key in ("protected", "additionalProtected", "allowedProductPrefixes"):
            candidates.extend(value["paths"][key])
        if any(map(unsafe_path, candidates)):
            issues.append("unsafe relative path in config")
        try:
            re.compile(value["tasks"]["idPattern"])
        except re.error:
            issues.append("tasks.idPattern is not a valid regex")
    elif kind == "lock":
        ids = [kit["id"] for kit in value["kits"]]
        if len(ids) != len(set(ids)):
            issues.append("duplicate kit id")
        for kit in value["kits"]:
            if kit["releaseTag"] != f'kits/{kit["id"]}/v{kit["version"]}':
                issues.append("lock releaseTag does not match id and version")
            if any(map(unsafe_path, kit["managedFiles"])):
                issues.append("unsafe managedFile path")
    elif kind == "release":
        if value["releaseTag"] != f'kits/{value["kitId"]}/v{value["kitVersion"]}':
            issues.append("releaseTag does not match kitId and kitVersion")
        paths = [artifact["path"] for artifact in value["artifacts"]]
        if len(paths) != len(set(paths)):
            issues.append("duplicate artifact paths")
        if any(map(unsafe_path, paths)):
            issues.append("unsafe artifact path")
    return issues


def validate(kind, value):
    schema = read_json(ROOT / "schemas" / SCHEMAS[kind])
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = [f"{'.'.join(map(str, err.path)) or '$'}: {err.message}" for err in validator.iter_errors(value)]
    if errors:
        return sorted(errors)
    return sorted(check_semantics(kind, value))


def main():
    parser = argparse.ArgumentParser(description="Offline AgentKit contract validation (no paid calls)")
    parser.add_argument("kind", choices=SCHEMAS)
    parser.add_argument("json_path", type=Path)
    args = parser.parse_args()
    try:
        errors = validate(args.kind, read_json(args.json_path))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"INVALID {args.kind}: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"INVALID {args.kind}: {error}", file=sys.stderr)
        return 1
    print(f"VALID {args.kind}: {args.json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
