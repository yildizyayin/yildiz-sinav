import {resultRetentionFixture as fixture} from './helpers/result-retention-fixture';
import {expect,it} from 'vitest';
import {purgeExpiredResultNetwork} from '../worker/result-network-entry';
import {prepareResultArtifacts} from '../worker/lib/result-artifacts';
import {sweepRetiredResultArtifacts} from '../worker/lib/result-artifact-retention';

it('retires versions before cascading source deletion, keeps the nonexpired administration and caps each purge at 80 participants',async()=>{
 const f=fixture(81);try{
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:1});
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PUBLISHED'});
 expect(f.db.prepare('SELECT administration_id,exam_id,retired_through_version FROM result_artifact_retirements').all()).toEqual([{administration_id:'a',exam_id:'e',retired_through_version:2}]);
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots').all()).toHaveLength(0);
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PURGED'});
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='b'").get()).toEqual({status:'PUBLISHED'});
 const summary=JSON.parse((f.db.prepare("SELECT summary_json FROM result_retention_events WHERE event_type='PURGE_COMPLETED'").get() as any).summary_json);expect(summary.participants).toBe(81);for(const field of ['examDefinitionRetained','answerKeysRetained','outcomesRetained','videosRetained'])expect(summary[field]).toBe(true);
 f.db.exec("DELETE FROM exam_administrations WHERE id='a'");expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('cleans manifest-free orphans by exact retired versions and retains markers for late-write reconciliation',async()=>{
 const f=fixture();try{
 f.objects.set('private-results/a/v1/orphan','');f.objects.set('private-results/a/v2/orphan','');f.objects.set('private-results/a/v3/new','');f.objects.set('private-results/b/v1/other','');
 await purgeExpiredResultNetwork(f.env);
 expect((await sweepRetiredResultArtifacts(f.env)).processed).toBe(1);
 expect(f.objects.has('private-results/a/v1/orphan')).toBe(false);expect(f.objects.has('private-results/a/v2/orphan')).toBe(true);
 f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);
 expect([...f.objects.keys()]).toEqual(['private-results/a/v3/new','private-results/b/v1/other']);
 expect((f.db.prepare('SELECT sweep_version FROM result_artifact_retirements').get() as any).sweep_version).toBe(1);
 f.objects.set('private-results/a/v1/late','');f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);expect(f.objects.has('private-results/a/v1/late')).toBe(false);
 expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('keeps failed deletion jobs retryable and gates cleanup before all database/bucket access',async()=>{
 expect(await sweepRetiredResultArtifacts({DB:{prepare:()=>{throw Error('UNEXPECTED')}}} as any)).toEqual({enabled:false,processed:0,failed:0});
 const f=fixture();try{await purgeExpiredResultNetwork(f.env);f.objects.set('private-results/a/v1/orphan','');f.setFailDelete(true);
 expect((await sweepRetiredResultArtifacts(f.env)).failed).toBe(1);expect(f.objects.size).toBe(1);expect((f.db.prepare('SELECT sweep_version FROM result_artifact_retirements').get() as any).sweep_version).toBe(1);
 f.setFailDelete(false);f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");expect((await sweepRetiredResultArtifacts(f.env)).failed).toBe(0);expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});
it('does not purge or retire after expiry changes, a busy lock or revoked ownership',async()=>{
 for(const mode of ['expiry','busy','revoke']){const f=fixture();try{
 if(mode==='expiry')f.beforeCurrent(()=>f.db.exec("UPDATE exam_administrations SET retention_due_at='2099-01-01' WHERE id='a'"));
 if(mode==='busy')f.db.exec("INSERT INTO exam_operation_locks VALUES('e','other-owner','BUSY')");
 if(mode==='revoke')f.beforeRetirement(()=>f.db.exec("UPDATE exam_operation_locks SET owner_token='replacement' WHERE exam_id='e'"));
 await purgeExpiredResultNetwork(f.env);expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 }finally{f.db.close()}}
});
it('preserves a durable retirement but rolls back participant removal on retention event failure',async()=>{
 const f=fixture();try{f.setFailEvent();await expect(purgeExpiredResultNetwork(f.env)).rejects.toThrow('EVENT_FAILED');expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0)}finally{f.db.close()}
});
it('denies preparation of retired versions before touching the bucket',async()=>{
 const f=fixture();try{
 f.db.exec("INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',2)");
 const response=await prepareResultArtifacts(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2})}),f.env,{id:'super',role:'SUPER_ADMIN'} as any,'a');
 expect(response.status).toBe(409);expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 }finally{f.db.close()}
});
it('eventually removes orphan bytes left by a failed producer manifest/audit transaction',async()=>{
 const f=fixture();try{
 f.setFailAudit();await expect(prepareResultArtifacts(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2})}),f.env,{id:'super',role:'SUPER_ADMIN'} as any,'a')).rejects.toThrow('AUDIT_FAILED');
 expect(f.objects.size).toBe(1);expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 await purgeExpiredResultNetwork(f.env);await sweepRetiredResultArtifacts(f.env);f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});
it('processes at most five jobs and lets other jobs advance when one deletion fails',async()=>{
 const f=fixture();try{
 for(const id of ['a','b','c','d','e','f']){f.db.prepare('INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES(?,?,1)').run(id,'exam-'+id);f.objects.set(`private-results/${id}/v1/file`,'');}
 const deleteObjects=f.env.RESULT_FILES.delete;f.env.RESULT_FILES.delete=async(keys:string[])=>{if(keys[0].includes('/a/'))throw Error('R2_FAILED');return deleteObjects(keys)};
 expect(await sweepRetiredResultArtifacts(f.env)).toEqual({enabled:true,processed:5,failed:1});expect(f.listCalls).toBe(5);expect([...f.objects.keys()]).toEqual(['private-results/a/v1/file','private-results/f/v1/file']);
 }finally{f.db.close()}
});
it('preserves participants and snapshots referenced by another administration or licensed publication',async()=>{
 for(const mode of ['other-administration','licensed-profile','licensed-administration']){const f=fixture();try{
 if(mode==='other-administration')f.db.exec("UPDATE exam_administrations SET exam_id='e',published_snapshot_version=3 WHERE id='b';INSERT INTO result_network_institutions VALUES('rni-b','b','school','code');INSERT INTO result_access_identities VALUES('b','p000','rni-b');INSERT INTO exam_result_snapshots SELECT exam_id,participant_id,3,institution_id,payload_json FROM exam_result_snapshots");
 if(mode==='licensed-profile')f.db.exec("INSERT INTO exam_delivery_profiles VALUES('e',2)");
 if(mode==='licensed-administration')f.db.exec("INSERT INTO exam_administrations VALUES('licensed','e','LICENSED','PUBLISHED',2,'2099-01-01')");
 f.db.exec("INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) VALUES('a','p000',2,'key','digest')");
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots').all()).toHaveLength(mode==='other-administration'?2:1);
 expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 expect(f.db.prepare("SELECT * FROM result_access_identities WHERE administration_id='a'").all()).toHaveLength(0);
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PURGED'});
 }finally{f.db.close()}}
});
