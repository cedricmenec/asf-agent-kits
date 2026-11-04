import { exact, equal, SHA, HEX, requireThat, hash } from "./node/common.mjs";
import { inspect_claim } from "./check_release_claim.mjs";
import { inventory_fdrelative } from "./inventory_fdrelative.mjs";
export class SyntheticReleaseError extends Error {}
export function inspect_synthetic_release(claim, host, obs, root, raw) {
  try {
    requireThat(
      inspect_claim(claim).claimInternallyConsistent &&
        exact(host, [
          "repository",
          "kitId",
          "tag",
          "commitSha",
          "checkAppId",
        ]) &&
        exact(obs, [
          "repository",
          "tag",
          "targetCommitSha",
          "mainProtected",
          "tagImmutable",
          "publisherAppId",
          "permissions",
          "manifestSha256",
        ]) &&
        exact(obs.permissions, [
          "contentsRead",
          "metadataRead",
          "contentsWrite",
        ]),
      "Invalid claim/evidence",
    );
    requireThat(
      Number.isInteger(host.checkAppId) &&
        host.checkAppId > 0 &&
        Number.isInteger(obs.publisherAppId) &&
        ["repository", "kitId", "tag", "commitSha"].every(
          (k) => typeof host[k] === "string",
        ) &&
        SHA.test(host.commitSha) &&
        typeof root === "string" &&
        root.startsWith("/") &&
        Buffer.isBuffer(raw) &&
        raw.length > 0 &&
        raw.length <= 1048576,
      "Invalid identity/root",
    );
    requireThat(
      host.repository === claim.sourceRepository &&
        host.kitId === claim.kitId &&
        host.tag === claim.releaseTag &&
        host.commitSha === claim.sourceCommitSha &&
        obs.repository === host.repository &&
        obs.tag === host.tag &&
        obs.targetCommitSha === host.commitSha &&
        obs.publisherAppId === host.checkAppId &&
        obs.mainProtected === true &&
        obs.tagImmutable === true &&
        equal(obs.permissions, {
          contentsRead: true,
          metadataRead: true,
          contentsWrite: false,
        }) &&
        typeof obs.manifestSha256 === "string" &&
        HEX.test(obs.manifestSha256) &&
        hash(raw) === claim.manifestSha256 &&
        obs.manifestSha256 === claim.manifestSha256,
      "Contradictory synthetic evidence",
    );
    const files = inventory_fdrelative(
        root,
        host.commitSha,
        claim.artifacts.map((a) => a.path),
      ).files,
      expected = Object.fromEntries(
        claim.artifacts.map((a) => [a.path, a.sha256]),
      );
    requireThat(
      files.length === Object.keys(expected).length &&
        files.every((f) => expected[f.path] === f.sha256),
      "Artifact bytes mismatch",
    );
    return {
      kind: "sec02b-synthetic-release-byte-preview",
      syntheticEvidenceConsistent: true,
      disposableArtifactBytesMatched: true,
      artifactCount: files.length,
      hostIndependentlyAuthenticated: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      promotionAllowed: false,
      authorizedToExecute: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new SyntheticReleaseError(
      "SEC-02b DENY: synthetic release consistency failure",
    );
  }
}
