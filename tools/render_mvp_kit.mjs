import {
  ROOT,
  fs,
  path,
  hash,
  exact,
  requireThat,
  REPO,
  safeRoot,
  strictFile,
  output,
  isMain,
  runMain,
} from "./node/common.mjs";
import { read_regular } from "./render_templates.mjs";
export const CATALOGUE = ROOT,
  TEMPLATES = "kits/opencode-openspec/templates/";
export const FILES = [
  ["agent-openspec.yml.tmpl", ".github/workflows/asf-agentkit-openspec.yml"],
  ...[
    "request.mjs",
    "scope.mjs",
    "model-policy.mjs",
    "budget.mjs",
    "checklist.mjs",
    "phase.sh",
    "publish.sh",
    "stage.sh",
  ].map((v) => [v + ".tmpl", ".asf/agentkit/runtime/" + v]),
  ...[
    "manual-acceptance.md",
    "openspec-checklist.md",
    "opsx-sync-quality.md",
  ].map((v) => [v + ".tmpl", ".asf/agentkit/" + v]),
];
const checks = {
  targetRepository: REPO,
  defaultBranch: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  taskPrefix: /^[A-Z][A-Z0-9]{1,8}$/,
  taskDirectory: /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/,
  checkScript: /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/,
  appIdVar: /^[A-Za-z_][A-Za-z0-9_]*$/,
  appPrivateKeySecret: /^[A-Za-z_][A-Za-z0-9_]*$/,
  openRouterSecret: /^[A-Za-z_][A-Za-z0-9_]*$/,
  mutexGroup: /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/,
};
export function checked_config(config) {
  requireThat(
    exact(config, ["schemaVersion", ...Object.keys(checks)]) &&
      config.schemaVersion === 1,
    "Invalid MVP config",
  );
  for (const [k, re] of Object.entries(checks))
    requireThat(
      typeof config[k] === "string" && re.test(config[k]),
      "Invalid " + k,
    );
  requireThat(
    !config.targetRepository.split("/").some((x) => [".", ".."].includes(x)),
    "Invalid repository",
  );
  requireThat(
    !config.defaultBranch.includes("..") &&
      !config.defaultBranch.includes("//") &&
      !/[./]$/.test(config.defaultBranch),
    "Unsafe defaultBranch",
  );
  requireThat(
    !config.taskDirectory.split("/").some((x) => [".", ".."].includes(x)),
    "Unsafe taskDirectory",
  );
  return Object.fromEntries(
    Object.entries(config)
      .filter(([k]) => k !== "schemaVersion")
      .map(([k, v]) => [k.toUpperCase(), v]),
  );
}
export const DIRECT_FILES = [
  ["agent-direct.yml.tmpl", ".github/workflows/asf-agentkit-direct.yml"],
  ...["request.mjs", "scope.mjs", "model-policy.mjs", "phase.sh"].map((v) => [
    v + ".tmpl",
    ".asf/agentkit/direct/" + v,
  ]),
  ["manual-acceptance.md.tmpl", ".asf/agentkit/direct/manual-acceptance.md"],
];
export const KIT_IDS = ["opencode-openspec", "opencode-direct"];
export const LEGACY_LOCK = ".asf/agentkit.lock.json";
export function profile_lock_path(kit) {
  profile(kit);
  return ".asf/agentkit/locks/" + kit + ".json";
}
export function profile(kit = "opencode-openspec") {
  requireThat(
    ["opencode-openspec", "opencode-direct"].includes(kit),
    "Unsupported kit",
  );
  return kit === "opencode-direct"
    ? { files: DIRECT_FILES, templates: "kits/opencode-direct/templates/" }
    : { files: FILES, templates: TEMPLATES };
}
export function render_mvp(source, config, kit = "opencode-openspec") {
  const selected = profile(kit);
  const root = safeRoot(source),
    vars = checked_config(config);
  const files = selected.files
    .map(([src, dest]) => {
      const bytes = read_regular(root, selected.templates + src, 1048576);
      let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      requireThat(!/[\0\r]/.test(text), "Invalid template bytes");
      text = text.replace(/@@([A-Z_]+)@@/g, (_, key) => {
        requireThat(Object.hasOwn(vars, key), "Unknown token");
        return vars[key];
      });
      requireThat(!text.includes("@@"), "Unresolved delimiter");
      const data = Buffer.from(text);
      return {
        path: dest,
        sha256: hash(data),
        contentBase64: data.toString("base64"),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    kind: "ak-mvp-01-local-render",
    kitId: kit,
    sourceProvenanceVerified: false,
    writesPerformed: false,
    files,
  };
}
if (isMain(import.meta.url))
  runMain((a) => output(render_mvp(a.source || ROOT, strictFile(a.config))));
