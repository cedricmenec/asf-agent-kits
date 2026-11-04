import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fs, path, ROOT, strictFile, git } from "../tools/node/common.mjs";
import { render_mvp } from "../tools/render_mvp_kit.mjs";
const cfg = strictFile(
  path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"),
);
const put = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
const commit = (p) => {
  git(p, "add", "-A");
  git(
    p,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "phase",
  );
};
function fixture(fn, { realNpm = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asf-lts-phases-")),
    target = path.join(root, "target");
  fs.mkdirSync(target);
  try {
    for (const f of render_mvp(ROOT, cfg).files)
      put(path.join(target, f.path), Buffer.from(f.contentBase64, "base64"));
    put(path.join(target, "openspec/config.yaml"), "schema: spec-driven\n");
    put(
      path.join(target, "backlog/tasks/TS-009.md"),
      "# Task 009\nBuild a safe feature.\n",
    );
    put(path.join(target, "package-lock.json"), "{}\n");
    put(path.join(target, "package.json"), '{"scripts":{"check":"true"}}\n');
    if (realNpm)
      for (const p of [
        "package.json",
        "package-lock.json",
        "check-esbuild.mjs",
      ])
        fs.copyFileSync(
          path.join(ROOT, "tests/fixtures/node-lts-esbuild", p),
          path.join(target, p),
        );
    git(target, "init", "-q");
    put(path.join(target, ".git/info/exclude"), "/node_modules/\n");
    commit(target);
    const bin = path.join(root, "mock-bin");
    fs.mkdirSync(bin);
    for (const name of realNpm
      ? ["openspec", "opencode"]
      : ["npm", "openspec", "opencode"]) {
      fs.copyFileSync(
        path.join(ROOT, "tests/fixtures/node-migration/fake-provider.cjs"),
        path.join(bin, name),
      );
      fs.chmodSync(path.join(bin, name), 0o700);
    }
    const runtime = path.join(target, ".asf/agentkit/runtime");
    fs.copyFileSync(
      path.join(runtime, "checklist.mjs"),
      path.join(root, "checklist.mjs"),
    );
    const env = {
      ...process.env,
      PATH:
        bin +
        path.delimiter +
        path.dirname(process.execPath) +
        path.delimiter +
        process.env.PATH,
      RUNNER_TEMP: root,
      MOCK_LOG: path.join(root, "calls.log"),
      GITHUB_REPOSITORY: cfg.targetRepository,
      TASK_ID: "TS-009",
      CHANGE_ID: "ts-009",
      OPENCODE_MODEL: "openrouter/deepseek/deepseek-v4.1-flash",
      ...(realNpm ? { REQUIRE_ESBUILD: "1" } : {}),
    };
    for (const key of [
      "OPENROUTER_API_KEY",
      "NODE_ENV",
      "npm_config_omit",
      "NPM_CONFIG_OMIT",
    ])
      delete env[key];
    return fn({ root, target, runtime, env });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const run = (target, runtime, env, phase) =>
  spawnSync("bash", [path.join(runtime, "phase.sh")], {
    cwd: target,
    env: { ...env, PHASE: phase },
    encoding: "utf8",
    timeout: 120000,
  });
for (const failure of [null, "apply", "sync"])
  test(
    "auto phases " +
      (failure
        ? "stop on " + failure
        : "complete sequentially without provider"),
    () =>
      fixture(({ target, runtime, env }) => {
        if (failure) env.FAIL_OPENCODE_PHASE = failure;
        const result = run(target, runtime, env, "auto");
        assert.equal(result.status === 0, !failure, result.stderr);
        const calls = fs.readFileSync(env.MOCK_LOG, "utf8");
        assert.deepEqual(
          calls.split("\n").filter((s) => s.startsWith("opencode-phase ")),
          failure === "apply"
            ? ["opencode-phase plan", "opencode-phase apply"]
            : [
                "opencode-phase plan",
                "opencode-phase apply",
                "opencode-phase sync",
              ],
        );
        assert.equal(calls.includes("openspec archive"), !failure);
        assert.equal(
          fs.existsSync(
            path.join(
              target,
              "openspec/changes/archive/2026-10-24-ts-009/tasks.md",
            ),
          ),
          !failure,
        );
        if (!failure) {
          execFileSync(
            process.execPath,
            [path.join(runtime, "scope.mjs"), "all", "auto", "ts-009"],
            { cwd: target, env },
          );
          git(target, "add", "-A");
          execFileSync(
            process.execPath,
            [path.join(runtime, "scope.mjs"), "staged", "auto", "ts-009"],
            { cwd: target, env },
          );
        }
      }),
  );
test("separate plan apply finalize preserve scope and placeholders", () =>
  fixture(({ target, runtime, env }) => {
    for (const phase of ["plan", "apply", "finalize"]) {
      const r = run(target, runtime, env, phase);
      assert.equal(r.status, 0, r.stderr);
      execFileSync(
        process.execPath,
        [path.join(runtime, "scope.mjs"), "all", phase, "ts-009"],
        { cwd: target, env },
      );
      git(target, "add", "-A");
      execFileSync(
        process.execPath,
        [path.join(runtime, "scope.mjs"), "staged", phase, "ts-009"],
        { cwd: target, env },
      );
      commit(target);
    }
    assert.equal(
      fs.readFileSync(path.join(target, "openspec/specs/demo/spec.md"), "utf8"),
      "Canonical semantic sync output\n",
    );
    assert.equal(
      fs
        .readFileSync(env.MOCK_LOG, "utf8")
        .split("\n")
        .filter((s) => s.startsWith("opencode run")).length,
      3,
    );
  }));
for (const [changes, message] of [
  [{ GITHUB_ACTOR: "other" }, "Owner-only"],
  [{ GITHUB_REF: "refs/heads/feature" }, "Owner-only"],
  [{ GITHUB_RUN_ATTEMPT: "2" }, "Owner-only"],
  [{ PHASE: "unknown" }, "Unsupported phase"],
  [{ OPENCODE_MODEL: "unlisted/model" }, "allowlist"],
  [{ RAW_TASK_ID: "0" }, "Invalid task ID"],
])
  test("request refuses " + JSON.stringify(changes) + " before network", () =>
    fixture(({ root, target, runtime, env }) => {
      const result = spawnSync(
        process.execPath,
        [path.join(runtime, "request.mjs")],
        {
          cwd: target,
          encoding: "utf8",
          env: {
            ...env,
            GITHUB_REPOSITORY_OWNER: "example",
            GITHUB_ACTOR: "example",
            GITHUB_REF: "refs/heads/main",
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_RUN_ATTEMPT: "1",
            PHASE: "auto",
            RAW_TASK_ID: "9",
            GITHUB_OUTPUT: path.join(root, "output"),
            ...changes,
          },
        },
      );
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(message), result.stderr);
      assert.equal(fs.existsSync(path.join(root, "output")), false);
    }),
  );
test(
  "fresh Node LTS phase runners install real dev esbuild before every check",
  { timeout: 180000 },
  (t) => {
    if (!process.version.startsWith("v26.")) {
      assert.notEqual(process.env.CI, "true", "CI must run latest LTS");
      t.skip("Requires Node 26 LTS");
      return;
    }
    fixture(
      ({ target, runtime, env }) => {
        const shell = fs.readFileSync(path.join(runtime, "phase.sh"), "utf8");
        assert.ok(
          shell.indexOf("npm ci --ignore-scripts") <
            shell.indexOf("openspec init --tools"),
        );
        assert.equal(shell.split("npm ci --ignore-scripts").length - 1, 1);
        for (const phase of ["plan", "apply", "finalize"]) {
          assert.equal(fs.existsSync(path.join(target, "node_modules")), false);
          const result = run(target, runtime, env, phase);
          assert.equal(result.status, 0, result.stderr);
          assert.ok(
            fs.existsSync(
              path.join(target, "node_modules/esbuild/package.json"),
            ),
          );
          assert.equal(
            git(target, "diff", "--", "package.json", "package-lock.json")
              .length,
            0,
          );
          for (const p of [
            "openspec/changes/archive/.gitkeep",
            "openspec/specs/.gitkeep",
          ])
            assert.equal(git(target, "check-ignore", p).toString().trim(), p);
          git(target, "add", "-A");
          execFileSync(
            process.execPath,
            [path.join(runtime, "scope.mjs"), "staged", phase, "ts-009"],
            { cwd: target, env },
          );
          commit(target);
          fs.rmSync(path.join(target, "node_modules"), { recursive: true });
        }
      },
      { realNpm: true },
    );
  },
);
