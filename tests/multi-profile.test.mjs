import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import {
  fs,
  path,
  ROOT,
  git,
  canonical,
  hash,
  strictFile,
} from "../tools/node/common.mjs";
import { openRoot } from "../tools/node/secure-fs.mjs";
import {
  render_mvp,
  profile_lock_path,
  KIT_IDS,
} from "../tools/render_mvp_kit.mjs";
import * as cli from "../tools/asf_agentkit_cli.mjs";
import { publish_draft } from "../tools/asf_agentkit_publish.mjs";
const cfg = strictFile(
  path.join(ROOT, "kits/opencode-direct/mvp-config.example.json"),
);
const put = (r, p, b) => {
  fs.mkdirSync(path.dirname(path.join(r, p)), { recursive: true });
  fs.writeFileSync(path.join(r, p), b);
};
const commit = (r) => {
  git(r, "add", "-A");
  git(
    r,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  return git(r, "rev-parse", "HEAD").toString().trim();
};
for (const order of [KIT_IDS, [...KIT_IDS].reverse()])
  test("co-install and independently upgrade " + order.join(" then "), (t) => {
    try {
      fs.closeSync(openRoot(ROOT));
    } catch {
      assert.notEqual(process.env.CI, "true");
      t.skip("Local broker lacks procfs");
      return;
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multi-profile-"));
    try {
      git(root, "init", "-q");
      git(
        root,
        "remote",
        "add",
        "origin",
        "https://github.com/" + cfg.targetRepository,
      );
      put(root, "README.md", "preserved");
      commit(root);
      git(root, "switch", "-c", "install/profiles");
      const inventories = {};
      for (const kit of order) {
        const files = Object.fromEntries(
          render_mvp(ROOT, cfg, kit).files.map((f) => [
            f.path,
            Buffer.from(f.contentBase64, "base64"),
          ]),
        );
        const lock = cli.desired_lock(files, cfg, "1.0.0", "a".repeat(40), kit),
          old = cli.read_lock(root, kit);
        assert.equal(old, null);
        const preview = cli.plan(root, cfg, files, old, lock, "install");
        const head = git(root, "rev-parse", "HEAD").toString().trim();
        cli.create_only(root, files, lock, preview, head, "main");
        inventories[kit] = { files, lock };
        assert.equal(
          cli.status(root, cfg.targetRepository, kit).status,
          "hash-match",
        );
        commit(root);
      }
      const legacy = fs.readFileSync(path.join(root, cli.LOCK_PATH));
      assert.equal(cli.read_locks(root).length, 2);
      assert.throws(() => cli.read_lock(root), /Several profiles/);
      assert.deepEqual(
        Object.keys(cli.status(root, cfg.targetRepository).profiles),
        order,
      );
      assert.equal(
        Object.keys(cli.doctor(root, cfg.targetRepository, null).profiles)
          .length,
        2,
      );
      for (const kit of order) {
        const { files, lock } = inventories[kit];
        const idem = cli.plan(root, cfg, files, lock, lock, "install");
        assert.ok(idem.operations.every((o) => o.action === "unchanged"));
        const bad = { ...cfg, mutexGroup: "different-mutex" };
        assert.throws(
          () => cli.plan(root, bad, files, lock, lock, "install"),
          /same paid execution mutex/,
        );
        const next = { ...files };
        const p = Object.keys(next).find((p) => p.endsWith("phase.sh"));
        next[p] = Buffer.concat([next[p], Buffer.from("\n# next version\n")]);
        const updated = cli.desired_lock(
            next,
            cfg,
            "1.1.0",
            "b".repeat(40),
            kit,
          ),
          preview = cli.plan(root, cfg, next, lock, updated, "upgrade");
        cli.apply_upgrade(
          root,
          next,
          lock,
          updated,
          preview,
          git(root, "rev-parse", "HEAD").toString().trim(),
          "main",
        );
        commit(root);
        assert.equal(cli.read_lock(root, kit).version, "1.1.0");
        const other = order.find((k) => k !== kit);
        assert.equal(
          cli.status(root, cfg.targetRepository, other).status,
          "hash-match",
        );
      }
      const secondary = order[1],
        f = Object.keys(inventories[secondary].files).find((p) =>
          p.endsWith("phase.sh"),
        );
      put(root, f, "local overlay");
      assert.equal(cli.status(root, cfg.targetRepository).status, "drifted");
      assert.equal(
        cli.status(root, cfg.targetRepository, order[0]).status,
        "hash-match",
      );
      const current = cli.read_lock(root, secondary);
      assert.equal(
        cli.plan(
          root,
          cfg,
          inventories[secondary].files,
          current,
          current,
          "install",
        ).status,
        "blocked",
      );
      // A duplicate legacy/profile identity must never select an arbitrary authority.
      put(
        root,
        profile_lock_path(order[0]),
        fs.readFileSync(path.join(root, cli.LOCK_PATH)),
      );
      assert.throws(() => cli.read_locks(root), /Duplicate/);
      fs.unlinkSync(path.join(root, profile_lock_path(order[0])));
      put(
        root,
        profile_lock_path(secondary),
        canonical({ ...current, kitId: order[0] }),
      );
      assert.throws(() => cli.read_locks(root));
      assert.equal(
        fs.readFileSync(path.join(root, "README.md"), "utf8"),
        "preserved",
      );
      assert.ok(legacy.length);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
test("publisher accepts a profile-specific lock and rejects identity/path substitution", async () => {
  const kit = "opencode-direct",
    files = Object.fromEntries(
      render_mvp(ROOT, cfg, kit).files.map((f) => [
        f.path,
        Buffer.from(f.contentBase64, "base64"),
      ]),
    ),
    lock = cli.desired_lock(files, cfg, "0.1.0", "a".repeat(40), kit);
  const seen = [];
  const writer = {
    request: async (method, p, body) => {
      seen.push({ method, p, body });
      throw Error("preflight reached");
    },
  };
  await assert.rejects(
    publish_draft(
      writer,
      cfg.targetRepository,
      "main",
      "b".repeat(40),
      "asf-agentkit/install-direct",
      "c".repeat(64),
      "c".repeat(64),
      files,
      canonical(lock),
      profile_lock_path(kit),
    ),
    /preflight reached/,
  );
  assert.equal(seen.length, 1);
  seen.length = 0;
  await assert.rejects(
    publish_draft(
      writer,
      cfg.targetRepository,
      "main",
      "b".repeat(40),
      "asf-agentkit/install-direct",
      "c".repeat(64),
      "c".repeat(64),
      files,
      canonical(lock),
      profile_lock_path("opencode-openspec"),
    ),
    /identity mismatch/,
  );
  assert.equal(seen.length, 0);
});
