import { requireThat, isMain, runMain, output } from "./node/common.mjs";
import { status } from "./plan_install.mjs";
export class StatusPreviewError extends Error {}
export function preview_installation_status(target) {
  try {
    requireThat(typeof target === "string", "Invalid target");
    const observed = status(target),
      states = {
        "hash-match": "unknown",
        drifted: "drifted",
        "unmanaged-or-legacy": "unmanaged-legacy",
      };
    requireThat(
      Object.hasOwn(states, observed.status) &&
        observed.provenanceVerified === false &&
        Array.isArray(observed.kits) &&
        !observed.kits.length === (observed.status === "unmanaged-or-legacy"),
      "Invalid state",
    );
    const kits = observed.kits.map((k) => {
      requireThat(
        ["hash-match", "drifted"].includes(k.state) &&
          Array.isArray(k.files) &&
          k.files.length &&
          k.files.every((f) =>
            ["hash-match", "missing", "drifted"].includes(f.state),
          ),
        "Invalid kit state",
      );
      return {
        kitId: k.id,
        kitVersion: k.version,
        fileCount: k.files.length,
        nonMatchingFiles: k.files.filter((f) => f.state !== "hash-match")
          .length,
      };
    });
    return {
      kind: "r5a-read-only-installation-status",
      classification: states[observed.status],
      kits,
      filesystemSnapshotAtomic: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new StatusPreviewError(
      "R5a DENY: installation status cannot be trusted",
    );
  }
}
if (isMain(import.meta.url))
  runMain((a) => {
    const r = preview_installation_status(a.target);
    output(r);
    return r.classification === "drifted" ? 2 : 0;
  });
