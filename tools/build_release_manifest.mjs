import {
  strictParse,
  VERSION,
  requireThat,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import {
  build_git_candidate,
  git_artifact_bytes,
  pinned_openspec_runtime,
} from "./build_candidate.mjs";
export const REPOSITORY = "cedricmenec/asf-agent-kits",
  KIT = "opencode-openspec";
export const RELEASE_PATHS = [
  "bin/asf-agentkit",
  ...["kit.json", "version.json", "mvp-config.example.json"].map(
    (p) => "kits/opencode-direct/" + p,
  ),
  ...[
    "agent-direct.yml",
    "request.mjs",
    "scope.mjs",
    "model-policy.mjs",
    "phase.sh",
    "manual-acceptance.md",
  ].map((p) => "kits/opencode-direct/templates/" + p + ".tmpl"),
  "package.json",
  "package-lock.json",
  ...["reference", "install", "releases", "use"].map(
    (p) => `docs/kits/opencode-openspec/${p}.md`,
  ),
  ...["kit.json", "mvp-config.example.json", "version.json"].map(
    (p) => `kits/${KIT}/${p}`,
  ),
  ...[
    "agent-openspec.yml",
    "checklist.mjs",
    "manual-acceptance.md",
    "model-policy.mjs",
    "openspec-checklist.md",
    "opsx-sync-quality.md",
    "phase.sh",
    "request.mjs",
    "scope.mjs",
  ].map((p) => `kits/${KIT}/templates/${p}.tmpl`),
  ...["agentkit-config", "agentkit-lock", "release", "release-claim"].map(
    (p) => `schemas/${p}.schema.json`,
  ),
  ...[
    "asf_agentkit_cli",
    "asf_agentkit_github_read",
    "asf_agentkit_publish",
    "build_candidate",
    "build_release_manifest",
    "plan_install",
    "render_mvp_kit",
    "render_templates",
    "validate_contracts",
  ].map((p) => `tools/${p}.mjs`),
  "tools/node/common.mjs",
  "tools/node/secure-fs.mjs",
];
export function descriptor(source, commit) {
  const version = strictParse(
      git_artifact_bytes(source, commit, `kits/${KIT}/version.json`),
    ),
    kit = strictParse(
      git_artifact_bytes(source, commit, `kits/${KIT}/kit.json`),
    );
  requireThat(
    version.schemaVersion === 1 &&
      version.distribution === "user-pinned-git-commit" &&
      version.releaseStatus === "stable" &&
      VERSION.test(version.kitVersion),
    "Source is not a stable kit release",
  );
  const tag = `kits/${KIT}/v${version.kitVersion}`;
  requireThat(
    kit.id === KIT &&
      kit.release.version === version.kitVersion &&
      kit.release.tag === tag &&
      kit.release.distribution === version.distribution,
    "Kit metadata mismatch",
  );
  return {
    schemaVersion: 1,
    kitId: KIT,
    kitVersion: version.kitVersion,
    coreVersion: version.kitVersion,
    sourceRepository: REPOSITORY,
    sourceCommitSha: commit,
    releaseTag: tag,
    runtime: pinned_openspec_runtime(source, commit),
    paths: RELEASE_PATHS,
  };
}
export const build_release_manifest = (source, commit) =>
  build_git_candidate(source, commit, descriptor(source, commit));
if (isMain(import.meta.url))
  runMain((a) => output(build_release_manifest(a.source, a.source_commit)));
