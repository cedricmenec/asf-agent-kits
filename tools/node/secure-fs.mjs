/**
 * Portable, dependency-free managed-file I/O for a trusted local checkout.
 *
 * THREAT MODEL: another hostile process must NOT concurrently mutate parent
 * directories. Parent checks are pathname-based and cannot prevent TOCTOU
 * symlink/junction replacement between validation and a filesystem call.
 * This module is not a containment boundary on a hostile shared workspace.
 *
 * Retained checks: safe relative paths, ordinary parents and files, symlink
 * rejection at inspection time, hardlink rejection, bounded stable reads,
 * case-collision checks, exclusive creation, content-checked replacement
 * via a unique temporary file, and identity-checked best-effort rollback.
 */
import {
  fs,
  path,
  safeRoot,
  safePath,
  requireThat,
  identity,
  stamp,
  MAX_FILE,
  nonce,
} from "./common.mjs";

const C = fs.constants;
const noFollow = C.O_NOFOLLOW || 0;
const nonblock = C.O_NONBLOCK || 0;

function notFound(error) {
  return error?.code === "ENOENT";
}

function inspectParent(root, relative, create = false) {
  safePath(relative);
  let directory = safeRoot(root);
  const parts = relative.split("/");
  for (const part of parts.slice(0, -1)) {
    requireThat(
      !fs.readdirSync(directory).some((name) =>
        name.toLowerCase() === part.toLowerCase() && name !== part),
      "Case-colliding directory",
    );
    const next = path.join(directory, part);
    let stat;
    try {
      stat = fs.lstatSync(next, { bigint: true });
    } catch (error) {
      if (!notFound(error) || !create) throw error;
      fs.mkdirSync(next, { mode: 0o700 });
      stat = fs.lstatSync(next, { bigint: true });
    }
    requireThat(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "Non-directory or symlink parent",
    );
    directory = next;
  }
  const leaf = parts.at(-1);
  requireThat(
    !fs.readdirSync(directory).some((name) =>
      name.toLowerCase() === leaf.toLowerCase() && name !== leaf),
    "Case-colliding file",
  );
  return { file: path.join(directory, leaf), directory };
}

function checkedStat(root, relative) {
  const { file } = inspectParent(root, relative);
  return fs.lstatSync(file, { bigint: true });
}

function regular(stat) {
  requireThat(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n &&
      stat.size <= BigInt(MAX_FILE),
    "Non-regular, linked or oversized managed file",
  );
}

function unchangedPath(root, relative, before) {
  const now = checkedStat(root, relative);
  requireThat(
    identity(now) === identity(before) && stamp(now) === stamp(before),
    "Managed path changed during operation",
  );
}

function checkedOpen(root, relative) {
  const { file } = inspectParent(root, relative);
  const byPath = fs.lstatSync(file, { bigint: true });
  regular(byPath);
  const fd = fs.openSync(file, C.O_RDONLY | noFollow | nonblock);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    regular(before);
    requireThat(
      identity(byPath) === identity(before) &&
        stamp(byPath) === stamp(before),
      "Managed file changed before opening",
    );
    return { fd, before };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

export function managedIdentity(root, relative) {
  const stat = checkedStat(root, relative);
  regular(stat);
  return identity(stat);
}

export function observe(root, relative) {
  let opened;
  try {
    opened = checkedOpen(root, relative);
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
  const { fd, before } = opened;
  try {
    const data = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    let n;
    do {
      n = fs.readSync(fd, data, count, data.length - count, null);
      count += n;
    } while (n && count < data.length);
    requireThat(
      count === Number(before.size) &&
        stamp(before) === stamp(fs.fstatSync(fd, { bigint: true })),
      "Managed file changed during read",
    );
    unchangedPath(root, relative, before);
    return data.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}

export function recoverCreated(root, relative, expectedIdentity) {
  try {
    const stat = checkedStat(root, relative);
    regular(stat);
    if (identity(stat) !== expectedIdentity) return;
    const { file } = inspectParent(root, relative);
    unchangedPath(root, relative, stat);
    fs.unlinkSync(file);
  } catch (error) {
    if (!notFound(error)) throw error;
  }
}

export function exclusiveFile(root, relative, bytes) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length <= MAX_FILE,
    "Managed file bytes required within size limit");
  requireThat(observe(root, relative) === null, "Create destination exists");
  const { file } = inspectParent(root, relative, true);
  let fd;
  let created;
  try {
    fd = fs.openSync(file,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | noFollow, 0o600);
    created = identity(fs.fstatSync(fd, { bigint: true }));
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    regular(after);
    unchangedPath(root, relative, after);
    return created;
  } catch (error) {
    if (created) {
      try {
        const stat = checkedStat(root, relative);
        if (identity(stat) === created) fs.unlinkSync(file);
      } catch {
        // Never remove an unknown or redirected path to hide the first error.
      }
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function replaceManaged(root, relative, expected, replacement) {
  requireThat(
    Buffer.isBuffer(expected) && Buffer.isBuffer(replacement) &&
      expected.length <= MAX_FILE && replacement.length <= MAX_FILE,
    "Bounded managed file bytes required",
  );
  const { file, directory } = inspectParent(root, relative);
  const temp = path.join(directory, ".asf-agentkit-upgrade-" + nonce());
  const { fd, before } = checkedOpen(root, relative);
  try {
    requireThat(fs.readFileSync(fd).equals(expected) &&
      stamp(before) === stamp(fs.fstatSync(fd, { bigint: true })),
    "Managed file changed before upgrade");
  } finally {
    fs.closeSync(fd);
  }
  let staged = false;
  try {
    const mode = Number(before.mode & 0o777n);
    const out = fs.openSync(temp,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | noFollow, mode);
    staged = true;
    try {
      fs.writeFileSync(out, replacement);
      if (process.platform !== "win32") fs.fchmodSync(out, mode);
      fs.fsyncSync(out);
    } finally {
      fs.closeSync(out);
    }
    unchangedPath(root, relative, before);
    const next = inspectParent(root, relative);
    requireThat(next.file === file && next.directory === directory,
      "Managed parent moved before replace");
    fs.renameSync(temp, file);
    staged = false;
    const after = checkedStat(root, relative);
    regular(after);
    return identity(after);
  } finally {
    if (staged) {
      try {
        const now = inspectParent(root, relative);
        if (now.directory === directory) fs.unlinkSync(temp);
      } catch {
        // Leave an unexpected path untouched for manual recovery.
      }
    }
  }
}
