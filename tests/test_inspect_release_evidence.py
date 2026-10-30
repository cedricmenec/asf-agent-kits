"""Offline positive/hostile GitHub REST fixtures; no requests or writes."""
import base64
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from asf_agentkit_github_read import ReadUnavailable  # noqa: E402
from inspect_release_evidence import inspect  # noqa: E402

REPO = "example/catalogue"
KIT = "opencode-openspec"
VERSION = "1.0.0"
TAG = f"kits/{KIT}/v{VERSION}"
TAG_ENCODED = "kits%2Fopencode-openspec%2Fv1.0.0"
COMMIT = "a" * 40
HEAD = "b" * 40
ANNOTATED = "c" * 40
ARTIFACT = "kits/opencode-openspec/README.md"
MANIFEST_PATH = "kits/opencode-openspec/release-manifest.json"
BYTES = b"AgentKit example\n"


def content(path, raw):
    return {"type": "file", "path": path, "size": len(raw),
            "encoding": "base64", "content": base64.b64encode(raw).decode()}


def fixture():
    manifest = {
        "schemaVersion": 1, "kitId": KIT, "kitVersion": VERSION,
        "coreVersion": "1.0.0", "sourceRepository": REPO,
        "sourceCommitSha": COMMIT, "releaseTag": TAG,
        "runtime": {"nodeVersion": "22.16.0", "openCodeVersion": "1.0.0",
                    "openSpecVersion": "1.14.1"},
        "artifacts": [{"path": ARTIFACT, "sha256": hashlib.sha256(BYTES).hexdigest()}]}
    raw = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    return {
        "__manifest_bytes": raw,
        "": {"full_name": REPO, "id": 42, "default_branch": "main", "archived": False},
        "/branches/main": {"commit": {"sha": HEAD}, "protected": True},
        "/releases/tags/" + TAG_ENCODED: {
            "id": 123, "tag_name": TAG, "draft": False, "prerelease": False,
            "published_at": "2026-10-30T10:00:00Z", "author": {"login": "publisher"}},
        "/git/ref/tags/" + TAG_ENCODED: {
            "ref": "refs/tags/" + TAG, "object": {"type": "tag", "sha": ANNOTATED}},
        "/git/tags/" + ANNOTATED: {
            "tag": TAG, "object": {"type": "commit", "sha": COMMIT}},
        "/compare/" + COMMIT + "...main": {
            "status": "ahead", "behind_by": 0, "merge_base_commit": {"sha": COMMIT}},
        "/contents/" + ARTIFACT + "?ref=" + COMMIT: content(ARTIFACT, BYTES),
        "/releases/123/assets?per_page=100": [{
            "name": "release-manifest.json", "size": len(raw), "state": "uploaded",
            "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}],
    }


class Reader:
    def __init__(self, data):
        self.data = data
        self.paths = []

    def get(self, path):
        self.paths.append(path)
        if path not in self.data:
            raise ReadUnavailable("http-404")
        item = self.data[path]
        if isinstance(item, Exception):
            raise item
        return item


class ReleaseEvidenceTests(unittest.TestCase):
    def check(self, data):
        reader = Reader(data)
        result = inspect(reader, REPO, KIT, VERSION, "publisher", data["__manifest_bytes"])
        self.assertFalse(result["sourceProvenanceVerified"])
        self.assertFalse(result["trustEvidenceIndependentlyVerified"])
        self.assertFalse(result["tagGovernanceVerified"])
        self.assertFalse(result["promotionAllowed"])
        self.assertFalse(result["authorizedToExecute"])
        self.assertFalse(result["writesPerformed"])
        self.assertTrue(all(p == "" or p.startswith("/") for p in reader.paths))
        return result

    def test_consistent_read_only_observations_still_do_not_authorize_release(self):
        result = self.check(fixture())
        self.assertTrue(result["releaseEvidenceConsistent"], result["errors"])
        self.assertEqual(result["sourceCommitSha"], COMMIT)
        self.assertEqual(result["artifactCount"], 1)

    def test_fail_closed_on_independent_evidence_mismatches(self):
        cases = [
            ("repo swapped", "", "full_name", "different/catalogue"),
            ("main unprotected", "/branches/main", "protected", False),
            ("release draft", "/releases/tags/" + TAG_ENCODED, "draft", True),
            ("wrong publisher", "/releases/tags/" + TAG_ENCODED, "author", {"login": "other"}),
            ("release missing", "/releases/tags/" + TAG_ENCODED, None, ReadUnavailable("http-404")),
            ("tag moved", "/git/tags/" + ANNOTATED, "object", {"type": "commit", "sha": "d" * 40}),
            ("commit not on main", "/compare/" + COMMIT + "...main", "status", "diverged"),
            ("manifest asset altered", "/releases/123/assets?per_page=100", None, []),
            ("manifest locally missing", "__manifest_bytes", None, b""),
            ("artifact source changed", "/contents/" + ARTIFACT + "?ref=" + COMMIT,
             "content", base64.b64encode(b"Altered fixture!\n").decode()),
        ]
        for name, endpoint, field, mutation in cases:
            with self.subTest(name):
                data = fixture()
                if field is None:
                    data[endpoint] = mutation
                else:
                    data[endpoint][field] = mutation
                self.assertFalse(self.check(data)["releaseEvidenceConsistent"])

    def test_rejects_non_annotated_tag_and_incomplete_assets(self):
        data = fixture()
        data["/git/ref/tags/" + TAG_ENCODED]["object"]["type"] = "commit"
        self.assertFalse(self.check(data)["releaseEvidenceConsistent"])
        data = fixture()
        data["/releases/123/assets?per_page=100"] *= 100
        self.assertFalse(self.check(data)["releaseEvidenceConsistent"])

    def test_rejects_manifest_path_escape_and_duplicate_keys(self):
        for tweak in ("../outside", ".git/config", "docs/../../outside"):
            with self.subTest(tweak):
                data = fixture()
                raw = data["__manifest_bytes"]
                manifest = json.loads(raw)
                manifest["artifacts"][0]["path"] = tweak
                changed = (json.dumps(manifest) + "\n").encode()
                data["__manifest_bytes"] = changed
                data["/releases/123/assets?per_page=100"][0].update({
                    "size": len(changed),
                    "digest": "sha256:" + hashlib.sha256(changed).hexdigest()})
                self.assertFalse(self.check(data)["releaseEvidenceConsistent"])
        data = fixture()
        raw = data["__manifest_bytes"]
        changed = raw.replace(b'"schemaVersion":1', b'"schemaVersion":1,"schemaVersion":1')
        data["__manifest_bytes"] = changed
        data["/releases/123/assets?per_page=100"][0].update({
            "size": len(changed),
            "digest": "sha256:" + hashlib.sha256(changed).hexdigest()})
        self.assertFalse(self.check(data)["releaseEvidenceConsistent"])


if __name__ == "__main__":
    unittest.main()
