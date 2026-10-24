#!/usr/bin/env python3
"""Render AK-MVP-01 from an explicit file allowlist, without writing to a target.

This is a *local source* renderer, not an authenticated release installer. The
CLI/source verification/lock and the target checkout belong to AK-MVP-02.
"""
import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

from render_templates import RenderError, read_regular, unique_pairs

CATALOGUE = Path(__file__).resolve().parents[1]
TEMPLATES = "kits/opencode-openspec/templates/"
FILES = (
    ("agent-openspec.yml.tmpl", ".github/workflows/asf-agentkit-openspec.yml"),
    ("request.mjs.tmpl", ".asf/agentkit/runtime/request.mjs"),
    ("scope.mjs.tmpl", ".asf/agentkit/runtime/scope.mjs"),
    ("model-policy.mjs.tmpl", ".asf/agentkit/runtime/model-policy.mjs"),
    ("checklist.mjs.tmpl", ".asf/agentkit/runtime/checklist.mjs"),
    ("phase.sh.tmpl", ".asf/agentkit/runtime/phase.sh"),
    ("manual-acceptance.md.tmpl", ".asf/agentkit/manual-acceptance.md"),
    ("openspec-checklist.md.tmpl", ".asf/agentkit/openspec-checklist.md"),
    ("opsx-sync-quality.md.tmpl", ".asf/agentkit/opsx-sync-quality.md"),
)
FIELDS = frozenset({"schemaVersion", "targetRepository", "defaultBranch",
                    "taskPrefix", "taskDirectory", "checkScript", "appIdVar",
                    "appPrivateKeySecret", "openRouterSecret", "mutexGroup"})
TOKEN = re.compile(r"@@([A-Z_]+)@@")
REPO = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*\Z")
PREFIX = re.compile(r"[A-Z][A-Z0-9]{1,8}\Z")
SCRIPT = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}\Z")
GROUP = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\Z")
DIRECTORY = re.compile(r"[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*\Z")


def checked_config(config):
    if not isinstance(config, dict) or set(config) != FIELDS or type(config["schemaVersion"]) is not int or config["schemaVersion"] != 1:
        raise RenderError("invalid MVP config keys or schemaVersion")
    checks = {
        "targetRepository": REPO, "defaultBranch": BRANCH,
        "taskPrefix": PREFIX, "taskDirectory": DIRECTORY,
        "checkScript": SCRIPT, "appIdVar": IDENT,
        "appPrivateKeySecret": IDENT, "openRouterSecret": IDENT,
        "mutexGroup": GROUP,
    }
    for name, regex in checks.items():
        value = config[name]
        if not isinstance(value, str) or not regex.fullmatch(value):
            raise RenderError("invalid " + name)
    repo_parts = config["targetRepository"].split("/")
    if any(x in (".", "..") for x in repo_parts):
        raise RenderError("invalid targetRepository")
    branch = config["defaultBranch"]
    if ".." in branch or "//" in branch or branch.endswith(".") or branch.endswith("/") or branch.startswith("/") or any(x in (".", "..") for x in branch.split("/")):
        raise RenderError("unsafe defaultBranch")
    if any(x in (".", "..") for x in config["taskDirectory"].split("/")):
        raise RenderError("unsafe taskDirectory")
    return {name.upper(): value for name, value in config.items() if name != "schemaVersion"}


def render_mvp(source, config):
    root = Path(source).absolute()
    if root.is_symlink() or not root.is_dir():
        raise RenderError("invalid source root")
    variables = checked_config(config)
    files = []
    for src, destination in FILES:
        data = read_regular(root, TEMPLATES + src, 1024 * 1024)
        try:
            template = data.decode("utf-8")
        except UnicodeError as exc:
            raise RenderError("template is not UTF-8") from exc
        if "\0" in template or "\r" in template:
            raise RenderError("invalid template bytes")

        def replacement(match):
            try:
                return variables[match.group(1)]
            except KeyError as exc:
                raise RenderError("unknown template token: " + match.group(1)) from exc

        result = TOKEN.sub(replacement, template)
        if "@@" in result:
            raise RenderError("unresolved template delimiter")
        content = result.encode("utf-8")
        files.append({"path": destination,
                      "sha256": hashlib.sha256(content).hexdigest(),
                      "contentBase64": base64.b64encode(content).decode("ascii")})
    return {"kind": "ak-mvp-01-local-render", "kitId": "opencode-openspec",
            "sourceProvenanceVerified": False, "writesPerformed": False,
            "files": sorted(files, key=lambda item: item["path"])}


def main():
    parser = argparse.ArgumentParser(description="Render real MVP kit bytes (no install, no source attestation)")
    parser.add_argument("--source", default=str(CATALOGUE))
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    try:
        path = Path(args.config)
        if path.is_symlink() or path.stat().st_size > 65536:
            raise RenderError("invalid config file")
        config = json.loads(path.read_text("utf-8"), object_pairs_hook=unique_pairs)
        print(json.dumps(render_mvp(args.source, config), sort_keys=True, separators=(",", ":")))
        return 0
    except (RenderError, ValueError, TypeError, OSError) as exc:
        print("AK-MVP-01 FAIL-CLOSED: " + str(exc), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
