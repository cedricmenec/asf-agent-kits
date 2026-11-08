import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fs, path, ROOT, git, strictFile, canonical } from "../tools/node/common.mjs";
import * as cli from "../tools/asf_agentkit_cli.mjs";
import { render_mvp } from "../tools/render_mvp_kit.mjs";
import { observe, exclusiveFile, recoverCreated, replaceManaged } from "../tools/node/secure-fs.mjs";

function fixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asf-portable-node-"));
  try { return callback(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function put(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}
function commit(root) {
  git(root, "add", "-A");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "-qm", "fixture");
  return git(root, "rev-parse", "HEAD").toString().trim();
}
function setup(root) {
  const target = path.join(root, "target");
  fs.mkdirSync(target);
  git(target, "init", "-q", "-b", "main");
  git(target, "remote", "add", "origin", "https://github.com/example/portable-fixture");
  put(path.join(target, "README.md"), "Preserved content\n");
  commit(target);
  git(target, "switch", "-q", "-c", "feature/agentkit-install");
  const cfg = strictFile(path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"));
  cfg.targetRepository = "example/portable-fixture";
  return { target, cfg };
}

test("#119: Node filesystem backend contains no procfs or native helper dependency", () => {
  const code = fs.readFileSync(path.join(ROOT, "tools/node/secure-fs.mjs"), "utf8");
  assert.doesNotMatch(code, /\/proc\/self\/fd|\/dev\/fd|child_process|\.node\b|openat\(/);
});

test("#119: unsafe, linked and colliding paths fail before creating files", (t) =>
  fixture((root) => {
    for (const relative of ["../escape", "/absolute", ".git/config", "a/../escape", "a\\b"]) {
      assert.throws(() => exclusiveFile(root, relative, Buffer.from("bad")));
    }
    put(path.join(root, "existing.txt"), "keep");
    fs.linkSync(path.join(root, "existing.txt"), path.join(root, "hard.txt"));
    assert.throws(() => observe(root, "hard.txt"));
    put(path.join(root, "Case.txt"), "preserve");
    assert.throws(() => exclusiveFile(root, "case.txt", Buffer.from("other")));
    assert.equal(fs.readFileSync(path.join(root, "existing.txt"), "utf8"), "keep");
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    try {
      fs.symlinkSync(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir");
      assert.throws(() => exclusiveFile(root, "link/secret", Buffer.from("bad")),
        /symlink parent|Non-directory/i);
      assert.equal(fs.existsSync(path.join(outside, "secret")), false);
    } catch (error) {
      if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
      t.diagnostic("Windows runner disallows junction creation; handled by lstat implementation");
    }
  }));

test("#119: exclusive create, stale replacement and guarded rollback work without procfs", () =>
  fixture((root) => {
    const p = "a/target.txt";
    const id = exclusiveFile(root, p, Buffer.from("original"));
    assert.equal(observe(root, p).toString(), "original");
    assert.throws(() => exclusiveFile(root, p, Buffer.from("clobber")));
    assert.throws(() => replaceManaged(root, p, Buffer.from("stale"), Buffer.from("new")));
    assert.equal(observe(root, p).toString(), "original");
    const nextId = replaceManaged(root, p, Buffer.from("original"), Buffer.from("new"));
    assert.ok(nextId);
    assert.equal(observe(root, p).toString(), "new");
    recoverCreated(root, p, id);
    assert.equal(observe(root, p).toString(), "new");
    recoverCreated(root, p, nextId);
    assert.equal(observe(root, p), null);
    assert.equal(fs.readdirSync(path.join(root, "a")).length, 0);
  }));

for (const kit of ["opencode-openspec", "opencode-direct"]) {
  test("#119: " + kit + " install, status, doctor, upgrade and refusal on " + process.platform, () =>
    fixture((root) => {
      const { target, cfg } = setup(root);
      const files = Object.fromEntries(render_mvp(ROOT, cfg, kit).files.map((item) =>
        [item.path, Buffer.from(item.contentBase64, "base64")]));
      const lock = cli.desired_lock(files, cfg, "1.3.0", "a".repeat(40), kit);
      assert.equal(cli.read_lock(target, kit), null);
      const install = cli.plan(target, cfg, files, null, lock, "install");
      assert.equal(install.status, "proposed");
      assert.equal(cli.create_only(target, files, lock, install,
        git(target, "rev-parse", "HEAD").toString().trim(), "main"),
        Object.keys(files).length + 1);
      assert.equal(cli.status(target, cfg.targetRepository, kit).status, "hash-match");
      assert.equal(cli.doctor(target, cfg.targetRepository, cfg, kit).localChecks.managedWorkflowPresent, true);
      commit(target);
      const next = { ...files };
      const targetPath = Object.keys(files).find((p) => p.endsWith("manual-acceptance.md"));
      next[targetPath] = Buffer.concat([next[targetPath], Buffer.from("\n# Portable update\n")]);
      const nextLock = cli.desired_lock(next, cfg, "1.3.1", "b".repeat(40), kit);
      const plan = cli.plan(target, cfg, next, lock, nextLock, "upgrade");
      assert.equal(plan.status, "proposed");
      const updated = cli.apply_upgrade(target, next, lock, nextLock, plan,
        git(target, "rev-parse", "HEAD").toString().trim(), "main");
      assert.deepEqual(updated, [0, 2]);
      assert.equal(cli.status(target, cfg.targetRepository, kit).status, "hash-match");
      assert.equal(cli.read_lock(target, kit).version, "1.3.1");
      assert.equal(fs.readFileSync(path.join(target, "README.md"), "utf8"), "Preserved content\n");
    }));
}

// Exercise the real shipped binary entry point, not just imported helpers.
test("#119: actual Node CLI dry-run, apply, status, doctor on " + process.platform, () =>
  fixture((root) => {
    const { target, cfg } = setup(root);
    const cfgPath = path.join(root, "config.json");
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const head = git(target, "rev-parse", "HEAD").toString().trim();
    const sourceSha = git(ROOT, "rev-parse", "HEAD").toString().trim();
    const entry = path.join(ROOT, "bin/asf-agentkit");
    const baseArgs = [
      "--repo", cfg.targetRepository, "--checkout", target,
      "--kit", "opencode-openspec", "--version", "1.3.0",
      "--source", ROOT, "--source-commit", sourceSha, "--config", cfgPath,
    ];
    function call(args) {
      const result = spawnSync(process.execPath, [entry, ...args], {
        encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1048576,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    }
    const dry = call(["install", ...baseArgs, "--dry-run"]);
    assert.equal(dry.status, "proposed");
    assert.equal(dry.writesPerformed, false);
    const applied = call(["install", ...baseArgs, "--apply", "--expected-head", head]);
    assert.equal(applied.status, "applied-locally-uncommitted");
    assert.equal(applied.createdFiles, 10);
    const status = call(["status", "--repo", cfg.targetRepository, "--checkout", target]);
    assert.equal(status.status, "hash-match");
    const doctor = call(["doctor", "--repo", cfg.targetRepository, "--checkout", target,
      "--config", cfgPath]);
    assert.equal(doctor.localChecks.managedWorkflowPresent, true);
  }));
