#!/usr/bin/env python3
"""Read-only GitHub release/commit/tag/source-byte consistency inspection.

This is NOT an independent publisher attestation, tag-governance proof or
release/install authorization. Every trust and promotion flag stays false.
"""
import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import stat
import sys
import urllib.parse
from pathlib import Path

from asf_agentkit_github_read import GitHubReader, ReadUnavailable
from build_candidate import PlanError, unique_pairs
from check_release_claim import path_issue
from validate_contracts import validate

SHA = re.compile(r"[0-9a-f]{40}\Z")
KIT = re.compile(r"[a-z0-9-]{1,60}\Z")
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
LOGIN = re.compile(r"[A-Za-z0-9-]{1,39}\Z")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
MAX_FILE = 1024 * 1024
MAX_TOTAL = 10 * MAX_FILE
MAX_FILES = 50


class EvidenceRefused(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise EvidenceRefused(reason)


def object_at(reader, path, label):
    value = reader.get(path)
    require(type(value) is dict, "invalid " + label + " response")
    return value


def source_bytes(reader, path, commit):
    """Get bounded source bytes at the exact SHA, never a mutable branch name."""
    endpoint = "/contents/" + urllib.parse.quote(path, safe="/") + "?ref=" + commit
    value = object_at(reader, endpoint, "source file")
    require(value.get("type") == "file" and value.get("path") == path and
            value.get("encoding") == "base64" and
            type(value.get("size")) is int and 0 <= value["size"] <= MAX_FILE and
            isinstance(value.get("content"), str), "invalid or oversized source file")
    try:
        raw = base64.b64decode(value["content"], validate=False)
        # GitHub may insert base64 newlines. Reject all other non-base64 chars.
        clean = value["content"].replace("\n", "")
        require(base64.b64encode(raw).decode("ascii") == clean,
                "non-canonical base64 source file")
    except (ValueError, binascii.Error):
        raise EvidenceRefused("invalid source encoding") from None
    require(len(raw) == value["size"] and len(raw) <= MAX_FILE,
            "source bytes/size mismatch")
    return raw


def load_local_manifest(path):
    """Local candidate bytes are untrusted until matched to GitHub's asset digest."""
    file = Path(path)
    # O_NOFOLLOW closes a symlink swap between checking and opening the path.
    with os.fdopen(os.open(file, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= 64 * 1024,
                "manifest must be a small regular file")
        raw = stream.read(64 * 1024 + 1)
        after = os.fstat(stream.fileno())
    require(len(raw) == before.st_size and before.st_size == after.st_size and
            before.st_ino == after.st_ino and before.st_mtime_ns == after.st_mtime_ns,
            "manifest changed during read")
    return raw


def inspect(reader, repository, kit, version, expected_publisher, raw):
    """Consistent evidence is useful, but deliberately never means trusted release."""
    result = {"kind": "github-release-evidence-inspection",
              "repository": repository, "kitId": kit, "kitVersion": version,
              "releaseEvidenceConsistent": False,
              "sourceProvenanceVerified": False,
              "trustEvidenceIndependentlyVerified": False,
              "tagGovernanceVerified": False,
              "promotionAllowed": False, "authorizedToExecute": False,
              "writesPerformed": False, "errors": []}
    try:
        require(bool(REPOSITORY.fullmatch(repository or "")), "invalid target repository")
        require(bool(KIT.fullmatch(kit or "")) and bool(VERSION.fullmatch(version or "")),
                "invalid kit/version")
        require(bool(LOGIN.fullmatch(expected_publisher or "")), "expected publisher required")
        tag = f"kits/{kit}/v{version}"
        repo = object_at(reader, "", "repository")
        require(repo.get("full_name") == repository and repo.get("default_branch") == "main" and
                type(repo.get("id")) is int and repo.get("archived") is False,
                "repository identity or default branch mismatch")
        branch = object_at(reader, "/branches/main", "main branch")
        main_sha = branch.get("commit", {}).get("sha") if type(branch.get("commit")) is dict else None
        require(isinstance(main_sha, str) and SHA.fullmatch(main_sha) and
                branch.get("protected") is True, "main SHA or protection not established")

        tag_path = urllib.parse.quote(tag, safe="")
        release = object_at(reader, "/releases/tags/" + tag_path, "release")
        require(release.get("tag_name") == tag and release.get("draft") is False and
                release.get("prerelease") is False and isinstance(release.get("published_at"), str) and
                release.get("published_at") and type(release.get("id")) is int and
                type(release.get("author")) is dict and
                release["author"].get("login") == expected_publisher,
                "published release or expected author not established")
        ref = object_at(reader, "/git/ref/tags/" + tag_path, "tag ref")
        target = ref.get("object")
        require(ref.get("ref") == "refs/tags/" + tag and type(target) is dict and
                target.get("type") == "tag" and isinstance(target.get("sha"), str) and
                SHA.fullmatch(target["sha"]), "expected annotated release tag not established")
        annotated = object_at(reader, "/git/tags/" + target["sha"], "annotated tag")
        source = annotated.get("object")
        require(annotated.get("tag") == tag and type(source) is dict and
                source.get("type") == "commit" and isinstance(source.get("sha"), str) and
                SHA.fullmatch(source["sha"]), "annotated tag does not target a commit")
        commit = source["sha"]

        ancestry = object_at(reader, "/compare/" + commit + "...main", "ancestry")
        merge_base = ancestry.get("merge_base_commit")
        require(ancestry.get("status") in ("identical", "ahead") and
                type(ancestry.get("behind_by")) is int and ancestry["behind_by"] == 0 and
                type(merge_base) is dict and merge_base.get("sha") == commit,
                "release commit not proven in main ancestry")
        # Re-read the head after comparison; fail on observed races. A true
        # atomic snapshot would require an additional host-side primitive.
        branch_after = object_at(reader, "/branches/main", "main branch recheck")
        require(type(branch_after.get("commit")) is dict and
                branch_after["commit"].get("sha") == main_sha and
                branch_after.get("protected") is True,
                "main branch moved or protection changed during inspection")

        require(type(raw) is bytes and 0 < len(raw) <= 64 * 1024,
                "missing or oversized local release manifest")
        try:
            manifest = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs,
                                  parse_constant=lambda _: (_ for _ in ()).throw(
                                      EvidenceRefused("non-finite manifest number")))
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise EvidenceRefused("invalid UTF-8 release manifest") from exc
        require(type(manifest) is dict and not validate("release", manifest),
                "release manifest schema invalid")
        require(manifest["sourceRepository"] == repository and manifest["kitId"] == kit and
                manifest["kitVersion"] == version and manifest["releaseTag"] == tag and
                manifest["sourceCommitSha"] == commit,
                "release manifest identity/commit mismatch")
        artifacts = manifest["artifacts"]
        paths = [item["path"] for item in artifacts]
        require(len(paths) <= MAX_FILES and len({p.casefold() for p in paths}) == len(paths) and
                all(path_issue(p) is None for p in paths),
                "ambiguous, unsafe or excessive artifact paths")

        assets = reader.get("/releases/" + str(release["id"]) + "/assets?per_page=100")
        require(type(assets) is list and len(assets) < 100,
                "release asset list not proven complete")
        manifest_assets = [a for a in assets if type(a) is dict and
                           a.get("name") == "release-manifest.json"]
        require(len(manifest_assets) == 1, "exactly one release manifest asset required")
        asset = manifest_assets[0]
        require(asset.get("state") == "uploaded" and type(asset.get("size")) is int and
                asset["size"] == len(raw) and
                asset.get("digest") == "sha256:" + hashlib.sha256(raw).hexdigest(),
                "release manifest asset digest/size mismatch")

        total = 0
        for item in artifacts:
            payload = source_bytes(reader, item["path"], commit)
            total += len(payload)
            require(total <= MAX_TOTAL and hashlib.sha256(payload).hexdigest() == item["sha256"],
                    "source artifact digest/size mismatch")
        result.update({"releaseEvidenceConsistent": True, "sourceCommitSha": commit,
                       "releaseTag": tag, "artifactCount": len(artifacts),
                       "manifestSha256": hashlib.sha256(raw).hexdigest()})
    except (EvidenceRefused, PlanError, ReadUnavailable, ValueError, KeyError, TypeError, OSError) as exc:
        # The error must remain a status, not an echo of untrusted remote data.
        result["errors"] = ["evidence unavailable or contradictory: " +
                            (exc.status if isinstance(exc, ReadUnavailable) else
                             str(exc) if isinstance(exc, EvidenceRefused) else "invalid response")]
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only non-authoritative GitHub release evidence")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--kit", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--expected-publisher", required=True)
    parser.add_argument("--manifest", required=True, help="Local, untrusted release candidate JSON")
    args = parser.parse_args(argv)
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print(json.dumps({"releaseEvidenceConsistent": False,
                          "sourceProvenanceVerified": False,
                          "writesPerformed": False,
                          "errors": ["read-only GitHub token unavailable"]}))
        return 3
    try:
        raw = load_local_manifest(args.manifest)
    except (EvidenceRefused, OSError) as exc:
        print(json.dumps({"releaseEvidenceConsistent": False,
                          "sourceProvenanceVerified": False,
                          "writesPerformed": False,
                          "errors": ["local manifest unavailable or unsafe"]}))
        return 3
    report = inspect(GitHubReader(args.repository, token), args.repository,
                     args.kit, args.version, args.expected_publisher, raw)
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    return 0 if report["releaseEvidenceConsistent"] else 3


if __name__ == "__main__":
    sys.exit(main())
