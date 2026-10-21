"""R1 positive and negative contract fixtures, standard Draft 2020-12 engine."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from validate_contracts import SCHEMAS, read_json, unsafe_path, validate  # noqa: E402
from jsonschema import Draft202012Validator  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"


class SchemaTests(unittest.TestCase):
    def test_every_schema_compiles_with_draft_2020_12(self):
        for name in SCHEMAS.values():
            with self.subTest(name=name):
                schema = read_json(ROOT / "schemas" / name)
                self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
                Draft202012Validator.check_schema(schema)

    def test_positive_fixtures(self):
        for kind in SCHEMAS:
            with self.subTest(kind=kind):
                path = FIXTURES / kind / "valid.json"
                self.assertEqual([], validate(kind, read_json(path)))

    def test_negative_fixtures_are_rejected(self):
        count = 0
        for kind in SCHEMAS:
            for path in sorted((FIXTURES / kind).glob("invalid-*.json")):
                with self.subTest(kind=kind, file=path.name):
                    self.assertTrue(validate(kind, read_json(path)), f"unexpectedly accepted {path}")
                count += 1
        self.assertGreaterEqual(count, 12, "insufficient negative scenarios")

    def test_valid_example_config_is_not_a_release(self):
        config = read_json(ROOT / "examples" / "valid-config.json")
        self.assertEqual([], validate("config", config))
        self.assertFalse(config["publication"]["autoMerge"])

    def test_protected_and_unsafe_paths(self):
        for value in ("../../secret", "/root/secret", "src/../secret", "./src", "src//file", "C:/root", "x\\y", "~/.ssh"):
            with self.subTest(value=value):
                self.assertTrue(unsafe_path(value))
        for value in ("src/", "docs/file.md", ".asf/"):
            with self.subTest(value=value):
                self.assertFalse(unsafe_path(value))

    def test_schema_validation_and_semantics_are_both_required(self):
        config = read_json(FIXTURES / "config" / "valid.json")
        config["execution"]["defaultModel"] = "another/provider"
        self.assertTrue(any("defaultModel" in error for error in validate("config", config)))
        config["execution"]["defaultModel"] = config["execution"]["allowedModels"][0]
        config["unexpected"] = "must fail"
        self.assertTrue(any("Additional properties" in error for error in validate("config", config)))


if __name__ == "__main__":
    unittest.main()
