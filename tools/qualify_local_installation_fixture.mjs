import { fs, member, requireThat, equal } from "./node/common.mjs";
import { load_lock } from "./plan_install.mjs";
import { preview_installation_status } from "./inspect_installation_status.mjs";
import { preview_version_transition } from "./preview_version_transition.mjs";
import { preview_draft_pr } from "./preview_draft_pr.mjs";
import { preview_pr_publication } from "./preview_pr_publication.mjs";
export class R6OfflineError extends Error {}
export function qualify_local_installation_fixture(
  target,
  lock,
  release,
  ownership,
  host,
  obs,
) {
  try {
    requireThat(equal(load_lock(target), lock), "Local lock mismatch");
    const state = preview_installation_status(target);
    requireThat(
      state.classification === (lock === null ? "unmanaged-legacy" : "unknown"),
      "Invalid installation classification",
    );
    const transition =
        lock === null
          ? null
          : preview_version_transition(lock, release, release.kitId),
      draft = preview_draft_pr(release, ownership, transition);
    requireThat(draft.status === "review-preview-only", "Blocked draft");
    for (const item of draft.files) {
      const p = member(target, item.path);
      requireThat(
        item.action !== "create" || !fs.existsSync(p),
        "Create destination exists",
      );
      requireThat(
        item.action !== "unchanged" || (lock && fs.statSync(p).isFile()),
        "Missing unchanged file",
      );
    }
    const pub = preview_pr_publication(draft, host, obs);
    return {
      kind: "r6a01-disposable-qualification-preview",
      installationClassification: state.classification,
      mode: draft.mode,
      kitId: draft.kitId,
      plannedFileCount: draft.files.length,
      syntheticPublicationPreflightMatched: pub.syntheticObservationsConsistent,
      localFileSnapshotAtomic: false,
      releaseIndependentlyAttested: false,
      hostIndependentlyAuthenticated: false,
      sourceProvenanceVerified: false,
      targetRefCasVerified: false,
      authorizedToPublish: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new R6OfflineError(
      "R6a-01 DENY: untrusted or inconsistent local qualification",
    );
  }
}
