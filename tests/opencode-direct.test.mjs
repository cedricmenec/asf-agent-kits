import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { ROOT, git, canonical, strictFile } from "../tools/node/common.mjs";
import { render_mvp, profile } from "../tools/render_mvp_kit.mjs";
import {
  rendered_source,
  desired_lock,
  plan,
  create_only,
  status,
  doctor,
  read_lock,
  apply_upgrade,
} from "../tools/asf_agentkit_cli.mjs";
import { openRoot } from "../tools/node/secure-fs.mjs";
import { publish_draft } from "../tools/asf_agentkit_publish.mjs";
const kit = "opencode-direct";
const cfg = strictFile(
  path.join(ROOT, "kits/opencode-direct/mvp-config.example.json"),
);
const put = (root, p, text) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), text);
};
const commit = (root) => {
  git(root, "add", "-A");
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
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "direct-test-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function materialize(root) {
  for (const f of render_mvp(ROOT, cfg, kit).files)
    put(root, f.path, Buffer.from(f.contentBase64, "base64"));
  return path.join(root, ".asf/agentkit/direct");
}
const environment = (root) => ({
  ...process.env,
  GITHUB_REPOSITORY: cfg.targetRepository,
  GITHUB_REPOSITORY_OWNER: cfg.targetRepository.split("/")[0],
  GITHUB_ACTOR: cfg.targetRepository.split("/")[0],
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ATTEMPT: "1",
  PHASE: "run",
  OPENCODE_MODEL: "openrouter/z-ai/glm-5.3-flash",
  RAW_TASK_ID: "9",
  TASK_ID: cfg.taskPrefix + "-009",
  GITHUB_OUTPUT: path.join(root, "out"),
  RUNNER_TEMP: root,
});
const run = (root, file, env) =>
  spawnSync(process.execPath, [file], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 30000,
  });
function requestFixture(root) {
  const runtime = materialize(root);
  put(
    root,
    `${cfg.taskDirectory}/${cfg.taskPrefix}-009.md`,
    "Implement one feature.",
  );
  put(root, "package.json", '{"scripts":{"check":"true"}}');
  put(root, "package-lock.json", "{}");
  git(root, "init", "-q");
  commit(root);
  const bare = path.join(root, "remote.git");
  git(root, "init", "--bare", "-q", bare);
  git(root, "remote", "add", "origin", bare);
  return runtime;
}
test("direct renderer is deterministic, pinned, independent of OpenSpec and isolates writer", () =>
  fixture((root) => {
    const runtime = materialize(root),
      preview = render_mvp(ROOT, cfg, kit);
    assert.deepEqual(preview, render_mvp(ROOT, cfg, kit));
    assert.equal(preview.files.length, 6);
    const text = fs.readFileSync(
      path.join(root, ".github/workflows/asf-agentkit-direct.yml"),
      "utf8",
    );
    const workflow = parse(text);
    assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
    assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
      "task_id",
      "model",
    ]);
    assert.equal(workflow.permissions.contents, "read");
    assert.equal(workflow.jobs.execute.permissions.contents, "read");
    assert.equal(workflow.jobs.execute.concurrency.group, cfg.mutexGroup);
    assert.equal(
      workflow.jobs.execute.concurrency["cancel-in-progress"],
      false,
    );
    assert.equal(workflow.jobs.execute["timeout-minutes"], 20);
    assert.equal(
      workflow.jobs.execute.steps.some((s) =>
        s.uses?.startsWith("actions/create-github-app-token"),
      ),
      false,
    );
    assert.equal(
      JSON.stringify(workflow.jobs.execute).includes(cfg.appPrivateKeySecret),
      false,
    );
    assert.equal(
      JSON.stringify(workflow.jobs.publish).includes(cfg.openRouterSecret),
      false,
    );
    assert.ok(JSON.stringify(workflow.jobs.publish).includes("--draft"));
    const upload = workflow.jobs.execute.steps.find((s) =>
      s.uses?.startsWith("actions/upload-artifact"),
    );
    const download = workflow.jobs.publish.steps.find((s) =>
      s.uses?.startsWith("actions/download-artifact"),
    );
    assert.equal(upload.with.name, download.with.name);
    assert.equal(text.includes("openspec"), false);
    for (const job of Object.values(workflow.jobs))
      for (const step of job.steps)
        if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
    for (const file of ["request.mjs", "scope.mjs", "model-policy.mjs"])
      execFileSync(process.execPath, ["--check", path.join(runtime, file)]);
    execFileSync("bash", ["-n", path.join(runtime, "phase.sh")]);
  }));
test("scope accepts direct product changes and refuses protected/custom task paths", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "direct-scope-"));
  try {
    const runtime = materialize(root),
      { allowed, checkPaths } = await import(
        pathToFileURL(path.join(runtime, "scope.mjs"))
      );
    assert.equal(allowed("run", "ts-009", "src/feature.mjs"), true);
    for (const p of [
      ".github/workflows/ci.yml",
      ".asf/agentkit/direct/scope.mjs",
      ".asf/agentkit.lock.json",
      "AGENTS.md",
      "ChatGPT.md",
      "opencode.json",
      "scripts/test.mjs",
      "openspec/specs/x/spec.md",
      `${cfg.taskDirectory}/TS-009.md`,
      ".env",
      "src/.env.local",
      "credentials",
      "src/id_rsa",
      ".aws/config",
      ".ssh/config",
      "secret.pem",
      "../src/x",
      "src/../x",
      "src\\x",
    ])
      assert.equal(allowed("run", "ts-009", p), false, p);
    assert.equal(allowed("apply", "ts-009", "src/x"), false);
    assert.throws(() => checkPaths("run", "ts-009", []), /Empty/);
    const alternate = { ...cfg, taskDirectory: "work/items" };
    const f = render_mvp(ROOT, alternate, kit).files.find((f) =>
      f.path.endsWith("/scope.mjs"),
    );
    put(root, "custom-scope.mjs", Buffer.from(f.contentBase64, "base64"));
    const custom = await import(
      pathToFileURL(path.join(root, "custom-scope.mjs"))
    );
    assert.equal(
      custom.allowed("run", "ts-009", "work/items/TS-009.md"),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
for (const [changes, error] of [
  [{ GITHUB_ACTOR: "intruder" }, "Owner-only"],
  [{ GITHUB_REF: "refs/heads/feature" }, "Owner-only"],
  [{ GITHUB_EVENT_NAME: "push" }, "Owner-only"],
  [{ GITHUB_RUN_ATTEMPT: "2" }, "Owner-only"],
  [{ GITHUB_REPOSITORY: "other/repo" }, "Owner-only"],
  [{ PHASE: "auto" }, "Unsupported phase"],
  [{ OPENCODE_MODEL: "unlisted/model" }, "allowlist"],
  [{ RAW_TASK_ID: "../9" }, "Invalid task"],
  [{ RAW_TASK_ID: "0" }, "Invalid task"],
])
  test("request refuses " + JSON.stringify(changes), () =>
    fixture((root) => {
      const runtime = requestFixture(root),
        result = run(root, path.join(runtime, "request.mjs"), {
          ...environment(root),
          ...changes,
        });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(error));
      assert.equal(fs.existsSync(path.join(root, "out")), false);
    }),
  );
test("request needs no OpenSpec, normalizes task and refuses existing direct branch", () =>
  fixture((root) => {
    const runtime = requestFixture(root),
      env = environment(root);
    let r = run(root, path.join(runtime, "request.mjs"), env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      fs.readFileSync(env.GITHUB_OUTPUT, "utf8"),
      /branch=agent\/direct\/TS-009/,
    );
    assert.equal(fs.existsSync(path.join(root, "openspec")), false);
    git(root, "push", "-q", "origin", "HEAD:refs/heads/agent/direct/TS-009");
    r = run(root, path.join(runtime, "request.mjs"), env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /already exists/);
  }));
for (const failure of [null, "opencode", "check"])
  test(
    "direct phase " +
      (failure ? "stops on " + failure : "executes once and checks"),
    () =>
      fixture((root) => {
        const runtime = requestFixture(root),
          bin = path.join(root, "mock-bin");
        fs.mkdirSync(bin);
        for (const name of ["npm", "opencode"]) {
          put(
            root,
            "mock-bin/" + name,
            `#!/usr/bin/env node\nconst fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(process.env.CALLS,${JSON.stringify(name)}+' '+args[0]+'\\n'); if(process.env.FAIL===${JSON.stringify(name === "npm" ? "check" : "opencode")} && ${name === "npm" ? "args[0]==='run'" : "true"}) process.exit(7);\n`,
          );
          fs.chmodSync(path.join(bin, name), 0o700);
        }
        const env = {
          ...environment(root),
          PATH: bin + path.delimiter + process.env.PATH,
          CALLS: path.join(root, "calls"),
          FAIL: failure || "",
        };
        delete env.OPENROUTER_API_KEY;
        delete env.GH_TOKEN;
        delete env.GITHUB_TOKEN;
        const r = spawnSync("bash", [path.join(runtime, "phase.sh")], {
          cwd: root,
          env,
          encoding: "utf8",
        });
        assert.equal(r.status === 0, !failure, r.stderr);
        assert.deepEqual(
          fs.readFileSync(env.CALLS, "utf8").trim().split("\n"),
          failure === "opencode"
            ? ["npm ci", "opencode run"]
            : ["npm ci", "opencode run", "npm run"],
        );
      }),
  );
test("CLI pinned install, idempotence, drift, overlay refusal, upgrade and cross-profile refusal", (t) => {
  try {
    fs.closeSync(openRoot(ROOT));
  } catch {
    assert.notEqual(
      process.env.CI,
      "true",
      "CI must expose Linux procfs for installation tests",
    );
    t.skip("Local filesystem broker does not expose procfs descriptors");
    return;
  }
  return fixture((root) => {
    const source = path.join(root, "source"),
      target = path.join(root, "target");
    fs.mkdirSync(source);
    fs.mkdirSync(target);
    for (const [name] of profile(kit).files)
      put(
        source,
        "kits/opencode-direct/templates/" + name,
        fs.readFileSync(
          path.join(ROOT, "kits/opencode-direct/templates", name),
        ),
      );
    put(
      source,
      "kits/opencode-direct/version.json",
      fs.readFileSync(path.join(ROOT, "kits/opencode-direct/version.json")),
    );
    git(source, "init", "-q");
    git(
      source,
      "remote",
      "add",
      "origin",
      "https://github.com/cedricmenec/asf-agent-kits",
    );
    const sha = commit(source);
    git(target, "init", "-q");
    git(
      target,
      "remote",
      "add",
      "origin",
      "https://github.com/" + cfg.targetRepository,
    );
    put(target, "README.md", "Existing content\n");
    const head = commit(target);
    git(target, "switch", "-c", "install-direct");
    const files = rendered_source(source, sha, "0.1.0", cfg, kit),
      lock = desired_lock(files, cfg, "0.1.0", sha, kit);
    const preview = plan(target, cfg, files, null, lock, "install");
    assert.equal(preview.conflicts, 0);
    assert.equal(create_only(target, files, lock, preview, head, "main"), 7);
    assert.equal(read_lock(target).kitId, kit);
    assert.equal(status(target, cfg.targetRepository).status, "hash-match");
    assert.equal(
      doctor(target, cfg.targetRepository, cfg).localChecks
        .managedWorkflowPresent,
      true,
    );
    assert.equal(
      Object.hasOwn(
        doctor(target, cfg.targetRepository, cfg).localChecks,
        "openspecConfigPresent",
      ),
      false,
    );
    assert.ok(
      plan(target, cfg, files, lock, lock, "install").operations.every(
        (o) => o.action === "unchanged",
      ),
    );
    put(target, ".asf/agentkit/direct/phase.sh", "local overlay");
    assert.equal(status(target, cfg.targetRepository).status, "drifted");
    assert.equal(
      plan(target, cfg, files, lock, lock, "install").status,
      "blocked",
    );
    put(
      target,
      ".asf/agentkit/direct/phase.sh",
      files[".asf/agentkit/direct/phase.sh"],
    );
    assert.throws(
      () =>
        plan(
          target,
          cfg,
          files,
          lock,
          { ...lock, kitId: "opencode-openspec" },
          "install",
        ),
      /Changing installed kit/,
    );
    commit(target);
    const next = {
      ...files,
      ".asf/agentkit/direct/phase.sh": Buffer.concat([
        files[".asf/agentkit/direct/phase.sh"],
        Buffer.from("\n# upgrade\n"),
      ]),
    };
    const newLock = desired_lock(next, cfg, "0.1.1", sha, kit),
      up = plan(target, cfg, next, lock, newLock, "upgrade");
    const current = git(target, "rev-parse", "HEAD").toString().trim();
    apply_upgrade(target, next, lock, newLock, up, current, "main");
    assert.equal(read_lock(target).version, "0.1.1");
    assert.equal(
      fs.readFileSync(path.join(target, "README.md"), "utf8"),
      "Existing content\n",
    );
    // Source checkout edits cannot substitute bytes at a pinned SHA.
    put(source, "kits/opencode-direct/templates/phase.sh.tmpl", "untrusted");
    assert.deepEqual(rendered_source(source, sha, "0.1.0", cfg, kit), files);
    assert.throws(
      () => rendered_source(source, sha, "0.2.0", cfg, kit),
      /version mismatch/,
    );
    const cli = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "bin/asf-agentkit"),
        "status",
        "--repo",
        cfg.targetRepository,
        "--checkout",
        target,
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).status, "hash-match");
  });
});
test("publisher rejects mixed-profile bytes before any network operation", async () => {
  let calls = 0;
  const writer = {
    request() {
      calls++;
      throw Error("unexpected network");
    },
  };
  const files = Object.fromEntries(
    render_mvp(ROOT, cfg, kit).files.map((f) => [
      f.path,
      Buffer.from(f.contentBase64, "base64"),
    ]),
  );
  const lock = desired_lock(files, cfg, "0.1.0", "a".repeat(40), kit);
  await assert.rejects(
    publish_draft(
      writer,
      cfg.targetRepository,
      "main",
      "b".repeat(40),
      "install/direct",
      "c".repeat(64),
      "c".repeat(64),
      { ...files, ".github/workflows/evil.yml": Buffer.from("bad") },
      canonical(lock),
    ),
    /Reviewed files/,
  );
  assert.equal(calls, 0);
});

test("artifact scope rejects deletions, symbolic links and hard links; clean replay accepts product patch", () =>
  fixture((root) => {
    const runtime = materialize(root);
    put(root, "src/feature.mjs", "export const value = 1;\n");
    git(root, "init", "-q");
    const base = commit(root);
    const check = () =>
      spawnSync(
        process.execPath,
        [path.join(runtime, "scope.mjs"), "all", "run", "ts-009"],
        { cwd: root, encoding: "utf8" },
      );
    fs.unlinkSync(path.join(root, "src/feature.mjs"));
    assert.notEqual(check().status, 0);
    put(root, "src/feature.mjs", "export const value = 1;\n");
    fs.symlinkSync("feature.mjs", path.join(root, "src/link.mjs"));
    assert.notEqual(check().status, 0);
    fs.unlinkSync(path.join(root, "src/link.mjs"));
    fs.linkSync(
      path.join(root, "src/feature.mjs"),
      path.join(root, "src/link.mjs"),
    );
    assert.notEqual(check().status, 0);
    fs.unlinkSync(path.join(root, "src/link.mjs"));
    put(root, "src/feature.mjs", "export const value = 2;\n");
    assert.equal(check().status, 0);
    git(root, "add", "-A");
    const patch = git(root, "diff", "--cached", "--binary");
    git(root, "reset", "--hard", base);
    // Reapply the artifact on a fresh base, exactly as the isolated publisher does.
    const patchPath = path.join(root, "patch.bin");
    fs.writeFileSync(patchPath, patch);
    git(root, "apply", "--check", "--index", patchPath);
    git(root, "apply", "--index", patchPath);
    fs.unlinkSync(patchPath);
    const result = spawnSync(
      process.execPath,
      [path.join(runtime, "scope.mjs"), "staged", "run", "ts-009"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(path.join(root, "src/feature.mjs"), "utf8"),
      "export const value = 2;\n",
    );
  }));
