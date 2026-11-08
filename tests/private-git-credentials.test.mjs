import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { fs, path, ROOT, strictFile } from "../tools/node/common.mjs";
import { render_mvp } from "../tools/render_mvp_kit.mjs";

const cfg = strictFile(path.join(ROOT, "kits/opencode-openspec/mvp-config.example.json"));
const marker = "ASF_GIT_READ_TOKEN";
const readSteps = [
  "Verify owner request and source prerequisites before a paid job",
  "Prepare trusted guard and check exact remote refs",
];
const runScript = (step) => step?.run ?? "";

for (const [kit, target, count] of [
  ["opencode-openspec", ".github/workflows/asf-agentkit-openspec.yml", 3],
  ["opencode-direct", ".github/workflows/asf-agentkit-direct.yml", 2],
]) {
  test(`#118 ${kit}: authenticated, ephemeral Git reads with no model credentials`, () => {
    const rendered = render_mvp(ROOT, cfg, kit);
    const managed = rendered.files.find((f) => f.path === target);
    assert.ok(managed, "Expected a rendered workflow");
    const workflow = parse(Buffer.from(managed.contentBase64, "base64").toString("utf8"));
    assert.equal(workflow.permissions.contents, "read");
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      assert.equal(job.permissions.contents, "read", jobName);
      assert.equal(job.env?.[marker], undefined, "Never put the Git token in job env");
      const checkouts = job.steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
      assert.ok(checkouts.length, "Each job checks out the repository");
      for (const step of checkouts)
        assert.equal(step.with["persist-credentials"], false,
          "Never persist the token in working-tree Git configuration");
    }
    const scoped = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .filter((step) => Object.hasOwn(step.env ?? {}, marker));
    assert.equal(scoped.length, count);
    for (const step of scoped) {
      assert.ok(readSteps.includes(step.name) ||
        (kit === "opencode-openspec" &&
          step.name === "Load trusted policies and select exact observed branch"),
        "Read token must only be exposed to trusted preflight steps");
      assert.equal(step.env[marker], "${{ github.token }}");
      assert.match(runScript(step), /test -n "\$ASF_GIT_READ_TOKEN"/);
      assert.match(runScript(step), /export GIT_CONFIG_COUNT=1/);
      assert.match(runScript(step), /GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader/);
      assert.match(runScript(step), /GIT_CONFIG_VALUE_0=/);
      assert.doesNotMatch(runScript(step), /git config\s+--(?:global|local|system)/);
    }
    const modelSteps = workflow.jobs.execute.steps.filter((step) =>
      /Execute.*(?:task|phase|sequence)|Configure trusted model policy/.test(step.name ?? ""));
    assert.ok(modelSteps.length >= 2);
    for (const step of modelSteps) {
      assert.equal(step.env?.[marker], undefined);
      assert.doesNotMatch(runScript(step), /ASF_GIT_READ_TOKEN|GIT_CONFIG_VALUE_0/);
    }
    const issueStep = workflow.jobs.publish.steps.find((step) =>
      step.uses?.startsWith("actions/create-github-app-token@"));
    assert.ok(issueStep);
    assert.equal(issueStep.with["permission-contents"], "write");
    assert.equal(issueStep.with["permission-pull-requests"], "write");
    assert.ok(workflow.jobs.publish.steps.indexOf(issueStep) >
      workflow.jobs.publish.steps.findIndex((step) =>
        step.name === "Prepare trusted guard and check exact remote refs"),
      "Publishing permissions must be minted after read-only preflight");
  });
}

test("#118: no model runner step can inherit the read credential from workflow env", () => {
  for (const kit of ["opencode-openspec", "opencode-direct"]) {
    const template = fs.readFileSync(path.join(ROOT, "kits", kit, "templates",
      kit === "opencode-direct" ? "agent-direct.yml.tmpl" : "agent-openspec.yml.tmpl"), "utf8");
    assert.doesNotMatch(template, /^    env:\n      ASF_GIT_READ_TOKEN:/m);
    assert.doesNotMatch(template, /^  env:\n    ASF_GIT_READ_TOKEN:/m);
    assert.doesNotMatch(template, /persist-credentials: true/);
  }
});
