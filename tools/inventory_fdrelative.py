"""Linux-only fd-relative, read-only byte inventory of disposable fixtures.

This prevents following symlink path components after opening an approved root.
It does NOT authenticate the root, Git HEAD, an App or an atomic snapshot.
"""
from __future__ import annotations

import hashlib
import os
import stat
import unicodedata

MAX_FILE = 1024 * 1024
MAX_FILES = 500
_DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK


class FdInventoryError(Exception):
    def __init__(self):
        super().__init__("R3g-03 DENY: unsafe or inconsistent disposable fixture")


def _deny():
    raise FdInventoryError()


def _safe(path):
    return (type(path) is str and 0 < len(path) <= 320 and
            unicodedata.normalize("NFC", path) == path and
            not path.startswith("/") and "\\" not in path and
            not any(ord(c) < 32 or ord(c) == 127 for c in path) and
            all(p and p not in (".", "..") and not p.endswith(":")
                for p in path.split("/")))


def _stamp(info):
    return (info.st_dev, info.st_ino, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)


def _open_file(root_fd, path):
    current = os.dup(root_fd)
    try:
        pieces = path.split("/")
        for name in pieces[:-1]:
            next_fd = os.open(name, _DIR_FLAGS, dir_fd=current)
            os.close(current)
            current = next_fd
        leaf = os.open(pieces[-1], _FILE_FLAGS, dir_fd=current)
        try:
            info = os.fstat(leaf)
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or
                info.st_size < 0 or info.st_size > MAX_FILE or
                info.st_mode & 0o111):
                _deny()
            digest = hashlib.sha256()
            count = 0
            while True:
                chunk = os.read(leaf, min(65536, MAX_FILE + 1 - count))
                if not chunk:
                    break
                count += len(chunk)
                if count > MAX_FILE:
                    _deny()
                digest.update(chunk)
            if count != info.st_size or _stamp(info) != _stamp(os.fstat(leaf)):
                _deny()
            return digest.hexdigest(), _stamp(info)
        finally:
            os.close(leaf)
    finally:
        os.close(current)


def _walk(fd, prefix, found, stamps):
    # The directory fd is already anchored. Never follow a symlink or fallback
    # to a pathname if one of these operations is unsupported or fails.
    for name in os.listdir(fd):
        path = prefix + name
        if not _safe(path):
            _deny()
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            child = os.open(name, _DIR_FLAGS, dir_fd=fd)
            try:
                if _stamp(info)[:2] != _stamp(os.fstat(child))[:2]:
                    _deny()
                _walk(child, path + "/", found, stamps)
            finally:
                os.close(child)
        elif stat.S_ISREG(info.st_mode):
            if path not in stamps or _stamp(info) != stamps[path]:
                _deny()
            found.add(path)
        else:
            _deny()


def inventory_fdrelative(root, head_sha, expected_paths):
    """Produce R3f-compatible {headSha,files} without filesystem writes.

    The caller MUST provide a host-controlled disposable directory. Root path
    resolution before os.open remains outside the verified fd-relative scope.
    """
    if (os.name != "posix" or not hasattr(os, "O_NOFOLLOW") or
        type(root) is not str or not os.path.isabs(root) or
        type(head_sha) is not str or len(head_sha) != 40 or
        any(c not in "0123456789abcdef" for c in head_sha) or
        type(expected_paths) is not list or
        not 1 <= len(expected_paths) <= MAX_FILES):
        _deny()
    if any(not _safe(p) for p in expected_paths) or len({p.casefold() for p in expected_paths}) != len(expected_paths):
        _deny()
    try:
        before = os.lstat(root)
        if not stat.S_ISDIR(before.st_mode):
            _deny()
        fd = os.open(root, _DIR_FLAGS)
        try:
            if _stamp(before)[:2] != _stamp(os.fstat(fd))[:2]:
                _deny()
            files = []
            stamps = {}
            for path in expected_paths:
                digest, stamp = _open_file(fd, path)
                stamps[path] = stamp
                files.append({"path": path, "mode": "100644", "sha256": digest, "type": "file"})
            observed = set()
            _walk(fd, "", observed, stamps)
            if observed != set(expected_paths):
                _deny()
            return {"headSha": head_sha, "files": sorted(files, key=lambda e: e["path"])}
        finally:
            os.close(fd)
    except (OSError, ValueError, TypeError, FdInventoryError) as exc:
        raise FdInventoryError() from None
