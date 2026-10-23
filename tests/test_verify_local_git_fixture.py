"""R3g-04: local Git object checks on temporary repos only; no remote network."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from verify_local_git_fixture import verify_local_git_fixture, LocalGitFixtureError

SPEC='openspec/specs/widgets/spec.md'


@unittest.skipUnless(os.name=='posix', 'Linux/POSIX-only fixture')
class LocalGitFixtureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='asf-gitproof-')
        self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        self.repo=root/'repo'
        self.snapshot=root/'snapshot'
        self.repo.mkdir()
        self.snapshot.mkdir()
        self.git('init','-q')
        self.git('config','user.email','fixture@example.invalid')
        self.git('config','user.name','Fixture Tester')
        self.commit_path(SPEC,'# Git-tracked spec\n')
        self.sync_snapshot()

    def git(self,*args):
        return subprocess.check_output(['git','-C',str(self.repo),*args],stderr=subprocess.DEVNULL).decode().strip()

    def commit_path(self,path,text):
        target=self.repo/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(text)
        self.git('add','--',path)
        self.git('commit','-qm','disposable fixture')
        self.sha=self.git('rev-parse','HEAD')

    def sync_snapshot(self):
        target=self.snapshot/SPEC
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((self.repo/SPEC).read_bytes())

    def check(self,paths=None,sha=None):
        return verify_local_git_fixture(str(self.repo/'.git'),str(self.snapshot),sha or self.sha,
                                        paths if paths is not None else [SPEC])

    def test_git_commit_tree_bytes_match_snapshot_but_never_authorize_any_action(self):
        result=self.check()
        self.assertEqual(result['observedLocalGitHeadSha'],self.sha)
        self.assertTrue(result['localGitObjectsMatchSnapshot'])
        self.assertEqual(result['filesReviewed'],1)
        for key in ['remoteGitHubEvidenceVerified','sourceProvenanceVerified',
                    'authorizedToExecute','promotionAllowed','writesPerformed']:
            self.assertFalse(result[key])
        self.assertTrue(result['paidApprovalRequired'])

    def test_repeat_is_deterministic_without_writes(self):
        self.assertEqual(self.check(),self.check())
        self.assertFalse((self.snapshot/'.git').exists())

    def test_wrong_git_head_is_rejected(self):
        with self.assertRaises(LocalGitFixtureError): self.check(sha='a'*40)

    def test_tampered_snapshot_bytes_are_rejected(self):
        (self.snapshot/SPEC).write_text('# different bytes\n')
        with self.assertRaises(LocalGitFixtureError): self.check()

    def test_git_commit_changed_after_old_sha_is_rejected(self):
        old_sha=self.sha
        self.commit_path(SPEC,'# newer committed spec\n')
        with self.assertRaises(LocalGitFixtureError): self.check(sha=old_sha)

    def test_untracked_local_extra_file_is_rejected(self):
        (self.snapshot/'untracked.md').write_text('unmanaged')
        with self.assertRaises(LocalGitFixtureError): self.check()

    def test_git_extra_tracked_path_is_rejected(self):
        self.commit_path('other.md','tracked not inventoried\n')
        with self.assertRaises(LocalGitFixtureError): self.check()

    def test_git_executable_blob_mode_is_rejected(self):
        (self.repo/SPEC).chmod(0o755)
        self.git('add','--',SPEC)
        self.git('commit','-qm','executable fixture')
        self.sha=self.git('rev-parse','HEAD')
        with self.assertRaises(LocalGitFixtureError): self.check()

    def test_git_symlink_blob_mode_is_rejected(self):
        (self.repo/SPEC).unlink()
        (self.repo/SPEC).symlink_to('/etc/passwd')
        self.git('add','--',SPEC)
        self.git('commit','-qm','symlink fixture')
        self.sha=self.git('rev-parse','HEAD')
        with self.assertRaises(LocalGitFixtureError): self.check()

    def test_snapshot_symlink_and_unsafe_paths_are_rejected(self):
        (self.snapshot/SPEC).unlink()
        (self.snapshot/SPEC).symlink_to('/etc/passwd')
        with self.assertRaises(LocalGitFixtureError): self.check()
        with self.assertRaises(LocalGitFixtureError): self.check(paths=['../escape'])

    def test_malformed_injected_input_or_git_dir_rejected_without_command(self):
        link=Path(self.tmp.name)/'git-alias'
        link.symlink_to(self.repo/'.git',target_is_directory=True)
        with self.assertRaises(LocalGitFixtureError):
            verify_local_git_fixture(str(link),str(self.snapshot),self.sha,[SPEC])
        for bad in ['bad','B'*40]:
            with self.assertRaises(LocalGitFixtureError): self.check(sha=bad)


if __name__=='__main__':
    unittest.main()
