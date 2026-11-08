import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { fs, path } from "../tools/node/common.mjs";
import {
  anchored, parentFd, exclusiveFile, observe,
} from "../tools/node/secure-fs.mjs";

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asf-fd-namespace-"));
  try { return fn(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const denied = (mounts) => (original, file, options) => {
  if (typeof file === "string" &&
      mounts.some((m) => file.startsWith(m + "/"))) {
    const error = new Error("Synthetic descriptor namespace missing");
    error.code = "ENOENT";
    throw error;
  }
  return original(file, options);
};

test("#119: /dev/fd can be used when direct /proc/self/fd lookup is unavailable", (t) => {
  if (process.platform !== "linux") return t.skip("Linux fixture");
  const original = fs.statSync;
  t.mock.method(fs, "statSync", (file, options) =>
    denied(["/proc/self/fd"])(original, file, options));
  fixture((root) => {
    const id = exclusiveFile(root, "a/b.txt", Buffer.from("safe"));
    assert.ok(id);
    assert.equal(observe(root, "a/b.txt").toString(), "safe");
    fs.mkdirSync(path.join(root, "outside"));
    const parent = parentFd(root, "a/other");
    try {
      fs.renameSync(path.join(root, "a"), path.join(root, "moved"));
      fs.symlinkSync(path.join(root, "outside"), path.join(root, "a"));
      const out = fs.openSync(
        anchored(parent, "other"), fs.constants.O_WRONLY |
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeSync(out, "anchored");
      fs.closeSync(out);
      assert.equal(fs.existsSync(path.join(root, "outside/other")), false);
      assert.equal(fs.readFileSync(path.join(root, "moved/other"), "utf8"), "anchored");
    } finally { fs.closeSync(parent); }
  });
});

test("#119: if neither fd mount is usable, installation refuses before writing", (t) => {
  if (process.platform !== "linux") return t.skip("Linux fixture");
  const original = fs.statSync;
  t.mock.method(fs, "statSync", (file, options) =>
    denied(["/proc/self/fd", "/dev/fd"])(original, file, options));
  fixture((root) => {
    assert.throws(() => exclusiveFile(root, "a/b.txt", Buffer.from("not-written")),
      /descriptor operations unavailable/i);
    assert.deepEqual(fs.readdirSync(root), []);
  });
});

test("#119: an unsupported platform must not silently use pathname writes", (t) => {
  if (["linux", "darwin"].includes(process.platform)) return t.skip("Non-POSIX fixture");
  fixture((root) => {
    assert.throws(() => exclusiveFile(root, "one.txt", Buffer.from("not-written")),
      /POSIX descriptor support/i);
    assert.deepEqual(fs.readdirSync(root), []);
  });
});
