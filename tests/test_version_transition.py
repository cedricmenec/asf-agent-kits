"""R5a-02: memory-only version upgrade preflight, no install authority."""
import copy
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from preview_version_transition import preview_version_transition, TransitionPreviewError


class UpgradePreviewTests(unittest.TestCase):
    def setUp(self):
        self.path = 'docs/agentkit.md'
        self.hash_old = hashlib.sha256(b'previous\n').hexdigest()
        self.hash_new = hashlib.sha256(b'candidate\n').hexdigest()
        self.kit = 'opencode-direct'
        self.existing = {
            'schemaVersion': 1, 'kits': [{
                'id': self.kit, 'version': '1.2.3',
                'sourceRepository': 'synthetic/catalogue',
                'releaseTag': 'kits/opencode-direct/v1.2.3',
                'sourceCommitSha': 'a'*40, 'coreVersion': '1.0.0',
                'configSchemaVersion': 1,
                'managedFiles': {self.path: self.hash_old},
            }],
        }
        self.next = {
            'schemaVersion': 1, 'kitId': self.kit, 'kitVersion': '1.2.4',
            'coreVersion': '1.0.0', 'sourceRepository': 'synthetic/catalogue',
            'sourceCommitSha': 'b'*40, 'releaseTag': 'kits/opencode-direct/v1.2.4',
            'runtime': {'nodeVersion': '22.16.0', 'openCodeVersion': '1.0.0',
                        'openSpecVersion': '1.14.1'},
            'artifacts': [{'path': self.path, 'sha256': self.hash_new}],
        }

    def preview(self):
        return preview_version_transition(self.existing, self.next, self.kit)

    def denied(self):
        with self.assertRaisesRegex(TransitionPreviewError, '^R5a-02 DENY:'):
            self.preview()

    def test_upgrade_is_still_untrusted_and_only_a_preview(self):
        before = copy.deepcopy((self.existing, self.next))
        result = self.preview()
        self.assertEqual(result['status'], 'preview-only')
        self.assertEqual(result['changes'], [{'path': self.path, 'action': 'review-update'}])
        self.assertEqual(result['fromVersion'], '1.2.3')
        self.assertEqual(result['toVersion'], '1.2.4')
        for key in ('independentlyVerifiedRelease', 'sourceProvenanceVerified',
                    'trustEvidenceIndependentlyVerified','authorizedToExecute',
                    'promotionAllowed','writesPerformed'):
            self.assertFalse(result[key], key)
        self.assertTrue(result['paidApprovalRequired'])
        self.assertEqual(self.preview(), result)
        self.assertEqual((self.existing,self.next), before)

    def test_noop_artifact_is_listed_without_install(self):
        self.next['artifacts'][0]['sha256'] = self.hash_old
        self.assertEqual(self.preview()['changes'][0]['action'], 'unchanged')

    def test_addition_is_readonly(self):
        self.next['artifacts'].append({'path':'docs/second.md','sha256':'c'*64})
        self.assertEqual(self.preview()['changes'][-1]['action'],'propose-create')

    def test_removal_is_hard_block_not_silent_deletion(self):
        self.existing['kits'][0]['managedFiles']['docs/removed.md'] = 'c'*64
        result = self.preview()
        self.assertEqual(result['status'],'blocked')
        self.assertEqual(result['conflicts'],1)
        self.assertEqual(result['changes'][-1]['action'],'conflict-removal')

    def test_downgrade_denied(self):
        self.next['kitVersion'] = '1.2.2'
        self.next['releaseTag'] = 'kits/opencode-direct/v1.2.2'
        self.denied()

    def test_same_version_new_commit_denied(self):
        self.next['kitVersion'] = '1.2.3'
        self.next['releaseTag'] = 'kits/opencode-direct/v1.2.3'
        self.denied()

    def test_mismatched_source_repo_denied(self):
        self.next['sourceRepository'] = 'unknown/catalogue'
        self.denied()

    def test_same_commit_across_versions_denied(self):
        self.next['sourceCommitSha'] = 'a'*40
        self.denied()

    def test_other_kit_identity_denied(self):
        self.next['kitId'] = 'opencode-openspec'
        self.next['releaseTag'] = 'kits/opencode-openspec/v1.2.4'
        self.denied()

    def test_core_change_requires_separate_review(self):
        self.next['coreVersion'] = '2.0.0'
        self.denied()

    def test_pre_release_candidate_denied(self):
        self.next['kitVersion'] = '1.2.4-rc.1'
        self.next['releaseTag'] = 'kits/opencode-direct/v1.2.4-rc.1'
        self.denied()

    def test_leading_zero_semver_denied(self):
        self.next['kitVersion'] = '01.2.4'
        self.next['releaseTag'] = 'kits/opencode-direct/v01.2.4'
        self.denied()

    def test_case_collision_path_denied(self):
        self.next['artifacts'].append({'path': 'DOCS/AGENTKIT.MD','sha256':'f'*64})
        self.denied()

    def test_path_traversal_denied(self):
        self.next['artifacts'][0]['path']='docs/../secret.md'
        self.denied()

    def test_protected_file_denied(self):
        self.next['artifacts'][0]['path']='.github/workflows/ci.yml'
        self.denied()

    def test_unsafe_nested_key_denied(self):
        self.existing['kits'][0]['managedFiles']['docs/secret.pem']='c'*64
        self.denied()

    def test_other_kit_ownership_collision_denied(self):
        another=copy.deepcopy(self.existing['kits'][0])
        another['id']='opencode-openspec'
        another['releaseTag']='kits/opencode-openspec/v1.2.3'
        another['managedFiles']={self.path:'f'*64}
        self.existing['kits'].append(another)
        self.denied()

    def test_extra_authority_field_denied(self):
        self.next['sourceProvenanceVerified']=True
        self.denied()

    def test_missing_lock_denied(self):
        self.existing={'schemaVersion':1,'kits':[]}
        self.denied()

    def test_invalid_version_number_denied(self):
        self.next['kitVersion']='999999999999999999999.2.4'
        self.next['releaseTag']='kits/opencode-direct/v999999999999999999999.2.4'
        self.denied()


if __name__ == '__main__':
    unittest.main()
