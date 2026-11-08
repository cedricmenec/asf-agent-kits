import {
  fs,
  path,
  requireThat,
  hash,
  strictFile,
  strictParse,
  canonical,
  git,
  SHA,
  REPO,
  exact,
  object,
  safePath,
  safeRoot,
  member,
  readFile,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
export class PlanError extends Error {}
export const MAX_FILE = 1048576,
  MAX_TOTAL = 10 * MAX_FILE,
  MAX_DESCRIPTOR = 65536;
export const RELEASE_KEYS = [
  "schemaVersion",
  "kitId",
  "kitVersion",
  "coreVersion",
  "sourceRepository",
  "sourceCommitSha",
  "releaseTag",
  "runtime",
];
export const strict_json = strictFile,
  manifest_bytes = canonical,
  read_exact_manifest = (p) => readFile(p, MAX_DESCRIPTOR),
  git_output = git;
export function validate_artifact_path(p) {
  safePath(p);
  requireThat(
    ![".asf/agentkit.yaml", ".asf/agentkit.lock.json"].includes(p),
    "Reserved artifact path",
  );
}
export function artifact_digest(root, p) {
  const raw = readFile(member(root, p));
  return [hash(raw), raw.length];
}
export function git_artifact_bytes(root, commit, relative) {
  validate_artifact_path(relative);
  const row = git(root, "ls-tree", "-z", commit, "--", relative).toString();
  const m = /^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)\0$/.exec(row);
  requireThat(m && m[3] === relative, "Expected exact regular Git blob");
  const size = Number(git(root, "cat-file", "-s", m[2]).toString().trim());
  requireThat(
    Number.isInteger(size) && size <= MAX_FILE,
    "Oversized Git object",
  );
  const raw = git(root, "cat-file", "blob", m[2]);
  requireThat(raw.length === size, "Git byte count mismatch");
  return raw;
}
export function pinned_openspec_runtime(root, commit) {
  const text = git_artifact_bytes(
    root,
    commit,
    "kits/opencode-openspec/templates/agent-openspec.yml.tmpl",
  ).toString();
  const nodes = [
    ...text.matchAll(
      /^[ \t]+node-version: '([0-9]+\.[0-9]+\.[0-9]+)'[ \t]*$/gm,
    ),
  ].map((m) => m[1]);
  const packages = [
    ...text.matchAll(
      /^[ \t]+npm install --global @fission-ai\/openspec@([0-9]+\.[0-9]+\.[0-9]+) opencode-ai@([0-9]+\.[0-9]+\.[0-9]+)[ \t]*$/gm,
    ),
  ];
  const verifyPackages = [
    ...text.matchAll(
      /^[ \t]+npm install --global @fission-ai\/openspec@([0-9]+\.[0-9]+\.[0-9]+)[ \t]*$/gm,
    ),
  ];
  requireThat(
    nodes.length >= 2 && new Set(nodes).size === 1 && packages.length >= 1 &&
      new Set(packages.map(p => p[1] + '/' + p[2])).size === 1 &&
      verifyPackages.every(p => p[1] === packages[0][1]),
    "Inconsistent explicit runtime pins",
  );
  return {
    nodeVersion: nodes[0],
    openCodeVersion: packages[0][2],
    openSpecVersion: packages[0][1],
  };
}
export function build_document(document, digestForPath) {
  requireThat(
    exact(document, [...RELEASE_KEYS, "paths"]),
    "Invalid descriptor fields",
  );
  const paths = document.paths;
  requireThat(
    Array.isArray(paths) &&
      paths.length > 0 &&
      paths.length <= 250 &&
      paths.every((p) => typeof p === "string") &&
      new Set(paths.map((p) => p.toLowerCase())).size === paths.length,
    "Invalid/duplicate paths",
  );
  let total = 0;
  const artifacts = [...paths].sort().map((p) => {
    validate_artifact_path(p);
    const [digest, size] = digestForPath(p);
    total += size;
    requireThat(total <= MAX_TOTAL, "Aggregate size limit");
    return { path: p, sha256: digest };
  });
  const result = {
    ...Object.fromEntries(RELEASE_KEYS.map((k) => [k, document[k]])),
    artifacts,
  };
  requireThat(
    validate("release", result).length === 0,
    "Invalid release contract",
  );
  return result;
}
export function build_candidate(source, descriptor) {
  const root = safeRoot(source);
  return build_document(
    typeof descriptor === "string" ? strictFile(descriptor) : descriptor,
    (p) => artifact_digest(root, p),
  );
}
export function build_git_candidate(source, commit, doc) {
  const root = safeRoot(source);
  requireThat(
    typeof commit === "string" &&
      SHA.test(commit) &&
      git(root, "rev-parse", "--verify", commit + "^{commit}")
        .toString()
        .trim() === commit,
    "Full exact Git commit required",
  );
  requireThat(
    object(doc) &&
      REPO.test(doc.sourceRepository) &&
      doc.sourceCommitSha === commit,
    "Source identity mismatch",
  );
  const remote = git(root, "remote", "get-url", "origin").toString().trim();
  requireThat(
    [
      `https://github.com/${doc.sourceRepository}`,
      `https://github.com/${doc.sourceRepository}.git`,
      `git@github.com:${doc.sourceRepository}`,
      `git@github.com:${doc.sourceRepository}.git`,
    ].includes(remote),
    "Source remote mismatch",
  );
  requireThat(/^[a-z0-9-]{1,60}$/.test(doc.kitId), "Invalid kit");
  const version = strictParse(
    git_artifact_bytes(root, commit, `kits/${doc.kitId}/version.json`),
  );
  requireThat(
    version.schemaVersion === 1 && version.kitVersion === doc.kitVersion,
    "Source version mismatch",
  );
  if (doc.kitId === "opencode-openspec")
    requireThat(
      canonical(doc.runtime).equals(
        canonical(pinned_openspec_runtime(root, commit)),
      ),
      "Runtime pins mismatch",
    );
  return build_document(doc, (p) => {
    const raw = git_artifact_bytes(root, commit, p);
    return [hash(raw), raw.length];
  });
}
if (isMain(import.meta.url))
  runMain((a) => {
    const doc = strictFile(a.descriptor),
      result = a.source_commit
        ? build_git_candidate(a.source, a.source_commit, doc)
        : build_candidate(a.source, doc);
    if (a.verify_manifest)
      requireThat(
        read_exact_manifest(a.verify_manifest).equals(canonical(result)),
        "Exact manifest bytes differ",
      );
    output(result);
  });
