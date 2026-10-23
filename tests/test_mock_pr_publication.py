"""R5b-02a mock PR publication preflight; no GitHub API or writes."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from preview_pr_publication import preview_pr_publication, OfflinePublisherError
from preview_draft_pr import preview_draft_pr

PATH = '.asf/agentkit/guide.md'


class MockPrPublisherTests(unittest.TestCase):
    def setUp(self):
        release = {'schemaVersion': 1, 'kitId':'opencode-direct',
                   'kitVersion':'1.2.4','coreVersion':'1.0.0',
                   'sourceRepository':'synthetic/catalogue',
                   'sourceCommitSha':'b'*40,
                   'releaseTag':'kits/opencode-direct/v1.2.4',
                   'runtime':{'nodeVersion':'22.16.0','openCodeVersion':'1.0.0',
                              'openSpecVersion':'1.14.1'},
                   'artifacts':[{'path': PATH, 'sha256': 'c'*64}]}
        ownership = {'kind':'r2d-read-only-ownership-preview',
                     'kitId':'opencode-direct','status':'proposed','conflicts':0,
                     'operations':[{'path':PATH,'action':'create'}],
                     'sourceProvenanceVerified':False,'promotionAllowed':False,
                     'writesPerformed':False}
        self.plan = preview_draft_pr(release,ownership)
        self.host = {'repository':'synthetic/catalogue','repositoryId':12345,
                     'baseBranch':'main','baseSha':'a'*40,
                     'requiredCheckContext':'check','expectedCheckAppId':15368,
                     'proposedBranch':'agentkit/new-install/opencode-direct/v1.2.4'}
        self.obs = {'repository':'synthetic/catalogue','repositoryId':12345,
                    'baseBranch':'main','baseSha':'a'*40,
                    'baseProtected':True,'checkContext':'check',
                    'checkHeadSha':'a'*40,'checkAppId':15368,'checkConclusion':'success',
                    'activePublisherRuns':0,'matchingOpenPullRequests':0,
                    'proposedBranchExists':False,'observedAtSeconds':1000,
                    'nowSeconds':1010}

    def check(self):
        return preview_pr_publication(self.plan,self.host,self.obs)

    def denied(self):
        with self.assertRaisesRegex(OfflinePublisherError, '^R5b-02a DENY:'):
            self.check()

    def test_local_mock_consistency_never_creates_a_pr_or_authorizes_writes(self):
        original = copy.deepcopy((self.plan,self.host,self.obs))
        result = self.check()
        self.assertEqual(result['plannedFileCount'],1)
        self.assertEqual(result['syntheticTargetBranch'],'main')
        self.assertEqual(result['proposedUncreatedBranch'],
                         'agentkit/new-install/opencode-direct/v1.2.4')
        self.assertTrue(result['syntheticObservationsConsistent'])
        for field in ('githubPrCreated','hostIndependentlyAuthenticated',
                      'targetRefCasVerified','sourceProvenanceVerified',
                      'trustEvidenceIndependentlyVerified','authorizedToPublish',
                      'authorizedToExecute','promotionAllowed','writesPerformed'):
            self.assertFalse(result[field],field)
        self.assertTrue(result['paidApprovalRequired'])
        self.assertEqual(self.check(),result)
        self.assertEqual((self.plan,self.host,self.obs),original)

    def test_hostile_metadata_refused_without_echo(self):
        self.obs['token'] = 'TOPSECRET'
        with self.assertRaises(OfflinePublisherError) as context:
            self.check()
        self.assertNotIn('TOPSECRET',str(context.exception))

    def test_existing_derived_upgrade_preview(self):
        self.plan['mode']='upgrade'
        self.host['proposedBranch']='agentkit/upgrade/opencode-direct/v1.2.4'
        self.assertFalse(self.check()['authorizedToPublish'])

    def test_blocked_conflict_is_never_publishable(self):
        self.plan['status']='blocked';self.plan['conflicts']=1
        self.denied()

    def test_protected_files_and_aliases_refused(self):
        self.plan['files'][0]['path']='.github/workflows/ci.yml'
        self.denied()

    def test_user_forged_grant_refused(self):
        self.plan['authorizedToExecute']=True
        self.denied()

    def test_plan_extra_provenance_claim_refused(self):
        self.plan['hostAuthenticated']=True
        self.denied()

    def test_untrusted_check_approval_false_is_never_writable(self):
        self.obs['checkConclusion']='failure'
        self.denied()

    def test_tag_or_commit_claim_mismatch_denied(self):
        self.plan['candidateCommitSha']='INVALID'
        self.denied()

    def test_local_branch_already_exists_denied(self):
        self.obs['proposedBranchExists']=True
        self.denied()

    def test_pr_conflict_denied(self):
        self.obs['matchingOpenPullRequests']=1
        self.denied()

    def test_concurrent_publisher_denied(self):
        self.obs['activePublisherRuns']=1
        self.denied()

    def test_base_sha_move_denied(self):
        self.obs['baseSha']='d'*40
        self.denied()

    def test_unprotected_target_denied(self):
        self.obs['baseProtected']=False
        self.denied()

    def test_wrong_repository_numeric_identity_denied(self):
        self.obs['repositoryId']=12346
        self.denied()

    def test_wrong_repo_denied(self):
        self.obs['repository']='other/catalogue'
        self.denied()

    def test_wrong_check_app_denied(self):
        self.obs['checkAppId']=1
        self.denied()

    def test_wrong_check_commit_denied(self):
        self.obs['checkHeadSha']='d'*40
        self.denied()

    def test_wrong_check_context_denied(self):
        self.obs['checkContext']='ci'
        self.denied()

    def test_stale_observation_denied(self):
        self.obs['nowSeconds']=1500
        self.denied()

    def test_reversed_clock_denied(self):
        self.obs['observedAtSeconds']=1011
        self.denied()

    def test_wrong_proposed_branch_denied(self):
        self.host['proposedBranch']='agentkit/upgrade/opencode-direct/v1.2.4'
        self.denied()

    def test_null_or_string_permission_flags_denied(self):
        self.obs['activePublisherRuns']='0'
        self.denied()

    def test_fake_self_protection_denied(self):
        self.obs['sourceProvenanceVerified']=True
        self.denied()

    def test_duplicate_file_entries_denied(self):
        self.plan['files'].append(copy.deepcopy(self.plan['files'][0]))
        self.denied()

    def test_file_checksum_invalid_denied(self):
        self.plan['files'][0]['declaredSha256']='bad'
        self.denied()

    def test_file_not_owned_namespace_denied(self):
        self.plan['files'][0]['path']='docs/unmanaged.md'
        self.denied()

    def test_plan_attempted_paid_retry_flag_denied(self):
        self.plan['paidRetry']=True
        self.denied()


if __name__=='__main__':
    unittest.main()
