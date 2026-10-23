"""R6a-01 integration: real disposable target bytes and synthetic PR gates."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from qualify_local_installation_fixture import (
    qualify_local_installation_fixture, R6OfflineError,
)

PATH='.asf/agentkit/guide.md'
SECOND='.asf/agentkit/extra.md'
OLD=b'kit version 1.2.3\n'
NEW=b'new additive file\n'
digest=lambda b:hashlib.sha256(b).hexdigest()


class IntegratedQualificationTests(unittest.TestCase):
    def setUp(self):
        root=tempfile.TemporaryDirectory(prefix='asf-r6a01-')
        self.addCleanup(root.cleanup)
        self.target=Path(root.name)/'target'
        self.target.mkdir()
        self.lock={
            'schemaVersion':1,'kits':[{
                'id':'opencode-direct','version':'1.2.3',
                'sourceRepository':'synthetic/catalogue',
                'releaseTag':'kits/opencode-direct/v1.2.3',
                'sourceCommitSha':'a'*40,'coreVersion':'1.0.0',
                'configSchemaVersion':1,
                'managedFiles':{PATH:digest(OLD)},
            }],
        }
        self.release={
            'schemaVersion':1,'kitId':'opencode-direct',
            'kitVersion':'1.2.4','coreVersion':'1.0.0',
            'sourceRepository':'synthetic/catalogue',
            'sourceCommitSha':'b'*40,
            'releaseTag':'kits/opencode-direct/v1.2.4',
            'runtime':{'nodeVersion':'22.16.0','openCodeVersion':'1.0.0',
                       'openSpecVersion':'1.14.1'},
            'artifacts':[{'path':PATH,'sha256':digest(OLD)},
                         {'path':SECOND,'sha256':digest(NEW)}],
        }
        self.ownership={
            'kind':'r2d-read-only-ownership-preview',
            'kitId':'opencode-direct','status':'proposed','conflicts':0,
            'operations':[{'path':PATH,'action':'create'},
                          {'path':SECOND,'action':'create'}],
            'sourceProvenanceVerified':False,
            'promotionAllowed':False,'writesPerformed':False,
        }
        self.host={
            'repository':'synthetic/target',
            'repositoryId':12345,'baseBranch':'main',
            'baseSha':'c'*40,'requiredCheckContext':'check',
            'expectedCheckAppId':15368,
            'proposedBranch':'agentkit/new-install/opencode-direct/v1.2.4',
        }
        self.obs={
            'repository':'synthetic/target','repositoryId':12345,
            'baseBranch':'main','baseSha':'c'*40,'baseProtected':True,
            'checkContext':'check','checkHeadSha':'c'*40,
            'checkAppId':15368,'checkConclusion':'success',
            'activePublisherRuns':0,'matchingOpenPullRequests':0,
            'proposedBranchExists':False,'observedAtSeconds':1000,
            'nowSeconds':1010,
        }
        self.current=None

    def installed(self):
        file=self.target/PATH
        file.parent.mkdir(parents=True,exist_ok=True)
        file.write_bytes(OLD)
        self.lock_file=(self.target/'.asf/agentkit.lock.json')
        self.lock_file.write_text(json.dumps(self.lock),encoding='utf-8')
        self.current=copy.deepcopy(self.lock)
        self.ownership['operations'][0]['action']='unchanged'
        self.host['proposedBranch']='agentkit/upgrade/opencode-direct/v1.2.4'

    def run_fixture(self):
        return qualify_local_installation_fixture(
            str(self.target),self.current,self.release,self.ownership,
            self.host,self.obs)

    def denied(self):
        with self.assertRaisesRegex(R6OfflineError,'^R6a-01 DENY:'):
            self.run_fixture()

    def assert_no_grants(self,value):
        for key in ('localFileSnapshotAtomic','releaseIndependentlyAttested',
                    'hostIndependentlyAuthenticated','sourceProvenanceVerified',
                    'targetRefCasVerified','authorizedToPublish',
                    'authorizedToExecute','promotionAllowed','writesPerformed'):
            self.assertFalse(value[key],key)
        self.assertTrue(value['paidApprovalRequired'])

    def test_clean_new_install_preview_never_touches_empty_target(self):
        before=list(self.target.iterdir())
        out=self.run_fixture()
        self.assertEqual(out['mode'],'new-install')
        self.assertEqual(out['installationClassification'],'unmanaged-legacy')
        self.assertEqual(out['plannedFileCount'],2)
        self.assert_no_grants(out)
        self.assertEqual(self.run_fixture(),out)
        self.assertEqual(list(self.target.iterdir()),before)

    def test_existing_clean_install_additive_upgrade_is_only_a_mock(self):
        self.installed()
        original=(self.target/PATH).read_bytes()
        out=self.run_fixture()
        self.assertEqual(out['mode'],'upgrade')
        self.assertEqual(out['installationClassification'],'unknown')
        self.assertEqual(out['plannedFileCount'],2)
        self.assert_no_grants(out)
        self.assertEqual((self.target/PATH).read_bytes(),original)
        self.assertFalse((self.target/SECOND).exists())
        self.assertEqual(json.loads(self.lock_file.read_text()),self.lock)

    def test_modified_local_file_refuses_even_if_mock_ownership_claims_clean(self):
        self.installed();(self.target/PATH).write_bytes(b'manually changed\n')
        self.denied()

    def test_missing_locked_file_refuses(self):
        self.installed();(self.target/PATH).unlink()
        self.denied()

    def test_existing_unmanaged_path_never_silently_adopted(self):
        file=self.target/PATH
        file.parent.mkdir(parents=True,exist_ok=True)
        file.write_bytes(b'old unmanaged\n')
        self.denied()

    def test_new_file_conflicts_with_existing_local_overlay(self):
        self.installed();(self.target/SECOND).write_bytes(b'unmanaged overlay')
        self.denied()

    def test_moved_target_ref_refuses(self):
        self.obs['baseSha']='d'*40
        self.denied()

    def test_failed_mock_ci_refuses(self):
        self.obs['checkConclusion']='failure'
        self.denied()

    def test_concurrent_publisher_refuses(self):
        self.obs['activePublisherRuns']=1
        self.denied()

    def test_unknown_publisher_permission_claim_refuses(self):
        self.obs['hostAuthenticated']=True
        self.denied()

    def test_forged_release_provenance_refuses(self):
        self.release['sourceProvenanceVerified']=True
        self.denied()

    def test_candidate_replaces_existing_managed_bytes_requires_review(self):
        self.installed()
        self.release['artifacts'][0]['sha256']=digest(b'v2 changed\n')
        self.denied()

    def test_candidate_removes_managed_file_cannot_be_approved(self):
        self.installed()
        self.release['artifacts']=[self.release['artifacts'][-1]]
        self.denied()

    def test_version_rollback_refuses(self):
        self.installed()
        self.release['kitVersion']='1.2.2'
        self.release['releaseTag']='kits/opencode-direct/v1.2.2'
        self.host['proposedBranch']='agentkit/upgrade/opencode-direct/v1.2.2'
        self.denied()

    def test_symlink_new_file_is_rejected_without_following(self):
        self.installed()
        (self.target/SECOND).symlink_to('/etc/passwd')
        self.denied()

    def test_lock_edited_after_host_copy_is_rejected(self):
        self.installed()
        self.lock_file.write_text('{"schemaVersion":3}')
        self.denied()

    def test_forged_ownership_writes_refused(self):
        self.ownership['writesPerformed']=True
        self.denied()

    def test_no_authority_from_consistent_observations(self):
        out=self.run_fixture()
        self.assertFalse(out['authorizedToPublish'])
        self.assertFalse(out['sourceProvenanceVerified'])


if __name__=='__main__':
    unittest.main()
