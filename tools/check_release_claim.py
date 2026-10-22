#!/usr/bin/env python3
"""Offline validation of untrusted release *claims*; NEVER proof of provenance.

No network, GitHub credentials, write operations or paid model calls. The only
positive finding is internal consistency of untrusted user-provided values.
"""
import argparse
import json
import stat
import sys
import unicodedata
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "schemas" / "release-claim.schema.json"
MAX_CLAIM_BYTES = 1024 * 1024


class ClaimError(ValueError):
    pass


def unique_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ClaimError("duplicate JSON key")
        value[key] = item
    return value


def _reject_constant(_):
    raise ClaimError("non-finite number in JSON")


def load_claim(path):
    path = Path(path)
    if path.is_symlink():
        raise ClaimError("symlink claim rejected")
    try:
        st = path.lstat()
    except OSError as exc:
        raise ClaimError("cannot access claim") from exc
    if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_CLAIM_BYTES:
        raise ClaimError("claim must be a small regular file")
    try:
        with path.open("rb") as handle:
            data = handle.read(MAX_CLAIM_BYTES + 1)
        if len(data) > MAX_CLAIM_BYTES:
            raise ClaimError("claim exceeds size limit")
        return json.loads(data.decode("utf-8"), object_pairs_hook=unique_pairs,
                          parse_constant=_reject_constant)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ClaimError("invalid UTF-8 JSON") from exc


def path_issue(path):
    if not isinstance(path, str) or len(path) > 512 or not path:
        return "invalid artifact path"
    if path != unicodedata.normalize("NFC", path):
        return "non-normalized artifact path"
    if path.startswith(("/", "~")) or "\\" in path or ":" in path or any(ord(c) < 32 or ord(c) == 127 for c in path):
        return "non-portable artifact path"
    parts = path.split("/")
    if any(p in ("", ".", "..") for p in parts) or ".git" in (p.lower() for p in parts):
        return "traversal or reserved git path"
    if path.lower() in (".asf/agentkit.yaml", ".asf/agentkit.lock.json"):
        return "installer-owned artifact path"
    lowered = parts[-1].casefold()
    if (lowered in (".env", ".envrc", ".npmrc", ".netrc", "id_rsa", "id_ed25519") or
            lowered.startswith(".env.") and lowered != ".env.example" or
            lowered.endswith((".pem", ".p12", ".pfx", ".key"))):
        return "potential secret artifact path"
    return None


def inspect_claim(value, schema=None):
    """All flags remain fail-closed even if the JSON is internally coherent."""
    errors = []
    if schema is None:
        schema = json.loads(SCHEMA.read_text("utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    errors.extend(f"schema:{'/'.join(map(str, e.path)) or '$'}: {e.message}"
                  for e in validator.iter_errors(value))
    if not errors:
        if value["releaseTag"] != f'kits/{value["kitId"]}/v{value["kitVersion"]}':
            errors.append("release tag does not match kit/version")
        if value["sourceCommitSha"] != value["claimedTagTargetCommitSha"]:
            errors.append("claimed target SHA differs from source SHA")
        paths = [a["path"] for a in value["artifacts"]]
        for path in paths:
            issue = path_issue(path)
            if issue:
                errors.append(issue)
        folded = [p.casefold() for p in paths]
        if len(set(folded)) != len(folded):
            errors.append("duplicate or case-colliding artifact paths")
        for i, p in enumerate(folded):
            if any(q.startswith(p + "/") for j, q in enumerate(folded) if j != i):
                errors.append("artifact path is also a parent directory")
                break
    return {
        "claimInternallyConsistent": not bool(errors),
        "errors": sorted(set(errors)),
        "sourceProvenanceVerified": False,
        "trustEvidenceIndependentlyVerified": False,
        "promotionAllowed": False,
        "authorizedToExecute": False,
        "writesPerformed": False,
        "paidApprovalRequired": True,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only, offline untrusted AgentKit release claim inspector")
    parser.add_argument("claim", type=Path)
    args = parser.parse_args(argv)
    try:
        result = inspect_claim(load_claim(args.claim))
    except (ClaimError, OSError, ValueError) as exc:
        result = inspect_claim(None)  # consistently fail closed
        result["errors"] = ["claim input rejected: " + str(exc)]
        result["claimInternallyConsistent"] = False
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["claimInternallyConsistent"] else 3


if __name__ == "__main__":
    sys.exit(main())
