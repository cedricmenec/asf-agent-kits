"""SEC-02a: hostile synthetic release *claims*, never real GitHub evidence."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from check_release_claim import ClaimError, inspect_claim, load_claim, path_issue  # noqa: E402


class ReleaseClaimTests(unittest.TestCase):
    def setUp(self):
        self.data = {
            "schemaVersion": 1, "kind": "untrusted-release-claim", "kitId": "opencode-direct",
            "kitVersion": "1.2.3", "sourceRepository": "synthetic/agent-kits",
            "sourceCommitSha": "a" * 40, "releaseTag": "kits/opencode-direct/v1.2.3",
            "claimedTagTargetCommitSha": "a" * 40, "manifestSha256": "b" * 64,
            "artifacts": [{"path": "docs/hello.md", "sha256": "c" * 64}],
        }

    def assert_denied(self, value):
        result = inspect_claim(value)
        self.assertFalse(result["claimInternallyConsistent"])
        self.assertTrue(result["errors"])
        self.assertFalse(result["sourceProvenanceVerified"])
        self.assertFalse(result["trustEvidenceIndependentlyVerified"])
        self.assertFalse(result["promotionAllowed"])
        self.assertFalse(result["authorizedToExecute"])
        self.assertFalse(result["writesPerformed"])
        self.assertTrue(result["paidApprovalRequired"])

    def test_01_positive_claim_is_only_internally_consistent(self):
        ok = inspect_claim(self.data)
        self.assertTrue(ok["claimInternallyConsistent"])
        for field in ("sourceProvenanceVerified", "trustEvidenceIndependentlyVerified", "promotionAllowed", "authorizedToExecute", "writesPerformed"):
            self.assertFalse(ok[field])
        self.assertTrue(ok["paidApprovalRequired"])

    def test_02_mismatched_tag(self):
        self.data["releaseTag"] = "kits/opencode-direct/v1.2.4"; self.assert_denied(self.data)

    def test_03_mismatched_kit_in_tag(self):
        self.data["releaseTag"] = "kits/opencode-openspec/v1.2.3"; self.assert_denied(self.data)

    def test_04_mismatched_claimed_commit(self):
        self.data["claimedTagTargetCommitSha"] = "d" * 40; self.assert_denied(self.data)

    def test_05_extra_credential_field(self):
        self.data["token"] = "never-a-secret"; self.assert_denied(self.data)

    def test_06_reject_missing_artifacts(self):
        self.data["artifacts"] = []; self.assert_denied(self.data)

    def test_07_wrong_manifest_sha(self):
        self.data["manifestSha256"] = "abcd"; self.assert_denied(self.data)

    def test_08_uppercase_source_sha(self):
        self.data["sourceCommitSha"] = "A" * 40; self.assert_denied(self.data)

    def test_09_untrusted_kind(self):
        self.data["kind"] = "signed-release"; self.assert_denied(self.data)

    def test_10_semver_leading_zero(self):
        self.data["kitVersion"] = "01.2.3"; self.assert_denied(self.data)

    def test_11_absolute_artifact(self):
        self.data["artifacts"][0]["path"] = "/etc/passwd"; self.assert_denied(self.data)

    def test_12_parent_traversal(self):
        self.data["artifacts"][0]["path"] = "docs/../secret"; self.assert_denied(self.data)

    def test_13_git_reserved(self):
        self.data["artifacts"][0]["path"] = "sub/.git/config"; self.assert_denied(self.data)

    def test_14_backslash(self):
        self.data["artifacts"][0]["path"] = "docs\\hello.md"; self.assert_denied(self.data)

    def test_15_secret_file(self):
        self.data["artifacts"][0]["path"] = "config/.env.local"; self.assert_denied(self.data)

    def test_16_secret_key_file(self):
        self.data["artifacts"][0]["path"] = "private/id_ed25519"; self.assert_denied(self.data)

    def test_17_nfc_normalization(self):
        self.data["artifacts"][0]["path"] = "e\u0301.txt"; self.assert_denied(self.data)

    def test_18_case_collision(self):
        self.data["artifacts"].append({"path": "DOCS/HELLO.md", "sha256": "f" * 64}); self.assert_denied(self.data)

    def test_19_path_parent_child(self):
        self.data["artifacts"].append({"path": "docs/hello.md/a.txt", "sha256": "f" * 64}); self.assert_denied(self.data)

    def test_20_duplicate_exact_path(self):
        self.data["artifacts"].append(copy.deepcopy(self.data["artifacts"][0])); self.assert_denied(self.data)

    def test_21_malformed_schema(self):
        self.data["artifacts"][0]["unexpected"] = True; self.assert_denied(self.data)

    def test_22_duplicate_json_key(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "claim.json"
            text = json.dumps(self.data).replace('"kitId":', '"kitId": "fake", "kitId":', 1)
            p.write_text(text, encoding="utf-8")
            with self.assertRaisesRegex(ClaimError, "duplicate JSON key"):
                load_claim(p)

    def test_23_symlink_claim(self):
        with tempfile.TemporaryDirectory() as d:
            t = Path(d) / "actual.json"; t.write_text(json.dumps(self.data))
            p = Path(d) / "claim.json"; p.symlink_to(t)
            with self.assertRaisesRegex(ClaimError, "symlink"):
                load_claim(p)

    def test_24_cli_deterministic_and_non_granting(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "claim.json"; p.write_text(json.dumps(self.data))
            cmd = [sys.executable, str(ROOT / "tools/check_release_claim.py"), str(p)]
            a = subprocess.run(cmd, capture_output=True); b = subprocess.run(cmd, capture_output=True)
            self.assertEqual(a.returncode, 0, a.stderr)
            self.assertEqual(a.stdout, b.stdout)
            obj = json.loads(a.stdout)
            self.assertTrue(obj["claimInternallyConsistent"])
            self.assertFalse(obj["promotionAllowed"])
            self.assertFalse(obj["sourceProvenanceVerified"])
            self.assertFalse(obj["writesPerformed"])


if __name__ == "__main__":
    unittest.main()
