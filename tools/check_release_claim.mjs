import {
  strictFile,
  safePath,
  requireThat,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
export class ClaimError extends Error {}
export const load_claim = (p) => strictFile(p, 1048576);
export function path_issue(p) {
  if (typeof p !== "string" || !p || p.length > 512)
    return "invalid artifact path";
  if (p !== p.normalize("NFC")) return "non-normalized artifact path";
  if (/^[~/]|[\\:\x00-\x1f\x7f]/.test(p)) return "non-portable artifact path";
  const parts = p.split("/");
  if (
    parts.some(
      (x) => !x || x === "." || x === ".." || x.toLowerCase() === ".git",
    )
  )
    return "traversal or reserved git path";
  if (
    [".asf/agentkit.yaml", ".asf/agentkit.lock.json"].includes(p.toLowerCase())
  )
    return "installer-owned artifact path";
  const leaf = parts.at(-1).toLowerCase();
  if (
    [".env", ".envrc", ".npmrc", ".netrc", "id_rsa", "id_ed25519"].includes(
      leaf,
    ) ||
    (leaf.startsWith(".env.") && leaf !== ".env.example") ||
    /\.(pem|p12|pfx|key)$/.test(leaf)
  )
    return "potential secret artifact path";
  return null;
}
export function inspect_claim(value, schema = null) {
  let errors = validate("claim", value);
  if (!errors.length) {
    if (value.releaseTag !== `kits/${value.kitId}/v${value.kitVersion}`)
      errors.push("release tag does not match kit/version");
    if (value.sourceCommitSha !== value.claimedTagTargetCommitSha)
      errors.push("claimed target SHA differs from source SHA");
    const paths = value.artifacts.map((a) => a.path);
    for (const p of paths) {
      const issue = path_issue(p);
      if (issue) errors.push(issue);
    }
    const folded = paths.map((p) => p.toLowerCase());
    if (new Set(folded).size !== folded.length)
      errors.push("duplicate or case-colliding artifact paths");
    if (
      folded.some((p, i) =>
        folded.some((q, j) => i !== j && q.startsWith(p + "/")),
      )
    )
      errors.push("artifact path is also a parent directory");
  }
  return {
    claimInternallyConsistent: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    sourceProvenanceVerified: false,
    trustEvidenceIndependentlyVerified: false,
    promotionAllowed: false,
    authorizedToExecute: false,
    writesPerformed: false,
    paidApprovalRequired: true,
  };
}
if (isMain(import.meta.url))
  runMain((a) => {
    let r;
    try {
      r = inspect_claim(load_claim(a._[0]));
    } catch {
      r = inspect_claim(null);
      r.errors = ["claim input rejected"];
    }
    output(r);
    return r.claimInternallyConsistent ? 0 : 3;
  });
