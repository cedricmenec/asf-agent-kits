import nativeTest from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import {
  fs,
  path,
  ROOT,
  git,
  canonical,
  strictParse,
  strictFile,
  hash,
  readFile,
  member,
} from "../tools/node/common.mjs";
import {
  openRoot,
  anchored,
  parentFd,
  observe,
  exclusiveFile,
  recoverCreated,
  replaceManaged,
} from "../tools/node/secure-fs.mjs";
import * as cli from "../tools/asf_agentkit_cli.mjs";
import { FILES, render_mvp } from "../tools/render_mvp_kit.mjs";
import {
  build_git_candidate,
  read_exact_manifest,
} from "../tools/build_candidate.mjs";
import { build_release_manifest } from "../tools/build_release_manifest.mjs";
import { inventory_fdrelative } from "../tools/inventory_fdrelative.mjs";
import { qualify } from "../tools/qualify_mvp_render.mjs";
import { config_for, three_way } from "../tools/plan_merge.mjs";
let procfsAvailable = false;
try {
  const fd = openRoot(ROOT);
  fs.closeSync(fd);
  procfsAvailable = true;
} catch {}
const test = (name, fn) =>
  nativeTest(name, (t) => {
    if (
      !procfsAvailable &&
      !/strict JSON|canonical JSON|unsafe path|historical|pinned renderer|manifest exact|YAML|rendered Node/.test(
        name,
      )
    ) {
      assert.notEqual(
        process.env.CI,
        "true",
        "CI must provide Linux procfs for security tests",
      );
      t.skip("Local filesystem broker does not expose procfs descriptors");
      return;
    }
    return fn(t);
  });
const fixture = (fn) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asf-node-migration-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
const put = (p, b) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, b);
};
const commit = (root) => {
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  return git(root, "rev-parse", "HEAD").toString().trim();
};
function setup(root) {
  const target = path.join(root, "target");
  fs.mkdirSync(target);
  git(target, "init", "-q", "-b", "main");
  git(
    target,
    "remote",
    "add",
    "origin",
    "https://github.com/example/qualification-repository",
  );
  put(path.join(target, "README.md"), "Existing project\n");
  const head = commit(target);
  git(target, "switch", "-q", "-c", "feature/install");
  const cfg = strictFile(
    path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"),
  );
  cfg.targetRepository = "example/qualification-repository";
  const files = Object.fromEntries(
    render_mvp(ROOT, cfg).files.map((f) => [
      f.path,
      Buffer.from(f.contentBase64, "base64"),
    ]),
  );
  const lock = cli.desired_lock(files, cfg, "1.1.0", "a".repeat(40));
  return { target, head, cfg, files, lock };
}
for (const [name, input] of Object.entries({
  duplicate: '{"a":1,"a":2}',
  escaped: '{"a":1,"\\u0061":2}',
  nested: '{"a":{"x":0,"x":1}}',
  nonfinite: '{"x":1e999}',
  trailing: "{} false",
  trailingComma: "[1,]",
  invalidUtf8: Buffer.from([0xff]),
}))
  test("strict JSON refuses " + name, () =>
    assert.throws(() => strictParse(input)),
  );
test("canonical JSON preserves prior ASCII-sorted bytes and prototype keys", () => {
  assert.equal(
    canonical({ z: "é", a: { x: 1 } }).toString(),
    '{"a":{"x":1},"z":"\\u00e9"}\n',
  );
  const p = strictParse('{"__proto__":{"polluted":true}}');
  assert.equal(Object.hasOwn(p, "__proto__"), true);
  assert.equal({}.polluted, undefined);
});
for (const p of [
  "../escape",
  "a/../../escape",
  "/absolute",
  "a\\b",
  "a//b",
  ".git/config",
])
  test("filesystem refuses unsafe path " + p, () =>
    fixture((root) =>
      assert.throws(() => exclusiveFile(root, p, Buffer.from("x"))),
    ),
  );
test("anchored creation and inode checked recovery", () =>
  fixture((root) => {
    const p = "a/b.txt",
      id = exclusiveFile(root, p, Buffer.from("one"));
    assert.equal(observe(root, p).toString(), "one");
    assert.throws(() => exclusiveFile(root, p, Buffer.from("two")));
    fs.unlinkSync(path.join(root, p));
    put(path.join(root, p), "foreign");
    recoverCreated(root, p, id);
    assert.equal(fs.readFileSync(path.join(root, p), "utf8"), "foreign");
  }));
test("no-follow directory descriptor remains anchored after parent replacement", () =>
  fixture((root) => {
    fs.mkdirSync(path.join(root, "a"));
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    const fd = parentFd(root, "a/file");
    try {
      fs.renameSync(path.join(root, "a"), path.join(root, "old"));
      fs.symlinkSync(outside, path.join(root, "a"));
      const p = anchored(fd, "file"),
        out = fs.openSync(
          p,
          fs.constants.O_WRONLY |
            fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_NOFOLLOW,
          0o600,
        );
      fs.writeSync(out, "anchored");
      fs.closeSync(out);
      assert.equal(fs.existsSync(path.join(outside, "file")), false);
      assert.equal(
        fs.readFileSync(path.join(root, "old/file"), "utf8"),
        "anchored",
      );
      assert.throws(() => exclusiveFile(root, "a/other", Buffer.from("x")));
    } finally {
      fs.closeSync(fd);
    }
  }));
for (const type of ["symlink", "hardlink", "fifo", "case", "directory"])
  test("managed audit refuses " + type, () =>
    fixture((root) => {
      const file = path.join(root, "x");
      if (type === "symlink") {
        put(path.join(root, "outside"), "outside");
        fs.symlinkSync("outside", file);
      }
      if (type === "hardlink") {
        put(path.join(root, "outside"), "outside");
        fs.linkSync(path.join(root, "outside"), file);
      }
      if (type === "fifo") execFileSync("mkfifo", [file]);
      if (type === "case") put(path.join(root, "X"), "case");
      if (type === "directory") fs.mkdirSync(file);
      assert.throws(() => observe(root, "x"));
    }),
  );
test("atomic managed replacement preserves mode and rejects stale content", () =>
  fixture((root) => {
    put(path.join(root, "x"), "old");
    fs.chmodSync(path.join(root, "x"), 0o640);
    assert.throws(() =>
      replaceManaged(root, "x", Buffer.from("other"), Buffer.from("new")),
    );
    replaceManaged(root, "x", Buffer.from("old"), Buffer.from("new"));
    assert.equal(observe(root, "x").toString(), "new");
    assert.equal(fs.statSync(path.join(root, "x")).mode & 0o777, 0o640);
    assert.deepEqual(fs.readdirSync(root), ["x"]);
  }));
test("CLI create-only install, idempotence, status, doctor, upgrade and Git rollback", () =>
  fixture((root) => {
    const f = setup(root);
    const p = cli.plan(f.target, f.cfg, f.files, null, f.lock, "install");
    assert.equal(p.operations.length, 10);
    assert.equal(
      cli.create_only(f.target, f.files, f.lock, p, f.head, "main"),
      10,
    );
    assert.equal(
      cli.status(f.target, f.cfg.targetRepository).status,
      "hash-match",
    );
    assert.equal(
      cli.doctor(f.target, f.cfg.targetRepository, f.cfg).localChecks
        .managedWorkflowPresent,
      true,
    );
    assert.equal(
      cli
        .plan(
          f.target,
          f.cfg,
          f.files,
          cli.read_lock(f.target),
          f.lock,
          "install",
        )
        .operations.every((o) => o.action === "unchanged"),
      true,
    );
    const before = fs.readFileSync(path.join(f.target, cli.LOCK_PATH)),
      head = commit(f.target),
      nextFiles = {
        ...f.files,
        ".asf/agentkit/manual-acceptance.md": Buffer.from("Upgraded\n"),
      },
      nextLock = cli.desired_lock(nextFiles, f.cfg, "1.2.0", "b".repeat(40)),
      preview = cli.plan(
        f.target,
        f.cfg,
        nextFiles,
        f.lock,
        nextLock,
        "upgrade",
      );
    assert.deepEqual(
      cli.apply_upgrade(
        f.target,
        nextFiles,
        f.lock,
        nextLock,
        preview,
        head,
        "main",
      ),
      [0, 2],
    );
    assert.equal(
      cli.status(f.target, f.cfg.targetRepository).kitVersion,
      "1.2.0",
    );
    commit(f.target);
    git(
      f.target,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "revert",
      "--no-edit",
      "HEAD",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(f.target, cli.LOCK_PATH)),
      before,
    );
    assert.equal(
      cli.status(f.target, f.cfg.targetRepository).status,
      "hash-match",
    );
  }));
for (const problem of [
  "head",
  "main",
  "dirty",
  "conflict",
  "symlink",
  "case",
  "lock",
])
  test("CLI refuses " + problem + " without overwriting", () =>
    fixture((root) => {
      const f = setup(root);
      if (problem === "main") git(f.target, "switch", "-q", "main");
      if (problem === "dirty") put(path.join(f.target, "dirty"), "dirty");
      if (problem === "conflict")
        put(
          path.join(f.target, ".asf/agentkit/manual-acceptance.md"),
          "overlay",
        );
      if (problem === "symlink") {
        fs.mkdirSync(path.join(f.target, ".asf"));
        fs.symlinkSync("../README.md", path.join(f.target, cli.LOCK_PATH));
      }
      if (problem === "case")
        put(path.join(f.target, ".ASF/agentkit/manual-acceptance.md"), "case");
      if (problem === "lock")
        put(path.join(f.target, cli.LOCK_PATH), '{"schemaVersion":1}');
      assert.throws(() => {
        const lock = cli.read_lock(f.target),
          p = cli.plan(f.target, f.cfg, f.files, lock, f.lock, "install");
        cli.create_only(
          f.target,
          f.files,
          f.lock,
          p,
          problem === "head" ? "0".repeat(40) : f.head,
          "main",
        );
      });
      assert.equal(
        fs.readFileSync(path.join(f.target, "README.md"), "utf8"),
        "Existing project\n",
      );
    }),
  );
test("upgrade rolls back earlier files on injected lock replacement failure", (t) =>
  fixture((root) => {
    const f = setup(root),
      p = cli.plan(f.target, f.cfg, f.files, null, f.lock, "install");
    cli.create_only(f.target, f.files, f.lock, p, f.head, "main");
    const head = commit(f.target),
      files = {
        ...f.files,
        ".asf/agentkit/manual-acceptance.md": Buffer.from("new"),
      },
      lock = cli.desired_lock(files, f.cfg, "1.2.0", "b".repeat(40)),
      preview = cli.plan(f.target, f.cfg, files, f.lock, lock, "upgrade");
    const rename = fs.renameSync;
    t.mock.method(fs, "renameSync", (from, to) => {
      if (to.endsWith("/agentkit.lock.json"))
        throw new Error("Injected lock failure");
      return rename(from, to);
    });
    assert.throws(
      () =>
        cli.apply_upgrade(f.target, files, f.lock, lock, preview, head, "main"),
      /Injected/,
    );
    assert.equal(
      cli.status(f.target, f.cfg.targetRepository).status,
      "hash-match",
    );
    assert.equal(git(f.target, "status", "--porcelain").length, 0);
  }));
test("upgrade refuses overlays and same/downgrade versions", () =>
  fixture((root) => {
    const f = setup(root);
    cli.create_only(
      f.target,
      f.files,
      f.lock,
      cli.plan(f.target, f.cfg, f.files, null, f.lock, "install"),
      f.head,
      "main",
    );
    for (const version of ["1.1.0", "1.0.0"])
      assert.throws(() =>
        cli.plan(
          f.target,
          f.cfg,
          f.files,
          f.lock,
          { ...f.lock, version },
          "upgrade",
        ),
      );
    put(path.join(f.target, ".asf/agentkit/manual-acceptance.md"), "overlay");
    assert.equal(
      cli.plan(
        f.target,
        f.cfg,
        f.files,
        f.lock,
        { ...f.lock, version: "1.2.0" },
        "upgrade",
      ).status,
      "blocked",
    );
  }));
test("historical 1.1.0 Git objects install without executing legacy source", () =>
  fixture((root) => {
    const cfg = strictFile(
        path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"),
      ),
      commit = "3ed348621cff28dc0b6be1503fce2a17bbc0f1e3";
    const files = cli.rendered_source(ROOT, commit, "1.1.0", cfg);
    assert.equal(Object.keys(files).length, 9);
    assert.ok(
      files[".github/workflows/asf-agentkit-openspec.yml"].includes(
        Buffer.from("22.23.3"),
      ),
    );
    assert.throws(() => cli.rendered_source(ROOT, "deadbeef", "1.1.0", cfg));
    assert.throws(() => cli.rendered_source(ROOT, commit, "9.9.9", cfg));
  }));
test("pinned renderer ignores modified worktree and Git symlink objects", () =>
  fixture((root) => {
    const source = path.join(root, "source");
    execFileSync("git", ["clone", "-q", "--no-hardlinks", ROOT, source]);
    git(
      source,
      "remote",
      "set-url",
      "origin",
      "https://github.com/cedricmenec/asf-agent-kits.git",
    );
    const sha = git(source, "rev-parse", "HEAD").toString().trim(),
      cfg = strictFile(
        path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"),
      ),
      before = cli.rendered_source(source, sha, "1.1.0", cfg);
    put(
      path.join(source, "kits/opencode-openspec/templates/phase.sh.tmpl"),
      "untrusted",
    );
    assert.deepEqual(cli.rendered_source(source, sha, "1.1.0", cfg), before);
    const p = path.join(
      source,
      "kits/opencode-openspec/templates/phase.sh.tmpl",
    );
    fs.unlinkSync(p);
    fs.symlinkSync("request.mjs.tmpl", p);
    const bad = commit(source);
    assert.throws(() => cli.rendered_source(source, bad, "1.1.0", cfg));
  }));
test("manifest exact-byte verification refuses reformatting and symlinks", () =>
  fixture((root) => {
    const p = path.join(root, "manifest.json");
    put(p, canonical({ a: 1 }));
    assert.deepEqual(read_exact_manifest(p), canonical({ a: 1 }));
    put(p, '{ "a": 1 }');
    assert.notDeepEqual(read_exact_manifest(p), canonical({ a: 1 }));
    fs.unlinkSync(p);
    put(path.join(root, "actual"), "{}");
    fs.symlinkSync("actual", p);
    assert.throws(() => read_exact_manifest(p));
  }));
for (const type of [
  "extra",
  "missing",
  "link",
  "hardlink",
  "executable",
  "case",
])
  test("fd inventory refuses " + type, () =>
    fixture((root) => {
      put(path.join(root, "a"), "content");
      const expected = ["a"];
      if (type === "extra") put(path.join(root, "b"), "extra");
      if (type === "missing") expected.push("b");
      if (type === "link") {
        fs.renameSync(path.join(root, "a"), path.join(root, "b"));
        fs.symlinkSync("b", path.join(root, "a"));
      }
      if (type === "hardlink")
        fs.linkSync(path.join(root, "a"), path.join(root, "b"));
      if (type === "executable") fs.chmodSync(path.join(root, "a"), 0o700);
      if (type === "case") expected.push("A");
      assert.throws(() => inventory_fdrelative(root, "a".repeat(40), expected));
    }),
  );
test("fd inventory exactly matches ordinary fixture bytes", () =>
  fixture((root) => {
    put(path.join(root, "a/b"), "text");
    assert.deepEqual(
      inventory_fdrelative(root, "a".repeat(40), ["a/b"]).files,
      [{ path: "a/b", mode: "100644", sha256: hash("text"), type: "file" }],
    );
  }));
for (const raw of [
  "x: &a {y: 1}\nz: *a\n",
  "x: 1\nx: 2\n",
  "x: !!python/object:foo {}\n",
  "x: 1\n---\nx: 2\n",
  "x:\n\ty: 1\n",
])
  test(
    "YAML bootstrap policy refuses ambiguous/unsafe document " +
      JSON.stringify(raw),
    () =>
      fixture((root) => {
        put(path.join(root, ".asf/agentkit.yaml"), raw);
        assert.throws(() => config_for(root));
      }),
  );
test("rendered Node LTS workflow syntax and scope smoke", async () => {
  assert.equal(
    await qualify(
      strictFile(
        path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"),
      ),
    ),
    9,
  );
});
