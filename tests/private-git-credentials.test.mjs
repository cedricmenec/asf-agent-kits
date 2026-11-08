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
  "Verify owner, preconditions and bounded optional repair before any paid job",
  "Check trusted policies and exact remote checkpoint",
  "Select exact published plan checkpoint",
];
const runScript = (step) => step?.run ?? "";

for (const [kit, target] of [
  ["opencode-openspec", ".github/workflows/asf-agentkit-openspec.yml"],
  ["opencode-direct", ".github/workflows/asf-agentkit-direct.yml"],
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
    assert.equal(scoped.length, kit === 'opencode-direct' ? 2 : 11);
    for (const step of scoped) {
      assert.ok(readSteps.includes(step.name) ||
        (kit === "opencode-openspec" &&
          step.name === "Load trusted policies and select exact observed branch"),
        "Read token must only be exposed to trusted preflight steps");
      assert.equal(step.env[marker], "${{ github.token }}");
      if (step.name !== 'Check trusted policies and exact remote checkpoint' &&
          step.name !== 'Select exact published plan checkpoint') {
        assert.match(runScript(step), /test -n "\$ASF_GIT_READ_TOKEN"/);
        assert.match(runScript(step), /export GIT_CONFIG_COUNT=1/);
        assert.match(runScript(step), /GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader/);
        assert.match(runScript(step), /GIT_CONFIG_VALUE_0=/);
      } else {
        assert.match(runScript(step), /git show "\$GITHUB_SHA:\.asf\/agentkit\/runtime\/stage\.sh"/);
        assert.match(runScript(step), /bash "\$RUNNER_TEMP\/stage\.sh" (execute|publish|verify)/);
      }
      assert.doesNotMatch(runScript(step), /git config\s+--(?:global|local|system)/);
    }
    const executeJobs = kit === 'opencode-direct' ? [workflow.jobs.execute] :
      ['execute_plan','execute_repair','execute_apply','execute_finalize'].map(name=>workflow.jobs[name]);
    const modelSteps = executeJobs.flatMap(job => job.steps).filter((step) =>
      /Execute.*(?:task|phase|sequence)|Repair existing plan|Configure trusted model policy/.test(step.name ?? ""));
    assert.ok(modelSteps.length >= 2);
    for (const step of modelSteps) {
      assert.equal(step.env?.[marker], undefined);
      assert.doesNotMatch(runScript(step), /ASF_GIT_READ_TOKEN|GIT_CONFIG_VALUE_0/);
    }
    const publishJobs = kit === 'opencode-direct' ? [workflow.jobs.publish] :
      ['publish_plan','publish_repair','publish_apply','publish_finalize'].map(name=>workflow.jobs[name]);
    for (const publishJob of publishJobs) {
      const issueStep = publishJob.steps.find((step) =>
        step.uses?.startsWith("actions/create-github-app-token@"));
      assert.ok(issueStep);
      assert.equal(issueStep.with["permission-contents"], "write");
      assert.equal(issueStep.with["permission-pull-requests"], "write");
      assert.ok(publishJob.steps.indexOf(issueStep) >
        publishJob.steps.findIndex((step) =>
          /Check trusted policies|Prepare trusted guard/.test(step.name ?? '')),
        "Publishing permissions must be minted after read-only preflight");
    }
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
