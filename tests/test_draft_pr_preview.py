"""R5b-01: an advisory PR envelope does not authorize a GitHub PR write."""
import copy
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
from preview_draft_pr import preview_draft_pr, PrPreviewError
from preview_version_transition import preview_version_transition

PATH = '.asf/agentkit/guide.md'


class DraftPrPreviewTests(unittest.TestCase):
    def setUp(self):
        self.hash = hashlib.sha256(b'vendored kit\n').hexdigest()
        self.release = {
            'schemaVersion': 1, 'kitId': 'opencode-direct',
            'kitVersion': '1.2.4', 'coreVersion': '1.0.0',
            'sourceRepository': 'synthetic/catalogue',
            'sourceCommitSha': 'b'*40,
            'releaseTag': 'kits/opencode-direct/v1.2.4',
            'runtime': {'nodeVersion':'22.16.0', 'openCodeVersion':'1.0.0',
                        'openSpecVersion':'1.14.1'},
            'artifacts': [{'path':PATH,'sha256':self.hash}],
        }
        self.ownership={
            'kind':'r2d-read-only-ownership-preview',
            'kitId':'opencode-direct','status':'proposed','conflicts':0,
            'operations':[{'path':PATH,'action':'create'}],
            'sourceProvenanceVerified':False,
            'promotionAllowed':False,'writesPerformed':False,
        }
        self.lock={
            'schemaVersion':1,'kits':[{
                'id':'opencode-direct','version':'1.2.3',
                'sourceRepository':'synthetic/catalogue',
                'releaseTag':'kits/opencode-direct/v1.2.3',
                'sourceCommitSha':'a'*40,'coreVersion':'1.0.0',
                'configSchemaVersion':1,
                'managedFiles':{PATH:self.hash},
            }],
        }

    def run_preview(self,transition=None):
        return preview_draft_pr(self.release,self.ownership,transition)

    def denied(self,transition=None):
        with self.assertRaisesRegex(PrPreviewError,'^R5b DENY:'):
            self.run_preview(transition)

    def safe(self,preview):
        for field in ('githubPrCreated','filesystemSnapshotAtomic',
                      'independentlyVerifiedRelease','sourceProvenanceVerified',
                      'trustEvidenceIndependentlyVerified','authorizedToExecute',
                      'promotionAllowed','writesPerformed'):
            self.assertFalse(preview[field],field)
        self.assertTrue(preview['paidApprovalRequired'])

    def test_new_install_is_only_an_advisory_draft_preview(self):
        before=copy.deepcopy((self.release,self.ownership))
        item=self.run_preview()
        self.assertEqual(item['mode'],'new-install')
        self.assertEqual(item['status'],'review-preview-only')
        self.assertEqual(item['files'],[{
            'path':PATH,'action':'create','declaredSha256':self.hash}])
        self.assertIn('UNVERIFIED',item['draftTitlePreview'])
        self.assertEqual(self.run_preview(),item)
        self.assertEqual(before,(self.release,self.ownership))
        self.safe(item)

    def test_real_version_transition_and_ownership_unchanged(self):
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        self.ownership['operations'][0]['action']='unchanged'
        item=self.run_preview(transition)
        self.assertEqual(item['mode'],'upgrade')
        self.assertEqual(item['status'],'review-preview-only')
        self.safe(item)

    def test_review_update_blocks_instead_of_approving_write(self):
        self.release['artifacts'][0]['sha256']='c'*64
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        self.ownership['status']='blocked'
        self.ownership['conflicts']=1
        self.ownership['operations'][0]={'path':PATH,'action':'conflict',
                                         'reason':'candidate changes managed file'}
        item=self.run_preview(transition)
        self.assertEqual(item['status'],'blocked')
        self.assertEqual(item['conflicts'],1)
        self.safe(item)

    def test_non_destructive_added_file_in_upgrade(self):
        self.release['artifacts'].append({
            'path':'.asf/agentkit/another.md','sha256':'d'*64})
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        self.ownership['operations']=[
            {'path':'.asf/agentkit/another.md','action':'create'},
            {'path':PATH,'action':'unchanged'}]
        item=self.run_preview(transition)
        self.assertEqual(len(item['files']),2)
        self.safe(item)

    def test_ownership_conflict_blocks_new_install(self):
        self.ownership['status']='blocked'
        self.ownership['conflicts']=1
        self.ownership['operations'][0]={
            'path':PATH,'action':'conflict','reason':'unmanaged target exists'}
        item=self.run_preview()
        self.assertEqual(item['status'],'blocked')
        self.safe(item)

    def test_removal_conflict_must_be_explicit_in_both_plans(self):
        self.lock['kits'][0]['managedFiles']['.asf/agentkit/removed.md']='e'*64
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        self.ownership['status']='blocked'
        self.ownership['conflicts']=1
        self.ownership['operations']=[
            {'path':PATH,'action':'unchanged'},
            {'path':'.asf/agentkit/removed.md','action':'conflict','reason':'removal'}]
        result=self.run_preview(transition)
        self.assertEqual(result['status'],'blocked')
        self.assertIn(None,[row['declaredSha256'] for row in result['files']])
        self.safe(result)

    def test_forged_ownership_provenance_rejected(self):
        self.ownership['sourceProvenanceVerified']=True
        self.denied()

    def test_forged_transition_grant_rejected(self):
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        transition['authorizedToExecute']=True
        self.ownership['operations'][0]['action']='unchanged'
        self.denied(transition)

    def test_wrong_kit_denied(self):
        self.ownership['kitId']='opencode-openspec'
        self.denied()

    def test_missing_candidate_path_denied(self):
        self.ownership['operations']=[{
            'path':'.asf/agentkit/different.md','action':'create'}]
        self.denied()

    def test_extra_unmanaged_operation_denied(self):
        self.ownership['operations'].append({
            'path':'.asf/agentkit/extra.md','action':'create'})
        self.denied()

    def test_mismatched_conflict_count_denied(self):
        self.ownership['conflicts']=1
        self.denied()

    def test_injected_token_in_ownership_denied(self):
        self.ownership['token']='TOPSECRET'
        with self.assertRaisesRegex(PrPreviewError,'^R5b DENY:') as result:
            self.run_preview()
        self.assertNotIn('TOPSECRET',str(result.exception))

    def test_protected_path_denied(self):
        self.release['artifacts'][0]['path']='.github/workflows/ci.yml'
        self.denied()

    def test_case_alias_denied(self):
        self.release['artifacts'].append({'path':'.asf/agentkit/GUIDE.MD',
                                          'sha256':'f'*64})
        self.denied()

    def test_upgrade_transition_wrong_commit_denied(self):
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        transition['toCommitSha']='f'*40
        self.ownership['operations'][0]['action']='unchanged'
        self.denied(transition)

    def test_upgrade_conflict_cannot_be_claimed_unchanged(self):
        self.release['artifacts'][0]['sha256']='c'*64
        transition=preview_version_transition(self.lock,self.release,'opencode-direct')
        self.ownership['operations'][0]['action']='unchanged'
        self.denied(transition)

    def test_noncanonical_semver_is_rejected_in_draft_title(self):
        self.release['kitVersion']='01.2.4'
        self.release['releaseTag']='kits/opencode-direct/v01.2.4'
        self.denied()

    def test_oversized_semver_is_rejected_in_draft_title(self):
        self.release['kitVersion']='999999999999999999999.2.4'
        self.release['releaseTag']='kits/opencode-direct/v999999999999999999999.2.4'
        self.denied()

    def test_new_install_must_not_silently_take_existing_files(self):
        self.ownership['operations'][0]['action']='unchanged'
        self.denied()


if __name__=='__main__':
    unittest.main()
