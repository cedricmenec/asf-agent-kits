"""R2b offline proof on synthetic ephemeral repositories, never a real deployment."""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from plan_merge import PlanError, config_for, plan_merge, sha256, three_way  # noqa E402


class ThreeWayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.target = self.root / 'target'
        self.prior = self.root / 'prior'
        self.new = self.root / 'new'
        for p in (self.target, self.prior, self.new):
            p.mkdir()
        self.conf = json.loads((ROOT / 'examples' / 'valid-config.json').read_text())
        self.conf['project']['repository'] = 'synthetic/repo'
        self.conf['paths']['protected'] = ['.github/', '.asf/', 'AGENTS.md']
        self.write(self.target / '.asf/agentkit.yaml', json.dumps(self.conf))
        self.path = 'docs/agentkit.md'
        self.base_bytes = b'alpha\nbeta\ngamma\ndelta\n'
        self.new_bytes = b'alpha\nbeta\ngamma\nDELTA\n'
        self.write(self.prior / self.path, self.base_bytes)
        self.write(self.new / self.path, self.new_bytes)
        self.old_manifest = self.make_manifest('1.0.0', 'a'*40, self.base_bytes)
        self.next_manifest = self.make_manifest('1.0.1', 'b'*40, self.new_bytes)
        self.save_manifests()

    @staticmethod
    def write(path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())

    def make_manifest(self,version,commit,data, name=None):
        name = name or self.path
        return {'schemaVersion':1,'kitId':'opencode-openspec','kitVersion':version,'coreVersion':'1.0.0',
                'sourceRepository':'synthetic/repo','sourceCommitSha':commit,
                'releaseTag':f'kits/opencode-openspec/v{version}',
                'runtime':{'nodeVersion':'22.16.0','openCodeVersion':'1.0.0','openSpecVersion':'1.14.1'},
                'artifacts':[{'path':name,'sha256':sha256(data)}]}

    def save_manifests(self):
        self.old_path = self.root/'old.json'
        self.next_path = self.root/'new.json'
        self.write(self.old_path, json.dumps(self.old_manifest))
        self.write(self.next_path, json.dumps(self.next_manifest))

    def lock_installed(self, data=None):
        data = data or self.base_bytes
        lock={'schemaVersion':1,'kits':[{'id':'opencode-openspec','version':'1.0.0','sourceRepository':'synthetic/repo',
          'sourceCommitSha':'a'*40,'releaseTag':'kits/opencode-openspec/v1.0.0','coreVersion':'1.0.0',
          'configSchemaVersion':1,'managedFiles':{self.path:sha256(data)}}]}
        self.write(self.target/'.asf/agentkit.lock.json',json.dumps(lock))
        self.write(self.target/self.path,self.base_bytes)

    def preview(self, installed=True):
        return plan_merge(self.target, self.prior if installed else None,
                          self.old_path if installed else None, self.new, self.next_path)

    def test_first_install_proposes_create_and_does_not_write(self):
        before = {f.relative_to(self.target).as_posix(): f.read_bytes() for f in self.target.rglob('*') if f.is_file()}
        result = self.preview(False)
        self.assertEqual(result['status'],'proposed')
        self.assertEqual(result['operations'][0]['action'],'create')
        self.assertFalse(result['writesPerformed'])
        self.assertEqual(before,{f.relative_to(self.target).as_posix(): f.read_bytes() for f in self.target.rglob('*') if f.is_file()})

    def test_clean_upgrade_accepts_new_version(self):
        self.lock_installed()
        r=self.preview()
        self.assertEqual(r['operations'][0]['action'],'update')
        self.assertEqual(r['operations'][0]['sha256'],sha256(self.new_bytes))
        self.assertFalse(r['sourceProvenanceVerified'])

    def test_non_overlapping_three_way_edits(self):
        self.lock_installed()
        local=b'ALPHA\nbeta\ngamma\ndelta\n'
        self.write(self.target/self.path,local)
        r=self.preview()
        wanted=b'ALPHA\nbeta\ngamma\nDELTA\n'
        self.assertEqual(r['operations'][0]['action'],'update')
        self.assertEqual(r['operations'][0]['mergeMode'],'auto-merged')
        self.assertEqual(r['operations'][0]['sha256'],sha256(wanted))

    def test_overlap_conflicts(self):
        self.lock_installed()
        self.write(self.target/self.path,b'alpha\nbeta\ngamma\nOTHER\n')
        r=self.preview()
        self.assertEqual(r['status'],'blocked')
        self.assertIn('overlapping',r['operations'][0]['reason'])

    def test_no_mutation_when_candidate_does_not_change(self):
        self.lock_installed()
        self.write(self.target/self.path,b'LOCAL\nbeta\ngamma\ndelta\n')
        self.write(self.new/self.path,self.base_bytes)
        self.next_manifest['artifacts'][0]['sha256']=sha256(self.base_bytes)
        self.save_manifests()
        r=self.preview()
        self.assertEqual(r['operations'][0]['action'],'preserve-overlay')

    def test_protected_path_is_conflict(self):
        self.lock_installed()
        # Formerly managed file is now considered protected, regardless of hash.
        self.conf['paths']['additionalProtected']=[self.path]
        self.write(self.target/'.asf/agentkit.yaml',json.dumps(self.conf))
        r=self.preview()
        self.assertEqual(r['status'],'blocked')
        self.assertIn('protected',r['operations'][0]['reason'])

    def test_new_candidate_hash_mismatch_fails_closed(self):
        self.lock_installed()
        self.write(self.new/self.path,b'tampered')
        with self.assertRaisesRegex(PlanError,'hash mismatch'):
            self.preview()

    def test_wrong_historical_commit_fails_closed(self):
        self.lock_installed()
        self.old_manifest['sourceCommitSha']='f'*40
        self.save_manifests()
        with self.assertRaisesRegex(PlanError,'does not match installation lock'):
            self.preview()

    def test_symlink_artifact_refused(self):
        self.lock_installed()
        (self.new/self.path).unlink()
        (self.new/self.path).symlink_to(self.prior/self.path)
        with self.assertRaisesRegex(PlanError,'symlink'):
            self.preview()

    def test_absent_or_duplicate_yaml_key_refused(self):
        self.write(self.target/'.asf/agentkit.yaml',b'project: one\nproject: two\n')
        with self.assertRaisesRegex(PlanError,'duplicate YAML'):
            config_for(self.target)

    def test_aliases_and_merge_keys_refused(self):
        self.write(self.target/'.asf/agentkit.yaml',b'foo: &x one\nbar: *x\n')
        with self.assertRaisesRegex(PlanError,'anchors and aliases'):
            config_for(self.target)
        self.write(self.target/'.asf/agentkit.yaml',b'foo: &x {a: 1}\nbar: {<<: *x}\n')
        with self.assertRaisesRegex(PlanError,'anchors and aliases'):
            config_for(self.target)

    def test_unused_yaml_anchor_also_refused(self):
        self.write(self.target/'.asf/agentkit.yaml', b'foo: &x ignored\n')
        with self.assertRaisesRegex(PlanError, 'anchors and aliases'):
            config_for(self.target)

    def test_yaml_custom_tag_refused(self):
        self.write(self.target/'.asf/agentkit.yaml', b'foo: !python/object/apply:os.system [id]\n')
        with self.assertRaises(PlanError):
            config_for(self.target)

    def test_two_yaml_documents_refused(self):
        self.write(self.target/'.asf/agentkit.yaml',json.dumps(self.conf)+'\n---\n{}\n')
        with self.assertRaisesRegex(PlanError,'exactly one YAML'):
            config_for(self.target)

    def test_local_binary_merge_is_conflict_not_exec(self):
        self.lock_installed()
        self.write(self.target/self.path,b'\x00\x01binary')
        r=self.preview()
        self.assertEqual(r['status'],'blocked')
        self.assertIn('binary',r['operations'][0]['reason'])

    def test_omitted_old_file_requires_explicit_deletion(self):
        self.lock_installed()
        # Keep one new candidate file, but omit previously managed old path.
        extra='docs/replacement.md'
        self.write(self.new/extra,b'new\n')
        self.next_manifest['artifacts']=[{'path':extra,'sha256':sha256(b'new\n')}]
        self.save_manifests()
        r=self.preview()
        self.assertEqual(r['status'],'blocked')
        self.assertTrue(any('removes' in x.get('reason','') for x in r['operations']))

    def test_reserved_workflow_path_refused(self):
        rel='.github/workflows/agent.yml'
        self.write(self.new/rel,b'no real workflow\n')
        self.next_manifest['artifacts']=[{'path':rel,'sha256':sha256(b'no real workflow\n')}]
        self.save_manifests()
        r=self.preview(False)
        self.assertEqual(r['operations'][0]['action'],'conflict')

    def test_deterministic_repeated_preview(self):
        self.lock_installed()
        a=self.preview()
        b=self.preview()
        self.assertEqual(a,b)
        self.assertEqual((self.target/self.path).read_bytes(),self.base_bytes)

    def test_insertion_conflict_same_anchor(self):
        base=b'a\nb\nc\n'
        ours=b'a\nX\nb\nc\n'
        theirs=b'a\nY\nb\nc\n'
        with self.assertRaises(PlanError):
            three_way(base,ours,theirs)


if __name__=='__main__':
    unittest.main()
