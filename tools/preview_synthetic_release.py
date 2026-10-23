"""SEC-02b-01: offline release evidence consistency, never provenance.

Only run against disposable, host-created fixture trees. All identities and
GitHub observations are synthetic caller inputs; success grants NOTHING.
"""
from __future__ import annotations

import hashlib
import re

from check_release_claim import inspect_claim
from inventory_fdrelative import inventory_fdrelative, FdInventoryError

SHA = re.compile(r"[a-f0-9]{40}\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")


class SyntheticReleaseError(ValueError):
    def __init__(self):
        super().__init__("SEC-02b DENY: synthetic release consistency failure")


def _exact(obj, keys):
    if type(obj) is not dict or set(obj) != set(keys):
        raise SyntheticReleaseError()
    return obj


def inspect_synthetic_release(claim, host_policy, observation,
                              artifact_root, manifest_bytes):
    """Check observed fixture bytes against simulated tag/permission fields.

    The host_policy and observation are NOT authenticated by this function.
    Never pass a real deployment path or user-supplied repository root.
    """
    try:
        if not inspect_claim(claim)["claimInternallyConsistent"]:
            raise SyntheticReleaseError()
        expected = _exact(host_policy, (
            "repository", "kitId", "tag", "commitSha", "checkAppId"))
        remote = _exact(observation, (
            "repository", "tag", "targetCommitSha", "mainProtected",
            "tagImmutable", "publisherAppId", "permissions", "manifestSha256"))
        rights = _exact(remote["permissions"], (
            "contentsRead", "metadataRead", "contentsWrite"))
        if (type(expected["checkAppId"]) is not int or expected["checkAppId"] <= 0 or
            type(remote["publisherAppId"]) is not int or
            not all(type(rights[k]) is bool for k in rights)):
            raise SyntheticReleaseError()
        if (not all(type(expected[k]) is str for k in (
                "repository", "kitId", "tag", "commitSha")) or
            SHA.fullmatch(expected["commitSha"]) is None or
            type(artifact_root) is not str or not artifact_root.startswith("/") or
            type(manifest_bytes) is not bytes or not 0 < len(manifest_bytes) <= 1048576):
            raise SyntheticReleaseError()
        if (expected["repository"] != claim["sourceRepository"] or
            expected["kitId"] != claim["kitId"] or
            expected["tag"] != claim["releaseTag"] or
            expected["commitSha"] != claim["sourceCommitSha"] or
            remote["repository"] != expected["repository"] or
            remote["tag"] != expected["tag"] or
            remote["targetCommitSha"] != expected["commitSha"] or
            remote["publisherAppId"] != expected["checkAppId"] or
            remote["mainProtected"] is not True or
            remote["tagImmutable"] is not True or
            rights != {"contentsRead": True, "metadataRead": True, "contentsWrite": False} or
            type(remote["manifestSha256"]) is not str or
            HEX.fullmatch(remote["manifestSha256"]) is None or
            hashlib.sha256(manifest_bytes).hexdigest() != claim["manifestSha256"] or
            remote["manifestSha256"] != claim["manifestSha256"]):
            raise SyntheticReleaseError()
        paths = [entry["path"] for entry in claim["artifacts"]]
        inventory = inventory_fdrelative(artifact_root, expected["commitSha"], paths)
        expected_files = {a["path"]: a["sha256"] for a in claim["artifacts"]}
        if (len(inventory["files"]) != len(expected_files) or
            any(row["sha256"] != expected_files[row["path"]]
                for row in inventory["files"])):
            raise SyntheticReleaseError()
        return {
            "kind": "sec02b-synthetic-release-byte-preview",
            "syntheticEvidenceConsistent": True,
            "disposableArtifactBytesMatched": True,
            "artifactCount": len(expected_files),
            "hostIndependentlyAuthenticated": False,
            "sourceProvenanceVerified": False,
            "trustEvidenceIndependentlyVerified": False,
            "promotionAllowed": False,
            "authorizedToExecute": False,
            "writesPerformed": False,
            "paidApprovalRequired": True,
        }
    except (ValueError, TypeError, KeyError, FdInventoryError, OSError):
        raise SyntheticReleaseError() from None
