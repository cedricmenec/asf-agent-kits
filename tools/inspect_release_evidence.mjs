import {
  object,
  REPO,
  VERSION,
  SHA,
  requireThat,
  hash,
  strictParse,
  readFile,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
import { path_issue } from "./check_release_claim.mjs";
import { GitHubReader, ReadUnavailable } from "./asf_agentkit_github_read.mjs";
export class EvidenceRefused extends Error {}
const requireEvidence = (ok, reason) => {
  if (!ok) throw new EvidenceRefused(reason);
};
export const load_local_manifest = (p) => readFile(p, 65536);
async function object_at(reader, p, label) {
  const v = await reader.get(p);
  requireEvidence(object(v), "invalid " + label + " response");
  return v;
}
export async function source_bytes(reader, p, commit) {
  const v = await object_at(
    reader,
    "/contents/" +
      p.split("/").map(encodeURIComponent).join("/") +
      "?ref=" +
      commit,
    "source file",
  );
  requireEvidence(
    v.type === "file" &&
      v.path === p &&
      v.encoding === "base64" &&
      Number.isInteger(v.size) &&
      v.size >= 0 &&
      v.size <= 1048576 &&
      typeof v.content === "string",
    "invalid or oversized source file",
  );
  const raw = Buffer.from(v.content, "base64");
  requireEvidence(
    raw.toString("base64") === v.content.replaceAll("\n", ""),
    "non-canonical base64 source file",
  );
  requireEvidence(raw.length === v.size, "source bytes/size mismatch");
  return raw;
}
export async function inspect(
  reader,
  repository,
  kit,
  version,
  publisher,
  raw,
) {
  const result = {
    kind: "github-release-evidence-inspection",
    repository,
    kitId: kit,
    kitVersion: version,
    releaseEvidenceConsistent: false,
    sourceProvenanceVerified: false,
    trustEvidenceIndependentlyVerified: false,
    tagGovernanceVerified: false,
    promotionAllowed: false,
    authorizedToExecute: false,
    writesPerformed: false,
    errors: [],
  };
  try {
    requireEvidence(
      typeof repository === "string" && REPO.test(repository),
      "invalid target repository",
    );
    requireEvidence(
      typeof kit === "string" &&
        /^[a-z0-9-]{1,60}$/.test(kit) &&
        typeof version === "string" &&
        /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version),
      "invalid kit/version",
    );
    requireEvidence(
      typeof publisher === "string" && /^[A-Za-z0-9-]{1,39}$/.test(publisher),
      "expected publisher required",
    );
    const tag = `kits/${kit}/v${version}`,
      repo = await object_at(reader, "", "repository");
    requireEvidence(
      repo.full_name === repository &&
        repo.default_branch === "main" &&
        Number.isInteger(repo.id) &&
        repo.archived === false,
      "repository identity or default branch mismatch",
    );
    const branch = await object_at(reader, "/branches/main", "main branch"),
      main = branch.commit?.sha;
    requireEvidence(
      typeof main === "string" && SHA.test(main) && branch.protected === true,
      "main SHA or protection not established",
    );
    const tagPath = encodeURIComponent(tag),
      release = await object_at(reader, "/releases/tags/" + tagPath, "release");
    requireEvidence(
      release.tag_name === tag &&
        release.draft === false &&
        release.prerelease === false &&
        typeof release.published_at === "string" &&
        release.published_at &&
        Number.isInteger(release.id) &&
        object(release.author) &&
        release.author.login === publisher,
      "published release or expected author not established",
    );
    const ref = await object_at(reader, "/git/ref/tags/" + tagPath, "tag ref"),
      target = ref.object;
    requireEvidence(
      ref.ref === "refs/tags/" + tag &&
        object(target) &&
        target.type === "tag" &&
        typeof target.sha === "string" &&
        SHA.test(target.sha),
      "expected annotated release tag not established",
    );
    const annotated = await object_at(
        reader,
        "/git/tags/" + target.sha,
        "annotated tag",
      ),
      source = annotated.object;
    requireEvidence(
      annotated.tag === tag &&
        object(source) &&
        source.type === "commit" &&
        typeof source.sha === "string" &&
        SHA.test(source.sha),
      "annotated tag does not target a commit",
    );
    const commit = source.sha,
      ancestry = await object_at(
        reader,
        "/compare/" + commit + "...main",
        "ancestry",
      );
    requireEvidence(
      ["identical", "ahead"].includes(ancestry.status) &&
        ancestry.behind_by === 0 &&
        ancestry.merge_base_commit?.sha === commit,
      "release commit not proven in main ancestry",
    );
    const after = await object_at(
      reader,
      "/branches/main",
      "main branch recheck",
    );
    requireEvidence(
      after.commit?.sha === main && after.protected === true,
      "main branch moved or protection changed during inspection",
    );
    requireEvidence(
      Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 65536,
      "missing or oversized local release manifest",
    );
    const manifest = strictParse(raw);
    requireEvidence(
      object(manifest) && !validate("release", manifest).length,
      "release manifest schema invalid",
    );
    requireEvidence(
      manifest.sourceRepository === repository &&
        manifest.kitId === kit &&
        manifest.kitVersion === version &&
        manifest.releaseTag === tag &&
        manifest.sourceCommitSha === commit,
      "release manifest identity/commit mismatch",
    );
    const paths = manifest.artifacts.map((a) => a.path);
    requireEvidence(
      paths.length <= 50 &&
        new Set(paths.map((p) => p.toLowerCase())).size === paths.length &&
        paths.every((p) => path_issue(p) === null),
      "ambiguous, unsafe or excessive artifact paths",
    );
    const assets = await reader.get(
      `/releases/${release.id}/assets?per_page=100`,
    );
    requireEvidence(
      Array.isArray(assets) && assets.length < 100,
      "release asset list not proven complete",
    );
    const matches = assets.filter(
      (a) => object(a) && a.name === "release-manifest.json",
    );
    requireEvidence(
      matches.length === 1,
      "exactly one release manifest asset required",
    );
    const asset = matches[0];
    requireEvidence(
      asset.state === "uploaded" &&
        Number.isInteger(asset.size) &&
        asset.size === raw.length &&
        asset.digest === "sha256:" + hash(raw),
      "release manifest asset digest/size mismatch",
    );
    let total = 0;
    for (const a of manifest.artifacts) {
      const data = await source_bytes(reader, a.path, commit);
      total += data.length;
      requireEvidence(
        total <= 10 * 1048576 && hash(data) === a.sha256,
        "source artifact digest/size mismatch",
      );
    }
    Object.assign(result, {
      releaseEvidenceConsistent: true,
      sourceCommitSha: commit,
      releaseTag: tag,
      artifactCount: paths.length,
      manifestSha256: hash(raw),
    });
  } catch (e) {
    result.errors = [
      "evidence unavailable or contradictory: " +
        (e instanceof ReadUnavailable
          ? e.status
          : e instanceof EvidenceRefused
            ? e.message
            : "invalid response"),
    ];
  }
  return result;
}
if (isMain(import.meta.url))
  runMain(async (a) => {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    requireThat(token, "Read-only GitHub token unavailable");
    const r = await inspect(
      new GitHubReader(a.repository, token),
      a.repository,
      a.kit,
      a.version,
      a.expected_publisher,
      load_local_manifest(a.manifest),
    );
    output(r);
    return r.releaseEvidenceConsistent ? 0 : 3;
  });
