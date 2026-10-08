import {expect,it} from 'vitest';
import {resultRetentionFixture} from './helpers/result-retention-fixture';
import {encodeResultArtifact,inspectResultArtifactReadiness} from '../worker/lib/result-artifacts';
const user={role:'SUPER_ADMIN'} as any;
const request=(cursor='')=>new Request('https://test/api?expectedSnapshotVersion=2&cursor='+cursor);
async function seed(f:ReturnType<typeof resultRetentionFixture>){
 for(const row of f.db.prepare('SELECT * FROM exam_result_snapshots WHERE exam_id=\'e\'').all() as any[]){
  const a=await encodeResultArtifact('a',row);f.objects.set(a.key,a.body);
  f.db.prepare('INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) VALUES(?,?,?,?,?)').run('a',row.participant_id,2,a.key,a.digest);
 }
}
it('audits at most 50 private files and never certifies rollout from the last page',async()=>{
 const f=resultRetentionFixture(51);await seed(f);let reads=0;const get=f.env.RESULT_FILES.get;f.env.RESULT_FILES.get=async(key:string)=>{reads++;return get(key)};
 let aggregateReads=0;const prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=(sql:string)=>{if(sql.includes('COUNT(*) expected'))aggregateReads++;return prepare(sql)};
 const first=await(await inspectResultArtifactReadiness(request(),f.env,user,'a')).json() as any;
 expect(first.coverage).toEqual({expected:51,snapshots:51,manifests:51});expect(first.page.checked).toBe(50);expect(first.page.verified).toBe(50);expect(reads).toBe(50);expect(first.nextCursor).toBe('p049');
 const last=await(await inspectResultArtifactReadiness(request(first.nextCursor),f.env,user,'a')).json() as any;
 expect(last.page.verified).toBe(1);expect(last.nextCursor).toBeNull();expect(last.rolloutReady).toBe(false);expect(last.verificationScope).toBe('CURRENT_PAGE_ONLY');expect(JSON.stringify(last)).not.toContain('private-results/');
 expect(last.coverage).toBeNull();expect(aggregateReads).toBe(1);
});
it('distinguishes missing snapshots, manifests, objects and corrupted bytes without returning student data',async()=>{
 const f=resultRetentionFixture(6);await seed(f);
 f.db.prepare("DELETE FROM exam_result_snapshots WHERE participant_id='p000'").run();
 f.db.prepare("UPDATE exam_result_snapshots SET payload_json='invalid' WHERE participant_id='p001'").run();
 f.db.prepare("DELETE FROM result_artifact_manifest WHERE participant_id='p002'").run();
 f.db.prepare("UPDATE result_artifact_manifest SET object_key='foreign' WHERE participant_id='p003'").run();
 const missing=f.db.prepare("SELECT object_key FROM result_artifact_manifest WHERE participant_id='p004'").get() as any;f.objects.delete(missing.object_key);
 const corrupt=f.db.prepare("SELECT object_key FROM result_artifact_manifest WHERE participant_id='p005'").get() as any;f.objects.set(corrupt.object_key,'sensitive corrupted content');
 const data=await(await inspectResultArtifactReadiness(request(),f.env,user,'a')).json() as any;
 expect(data.page).toEqual({checked:6,verified:0,missingSnapshot:1,invalidSnapshot:1,missingManifest:1,invalidManifest:1,missingObject:1,invalidObject:1});expect(JSON.stringify(data)).not.toContain('sensitive');
});
it('denies unauthorized, retired or changed versions and sanitizes bucket failures',async()=>{
 const f=resultRetentionFixture();await seed(f);
 expect((await inspectResultArtifactReadiness(request(),f.env,{role:'TEACHER'} as any,'a')).status).toBe(403);
 expect((await inspectResultArtifactReadiness(new Request('https://test?expectedSnapshotVersion=1'),f.env,user,'a')).status).toBe(409);
 f.env.RESULT_FILES.get=async()=>{throw Error('secret provider detail')};
 const failed=await inspectResultArtifactReadiness(request(),f.env,user,'a');expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('secret');
 f.db.prepare("INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',2)").run();expect((await inspectResultArtifactReadiness(request(),f.env,user,'a')).status).toBe(409);
});
it('rechecks publication after reads so withdrawal cannot return a successful audit',async()=>{
 const f=resultRetentionFixture();await seed(f);const get=f.env.RESULT_FILES.get;
 f.env.RESULT_FILES.get=async(key:string)=>{f.db.prepare("UPDATE exam_administrations SET status='DRAFT' WHERE id='a'").run();return get(key)};
 expect((await inspectResultArtifactReadiness(request(),f.env,user,'a')).status).toBe(409);
});

it('rejects a valid artifact whose frozen institution differs from the current identity scope',async()=>{
 const f=resultRetentionFixture();f.db.prepare("UPDATE exam_result_snapshots SET institution_id='foreign'").run();await seed(f);
 const response=await inspectResultArtifactReadiness(request(),f.env,user,'a');const data=await response.json() as any;
 expect(data.page.invalidSnapshot).toBe(1);expect(data.page.verified).toBe(0);
});
