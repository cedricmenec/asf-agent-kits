import { object, exact, requireThat, VERSION } from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
import { canonical_owned } from "./plan_ownership.mjs";
export class PrPreviewError extends Error {}
function paths(names) {
  requireThat(
    Array.isArray(names) && names.length > 0 && names.length <= 250,
    "Invalid paths",
  );
  const seen = new Set();
  for (const p of names) {
    requireThat(
      typeof p === "string" && p.length <= 320 && !/[^\x00-\x7f]/.test(p),
      "Invalid path",
    );
    canonical_owned(p);
    const key = p.toLowerCase();
    requireThat(
      !seen.has(key) &&
        ![...seen].some(
          (v) => key.startsWith(v + "/") || v.startsWith(key + "/"),
        ),
      "Path collision",
    );
    seen.add(key);
  }
  return seen;
}
export function preview_draft_pr(manifest, ownership, transition = null) {
  try {
    requireThat(
      object(manifest) &&
        !validate("release", manifest).length &&
        /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(
          manifest.kitVersion,
        ),
      "Invalid release",
    );
    const release = Object.fromEntries(
      manifest.artifacts.map((a) => [a.path, a.sha256]),
    );
    paths(Object.keys(release));
    requireThat(
      exact(ownership, [
        "kind",
        "kitId",
        "status",
        "conflicts",
        "operations",
        "sourceProvenanceVerified",
        "promotionAllowed",
        "writesPerformed",
      ]) &&
        ownership.kind === "r2d-read-only-ownership-preview" &&
        ownership.kitId === manifest.kitId &&
        ["blocked", "proposed"].includes(ownership.status) &&
        Number.isInteger(ownership.conflicts) &&
        ownership.conflicts >= 0 &&
        [
          "sourceProvenanceVerified",
          "promotionAllowed",
          "writesPerformed",
        ].every((k) => ownership[k] === false),
      "Invalid ownership",
    );
    requireThat(
      Array.isArray(ownership.operations) &&
        ownership.operations.length > 0 &&
        ownership.operations.length <= 250,
      "Invalid operations",
    );
    const owned = {};
    for (const row of ownership.operations) {
      requireThat(
        exact(
          row,
          row.action === "conflict"
            ? ["path", "action", "reason"]
            : ["path", "action"],
        ) && ["create", "unchanged", "conflict"].includes(row.action),
        "Invalid operation",
      );
      if (row.action === "conflict")
        requireThat(
          typeof row.reason === "string" &&
            row.reason.length > 0 &&
            row.reason.length <= 256,
          "Invalid reason",
        );
      owned[row.path] = row.action;
    }
    paths(ownership.operations.map((o) => o.path));
    const conflicts = Object.values(owned).filter(
      (a) => a === "conflict",
    ).length;
    requireThat(
      conflicts === ownership.conflicts &&
        (ownership.status === "blocked") === conflicts > 0 &&
        Object.keys(release).every((p) => Object.hasOwn(owned, p)),
      "Inconsistent ownership",
    );
    let mode = "new-install";
    if (transition === null) {
      requireThat(
        Object.values(owned).every((a) => ["create", "conflict"].includes(a)) &&
          Object.keys(owned).length === Object.keys(release).length,
        "New install cannot claim existing file",
      );
    } else {
      mode = "upgrade";
      requireThat(
        exact(transition, [
          "kind",
          "kitId",
          "fromVersion",
          "toVersion",
          "fromCommitSha",
          "toCommitSha",
          "status",
          "conflicts",
          "changes",
          "independentlyVerifiedRelease",
          "sourceProvenanceVerified",
          "trustEvidenceIndependentlyVerified",
          "authorizedToExecute",
          "promotionAllowed",
          "writesPerformed",
          "paidApprovalRequired",
        ]) &&
          transition.kind === "r5a02-untrusted-transition-preview" &&
          transition.kitId === manifest.kitId &&
          transition.toVersion === manifest.kitVersion &&
          transition.toCommitSha === manifest.sourceCommitSha &&
          ["blocked", "preview-only"].includes(transition.status) &&
          Number.isInteger(transition.conflicts) &&
          transition.conflicts >= 0 &&
          [
            "independentlyVerifiedRelease",
            "sourceProvenanceVerified",
            "trustEvidenceIndependentlyVerified",
            "authorizedToExecute",
            "promotionAllowed",
            "writesPerformed",
          ].every((k) => transition[k] === false) &&
          transition.paidApprovalRequired === true,
        "Invalid transition",
      );
      requireThat(
        Array.isArray(transition.changes) &&
          transition.changes.length > 0 &&
          transition.changes.length <= 250,
        "Invalid changes",
      );
      for (const c of transition.changes)
        requireThat(
          exact(c, ["path", "action"]) &&
            [
              "unchanged",
              "review-update",
              "propose-create",
              "conflict-removal",
            ].includes(c.action),
          "Invalid change",
        );
      paths(transition.changes.map((c) => c.path));
      const removals = transition.changes.filter(
        (c) => c.action === "conflict-removal",
      ).length;
      requireThat(
        removals === transition.conflicts &&
          (transition.status === "blocked") === removals > 0 &&
          transition.changes.length === Object.keys(owned).length,
        "Inconsistent transition",
      );
      const map = {
        unchanged: "unchanged",
        "propose-create": "create",
        "review-update": "conflict",
        "conflict-removal": "conflict",
      };
      for (const c of transition.changes)
        requireThat(
          owned[c.path] === map[c.action],
          "Ownership/transition mismatch",
        );
      requireThat(
        transition.changes
          .filter((c) => c.action !== "conflict-removal")
          .every((c) => Object.hasOwn(release, c.path)) &&
          transition.changes.length - removals === Object.keys(release).length,
        "Release paths mismatch",
      );
    }
    return {
      kind: "r5b01-untrusted-draft-pr-plan",
      mode,
      kitId: manifest.kitId,
      candidateVersion: manifest.kitVersion,
      candidateCommitSha: manifest.sourceCommitSha,
      draftTitlePreview: `AgentKit (UNVERIFIED): ${manifest.kitId} v${manifest.kitVersion}`,
      status: conflicts ? "blocked" : "review-preview-only",
      conflicts,
      files: Object.keys(owned)
        .sort()
        .map((p) => ({
          path: p,
          action: owned[p],
          declaredSha256: release[p] ?? null,
        })),
      githubPrCreated: false,
      filesystemSnapshotAtomic: false,
      independentlyVerifiedRelease: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new PrPreviewError(
      "R5b DENY: inconsistent or untrusted draft-PR preview",
    );
  }
}
