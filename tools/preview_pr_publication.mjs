import { exact, requireThat, SHA, HEX } from "./node/common.mjs";
import { managedPaths } from "./preview_version_transition.mjs";
export class OfflinePublisherError extends Error {}
export const NON_GRANTS = [
  "githubPrCreated",
  "filesystemSnapshotAtomic",
  "independentlyVerifiedRelease",
  "sourceProvenanceVerified",
  "trustEvidenceIndependentlyVerified",
  "authorizedToExecute",
  "promotionAllowed",
  "writesPerformed",
];
const positive = (x) => Number.isSafeInteger(x) && x > 0;
export function preview_pr_publication(plan, host, obs) {
  try {
    requireThat(
      exact(plan, [
        "kind",
        "mode",
        "kitId",
        "candidateVersion",
        "candidateCommitSha",
        "draftTitlePreview",
        "status",
        "conflicts",
        "files",
        ...NON_GRANTS,
        "paidApprovalRequired",
      ]),
      "Invalid plan fields",
    );
    const kit = plan.kitId,
      version = plan.candidateVersion;
    requireThat(
      ["opencode-direct", "opencode-openspec"].includes(kit) &&
        typeof version === "string" &&
        /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(
          version,
        ) &&
        typeof plan.candidateCommitSha === "string" &&
        SHA.test(plan.candidateCommitSha) &&
        ["new-install", "upgrade"].includes(plan.mode) &&
        plan.kind === "r5b01-untrusted-draft-pr-plan" &&
        plan.status === "review-preview-only" &&
        plan.conflicts === 0 &&
        plan.draftTitlePreview ===
          `AgentKit (UNVERIFIED): ${kit} v${version}` &&
        NON_GRANTS.every((k) => plan[k] === false) &&
        plan.paidApprovalRequired === true,
      "Invalid plan",
    );
    requireThat(Array.isArray(plan.files), "Invalid files");
    managedPaths(plan.files.map((f) => f.path));
    for (const f of plan.files)
      requireThat(
        exact(f, ["path", "action", "declaredSha256"]) &&
          ["create", "unchanged"].includes(f.action) &&
          typeof f.declaredSha256 === "string" &&
          HEX.test(f.declaredSha256) &&
          (plan.mode !== "new-install" || f.action === "create"),
        "Invalid plan file",
      );
    requireThat(
      exact(host, [
        "repository",
        "repositoryId",
        "baseBranch",
        "baseSha",
        "requiredCheckContext",
        "expectedCheckAppId",
        "proposedBranch",
      ]) &&
        exact(obs, [
          "repository",
          "repositoryId",
          "baseBranch",
          "baseSha",
          "baseProtected",
          "checkContext",
          "checkHeadSha",
          "checkAppId",
          "checkConclusion",
          "activePublisherRuns",
          "matchingOpenPullRequests",
          "proposedBranchExists",
          "observedAtSeconds",
          "nowSeconds",
        ]),
      "Invalid policy/observation fields",
    );
    requireThat(
      typeof host.repository === "string" &&
        /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(
          host.repository,
        ) &&
        !host.repository.includes("..") &&
        positive(host.repositoryId) &&
        typeof host.baseBranch === "string" &&
        /^[A-Za-z][A-Za-z0-9/_-]{0,99}$/.test(host.baseBranch) &&
        !host.baseBranch.includes("..") &&
        !host.baseBranch.includes("//") &&
        typeof host.baseSha === "string" &&
        SHA.test(host.baseSha) &&
        host.baseSha !== plan.candidateCommitSha &&
        host.requiredCheckContext === "check" &&
        positive(host.expectedCheckAppId) &&
        host.proposedBranch === `agentkit/${plan.mode}/${kit}/v${version}`,
      "Invalid host",
    );
    requireThat(
      obs.repository === host.repository &&
        Number.isInteger(obs.repositoryId) &&
        obs.repositoryId === host.repositoryId &&
        obs.baseBranch === host.baseBranch &&
        obs.baseSha === host.baseSha &&
        obs.baseProtected === true &&
        obs.checkContext === host.requiredCheckContext &&
        obs.checkHeadSha === host.baseSha &&
        Number.isInteger(obs.checkAppId) &&
        obs.checkAppId === host.expectedCheckAppId &&
        obs.checkConclusion === "success" &&
        obs.activePublisherRuns === 0 &&
        obs.matchingOpenPullRequests === 0 &&
        obs.proposedBranchExists === false &&
        Number.isSafeInteger(obs.observedAtSeconds) &&
        Number.isSafeInteger(obs.nowSeconds) &&
        obs.observedAtSeconds >= 0 &&
        obs.nowSeconds >= obs.observedAtSeconds &&
        obs.nowSeconds - obs.observedAtSeconds <= 300,
      "Invalid publication observation",
    );
    return {
      kind: "r5b02a-untrusted-publication-preflight",
      kitId: kit,
      candidateVersion: version,
      plannedFileCount: plan.files.length,
      syntheticTargetBranch: host.baseBranch,
      syntheticTargetHeadSha: host.baseSha,
      proposedUncreatedBranch: host.proposedBranch,
      syntheticObservationsConsistent: true,
      githubPrCreated: false,
      hostIndependentlyAuthenticated: false,
      targetRefCasVerified: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      authorizedToPublish: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new OfflinePublisherError(
      "R5b-02a DENY: untrusted PR publication observation",
    );
  }
}
