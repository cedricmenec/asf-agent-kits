"""R5b-02a: consultative PR publication preflight, without any write/API.

ALL observations are caller-supplied mocks; never convert them into authority.
No network, filesystem, tokens, GitHub mutations, subprocesses or LLM calls.
"""
from __future__ import annotations

import re

SHA = re.compile(r"[a-f0-9]{40}\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")
REPO = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}/"
                  r"[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\Z")
VERSION = re.compile(r"(0|[1-9][0-9]{0,8})\."
                     r"(0|[1-9][0-9]{0,8})\."
                     r"(0|[1-9][0-9]{0,8})\Z")
KIT_IDS = {"opencode-direct", "opencode-openspec"}

PLAN_FIELDS = {
    "kind", "mode", "kitId", "candidateVersion", "candidateCommitSha",
    "draftTitlePreview", "status", "conflicts", "files",
    "githubPrCreated", "filesystemSnapshotAtomic", "independentlyVerifiedRelease",
    "sourceProvenanceVerified", "trustEvidenceIndependentlyVerified",
    "authorizedToExecute", "promotionAllowed", "writesPerformed",
    "paidApprovalRequired",
}
HOST_FIELDS = {
    "repository", "repositoryId", "baseBranch", "baseSha",
    "requiredCheckContext", "expectedCheckAppId", "proposedBranch",
}
OBS_FIELDS = {
    "repository", "repositoryId", "baseBranch", "baseSha",
    "baseProtected", "checkContext", "checkHeadSha", "checkAppId",
    "checkConclusion", "activePublisherRuns", "matchingOpenPullRequests",
    "proposedBranchExists", "observedAtSeconds", "nowSeconds",
}
NON_GRANTS = (
    "githubPrCreated", "filesystemSnapshotAtomic",
    "independentlyVerifiedRelease", "sourceProvenanceVerified",
    "trustEvidenceIndependentlyVerified", "authorizedToExecute",
    "promotionAllowed", "writesPerformed",
)


class OfflinePublisherError(ValueError):
    def __init__(self):
        super().__init__("R5b-02a DENY: untrusted PR publication observation")


def _deny():
    raise OfflinePublisherError()


def _exact(value, keys):
    if type(value) is not dict or set(value) != keys:
        _deny()
    return value


def _positive(value):
    return type(value) is int and 0 < value <= 2**53-1


def _safe_path(path):
    if (type(path) is not str or not path.isascii() or
        len(path) > 320 or not path.startswith(".asf/agentkit/")):
        _deny()
    parts = path.split("/")
    reserved = {".git", ".github", ".asf", ".agents", ".opencode", "node_modules",
                "AGENTS.md", "ChatGPT.md", "opencode.json"}
    if (len(parts) < 3 or any(not x or x in (".", "..") for x in parts) or
        any(p.casefold() in {n.casefold() for n in reserved} for p in parts[2:]) or
        any(x.casefold().startswith(".env") or
            x.casefold().endswith((".pem", ".p12", ".pfx", ".key"))
            for x in parts) or
        any(ord(x) < 32 or ord(x) == 127 for x in path) or
        "\\" in path or ":" in path):
        _deny()
    return path


def _plan(plan):
    _exact(plan, PLAN_FIELDS)
    kit, version, sha = plan["kitId"], plan["candidateVersion"], plan["candidateCommitSha"]
    if (kit not in KIT_IDS or type(kit) is not str or
        type(version) is not str or VERSION.fullmatch(version) is None or
        type(sha) is not str or SHA.fullmatch(sha) is None or
        plan["mode"] not in ("new-install", "upgrade") or
        plan["kind"] != "r5b01-untrusted-draft-pr-plan" or
        plan["status"] != "review-preview-only" or
        type(plan["conflicts"]) is not int or plan["conflicts"] != 0 or
        plan["draftTitlePreview"] != f"AgentKit (UNVERIFIED): {kit} v{version}" or
        any(plan[field] is not False for field in NON_GRANTS) or
        plan["paidApprovalRequired"] is not True):
        _deny()
    rows = plan["files"]
    if type(rows) is not list or not 1 <= len(rows) <= 250:
        _deny()
    seen = set()
    for entry in rows:
        _exact(entry, {"path", "action", "declaredSha256"})
        path = _safe_path(entry["path"])
        key = path.casefold()
        if key in seen or any(key.startswith(p + "/") or p.startswith(key + "/")
                              for p in seen):
            _deny()
        seen.add(key)
        if (entry["action"] not in ("create", "unchanged") or
            type(entry["declaredSha256"]) is not str or
            HEX.fullmatch(entry["declaredSha256"]) is None or
            (plan["mode"] == "new-install" and entry["action"] != "create")):
            _deny()
    return kit, version, len(rows)


def preview_pr_publication(plan, host_policy, observation):
    """Validate mock inputs and return NO permission to create a real PR.

    Ref movement between observation and write is unaddressed; only a future
    separately approved GitHub host with atomic CAS may perform real writes.
    """
    try:
        kit, version, count = _plan(plan)
        host = _exact(host_policy, HOST_FIELDS)
        obs = _exact(observation, OBS_FIELDS)
        if (type(host["repository"]) is not str or
            REPO.fullmatch(host["repository"]) is None or
            host["repository"].find("..") != -1 or
            not _positive(host["repositoryId"]) or
            type(host["baseBranch"]) is not str or
            re.fullmatch(r"[A-Za-z][A-Za-z0-9/_-]{0,99}", host["baseBranch"]) is None or
            ".." in host["baseBranch"] or "//" in host["baseBranch"] or
            type(host["baseSha"]) is not str or
            SHA.fullmatch(host["baseSha"]) is None or
            host["baseSha"] == plan["candidateCommitSha"] or
            host["requiredCheckContext"] != "check" or
            not _positive(host["expectedCheckAppId"]) or
            host["proposedBranch"] != f"agentkit/{plan['mode']}/{kit}/v{version}"):
            _deny()
        if (obs["repository"] != host["repository"] or
            type(obs["repositoryId"]) is not int or
            obs["repositoryId"] != host["repositoryId"] or
            obs["baseBranch"] != host["baseBranch"] or
            obs["baseSha"] != host["baseSha"] or
            obs["baseProtected"] is not True or
            obs["checkContext"] != host["requiredCheckContext"] or
            obs["checkHeadSha"] != host["baseSha"] or
            type(obs["checkAppId"]) is not int or
            obs["checkAppId"] != host["expectedCheckAppId"] or
            obs["checkConclusion"] != "success" or
            type(obs["activePublisherRuns"]) is not int or
            obs["activePublisherRuns"] != 0 or
            type(obs["matchingOpenPullRequests"]) is not int or
            obs["matchingOpenPullRequests"] != 0 or
            obs["proposedBranchExists"] is not False or
            type(obs["observedAtSeconds"]) is not int or
            type(obs["nowSeconds"]) is not int or
            obs["observedAtSeconds"] < 0 or
            obs["nowSeconds"] < obs["observedAtSeconds"] or
            obs["nowSeconds"] - obs["observedAtSeconds"] > 300 or
            obs["nowSeconds"] > 2**53-1):
            _deny()
        return {
            "kind": "r5b02a-untrusted-publication-preflight",
            "kitId": kit, "candidateVersion": version,
            "plannedFileCount": count,
            "syntheticTargetBranch": host["baseBranch"],
            "syntheticTargetHeadSha": host["baseSha"],
            "proposedUncreatedBranch": host["proposedBranch"],
            "syntheticObservationsConsistent": True,
            "githubPrCreated": False,
            "hostIndependentlyAuthenticated": False,
            "targetRefCasVerified": False,
            "sourceProvenanceVerified": False,
            "trustEvidenceIndependentlyVerified": False,
            "authorizedToPublish": False,
            "authorizedToExecute": False,
            "promotionAllowed": False,
            "writesPerformed": False,
            "paidApprovalRequired": True,
        }
    except (OfflinePublisherError, TypeError, ValueError, KeyError, AttributeError):
        raise OfflinePublisherError() from None
