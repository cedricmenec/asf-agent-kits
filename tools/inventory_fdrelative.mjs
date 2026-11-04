import {
  fs,
  path,
  requireThat,
  safePath,
  hash,
  SHA,
  stamp,
  identity,
} from "./node/common.mjs";
import { openRoot, anchored } from "./node/secure-fs.mjs";
export class FdInventoryError extends Error {}
const safe = (p) =>
  typeof p === "string" &&
  p.length > 0 &&
  p.length <= 320 &&
  p === p.normalize("NFC") &&
  !/^[\/]|[\\\x00-\x1f\x7f]/.test(p) &&
  p.split("/").every((x) => x && x !== "." && x !== ".." && !x.endsWith(":"));
export function inventory_fdrelative(root, head, expected) {
  try {
    requireThat(
      typeof root === "string" &&
        path.isAbsolute(root) &&
        typeof head === "string" &&
        SHA.test(head) &&
        Array.isArray(expected) &&
        expected.length > 0 &&
        expected.length <= 500 &&
        expected.every(safe) &&
        new Set(expected.map((p) => p.toLowerCase())).size === expected.length,
      "Invalid inventory input",
    );
    const fd = openRoot(root),
      files = [],
      stamps = {};
    try {
      for (const p of expected) {
        // Walk from the already-open root, never re-resolve its pathname.
        let current = fd,
          owned = false;
        let data;
        try {
          const parts = p.split("/");
          for (const name of parts.slice(0, -1)) {
            const next = fs.openSync(
              anchored(current, name),
              fs.constants.O_RDONLY |
                fs.constants.O_DIRECTORY |
                fs.constants.O_NOFOLLOW,
            );
            if (owned) fs.closeSync(current);
            current = next;
            owned = true;
          }
          const leaf = fs.openSync(
            anchored(current, parts.at(-1)),
            fs.constants.O_RDONLY |
              fs.constants.O_NOFOLLOW |
              fs.constants.O_NONBLOCK,
          );
          try {
            const before = fs.fstatSync(leaf, { bigint: true });
            requireThat(
              before.isFile() &&
                before.nlink === 1n &&
                before.size <= 1048576n &&
                (before.mode & 0o111n) === 0n,
              "Unsafe fixture file",
            );
            const buffer = Buffer.alloc(Number(before.size) + 1);
            let count = 0,
              n;
            do {
              n = fs.readSync(leaf, buffer, count, buffer.length - count, null);
              count += n;
            } while (n && count < buffer.length);
            requireThat(
              BigInt(count) === before.size &&
                stamp(before) === stamp(fs.fstatSync(leaf, { bigint: true })),
              "Fixture changed during read",
            );
            data = buffer.subarray(0, count);
            stamps[p] = stamp(before);
          } finally {
            fs.closeSync(leaf);
          }
        } finally {
          if (owned) fs.closeSync(current);
        }
        files.push({
          path: p,
          mode: "100644",
          sha256: hash(data),
          type: "file",
        });
      }
      const found = new Set();
      const walk = (dir, prefix) => {
        for (const name of fs.readdirSync(`/proc/self/fd/${dir}`)) {
          const rel = prefix + name;
          requireThat(safe(rel), "Unsafe inventory path");
          const entry = anchored(dir, name),
            info = fs.lstatSync(entry, { bigint: true });
          if (info.isDirectory()) {
            const child = fs.openSync(
              entry,
              fs.constants.O_RDONLY |
                fs.constants.O_DIRECTORY |
                fs.constants.O_NOFOLLOW,
            );
            try {
              requireThat(
                identity(info) ===
                  identity(fs.fstatSync(child, { bigint: true })),
                "Directory moved",
              );
              walk(child, rel + "/");
            } finally {
              fs.closeSync(child);
            }
          } else {
            requireThat(
              info.isFile() && stamps[rel] === stamp(info),
              "Unexpected or changed fixture file",
            );
            found.add(rel);
          }
        }
      };
      walk(fd, "");
      requireThat(
        found.size === expected.length && expected.every((p) => found.has(p)),
        "Inventory mismatch",
      );
      return {
        headSha: head,
        files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    throw new FdInventoryError(
      "R3g-03 DENY: unsafe or inconsistent disposable fixture",
    );
  }
}
