"""Explicit, App-authenticated draft-PR publisher for the AgentKit MVP.

Only fixed GitHub API endpoints are reachable. It creates a new unprotected
ordinary branch and draft PR; it never edits settings, secrets, workflows in
place, an existing branch, or the configured default branch.
"""
import base64
import json
import re
import urllib.error
import urllib.request

from asf_agentkit_github_read import NoRedirect, ReadUnavailable

SHA = re.compile(r"[0-9a-f]{40}\Z")
BRANCH = re.compile(r"asf-agentkit/install-[a-z0-9](?:[a-z0-9-]{0,45}[a-z0-9])?\Z")


class PublishRefused(Exception):
    pass


def read_json_response(request):
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise PublishRefused("Oversized GitHub publication response")
        return json.loads(data.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ReadUnavailable("http-" + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError, UnicodeError, ValueError):
        raise ReadUnavailable("network-or-malformed-response") from None


class GitHubAppIssuer:
    """JWT-authenticated App API, limited to observing and minting one token."""

    def __init__(self, repository, app_jwt):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or not app_jwt:
            raise PublishRefused("Expected GitHub App JWT and target repository required")
        self.repository = repository
        self.jwt = app_jwt

    def request(self, method, path, payload=None):
        installation_path = "/repos/" + self.repository + "/installation"
        if not ((method == "GET" and path == installation_path and payload is None) or
                (method == "POST" and re.fullmatch(r"/app/installations/[1-9][0-9]*/access_tokens", path)
                 and isinstance(payload, dict))):
            raise PublishRefused("GitHub App JWT request outside audited endpoint allowlist")
        req = urllib.request.Request("https://api.github.com" + path,
            data=None if payload is None else json.dumps(payload, separators=(",", ":")).encode(),
            method=method,
            headers={"Accept": "application/vnd.github+json",
                     "Content-Type": "application/json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "Authorization": "Bearer " + self.jwt,
                     "User-Agent": "asf-agentkit-one-repo-app-issuer"})
        return read_json_response(req)


def mint_target_writer(issuer, repository, expected_app_id):
    """Mint a short-lived token for exactly one repo, with no admin grants."""
    if type(expected_app_id) is not int or expected_app_id <= 0:
        raise PublishRefused("Expected numeric GitHub App ID is required")
    try:
        inst = required_dict(issuer.request("GET", "/repos/" + repository + "/installation"),
                             "authenticated App installation")
        permissions = required_dict(inst.get("permissions"), "App installation permissions")
        if (inst.get("app_id") != expected_app_id or type(inst.get("id")) is not int or inst["id"] <= 0 or
                permissions.get("contents") != "write" or permissions.get("pull_requests") != "write"):
            raise PublishRefused("Wrong App or insufficient installation permissions")
        token_info = required_dict(
            issuer.request("POST", "/app/installations/" + str(inst["id"]) +
                           "/access_tokens", {
                "repositories": [repository.split("/")[1]],
                "permissions": {"contents": "write", "pull_requests": "write"}}),
            "scoped token issuance")
        token = token_info.get("token")
        if (not isinstance(token, str) or not token or
                not isinstance(token_info.get("permissions"), dict) or
                token_info["permissions"].get("contents") != "write" or
                token_info["permissions"].get("pull_requests") != "write"):
            raise PublishRefused("Scoped App token permissions not confirmed")
        return GitHubDraftWriter(repository, token)
    except ReadUnavailable as exc:
        raise PublishRefused("GitHub App identity/token scope refused (" + exc.status + ")") from None


class GitHubDraftWriter:
    """Small single-path REST transport; no caller-selected arbitrary URLs."""

    def __init__(self, repository, token):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or not token:
            raise PublishRefused("Exact target repository and configured token required")
        self.prefix = "https://api.github.com/repos/" + repository
        self.token = token

    def request(self, method, path, payload=None):
        allowed_get = (
            path == "" or
            path == "/installation/repositories?per_page=100" or
            bool(re.fullmatch(r"/branches/[A-Za-z0-9_.%-]+", path)) or
            bool(re.fullmatch(r"/git/ref/heads/asf-agentkit/install-[a-z0-9-]+", path)) or
            bool(re.fullmatch(r"/git/commits/[0-9a-f]{40}", path)) or
            bool(re.fullmatch(r"/git/trees/[0-9a-f]{40}\?recursive=1", path)) or
            bool(re.fullmatch(r"/pulls\?state=open&head=[A-Za-z0-9_.-]+%3Aasf-agentkit%2Finstall-[a-z0-9-]+&per_page=100", path))
        )
        allowed_post = path in ("/git/blobs", "/git/trees", "/git/commits", "/git/refs", "/pulls")
        if not ((method == "GET" and allowed_get and payload is None) or
                (method == "POST" and allowed_post and isinstance(payload, dict))):
            raise PublishRefused("GitHub request outside audited publication allowlist")
        data = None if method == "GET" else json.dumps(payload, separators=(",", ":")).encode()
        url = ("https://api.github.com/installation/repositories?per_page=100"
               if path == "/installation/repositories?per_page=100" else self.prefix + path)
        req = urllib.request.Request(url, data=data, method=method,
            headers={"Accept": "application/vnd.github+json",
                     "Content-Type": "application/json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "Authorization": "Bearer " + self.token,
                     "User-Agent": "asf-agentkit-explicit-draft-publisher"})
        return read_json_response(req)


def required_dict(value, label):
    if not isinstance(value, dict):
        raise PublishRefused("Unexpected GitHub " + label + " response")
    return value


def sha_from(value, label):
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise PublishRefused("Invalid SHA in " + label)
    return value


def ensure_base(writer, base_branch, expected_sha):
    response = required_dict(writer.request("GET", "/branches/" + base_branch), "branch")
    actual = sha_from(required_dict(response.get("commit"), "branch commit").get("sha"), "branch")
    if actual != expected_sha:
        raise PublishRefused("Target base SHA moved; refuse publication")


def remote_tree_is_create_only(tree, paths):
    if not isinstance(tree, dict) or tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise PublishRefused("Incomplete or invalid remote Git tree")
    wanted = set(paths)
    for item in tree["tree"]:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not isinstance(item.get("type"), str):
            raise PublishRefused("Malformed remote tree entry")
        path = item["path"]
        for wanted_path in wanted:
            parts = wanted_path.split("/")
            parents = ["/".join(parts[:i]) for i in range(1, len(parts))]
            if path.casefold() == wanted_path.casefold():
                raise PublishRefused("Managed path already exists in remote base: " + wanted_path)
            for parent in parents:
                if path.casefold() == parent.casefold() and (path != parent or item["type"] != "tree"):
                    raise PublishRefused("Remote managed parent conflicts: " + parent)


def remote_preflight(writer, repository, base_branch, expected_sha, new_branch,
                     paths):
    if not BRANCH.fullmatch(new_branch or "") or new_branch == base_branch:
        raise PublishRefused("Draft must use a new ordinary asf-agentkit/install-* branch")
    if (not SHA.fullmatch(expected_sha or "") or
            not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,80}", base_branch or "") or
            ".." in base_branch or base_branch.endswith((".", ".lock"))):
        raise PublishRefused("Exact base branch and full SHA required")

    metadata = required_dict(writer.request("GET", ""), "repository")
    if (metadata.get("full_name") != repository or metadata.get("default_branch") != base_branch or
            type(metadata.get("id")) is not int):
        raise PublishRefused("GitHub target repository/base identity mismatch")
    scoped = required_dict(writer.request("GET", "/installation/repositories?per_page=100"),
                           "installation token repository scope")
    repos = scoped.get("repositories")
    if (type(scoped.get("total_count")) is not int or scoped["total_count"] != 1 or
            not isinstance(repos, list) or len(repos) != 1 or
            not isinstance(repos[0], dict) or repos[0].get("full_name") != repository or
            repos[0].get("id") != metadata["id"]):
        raise PublishRefused("Token not proven to be scoped to exactly the target repository")
    ensure_base(writer, base_branch, expected_sha)
    try:
        writer.request("GET", "/git/ref/heads/" + new_branch)
    except ReadUnavailable as exc:
        if exc.status != "http-404":
            raise
    else:
        raise PublishRefused("Target draft branch already exists")
    owner = repository.split("/")[0]
    query = "/pulls?state=open&head=" + owner + "%3A" + new_branch.replace("/", "%2F") + "&per_page=100"
    existing = writer.request("GET", query)
    if not isinstance(existing, list) or existing:
        raise PublishRefused("Duplicate PR or unverified pull-request pagination")

    commit = required_dict(writer.request("GET", "/git/commits/" + expected_sha), "base commit")
    tree_sha = sha_from(required_dict(commit.get("tree"), "base tree").get("sha"), "base tree")
    tree = writer.request("GET", "/git/trees/" + tree_sha + "?recursive=1")
    remote_tree_is_create_only(tree, paths)
    return tree_sha


def publish_draft(writer, repository, base_branch, expected_sha, new_branch,
                  expected_plan_sha, plan_sha, files, lock_bytes):
    """Publish a preapproved create-only deterministic file set, never merging."""
    if not re.fullmatch(r"[0-9a-f]{64}", expected_plan_sha or ""):
        raise PublishRefused("Exact dry-run plan SHA-256 required")
    if expected_plan_sha != plan_sha:
        raise PublishRefused("Dry-run plan digest differs; rerun and inspect dry-run")
    if any(not isinstance(path, str) or not isinstance(content, bytes) for path, content in files.items()):
        raise PublishRefused("Untrusted publication file set")
    from asf_agentkit_cli import ALLOWED, LOCK_PATH
    if set(files) != ALLOWED or not isinstance(lock_bytes, bytes):
        raise PublishRefused("Publication must contain exactly reviewed files and lock")
    try:
        lock = json.loads(lock_bytes)
        source_sha = lock["sourceCommitSha"]
        if not SHA.fullmatch(source_sha):
            raise ValueError("Invalid pinned source SHA")
    except (ValueError, KeyError, TypeError):
        raise PublishRefused("Invalid locked source identity") from None
    all_files = dict(files)
    all_files[LOCK_PATH] = lock_bytes
    elements = []
    try:
        tree_sha = remote_preflight(writer, repository, base_branch, expected_sha,
                                   new_branch, all_files)
        for path, content in sorted(all_files.items()):
            response = required_dict(writer.request("POST", "/git/blobs", {
                "content": base64.b64encode(content).decode("ascii"), "encoding": "base64"}), "blob")
            elements.append({"path": path, "mode": "100644", "type": "blob",
                             "sha": sha_from(response.get("sha"), "blob")})
        new_tree = required_dict(writer.request("POST", "/git/trees", {
            "base_tree": tree_sha, "tree": elements}), "proposed tree")
        result = required_dict(writer.request("POST", "/git/commits", {
            "message": "chore(agentkit): propose pinned OpenCode+OpenSpec installation",
            "tree": sha_from(new_tree.get("sha"), "new tree"),
            "parents": [expected_sha]}), "proposed commit")
        new_sha = sha_from(result.get("sha"), "new commit")
        ensure_base(writer, base_branch, expected_sha)
        writer.request("POST", "/git/refs", {
            "ref": "refs/heads/" + new_branch, "sha": new_sha})
        created = required_dict(writer.request("GET", "/git/ref/heads/" + new_branch),
                                "created head ref")
        actual_new_sha = sha_from(required_dict(created.get("object"), "head object").get("sha"),
                                  "head ref")
        if actual_new_sha != new_sha:
            raise PublishRefused("Created branch moved; leave for manual inspection without PR")
        # A post-write drift does not justify a PR against a different base.
        ensure_base(writer, base_branch, expected_sha)
        pr = required_dict(writer.request("POST", "/pulls", {
            "title": "AgentKit: proposed pinned OpenCode+OpenSpec installation",
            "head": new_branch, "base": base_branch, "draft": True,
            "body": "Draft only. Exact AgentKit development source commit: " +
                    source_sha +
                    "\n\nReview generated workflow, App permissions, required secrets/rulesets, and " +
                    "independent CI on the exact PR SHA. No model execution or automatic merge."}), "draft PR")
    except ReadUnavailable as exc:
        raise PublishRefused("GitHub API refused publication (" + exc.status +
                             "); inspect branch/PR state before any retry") from None
    if (type(pr.get("number")) is not int or pr["number"] <= 0 or pr.get("draft") is not True or
            not isinstance(pr.get("head"), dict) or pr["head"].get("ref") != new_branch or
            pr["head"].get("sha", new_sha) != new_sha or
            not isinstance(pr.get("base"), dict) or pr["base"].get("ref") != base_branch):
        raise PublishRefused("GitHub PR response ambiguous; inspect remote before any retry")
    return {"status": "draft-pr-created", "repository": repository,
            "baseBranch": base_branch, "approvedBaseSha": expected_sha,
            "headBranch": new_branch, "headSha": new_sha,
            "pullRequest": "https://github.com/" + repository + "/pull/" + str(pr["number"]),
            "draft": True, "ciStatus": "pending-independent-exact-sha-validation",
            "merged": False, "paidModelInvoked": False, "settingsChanged": False}
