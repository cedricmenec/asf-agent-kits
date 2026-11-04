import { gunzipSync } from 'node:zlib';
/** Filesystem fixtures and outcomes recorded from the previous implementation. */
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fs, path, ROOT } from "../tools/node/common.mjs";
import { openRoot } from "../tools/node/secure-fs.mjs";
const cases = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/node-migration/filesystem-reference.json.gz', import.meta.url))));
let procfsAvailable = false;
try {
  const fd = openRoot(ROOT);
  fs.closeSync(fd);
  procfsAvailable = true;
} catch {}
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k === "reason" && typeof x === "string" ? "diagnostic" : normalize(x),
      ]),
    );
  return v;
}
for (const [cid, c] of cases.entries())
  test(`${c.module}.${c.function}: ${c.case} #${cid}`, async (t) => {
    if (
      c.module === "inventory_fdrelative" ||
      c.module === "preview_synthetic_release"
    ) {
      if (!procfsAvailable) {
        assert.notEqual(process.env.CI, "true", "CI requires procfs");
        t.skip("Local procfs unavailable");
        return;
      }
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-fs-reference-")),
      mapping = Object.fromEntries(
        Object.keys(c.snapshots).map((root, i) => [
          root,
          path.join(tmp, "root" + i),
        ]),
      );
    const decode = (v) =>
      v && typeof v === "object"
        ? Object.hasOwn(v, "$bytes")
          ? Buffer.from(v.$bytes, "base64")
          : Array.isArray(v)
            ? v.map(decode)
            : Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, decode(x)]),
              )
        : typeof v === "string"
          ? Object.entries(mapping).reduce(
              (text, [from, to]) =>
                text === from || text.startsWith(from + "/")
                  ? to + text.slice(from.length)
                  : text,
              v,
            )
          : v;
    const encode = (v) =>
      v === undefined
        ? null
        : Buffer.isBuffer(v)
          ? { $bytes: v.toString("base64") }
          : Array.isArray(v)
            ? v.map(encode)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v).map(([k, x]) => [k, encode(x)]),
                )
              : v;
    try {
      for (const [root, rows] of Object.entries(c.snapshots)) {
        const dest = mapping[root];
        fs.mkdirSync(dest, { recursive: true });
        for (const row of rows) {
          const p = path.join(dest, row.path);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          if (row.type === "directory") fs.mkdirSync(p, { recursive: true });
          else if (row.type === "file")
            fs.writeFileSync(p, Buffer.from(row.bytes, "base64"), {
              mode: row.mode,
            });
          else if (row.type === "symlink")
            fs.symlinkSync(decode(row.target), p);
          else if (row.type === "fifo") execFileSync("mkfifo", [p]);
        }
        for (const row of rows)
          if (row.type === "hardlink")
            fs.linkSync(path.join(dest, row.target), path.join(dest, row.path));
      }
      const mod = await import(`../tools/${c.module}.mjs`),
        args = decode(c.args);
      if (c.denied) await assert.rejects(async () => mod[c.function](...args));
      else
        assert.deepEqual(
          normalize(encode(await mod[c.function](...args))),
          normalize(c.result),
        );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
