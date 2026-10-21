"""R2a tests: fixture-only candidate, no real AgentKit release or writes."""
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from plan_install import PlanError, plan, safe_member, status  # noqa: E402


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / "target"
        self.source = self.root / "source"
        self.target.mkdir()
        self.source.mkdir()
        self.candidate_file = self.source / "docs" / "agentkit.md"
        self.candidate_file.parent.mkdir()
        self.candidate_file.write_bytes(b"new candidate data\n")
        self.new_hash = self.digest(b"new candidate data\n")
        self.old_hash = self.digest(b"old installed data\n")
        self.manifest = self.root / "manifest.json"
        self.release = {
            "schemaVersion": 1, "kitId": "opencode-openspec", "kitVersion": "1.0.1",
            "coreVersion": "1.0.0", "sourceRepository": "synthetic/repo",
            "sourceCommitSha": "c" * 40, "releaseTag": "kits/opencode-openspec/v1.0.1",
            "runtime": {"nodeVersion": "22.16.0", "openCodeVersion": "1.0.0", "openSpecVersion": "1.14.1"},
            "artifacts": [{"path": "docs/agentkit.md", "sha256": self.new_hash}]
        }
        self.save_manifest()

    @staticmethod
    def digest(data):
        return hashlib.sha256(data).hexdigest()

    def save_manifest(self):
        self.manifest.write_text(json.dumps(self.release), encoding="utf-8")

    def make_lock(self, managed=None, other_owner=None):
        if managed is None:
            managed = {"docs/agentkit.md": self.old_hash}
        kits = [{
            "id": "opencode-openspec", "version": "1.0.0", "sourceRepository": "synthetic/repo",
            "sourceCommitSha": "b" * 40, "releaseTag": "kits/opencode-openspec/v1.0.0",
            "coreVersion": "1.0.0", "configSchemaVersion": 1, "managedFiles": managed
        }]
        if other_owner:
            kits.append({**kits[0], "id": "opencode-direct", "releaseTag": "kits/opencode-direct/v1.0.0", "managedFiles": other_owner})
        place = self.target / ".asf"
        place.mkdir(exist_ok=True)
        (place / "agentkit.lock.json").write_text(json.dumps({"schemaVersion": 1, "kits": kits}), encoding="utf-8")

    def target_file(self, contents=b"old installed data\n"):
        f = self.target / "docs" / "agentkit.md"
        f.parent.mkdir(exist_ok=True)
        f.write_bytes(contents)
        return f

    def test_empty_target_proposes_create_only(self):
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["status"], "proposed")
        self.assertEqual(p["operations"], [{"path": "docs/agentkit.md", "action": "create"}])
        self.assertFalse(p["writesPerformed"])
        self.assertFalse((self.target / "docs").exists())

    def test_clean_existing_managed_file_proposes_update(self):
        self.make_lock()
        f = self.target_file()
        before = f.read_bytes()
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["operations"][0]["action"], "update")
        self.assertEqual(f.read_bytes(), before)

    def test_candidate_unchanged_is_noop(self):
        self.make_lock({"docs/agentkit.md": self.new_hash})
        self.target_file(b"new candidate data\n")
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["operations"][0]["action"], "unchanged")

    def test_preexisting_unmanaged_file_conflicts(self):
        self.target_file()
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["status"], "blocked")
        self.assertIn("unmanaged", p["operations"][0]["reason"])

    def test_local_drift_blocks(self):
        self.make_lock()
        self.target_file(b"user-modified\n")
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["status"], "blocked")
        self.assertIn("drift", p["operations"][0]["reason"])

    def test_missing_managed_file_blocks(self):
        self.make_lock()
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["status"], "blocked")
        self.assertIn("missing", p["operations"][0]["reason"])

    def test_other_kit_ownership_collision_blocks(self):
        self.make_lock(managed={"docs/another.md": self.old_hash}, other_owner={"docs/agentkit.md": self.old_hash})
        self.target_file()
        p = plan(self.target, self.source, self.manifest)
        self.assertEqual(p["status"], "blocked")
        self.assertIn("another kit", p["operations"][0]["reason"])

    def test_candidate_hash_mismatch_fails_closed(self):
        self.candidate_file.write_text("tampered", encoding="utf-8")
        with self.assertRaisesRegex(PlanError, "SHA-256 mismatch"):
            plan(self.target, self.source, self.manifest)

    def test_invalid_release_manifest_fails_closed(self):
        self.release["sourceCommitSha"] = "not-a-sha"
        self.save_manifest()
        with self.assertRaisesRegex(PlanError, "invalid release"):
            plan(self.target, self.source, self.manifest)

    def test_symlinks_in_source_and_target_fail_closed(self):
        external = self.root / "external.txt"
        external.write_text("secret", encoding="utf-8")
        self.candidate_file.unlink()
        self.candidate_file.symlink_to(external)
        with self.assertRaisesRegex(PlanError, "symlink"):
            plan(self.target, self.source, self.manifest)
        self.candidate_file.unlink()
        self.candidate_file.write_bytes(b"new candidate data\n")
        self.target_file()
        (self.target / "docs" / "agentkit.md").unlink()
        (self.target / "docs" / "agentkit.md").symlink_to(external)
        with self.assertRaisesRegex(PlanError, "symlink"):
            plan(self.target, self.source, self.manifest)

    def test_reserved_path_cannot_be_owned_by_manifest(self):
        self.release["artifacts"][0]["path"] = ".asf/agentkit.lock.json"
        self.save_manifest()
        with self.assertRaisesRegex(PlanError, "reserved"):
            plan(self.target, self.source, self.manifest)

    def test_status_reports_hash_match_without_provenance_claim(self):
        self.make_lock()
        self.target_file()
        s = status(self.target)
        self.assertEqual(s["status"], "hash-match")
        self.assertFalse(s["provenanceVerified"])
        self.target_file(b"modified")
        self.assertEqual(status(self.target)["status"], "drifted")

    def test_invalid_lock_refuses_plan_and_status(self):
        self.make_lock()
        lock = self.target / ".asf" / "agentkit.lock.json"
        lock.write_text('{"corrupt":true}')
        with self.assertRaisesRegex(PlanError, "invalid local lock"):
            status(self.target)
        with self.assertRaisesRegex(PlanError, "invalid local lock"):
            plan(self.target, self.source, self.manifest)

    def test_status_without_lock_reports_unmanaged_not_verified(self):
        s = status(self.target)
        self.assertEqual(s, {"status": "unmanaged-or-legacy", "provenanceVerified": False, "kits": []})

    def test_output_is_deterministic_and_no_target_write(self):
        a = json.dumps(plan(self.target, self.source, self.manifest), sort_keys=True)
        b = json.dumps(plan(self.target, self.source, self.manifest), sort_keys=True)
        self.assertEqual(a, b)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_cli_plan_exit_code_and_stable_json(self):
        command = [sys.executable, str(ROOT / "tools" / "plan_install.py"), "plan", "--target", str(self.target), "--source", str(self.source), "--manifest", str(self.manifest)]
        ok = subprocess.run(command, text=True, capture_output=True, check=False)
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertEqual(json.loads(ok.stdout)["operations"][0]["action"], "create")
        self.target_file()
        blocked = subprocess.run(command, text=True, capture_output=True, check=False)
        self.assertEqual(blocked.returncode, 2, blocked.stderr)
        self.assertEqual(json.loads(blocked.stdout)["status"], "blocked")
