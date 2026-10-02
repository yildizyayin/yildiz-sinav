import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {resultRetentionFixture} from './helpers/result-retention-fixture';
import {startResultArtifactPreparation,advanceResultArtifactPreparation} from '../worker/lib/result-artifact-preparation';
import {startResultArtifactVerification,verifyResultArtifactPage,readResultArtifactVerification,advanceResultArtifactVerification} from '../worker/lib/result-artifact-verification';
const user={id:'admin-user',role:'SUPER_ADMIN'} as any;
const request=(restart=false)=>new Request('https://test/start',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2,restart})});
function fixture(count=1){const f=resultRetentionFixture(count);for(const name of ['0064_result_artifact_preparation_jobs','0065_result_artifact_preparation_health','0066_result_artifact_verification'])f.db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));f.env.RESULT_ARTIFACT_BACKGROUND_ENABLED='true';f.env.RESULT_ARTIFACT_VERIFICATION_ENABLED='true';return f}
async function prepared(count=1){const f=fixture(count);await startResultArtifactPreparation(request(),f.env,user,'a');for(let i=0;i<Math.ceil(count/50);i++)await advanceResultArtifactPreparation(f.env);return f}
const record=(f:ReturnType<typeof fixture>)=>f.db.prepare('SELECT * FROM result_artifact_verifications').get() as any;
it('verifies every private file in bounded pages and records a generation-scoped point-in-time full-cohort pass',async()=>{
 const f=await prepared(51);await startResultArtifactVerification(request(),f.env,user,'a');let reads=0;const get=f.env.RESULT_FILES.get;f.env.RESULT_FILES.get=async(key:string)=>{reads++;return get(key)};
 await advanceResultArtifactVerification(f.env);expect(reads).toBe(50);expect(record(f).verified_count).toBe(50);expect(record(f).status).toBe('VERIFYING');expect(record(f).verified_at).toBeNull();
 await advanceResultArtifactVerification(f.env);expect(reads).toBe(51);expect(record(f).verified_count).toBe(51);expect(record(f).status).toBe('VERIFIED');expect(record(f).verified_at).toBeTruthy();
 const dto=await(await readResultArtifactVerification(f.env,user,'a')).json() as any;expect(dto.records[0].certificate_current).toBe(1);expect(dto.rolloutReady).toBe(false);expect(JSON.stringify(dto)).not.toContain('p049');
 await startResultArtifactVerification(request(),f.env,user,'a');expect(record(f).verified_count).toBe(51);
});
it('cannot certify missing/corrupt objects and requires a new independent verification after repair',async()=>{
 const f=await prepared();f.objects.clear();await startResultArtifactVerification(request(),f.env,user,'a');await verifyResultArtifactPage(f.env,'a',2);expect(record(f).status).toBe('INVALIDATED');expect(record(f).last_error_code).toBe('RESULT_ARTIFACT_VERIFICATION_FAILED');expect(record(f).verified_at).toBeNull();
 await startResultArtifactPreparation(request(true),f.env,user,'a');await advanceResultArtifactPreparation(f.env);await startResultArtifactVerification(request(true),f.env,user,'a');await verifyResultArtifactPage(f.env,'a',2);expect(record(f).status).toBe('VERIFIED');
});
it('invalidates previously verified pages after source mutation and rejects a stale page commit',async()=>{
 const f=await prepared(51);await startResultArtifactVerification(request(),f.env,user,'a');await verifyResultArtifactPage(f.env,'a',2);
 const get=f.env.RESULT_FILES.get;f.env.RESULT_FILES.get=async(key:string)=>{f.db.prepare("UPDATE exam_result_snapshots SET payload_json=payload_json WHERE participant_id='p000'").run();return get(key)};
 expect((await verifyResultArtifactPage(f.env,'a',2)).status).toBe(409);expect(record(f).status).toBe('INVALIDATED');expect(record(f).verified_count).toBe(50);expect(record(f).verified_at).toBeNull();
});
it('invalidates the certificate on preparation restart, manifest change and durable retirement',async()=>{
 const f=await prepared();await startResultArtifactVerification(request(),f.env,user,'a');await verifyResultArtifactPage(f.env,'a',2);const generation=record(f).source_generation;
 await startResultArtifactPreparation(request(true),f.env,user,'a');expect(record(f).status).toBe('INVALIDATED');expect(record(f).verified_at).toBeNull();
 await advanceResultArtifactPreparation(f.env);await startResultArtifactVerification(request(true),f.env,user,'a');await verifyResultArtifactPage(f.env,'a',2);expect(record(f).source_generation).toBeGreaterThan(generation);
 f.db.prepare("UPDATE result_artifact_manifest SET object_key=object_key").run();expect(record(f).status).toBe('INVALIDATED');
 const other=await prepared();await startResultArtifactVerification(request(),other.env,user,'a');await verifyResultArtifactPage(other.env,'a',2);other.db.prepare("INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',2)").run();expect(record(other).status).toBe('INVALIDATED');expect((await startResultArtifactVerification(request(true),other.env,user,'a')).status).toBe(409);
});
it('rolls back verification progress on audit failure and fences a revoked owner',async()=>{
 const f=await prepared();await startResultArtifactVerification(request(),f.env,user,'a');f.setFailAudit();await expect(verifyResultArtifactPage(f.env,'a',2)).rejects.toThrow();expect(record(f).verified_count).toBe(0);expect(record(f).status).toBe('VERIFYING');f.setFailAudit(false);
 const get=f.env.RESULT_FILES.get;f.env.RESULT_FILES.get=async(key:string)=>{f.db.prepare("DELETE FROM exam_operation_locks WHERE exam_id='e'").run();f.db.prepare("INSERT INTO exam_operation_locks VALUES('e','new-owner','TEST')").run();return get(key)};
 expect((await verifyResultArtifactPage(f.env,'a',2)).status).toBe(409);expect(record(f).verified_count).toBe(0);expect(record(f).verified_at).toBeNull();
});
it('applies role/disabled/unprepared gates and retries provider failures without persisting raw details',async()=>{
 const f=fixture();expect((await startResultArtifactVerification(request(),f.env,{role:'TEACHER'} as any,'a')).status).toBe(403);expect((await startResultArtifactVerification(request(),f.env,user,'a')).status).toBe(409);f.env.RESULT_ARTIFACT_VERIFICATION_ENABLED='false';await advanceResultArtifactVerification(f.env);expect((await startResultArtifactVerification(request(),f.env,user,'a')).status).toBe(400);
 const other=await prepared();await startResultArtifactVerification(request(),other.env,user,'a');other.env.RESULT_FILES.get=async()=>{throw Error('private secret provider error')};expect((await verifyResultArtifactPage(other.env,'a',2)).status).toBe(503);expect(record(other).next_attempt_at).toBeTruthy();expect(record(other).last_error_code).toBe('RESULT_ARTIFACT_AUDIT_UNAVAILABLE');expect(JSON.stringify(record(other))).not.toContain('secret');
});
