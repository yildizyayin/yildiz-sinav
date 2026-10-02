import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {resultRetentionFixture} from './helpers/result-retention-fixture';
import {startResultArtifactPreparation,advanceResultArtifactPreparation,readResultArtifactPreparation} from '../worker/lib/result-artifact-preparation';
const user={id:'admin-user',role:'SUPER_ADMIN'} as any;
function fixture(count=1){const f=resultRetentionFixture(count);for(const migration of ['0064_result_artifact_preparation_jobs','0065_result_artifact_preparation_health','0066_result_artifact_verification'])f.db.exec(readFileSync(new URL('../migrations/'+migration+'.sql',import.meta.url),'utf8'));f.env.RESULT_ARTIFACT_BACKGROUND_ENABLED='true';return f}
const req=(restart=false)=>new Request('https://test/start',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2,restart})});
const job=(f:ReturnType<typeof fixture>)=>f.db.prepare("SELECT * FROM result_artifact_preparation_jobs WHERE administration_id='a'").get() as any;
it('persists atomic 50-row progress, resumes across scheduler calls and preserves completed jobs on duplicate starts',async()=>{
 const f=fixture(51);expect((await startResultArtifactPreparation(req(),f.env,user,'a')).status).toBe(200);
 await advanceResultArtifactPreparation(f.env);expect(job(f).prepared_count).toBe(50);expect(job(f).participant_cursor).toBe('p049');expect(job(f).status).toBe('RUNNING');
 await advanceResultArtifactPreparation(f.env);expect(job(f).prepared_count).toBe(51);expect(job(f).status).toBe('PREPARED');
 const duplicate=await(await startResultArtifactPreparation(req(),f.env,user,'a')).json() as any;expect(duplicate.job.prepared_count).toBe(51);expect(duplicate.rolloutReady).toBe(false);
 expect(f.db.prepare('SELECT COUNT(*) n FROM result_artifact_manifest').get()!.n).toBe(51);
});
it('does not advance on audit rollback and safely retries existing R2 orphans',async()=>{
 const f=fixture();await startResultArtifactPreparation(req(),f.env,user,'a');f.setFailAudit();await advanceResultArtifactPreparation(f.env);
 expect(job(f).prepared_count).toBe(0);expect(f.objects.size).toBe(1);expect(f.db.prepare('SELECT COUNT(*) n FROM result_artifact_manifest').get()!.n).toBe(0);
 f.setFailAudit(false);f.db.prepare("UPDATE result_artifact_preparation_jobs SET next_attempt_at=NULL").run();await advanceResultArtifactPreparation(f.env);expect(job(f).prepared_count).toBe(1);expect(f.objects.size).toBe(1);
});
it('invalidates cursor progress when cohort/source/publication changes and requires explicit restart',async()=>{
 const f=fixture(51);await startResultArtifactPreparation(req(),f.env,user,'a');await advanceResultArtifactPreparation(f.env);
 f.db.prepare("DELETE FROM result_access_identities WHERE participant_id='p000'").run();expect(job(f).status).toBe('INVALIDATED');
 await advanceResultArtifactPreparation(f.env);expect(job(f).prepared_count).toBe(50);
 await startResultArtifactPreparation(req(),f.env,user,'a');expect(job(f).status).toBe('INVALIDATED');
 await startResultArtifactPreparation(req(true),f.env,user,'a');expect(job(f).prepared_count).toBe(0);await advanceResultArtifactPreparation(f.env);expect(job(f).status).toBe('PREPARED');expect(job(f).prepared_count).toBe(50);
 f.db.prepare("UPDATE exam_result_snapshots SET payload_json=payload_json WHERE participant_id='p001'").run();expect(job(f).status).toBe('INVALIDATED');
 await startResultArtifactPreparation(req(true),f.env,user,'a');f.db.prepare("UPDATE exam_administrations SET status='DRAFT' WHERE id='a'").run();expect(job(f).status).toBe('INVALIDATED');
});
it('does not complete or write objects when a snapshot is missing or a manifest conflicts',async()=>{
 const f=fixture(2);f.db.prepare("DELETE FROM exam_result_snapshots WHERE participant_id='p000'").run();await startResultArtifactPreparation(req(),f.env,user,'a');await advanceResultArtifactPreparation(f.env);
 expect(job(f).status).toBe('RUNNING');expect(job(f).prepared_count).toBe(0);expect(f.objects.size).toBe(0);
 const other=fixture();other.db.prepare("INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) VALUES('a','p000',2,'foreign','bad')").run();await startResultArtifactPreparation(req(),other.env,user,'a');await advanceResultArtifactPreparation(other.env);expect(job(other).prepared_count).toBe(0);expect(other.objects.size).toBe(0);
});
it('checks access, gates, busy lock and cascade cleanup without automatic enablement',async()=>{
 const f=fixture();expect((await startResultArtifactPreparation(req(),f.env,{role:'TEACHER'} as any,'a')).status).toBe(403);
 f.env.RESULT_ARTIFACT_BACKGROUND_ENABLED='false';expect((await startResultArtifactPreparation(req(),f.env,user,'a')).status).toBe(400);await advanceResultArtifactPreparation(f.env);expect(job(f)).toBeUndefined();
 f.env.RESULT_ARTIFACT_BACKGROUND_ENABLED='true';f.db.prepare("INSERT INTO exam_operation_locks VALUES('e','other','TEST')").run();expect((await startResultArtifactPreparation(req(),f.env,user,'a')).status).toBe(409);f.db.prepare('DELETE FROM exam_operation_locks').run();await startResultArtifactPreparation(req(),f.env,user,'a');f.db.prepare("DELETE FROM exam_administrations WHERE id='a'").run();expect(job(f)).toBeUndefined();
});
it('fences manifest and cursor writes when ownership is revoked during the private object put',async()=>{
 const f=fixture();await startResultArtifactPreparation(req(),f.env,user,'a');const put=f.env.RESULT_FILES.put;
 f.env.RESULT_FILES.put=async(...args:any[])=>{f.db.prepare("DELETE FROM exam_operation_locks WHERE exam_id='e'").run();f.db.prepare("INSERT INTO exam_operation_locks VALUES('e','new-owner','TEST')").run();return put(...args)};
 await advanceResultArtifactPreparation(f.env);expect(f.objects.size).toBe(1);expect(job(f).prepared_count).toBe(0);expect(job(f).participant_cursor).toBe('');expect(f.db.prepare('SELECT COUNT(*) n FROM result_artifact_manifest').get()!.n).toBe(0);expect(f.db.prepare("SELECT owner_token FROM exam_operation_locks WHERE exam_id='e'").get()!.owner_token).toBe('new-owner');
});

it('reports sanitized errors, backs off failures and clears active error metadata after a successful retry',async()=>{
 const f=fixture();await startResultArtifactPreparation(req(),f.env,user,'a');const put=f.env.RESULT_FILES.put;let calls=0;
 f.env.RESULT_FILES.put=async()=>{calls++;throw Error('private-token sensitive provider text')};
 await advanceResultArtifactPreparation(f.env);expect(job(f).last_error_code).toBe('RESULT_ARTIFACT_PREPARATION_FAILED');expect(job(f).failure_count).toBe(1);expect(job(f).prepared_count).toBe(0);expect(job(f).next_attempt_at).toBeTruthy();
 const diagnostic=await readResultArtifactPreparation(f.env,user,'a');const text=await diagnostic.text();expect(text).toContain('RESULT_ARTIFACT_PREPARATION_FAILED');expect(text).not.toContain('artifact-attempt_');expect(text).not.toContain('private-token');
 await advanceResultArtifactPreparation(f.env);expect(calls).toBe(1);
 f.env.RESULT_FILES.put=put;f.db.prepare("UPDATE result_artifact_preparation_jobs SET next_attempt_at=NULL").run();await advanceResultArtifactPreparation(f.env);expect(job(f).status).toBe('PREPARED');expect(job(f).last_error_code).toBeNull();expect(job(f).failure_count).toBe(1);
});
it('does not attach a delayed failure to a new restart with a different attempt token',async()=>{
 const f=fixture();await startResultArtifactPreparation(req(),f.env,user,'a');
 f.env.RESULT_FILES.put=async()=>{f.db.prepare("UPDATE result_artifact_preparation_jobs SET attempt_token=NULL,prepared_count=0,last_error_code=NULL,failure_count=0").run();throw Error('old-attempt-error')};
 await advanceResultArtifactPreparation(f.env);expect(job(f).failure_count).toBe(0);expect(job(f).last_error_code).toBeNull();
});
