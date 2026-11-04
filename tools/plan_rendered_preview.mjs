import {
  safeRoot,
  member,
  readFile,
  hash,
  strictFile,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { compose, MAX_INPUT } from "./compose_preview.mjs";
export function inspect_target(root, p) {
  try {
    return readFile(member(root, p));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export function plan_preview(target, preview, metadata) {
  safeRoot(target);
  const checked = compose(preview, metadata),
    operations = preview.files
      .map((f) => {
        const actual = inspect_target(target, f.path),
          bytes = Buffer.from(f.contentBase64, "base64"),
          action =
            actual === null
              ? "create"
              : actual.equals(bytes)
                ? "unchanged"
                : "conflict";
        return {
          path: f.path,
          action,
          ...(action === "conflict"
            ? {
                reason:
                  "existing file differs; never overwrite without explicit ownership review",
              }
            : {}),
        };
      })
      .sort((a, b) => (a.path < b.path ? -1 : 1));
  const conflicts = operations.filter((o) => o.action === "conflict").length;
  return {
    kind: "r2d-read-only-materialization-preview",
    kitId: checked.release.kitId,
    status: conflicts ? "blocked" : "proposed",
    conflicts,
    operations,
    writesPerformed: false,
    sourceProvenanceVerified: false,
    promotionAllowed: false,
  };
}
if (isMain(import.meta.url))
  runMain((a) => {
    const r = plan_preview(
      a.target,
      strictFile(a.preview, MAX_INPUT),
      strictFile(a.metadata),
    );
    output(r);
    return r.conflicts ? 2 : 0;
  });
