#!/usr/bin/env python3
"""AK-MVP-02 local, pinned-source, non-destructive CLI.

This implements local read-only install/upgrade plans, status and doctor;
create-only local branch application is deliberately explicit. Remote PR
publication and authenticated GitHub setup remain AK-MVP-03.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

from render_mvp_kit import FILES, TEMPLATES, RenderError, checked_config, render_mvp
from render_templates import unique_pairs
from asf_agentkit_github_read import GitHubReader, remote_doctor

LOCK_PATH = ".asf/agentkit.lock.json"
REPO = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
MAX_FILE = 1024 * 1024
ALLOWED = frozenset(path for _, path in FILES)


class CliError(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return (json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("utf-8")


def git(root, *args):
    try:
        return subprocess.run(["git", "-C", str(root), *args], check=True,
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=20).stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise CliError("Git observation failed: " + " ".join(args[:2])) from exc


def origin(value):
    if not isinstance(value, str):
        return None
    matches = [
        re.fullmatch(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:\.git)?", value),
        re.fullmatch(r"git@github\.com:([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:\.git)?", value),
    ]
    match = next((m for m in matches if m), None)
    if match is None:
        return None
    name = match.group(1)
    return name[:-4] if name.endswith(".git") else name


def checkout(path, expected_repo):
    root = Path(path).absolute()
    if root.is_symlink() or not root.is_dir() or not REPO.fullmatch(expected_repo):
        raise CliError("Explicit existing target checkout and owner/repo required")
    remote = origin(git(root, "remote", "get-url", "origin").decode().strip())
    if remote != expected_repo:
        raise CliError("Target remote does not match --repo")
    return root


def safe_member(root, relative):
    if relative not in ALLOWED and relative != LOCK_PATH:
        raise CliError("Path is outside the reviewed AgentKit file allowlist")
    current = root
    missing_parent = False
    for part in relative.split("/"):
        if not missing_parent:
            if not current.is_dir() or current.is_symlink():
                raise CliError("Non-directory or symlink parent: " + relative)
            for item in current.iterdir():
                if item.name.casefold() == part.casefold() and item.name != part:
                    raise CliError("Case-colliding target path: " + relative)
        current = current / part
        if not missing_parent:
            if current.is_symlink():
                raise CliError("Symlink in target path: " + relative)
            if not current.exists():
                missing_parent = True
    return current


def observed(root, relative):
    path = safe_member(root, relative)
    if not path.exists():
        return None
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise CliError("Safe local audit requires O_NOFOLLOW and O_DIRECTORY")
    fd = parent_fd(root, relative)
    try:
        try:
            leaf = os.open(relative.split("/")[-1],
                           os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        except FileNotFoundError:
            return None
        with os.fdopen(leaf, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > MAX_FILE:
                raise CliError("Non-regular, hardlinked or oversized managed path: " + relative)
            data = stream.read(MAX_FILE + 1)
            after = os.fstat(stream.fileno())
        if len(data) > MAX_FILE or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
            raise CliError("Managed file changed during audit: " + relative)
        return data
    finally:
        os.close(fd)


def read_lock(target):
    raw = observed(target, LOCK_PATH)
    if raw is None:
        return None
    try:
        lock = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs)
    except (ValueError, UnicodeDecodeError) as exc:
        raise CliError("Invalid lock JSON") from exc
    expected = {"schemaVersion", "kitId", "version", "sourceRepository", "sourceCommitSha",
                "sourceTrust", "targetRepository", "configurationSha256", "managedFiles"}
    if not isinstance(lock, dict) or set(lock) != expected or lock["schemaVersion"] != 2 or (
            type(lock["schemaVersion"]) is not int):
        raise CliError("Lock is not the exact local-source schema v2; manual migration required")
    if (lock["kitId"] != "opencode-openspec" or not VERSION.fullmatch(lock["version"]) or
            lock["sourceRepository"] != "cedricmenec/asf-agent-kits" or
            not SHA.fullmatch(lock["sourceCommitSha"]) or
            lock["sourceTrust"] != "user-pinned-git-object-unattested" or
            not REPO.fullmatch(lock["targetRepository"]) or
            not DIGEST.fullmatch(lock["configurationSha256"])):
        raise CliError("Invalid local-source lock metadata")
    paths = lock["managedFiles"]
    if not isinstance(paths, dict) or not paths or not set(paths).issubset(ALLOWED) or any(
            not isinstance(h, str) or not DIGEST.fullmatch(h) for h in paths.values()):
        raise CliError("Lock file ownership is incomplete or ambiguous")
    return lock


def source_snapshot(source, commit, version):
    root = Path(source).absolute()
    if root.is_symlink() or not root.is_dir():
        raise CliError("Source must be a local Git checkout")
    if origin(git(root, "remote", "get-url", "origin").decode().strip()) != "cedricmenec/asf-agent-kits":
        raise CliError("Unexpected AgentKit source remote")
    if not SHA.fullmatch(commit or ""):
        raise CliError("A complete, explicit --source-commit SHA is required; no latest")
    if git(root, "rev-parse", "--verify", commit + "^{commit}").decode().strip() != commit:
        raise CliError("Pinned source SHA is not a local Git commit")
    if not VERSION.fullmatch(version or ""):
        raise CliError("Exact stable SemVer X.Y.Z required")
    def pinned_file(path):
        if path.startswith("/") or ".." in path.split("/"):
            raise CliError("Unsafe source path")
        object_sha = git(root, "rev-parse", commit + ":" + path).decode().strip()
        size = int(git(root, "cat-file", "-s", object_sha).decode().strip())
        if size > MAX_FILE:
            raise CliError("Source object too large")
        data = git(root, "show", commit + ":" + path)
        if len(data) != size:
            raise CliError("Source object byte count changed")
        return data
    manifest = json.loads(pinned_file("kits/opencode-openspec/version.json").decode("utf-8"),
                          object_pairs_hook=unique_pairs)
    if manifest != {"schemaVersion": 1, "kitVersion": version,
                    "distribution": "user-pinned-git-commit",
                    "releaseStatus": "development-unreleased"}:
        raise CliError("Pinned source does not declare requested exact development version")
    return pinned_file


def rendered_source(source, commit, version, config):
    read = source_snapshot(source, commit, version)
    # Never execute a renderer from an untrusted checkout. Only read explicit
    # Git objects and run THIS audited CLI's fixed renderer and file allowlist.
    with tempfile.TemporaryDirectory(prefix="asf-agentkit-source-") as tmp:
        root = Path(tmp)
        for name, _ in FILES:
            path = root / TEMPLATES / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(read(TEMPLATES + name))
        preview = render_mvp(root, config)
    return {item["path"]: base64.b64decode(item["contentBase64"], validate=True)
            for item in preview["files"]}


def desired_lock(files, config, version, sha):
    return {
        "schemaVersion": 2, "kitId": "opencode-openspec", "version": version,
        "sourceRepository": "cedricmenec/asf-agent-kits", "sourceCommitSha": sha,
        "sourceTrust": "user-pinned-git-object-unattested",
        "targetRepository": config["targetRepository"],
        "configurationSha256": digest(canonical(config)),
        "managedFiles": {p: digest(data) for p, data in sorted(files.items())},
    }


def plan(target, config, files, lock, new_lock, operation):
    if lock and lock["targetRepository"] != config["targetRepository"]:
        raise CliError("Lock belongs to another target repository")
    if operation == "upgrade":
        if not lock:
            raise CliError("Upgrade requires a recognized prior installation lock")
        old = tuple(map(int, lock["version"].split(".")))
        new = tuple(map(int, new_lock["version"].split(".")))
        if new <= old:
            raise CliError("Upgrade version must be greater than locked version")
    items = []
    for path in sorted(ALLOWED):
        actual = observed(target, path)
        prior = lock["managedFiles"].get(path) if lock else None
        if actual is None:
            action, reason = ("conflict", "previously managed file missing") if prior else ("create", None)
        elif prior is None:
            action, reason = "conflict", "unmanaged pre-existing path"
        elif digest(actual) != prior:
            action, reason = "conflict", "local overlay differs from locked bytes"
        elif actual == files[path]:
            action, reason = "unchanged", None
        else:
            action, reason = "update", None
        item = {"path": path, "action": action}
        if reason:
            item["reason"] = reason
        items.append(item)
    installed_lock = observed(target, LOCK_PATH)
    proposed_lock = canonical(new_lock)
    if lock is None and installed_lock is None:
        lock_action = "create"
    elif installed_lock == proposed_lock:
        lock_action = "unchanged"
    else:
        lock_action = "update"
    items.append({"path": LOCK_PATH, "action": lock_action})
    conflicts = sum(x["action"] == "conflict" for x in items)
    return {"operation": operation, "kitId": "opencode-openspec",
            "targetRepository": config["targetRepository"], "version": new_lock["version"],
            "sourceCommitSha": new_lock["sourceCommitSha"],
            "sourceTrust": "user-pinned-git-object-unattested",
            "status": "blocked" if conflicts else "proposed", "conflicts": conflicts,
            "operations": sorted(items, key=lambda x: x["path"]),
            "writesPerformed": False, "remotePublicationPerformed": False,
            "releaseProvenanceVerified": False}


def parent_fd(root, relative, create=False):
    """Open every parent using directory descriptors, never following links."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(root, flags)
    try:
        for part in relative.split("/")[:-1]:
            try:
                nxt = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(part, 0o700, dir_fd=fd)
                nxt = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = nxt
        return fd
    except BaseException:
        os.close(fd)
        raise


def exclusive_file(root, relative, content):
    if relative not in ALLOWED and relative != LOCK_PATH:
        raise CliError("Unowned installation destination")
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise CliError("Safe local application requires O_NOFOLLOW and O_DIRECTORY")
    # Check case aliases and existing parents, then bind every operation to
    # O_NOFOLLOW dirfds. A last-component race is rejected by O_EXCL.
    if observed(root, relative) is not None:
        raise CliError("Create destination appeared during apply: " + relative)
    fd = parent_fd(root, relative, create=True)
    try:
        leaf = relative.split("/")[-1]
        output = os.open(leaf,
                         os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=fd)
        identity = os.fstat(output)
        try:
            with os.fdopen(output, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.fsync(fd)
            return identity.st_dev, identity.st_ino
        except BaseException:
            # A partial exclusive create is ours only while its inode matches.
            try:
                actual = os.stat(leaf, dir_fd=fd, follow_symlinks=False)
                if (actual.st_dev, actual.st_ino) == (identity.st_dev, identity.st_ino):
                    os.unlink(leaf, dir_fd=fd)
                    os.fsync(fd)
            except OSError:
                pass
            raise
    finally:
        os.close(fd)


def recover_created(root, relative, identity):
    """Rollback only an untouched inode created by this invocation."""
    try:
        fd = parent_fd(root, relative)
    except (OSError, CliError):
        return
    try:
        leaf = relative.split("/")[-1]
        info = os.stat(leaf, dir_fd=fd, follow_symlinks=False)
        if stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == identity:
            os.unlink(leaf, dir_fd=fd)
            os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def create_only(target, files, new_lock, preview, expected_head, default_branch):
    if preview["status"] != "proposed":
        raise CliError("Refusing blocked plan")
    if any(x["action"] not in ("create", "unchanged") for x in preview["operations"]):
        raise CliError("Only create-only local installs are supported; updates require a separate reviewed PR")
    if not SHA.fullmatch(expected_head or "") or git(target, "rev-parse", "HEAD").decode().strip() != expected_head:
        raise CliError("Target HEAD is not the explicitly approved SHA")
    branch = git(target, "symbolic-ref", "--quiet", "--short", "HEAD").decode().strip()
    if not branch or branch in (default_branch, "main", "master") or branch.startswith("refs/"):
        raise CliError("Apply requires an ordinary non-default target branch")
    if git(target, "status", "--porcelain"):
        raise CliError("Apply requires a clean worktree; inspect changes first")
    pending = dict(files)
    pending[LOCK_PATH] = canonical(new_lock)
    created = []
    try:
        for item in preview["operations"]:
            if item["action"] != "create":
                continue
            rel = item["path"]
            identity = exclusive_file(target, rel, pending[rel])
            created.append((rel, identity))
        return len(created)
    except (OSError, CliError):
        for rel, identity in reversed(created):
            recover_created(target, rel, identity)
        raise


def status(target, repo):
    lock = read_lock(target)
    if lock is None:
        return {"status": "unmanaged", "targetRepository": repo,
                "sourceProvenanceVerified": False, "files": []}
    if lock["targetRepository"] != repo:
        raise CliError("Target repo and installed lock disagree")
    files = []
    for path, locked in sorted(lock["managedFiles"].items()):
        actual = observed(target, path)
        files.append({"path": path, "state": "missing" if actual is None
                      else "hash-match" if digest(actual) == locked else "drifted"})
    return {"status": "hash-match" if all(x["state"] == "hash-match" for x in files)
            else "drifted", "targetRepository": repo,
            "kitVersion": lock["version"], "sourceCommitSha": lock["sourceCommitSha"],
            "sourceProvenanceVerified": False, "files": files}


def doctor(target, repo, config=None):
    result = status(target, repo)
    checks = {
        "openspecConfigPresent": (target / "openspec/config.yaml").is_file(),
        "packageLockPresent": (target / "package-lock.json").is_file(),
        "packageJsonPresent": (target / "package.json").is_file(),
        "managedWorkflowPresent": (target / ".github/workflows/asf-agentkit-openspec.yml").is_file(),
    }
    if config:
        checks["taskDirectoryPresent"] = (target / config["taskDirectory"]).is_dir()
    return {"kind": "read-only-local-doctor", "repository": repo, "installation": result,
            "localChecks": checks,
            "githubAppStatus": "unknown-not-queried", "rulesetsStatus": "unknown-not-queried",
            "secretsStatus": "unknown-not-queried",
            "requiredVariableNames": [config["appIdVar"]] if config else ["APP_ID"],
            "requiredSecretNames": [config["appPrivateKeySecret"], config["openRouterSecret"]]
                if config else ["APP_PRIVATE_KEY", "OPENROUTER_API_KEY"],
            "manualSteps": [
                "Owner: review GitHub App installation and minimum repository permissions",
                "Owner: configure required variable and secret names; never paste values into CLI",
                "Owner: verify effective branch ruleset and independent CI in GitHub Settings",
                "Owner: authorize each provider call separately; no automatic paid retry",
            ], "writesPerformed": False}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="asf-agentkit", description="Local AgentKit CLI; no remote writes or model calls")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("install", "upgrade", "status", "doctor"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--repo", required=True)
        cmd.add_argument("--checkout", required=True)
        if name in ("install", "upgrade"):
            cmd.add_argument("--kit", required=True, choices=["opencode-openspec"])
            cmd.add_argument("--version", required=True)
            cmd.add_argument("--source", required=True)
            cmd.add_argument("--source-commit", required=True)
            cmd.add_argument("--config", required=True)
            cmd.add_argument("--dry-run", action="store_true")
            if name == "install":
                cmd.add_argument("--apply", action="store_true")
                cmd.add_argument("--expected-head")
        elif name == "doctor":
            cmd.add_argument("--config")
            cmd.add_argument("--github-read", action="store_true",
                             help="Explicit optional GET-only GitHub diagnostics")
            cmd.add_argument("--github-token-env", default="GITHUB_TOKEN",
                             help="Name of existing token environment variable (never its value)")
    args = parser.parse_args(argv)
    try:
        target = checkout(args.checkout, args.repo)
        cfg = None
        if getattr(args, "config", None):
            path = Path(args.config)
            if path.is_symlink() or path.stat().st_size > 65536:
                raise CliError("Invalid config file")
            cfg = json.loads(path.read_text("utf-8"), object_pairs_hook=unique_pairs)
            checked_config(cfg)
            if cfg["targetRepository"] != args.repo:
                raise CliError("Config targetRepository differs from --repo")
        if args.command == "status":
            report = status(target, args.repo)
        elif args.command == "doctor":
            report = doctor(target, args.repo, cfg)
            if args.github_read:
                if cfg is None:
                    raise CliError("--github-read requires an exact --config")
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", args.github_token_env):
                    raise CliError("Invalid GitHub token variable name")
                token = os.environ.get(args.github_token_env)
                if not token:
                    raise CliError("Requested GitHub read token is not configured")
                report["githubRead"] = remote_doctor(args.repo, cfg, GitHubReader(args.repo, token))
        else:
            if args.command == "upgrade" and not args.dry_run:
                raise CliError("Upgrade is currently dry-run only")
            if args.command == "install" and args.apply and args.dry_run:
                raise CliError("Choose either --apply or --dry-run")
            if Path(args.source).absolute() == target:
                raise CliError("Source and target checkouts must differ")
            files = rendered_source(args.source, args.source_commit, args.version, cfg)
            new_lock = desired_lock(files, cfg, args.version, args.source_commit)
            old_lock = read_lock(target)
            report = plan(target, cfg, files, old_lock, new_lock, args.command)
            if args.command == "install" and args.apply:
                count = create_only(target, files, new_lock, report,
                                    args.expected_head, cfg["defaultBranch"])
                report["writesPerformed"] = True
                report["createdFiles"] = count
                report["status"] = "applied-locally-uncommitted"
        print(json.dumps(report, sort_keys=True, indent=2))
        return 2 if report.get("status") == "blocked" else 0
    except (CliError, RenderError, OSError, UnicodeError, ValueError, KeyError, TypeError) as exc:
        print("ASF-AgentKit REFUSED: " + str(exc), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
