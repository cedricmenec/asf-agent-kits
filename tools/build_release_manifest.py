#!/usr/bin/env python3
"""Build the v1 release manifest from one exact Git commit, without writes."""
import argparse
import json
import re
import sys
from pathlib import Path

from build_candidate import (PlanError, build_git_candidate, git_artifact_bytes,
                            manifest_bytes, pinned_openspec_runtime, unique_pairs)

REPOSITORY = "cedricmenec/asf-agent-kits"
KIT = "opencode-openspec"
RELEASE_PATHS = (
    "bin/asf-agentkit",
    "docs/ak-mvp-02-cli.md",
    "docs/first-release-v1.0.0.md",
    "docs/qualification-quickstart.md",
    "kits/opencode-openspec/kit.json",
    "kits/opencode-openspec/mvp-config.example.json",
    "kits/opencode-openspec/version.json",
    "kits/opencode-openspec/templates/agent-openspec.yml.tmpl",
    "kits/opencode-openspec/templates/checklist.mjs.tmpl",
    "kits/opencode-openspec/templates/manual-acceptance.md.tmpl",
    "kits/opencode-openspec/templates/model-policy.mjs.tmpl",
    "kits/opencode-openspec/templates/openspec-checklist.md.tmpl",
    "kits/opencode-openspec/templates/opsx-sync-quality.md.tmpl",
    "kits/opencode-openspec/templates/phase.sh.tmpl",
    "kits/opencode-openspec/templates/request.mjs.tmpl",
    "kits/opencode-openspec/templates/scope.mjs.tmpl",
    "requirements-contracts.txt",
    "schemas/release.schema.json",
    "tools/asf_agentkit_cli.py",
    "tools/asf_agentkit_github_read.py",
    "tools/asf_agentkit_publish.py",
    "tools/build_candidate.py",
    "tools/build_release_manifest.py",
    "tools/plan_install.py",
    "tools/render_mvp_kit.py",
    "tools/render_templates.py",
    "tools/validate_contracts.py",
)


def descriptor(source, commit):
    root = Path(source).absolute()
    raw = git_artifact_bytes(root, commit, f"kits/{KIT}/version.json")
    try:
        version = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise PlanError("invalid pinned kit version metadata") from exc
    if (type(version) is not dict or version.get("schemaVersion") != 1 or
            version.get("distribution") != "user-pinned-git-commit" or
            version.get("releaseStatus") != "stable" or
            not isinstance(version.get("kitVersion"), str) or
            not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)",
                             version["kitVersion"])):
        raise PlanError("pinned source is not a stable SemVer kit release")
    kit_json = json.loads(
        git_artifact_bytes(root, commit, f"kits/{KIT}/kit.json").decode("utf-8"),
        object_pairs_hook=unique_pairs)
    expected_tag = f"kits/{KIT}/v{version['kitVersion']}"
    if (type(kit_json) is not dict or kit_json.get("id") != KIT or
            kit_json.get("release") != {
            "version": version["kitVersion"], "tag": expected_tag,
            "distribution": "user-pinned-git-commit"}):
        raise PlanError("pinned kit descriptor and version metadata disagree")
    return {
        "schemaVersion": 1,
        "kitId": KIT,
        "kitVersion": version["kitVersion"],
        "coreVersion": version["kitVersion"],
        "sourceRepository": REPOSITORY,
        "sourceCommitSha": commit,
        "releaseTag": expected_tag,
        "runtime": pinned_openspec_runtime(root, commit),
        "paths": list(RELEASE_PATHS),
    }


def build_release_manifest(source, commit):
    document = descriptor(source, commit)
    return build_git_candidate(source, commit, document)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Build a deterministic, read-only release manifest from an exact Git commit")
    parser.add_argument("--source", required=True, help="Local AgentKit Git checkout")
    parser.add_argument("--source-commit", required=True, help="Full 40-character Git commit SHA")
    args = parser.parse_args(argv)
    try:
        manifest = build_release_manifest(args.source, args.source_commit)
        sys.stdout.buffer.write(manifest_bytes(manifest))
        return 0
    except (PlanError, OSError, ValueError, KeyError, TypeError) as exc:
        print("RELEASE MANIFEST REFUSED: " + str(exc), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
