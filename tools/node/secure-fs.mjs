/** Descriptor-anchored operations. No unverified pathname fallback. */
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
const dirFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;
const mounts = ['/proc/self/fd', '/dev/fd'];
// Verify that the descriptor namespace points to this open directory,
// and supports traversal. Never fall back to a user-controlled pathname.
function descriptorDirectory(fd) {
  const actual = fs.fstatSync(fd, { bigint: true });
  requireThat(actual.isDirectory(), 'Expected directory descriptor');
  for (const base of mounts) {
    const candidate = base + '/' + fd;
    try {
      if (identity(fs.statSync(candidate, { bigint: true })) !== identity(actual)) continue;
      const probe = fs.openSync(candidate + '/.', dirFlags);
      try {
        if (identity(fs.fstatSync(probe, { bigint: true })) !== identity(actual)) continue;
      } finally { fs.closeSync(probe); }
      return candidate;
    } catch { /* another descriptor namespace may be available */ }
  }
  throw new Error('Secure descriptor namespace unavailable (/proc/self/fd or /dev/fd); no pathname fallback');
}
export function anchored(fd, name) {
  requireThat(
    Number.isInteger(fd) &&
      fd >= 0 &&
      typeof name === "string" &&
      !name.includes("/") &&
      name !== "." &&
      name !== "..",
    "Invalid anchored name",
  );
  return descriptorDirectory(fd) + '/' + name;
}
export function openRoot(root) {
  requireThat(
    ["linux", "darwin"].includes(process.platform) && C.O_NOFOLLOW && C.O_DIRECTORY,
    "Secure directory-relative operations require POSIX descriptor support",
  );
  root = safeRoot(root);
  const before = fs.lstatSync(root, { bigint: true });
  const fd = fs.openSync(root, dirFlags);
  try {
    requireThat(
      identity(before) === identity(fs.fstatSync(fd, { bigint: true })),
      "Root changed before opening",
    );
    descriptorDirectory(fd);
    return fd;
  } catch (e) {
    fs.closeSync(fd);
    throw new Error(
      "Safe filesystem descriptor operations unavailable",
    );
  }
}
export function managedIdentity(root, relative) {
  const fd = parentFd(root, relative);
  try {
    return identity(
      fs.lstatSync(anchored(fd, relative.split("/").at(-1)), { bigint: true }),
    );
  } finally {
    fs.closeSync(fd);
  }
}
export function parentFd(root, relative, create = false) {
  safePath(relative);
  let fd = openRoot(root);
  try {
    for (const name of relative.split("/").slice(0, -1)) {
      requireThat(
        !fs
          .readdirSync(descriptorDirectory(fd))
          .some((n) => n.toLowerCase() === name.toLowerCase() && n !== name),
        "Case-colliding directory",
      );
      const p = anchored(fd, name);
      let next;
      try {
        next = fs.openSync(p, dirFlags);
      } catch (e) {
        if (e.code !== "ENOENT" || !create) throw e;
        fs.mkdirSync(p, { mode: 0o700 });
        next = fs.openSync(p, dirFlags);
      }
      fs.closeSync(fd);
      fd = next;
    }
    return fd;
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
}
export function observe(root, relative) {
  let fd;
  try {
    fd = parentFd(root, relative);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  try {
    const leaf = relative.split("/").at(-1);
    requireThat(
      !fs
        .readdirSync(descriptorDirectory(fd))
        .some((n) => n.toLowerCase() === leaf.toLowerCase() && n !== leaf),
      "Case-colliding file",
    );
    let file;
    try {
      file = fs.openSync(
        anchored(fd, leaf),
        C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK,
      );
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
    try {
      const before = fs.fstatSync(file, { bigint: true });
      requireThat(
        before.isFile() &&
          before.nlink === 1n &&
          before.size <= BigInt(MAX_FILE),
        "Non-regular, linked or oversized managed file",
      );
      const data = Buffer.alloc(Number(before.size) + 1);
      let count = 0,
        n;
      do {
        n = fs.readSync(file, data, count, data.length - count, null);
        count += n;
      } while (n && count < data.length);
      requireThat(
        count === Number(before.size) &&
          stamp(before) === stamp(fs.fstatSync(file, { bigint: true })),
        "Managed file changed during read",
      );
      return data.subarray(0, count);
    } finally {
      fs.closeSync(file);
    }
  } finally {
    fs.closeSync(fd);
  }
}
export function recoverCreated(root, relative, id) {
  const fd = parentFd(root, relative);
  try {
    const p = anchored(fd, relative.split("/").at(-1));
    try {
      const s = fs.lstatSync(p, { bigint: true });
      if (s.isFile() && identity(s) === id) {
        fs.unlinkSync(p);
        fs.fsyncSync(fd);
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  } finally {
    fs.closeSync(fd);
  }
}
export function exclusiveFile(root, relative, bytes) {
  requireThat(observe(root, relative) === null, "Create destination exists");
  const fd = parentFd(root, relative, true);
  let file, id;
  try {
    const leaf = relative.split("/").at(-1);
    requireThat(
      !fs
        .readdirSync(descriptorDirectory(fd))
        .some((n) => n.toLowerCase() === leaf.toLowerCase()),
      "Create destination appeared",
    );
    file = fs.openSync(
      anchored(fd, leaf),
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600,
    );
    id = identity(fs.fstatSync(file, { bigint: true }));
    fs.writeFileSync(file, bytes);
    fs.fsyncSync(file);
    fs.fsyncSync(fd);
    return id;
  } catch (e) {
    if (id) {
      const p = anchored(fd, relative.split("/").at(-1));
      if (identity(fs.lstatSync(p, { bigint: true })) === id) fs.unlinkSync(p);
    }
    throw e;
  } finally {
    if (file !== undefined) fs.closeSync(file);
    fs.closeSync(fd);
  }
}
export function replaceManaged(root, relative, expected, replacement) {
  const fd = parentFd(root, relative),
    leaf = relative.split("/").at(-1),
    p = anchored(fd, leaf),
    temp = anchored(fd, ".asf-agentkit-upgrade-" + nonce());
  let staged = false;
  try {
    const file = fs.openSync(p, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    let before;
    try {
      before = fs.fstatSync(file, { bigint: true });
      requireThat(
        before.isFile() &&
          before.nlink === 1n &&
          before.size <= BigInt(MAX_FILE),
        "Unsafe replacement target",
      );
      const data = fs.readFileSync(file);
      requireThat(
        data.equals(expected) &&
          stamp(before) === stamp(fs.fstatSync(file, { bigint: true })),
        "Managed file changed before upgrade",
      );
    } finally {
      fs.closeSync(file);
    }
    const out = fs.openSync(
      temp,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      Number(before.mode & 0o777n),
    );
    staged = true;
    try {
      fs.writeFileSync(out, replacement);
      fs.fsyncSync(out);
    } finally {
      fs.closeSync(out);
    }
    requireThat(
      stamp(fs.lstatSync(p, { bigint: true })) === stamp(before),
      "Target changed before replace",
    );
    fs.renameSync(temp, p);
    staged = false;
    fs.fsyncSync(fd);
    return identity(fs.lstatSync(p, { bigint: true }));
  } finally {
    if (staged) fs.unlinkSync(temp);
    fs.closeSync(fd);
  }
}
