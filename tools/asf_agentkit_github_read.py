"""Optional read-only GitHub doctor. Never sends/prints secret values."""
import json
import re
import urllib.error
import urllib.parse
import urllib.request


class ReadUnavailable(Exception):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ReadUnavailable("unexpected-redirect")


class GitHubReader:
    def __init__(self, repository, token):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or not token:
            raise ValueError("Exact repository and configured token are required")
        self.prefix = "https://api.github.com/repos/" + repository
        self.token = token

    def get(self, path):
        if path and (not path.startswith("/") or ".." in path or "//" in path):
            raise ValueError("Unsupported GitHub read path")
        request = urllib.request.Request(self.prefix + path, method="GET",
            headers={"Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "Authorization": "Bearer " + self.token,
                     "User-Agent": "asf-agentkit-readonly-doctor"})
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=8) as response:
                data = response.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                raise ReadUnavailable("oversized-response")
            return json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise ReadUnavailable("http-" + str(exc.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError, UnicodeError, ValueError):
            raise ReadUnavailable("network-or-malformed-response") from None


def read_safe(reader, path):
    try:
        return reader.get(path), None
    except ReadUnavailable as exc:
        return None, exc.status


def collection_names(reader, path, key, required):
    data, unavailable = read_safe(reader, path)
    if unavailable:
        return {"state": "unknown", "reason": unavailable}
    if not isinstance(data, dict) or type(data.get("total_count")) is not int or (
            not isinstance(data.get(key), list)):
        return {"state": "unknown", "reason": "invalid-paged-response"}
    if data["total_count"] > len(data[key]):
        return {"state": "unknown", "reason": "incomplete-pagination"}
    names = [item.get("name") for item in data[key] if isinstance(item, dict)]
    if not all(isinstance(name, str) for name in names):
        return {"state": "unknown", "reason": "invalid-name-list"}
    # Explicitly NEVER return values carried by the Actions variables API.
    return {"state": "observed", "required": {
        name: "present" if name in names else "absent" for name in required}}


def remote_doctor(repo, config, reader):
    result = {"kind": "read-only-github-doctor", "repository": repo,
              "writesPerformed": False, "secretsDisplayed": False}
    metadata, error = read_safe(reader, "")
    if error:
        result["repositoryMetadata"] = {"state": "unknown", "reason": error}
    elif not isinstance(metadata, dict) or metadata.get("full_name") != repo:
        result["repositoryMetadata"] = {"state": "unknown", "reason": "unexpected-identity"}
    else:
        perms = metadata.get("permissions")
        result["repositoryMetadata"] = {
            "state": "observed", "defaultBranch": metadata.get("default_branch"),
            "defaultBranchMatchesConfig": metadata.get("default_branch") == config["defaultBranch"],
            "callerPermissions": {k: bool(perms[k]) for k in ("pull", "push", "admin")
                                  if isinstance(perms, dict) and type(perms.get(k)) is bool}}

    result["variables"] = collection_names(
        reader, "/actions/variables?per_page=100", "variables", [config["appIdVar"]])
    result["secrets"] = collection_names(
        reader, "/actions/secrets?per_page=100", "secrets",
        [config["appPrivateKeySecret"], config["openRouterSecret"]])

    app, error = read_safe(reader, "/installation")
    result["githubApp"] = {"state": "unknown", "reason": error} if error else (
        {"state": "observed-installation", "appId": app["app_id"]}
        if isinstance(app, dict) and type(app.get("app_id")) is int
        else {"state": "unknown", "reason": "invalid-installation-response"})

    rules, error = read_safe(reader, "/rulesets?includes_parents=true&per_page=100")
    result["rulesets"] = {"state": "unknown", "reason": error} if error else (
        {"state": "observed-summaries-require-manual-applicability-review",
         "activeCount": sum(x.get("enforcement") == "active" for x in rules)}
        if isinstance(rules, list) and len(rules) < 100 and all(isinstance(x, dict) for x in rules)
        else {"state": "unknown", "reason": "incomplete-or-invalid-ruleset-list"})

    workflows = collection_names(
        reader, "/actions/workflows?per_page=100", "workflows", [])
    # The workflows API returns path/state rather than a simple name contract;
    # never turn a generic list into positive activation evidence.
    result["workflows"] = {"state": "unknown", "reason": "needs-explicit-path-review"} \
        if workflows["state"] == "observed" else workflows

    branch_path = "/branches/" + urllib.parse.quote(config["defaultBranch"], safe="")
    branch, error = read_safe(reader, branch_path)
    if error:
        result["branch"] = {"state": "unknown", "reason": error}
    elif not isinstance(branch, dict) or not isinstance(branch.get("commit"), dict) or (
            not re.fullmatch(r"[0-9a-f]{40}", str(branch["commit"].get("sha", "")))):
        result["branch"] = {"state": "unknown", "reason": "invalid-branch-observation"}
    else:
        sha = branch["commit"]["sha"]
        result["branch"] = {"state": "observed", "headSha": sha,
                            "protectedFlag": branch.get("protected") if type(branch.get("protected")) is bool else None}
        checks = collection_names(
            reader, "/commits/" + sha + "/check-runs?per_page=100",
            "check_runs", [])
        # Check-runs do not establish which checks are required by a ruleset.
        result["checks"] = {"state": "observed-require-manual-required-check-review"} \
            if checks["state"] == "observed" else checks
    return result
