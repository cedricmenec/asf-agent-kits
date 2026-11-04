import {
  strictFile,
  exact,
  object,
  requireThat,
  safePath,
  hash,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
export const MAX_INPUT = 16 * 1048576,
  strict_file = strictFile;
export const METADATA_KEYS = [
  "schemaVersion",
  "kitId",
  "kitVersion",
  "coreVersion",
  "sourceRepository",
  "sourceCommitSha",
  "releaseTag",
  "runtime",
];
export function compose(preview, metadata) {
  requireThat(
    exact(preview, [
      "kind",
      "kitId",
      "sourceProvenanceVerified",
      "writesPerformed",
      "files",
    ]) &&
      preview.kind === "r2d-local-render-preview" &&
      preview.sourceProvenanceVerified === false &&
      preview.writesPerformed === false,
    "Invalid render preview",
  );
  requireThat(
    exact(metadata, METADATA_KEYS) &&
      typeof metadata.kitId === "string" &&
      preview.kitId === metadata.kitId,
    "Metadata/kit mismatch",
  );
  requireThat(
    Array.isArray(preview.files) &&
      preview.files.length > 0 &&
      preview.files.length <= 250,
    "Invalid file list",
  );
  const seen = new Set();
  let total = 0;
  const artifacts = preview.files
    .map((f) => {
      requireThat(
        exact(f, ["path", "sha256", "contentBase64"]),
        "Invalid file entry",
      );
      safePath(f.path);
      requireThat(
        f.path.startsWith(".asf/agentkit/") && !seen.has(f.path.toLowerCase()),
        "Unsafe/duplicate path",
      );
      seen.add(f.path.toLowerCase());
      requireThat(
        typeof f.contentBase64 === "string" &&
          f.contentBase64.length <= 4 * Math.ceil(1048576 / 3),
        "Oversized Base64",
      );
      const raw = Buffer.from(f.contentBase64, "base64");
      requireThat(
        raw.toString("base64") === f.contentBase64,
        "Non-canonical Base64",
      );
      const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
      requireThat(
        !/[\0\r]/.test(text) && raw.length <= 1048576,
        "Invalid artifact bytes",
      );
      total += raw.length;
      requireThat(
        total <= 10 * 1048576 && hash(raw) === f.sha256,
        "Size/hash mismatch",
      );
      return { path: f.path, sha256: f.sha256 };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const release = { ...metadata, artifacts };
  requireThat(
    validate("release", release).length === 0,
    "Invalid release contract",
  );
  return {
    kind: "r2d-unverified-release-preview",
    release,
    sourceProvenanceVerified: false,
    promotionAllowed: false,
    writesPerformed: false,
  };
}
if (isMain(import.meta.url))
  runMain((a) =>
    output(compose(strictFile(a.preview, MAX_INPUT), strictFile(a.metadata))),
  );
