#!/usr/bin/env node
// Local-only provider substitute. No network and no credential consumption.
const fs = require("node:fs"),
  path = require("node:path");
const name = path.basename(process.argv[1]),
  args = process.argv.slice(2),
  log = (line) => fs.appendFileSync(process.env.MOCK_LOG, line + "\n"),
  put = (p, s) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, s);
  },
  change = "openspec/changes/ts-009";
log(name + " " + args.slice(0, 7).join(" "));
if (
  process.env.REQUIRE_ESBUILD === "1" &&
  !fs.existsSync("node_modules/esbuild/package.json")
)
  process.exit(91);
if (name === "npm") process.exit(0);
if (name === "openspec") {
  if (args[0] === "init")
    for (const p of [
      ".opencode/commands/opsx-sync.md",
      ".opencode/skills/openspec-sync-specs/SKILL.md",
      "openspec/changes/archive/.gitkeep",
      "openspec/specs/.gitkeep",
    ])
      put(p, "generated\n");
  if (args[0] === "new") fs.mkdirSync(change, { recursive: true });
  if (args[0] === "archive") {
    fs.mkdirSync("openspec/changes/archive", { recursive: true });
    fs.renameSync(change, "openspec/changes/archive/2026-10-24-ts-009");
  }
  process.exit(0);
}
if (name === "opencode") {
  const phase = args.includes("--command")
    ? "sync"
    : fs.existsSync(change + "/proposal.md")
      ? "apply"
      : "plan";
  log("opencode-phase " + phase);
  if (process.env.FAIL_OPENCODE_PHASE === phase) process.exit(42);
  if (phase === "sync")
    put("openspec/specs/demo/spec.md", "Canonical semantic sync output\n");
  else if (phase === "plan")
    for (const [p, s] of Object.entries({
      "proposal.md": "Proposal\n",
      "design.md": "Design\n",
      "tasks.md": "## Implementation checklist\n- [ ] Implement feature\n",
      "specs/demo/spec.md": "## Requirement: feature\n#### Scenario: works\n",
    }))
      put(change + "/" + p, s);
  else {
    put(
      change + "/tasks.md",
      "## Implementation checklist\n- [x] Implement feature\n",
    );
    put("src/new-feature.txt", "implemented\n");
  }
  process.exit(0);
}
process.exit(127);
