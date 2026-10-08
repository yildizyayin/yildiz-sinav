import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {resultRetentionFixture} from './helpers/result-retention-fixture';
import {startResultArtifactPreparation} from '../worker/lib/result-artifact-preparation';
import {startResultArtifactVerification} from '../worker/lib/result-artifact-verification';
import {dispatchResultArtifactQueue,consumeResultArtifactQueue,resultArtifactQueueDiagnostics} from '../worker/lib/result-artifact-queue';
const user={id:'admin-user',role:'SUPER_ADMIN'} as any;
const request=(restart=false)=>new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2,restart})});
function fixture(count=1){const f=resultRetentionFixture(count);for(const name of ['0064_result_artifact_preparation_jobs','0065_result_artifact_preparation_health','0066_result_artifact_verification','0067_result_artifact_queue'])f.db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));Object.assign(f.env,{RESULT_ARTIFACT_BACKGROUND_ENABLED:'true',RESULT_ARTIFACT_VERIFICATION_ENABLED:'true',RESULT_ARTIFACT_QUEUE_ENABLED:'true'});const sent:any[]=[];let fail=false;f.env.RESULT_ARTIFACT_QUEUE={send:async(body:any)=>{if(fail)throw Error('secret provider');sent.push(body)}};return {...f,sent,setFailSend:(v:boolean)=>{fail=v}}}
function message(body:any){let ack=0;const retries:any[]=[];return {body,ack:()=>{ack++},retry:(options:any)=>retries.push(options),get acked(){return ack},retries}}
async function consume(f:ReturnType<typeof fixture>,body:any){const m=message(body);await consumeResultArtifactQueue({messages:[m]} as any,f.env);return m}
const prep=(f:ReturnType<typeof fixture>)=>f.db.prepare('SELECT * FROM result_artifact_preparation_jobs').get() as any;
it('drains 101 preparation identities with immediate continuations then independently verifies through the queue',async()=>{
 const f=fixture(101);await startResultArtifactPreparation(request(),f.env,user,'a');await dispatchResultArtifactQueue(f.env);
 const old=f.sent.shift();expect((await consume(f,old)).acked).toBe(1);expect(prep(f).prepared_count).toBe(50);expect((await consume(f,old)).acked).toBe(1);expect(prep(f).prepared_count).toBe(50);
 while(f.sent.length)await consume(f,f.sent.shift());expect(prep(f).prepared_count).toBe(101);expect(prep(f).status).toBe('PREPARED');
 await startResultArtifactVerification(request(),f.env,user,'a');await dispatchResultArtifactQueue(f.env);while(f.sent.length)await consume(f,f.sent.shift());
 const verified=f.db.prepare('SELECT * FROM result_artifact_verifications').get() as any;expect(verified.status).toBe('VERIFIED');expect(verified.verified_count).toBe(101);
 const diag=await(await resultArtifactQueueDiagnostics(f.env,user)).text();expect(diag).not.toContain('dispatch_token');expect(diag).not.toContain('page_cursor');expect(diag).not.toContain('raq_');
});
it('recovers a lost initial send and rejects old generation tickets after restart',async()=>{
 const f=fixture();await startResultArtifactPreparation(request(),f.env,user,'a');f.setFailSend(true);expect((await dispatchResultArtifactQueue(f.env)).dispatched).toBe(0);expect(f.db.prepare('SELECT last_error_code FROM result_artifact_queue_jobs').get()!.last_error_code).toBe('RESULT_ARTIFACT_QUEUE_SEND_FAILED');
 f.setFailSend(false);f.db.prepare("UPDATE result_artifact_queue_jobs SET next_dispatch_at='2000-01-01'").run();await dispatchResultArtifactQueue(f.env);const old=f.sent.shift();await startResultArtifactPreparation(request(true),f.env,user,'a');expect((await consume(f,old)).acked).toBe(1);expect(prep(f).prepared_count).toBe(0);
 await dispatchResultArtifactQueue(f.env);await consume(f,f.sent.shift());expect(prep(f).prepared_count).toBe(1);
});
it('does not repeat a committed source page after continuation send failure or transport bookkeeping loss',async()=>{
 const f=fixture(51);await startResultArtifactPreparation(request(),f.env,user,'a');await dispatchResultArtifactQueue(f.env);const old=f.sent.shift();f.setFailSend(true);expect((await consume(f,old)).retries[0].delaySeconds).toBe(300);expect(prep(f).prepared_count).toBe(50);
 expect((await consume(f,old)).acked).toBe(1);expect(prep(f).prepared_count).toBe(50);f.setFailSend(false);f.db.prepare("UPDATE result_artifact_queue_jobs SET next_dispatch_at='2000-01-01'").run();await dispatchResultArtifactQueue(f.env);await consume(f,f.sent.shift());expect(prep(f).prepared_count).toBe(51);
 // Simulate the final source commit surviving while the ticket remains pending.
 f.db.prepare("UPDATE result_artifact_queue_jobs SET status='PENDING'").run();await dispatchResultArtifactQueue(f.env);expect(f.db.prepare('SELECT status FROM result_artifact_queue_jobs').get()!.status).toBe('DONE');
});
it('retries busy/failing pages, keeps cursor unchanged and stores only sanitized codes',async()=>{
 const f=fixture();await startResultArtifactPreparation(request(),f.env,user,'a');await dispatchResultArtifactQueue(f.env);const work=f.sent.shift();f.db.prepare("INSERT INTO exam_operation_locks VALUES('e','other','TEST')").run();expect((await consume(f,work)).retries[0].delaySeconds).toBe(30);expect(prep(f).prepared_count).toBe(0);f.db.prepare('DELETE FROM exam_operation_locks').run();
 f.env.RESULT_FILES.put=async()=>{throw Error('provider-secret')};expect((await consume(f,work)).retries[0].delaySeconds).toBe(300);expect(prep(f).prepared_count).toBe(0);expect(prep(f).last_error_code).toBe('RESULT_ARTIFACT_PREPARATION_FAILED');expect(JSON.stringify(prep(f))).not.toContain('provider-secret');
});
it('never touches source data for malformed/unknown tickets and pauses without DB work',async()=>{
 const f=fixture();for(const body of [{}, {schemaVersion:1,kind:'DELETE',administrationId:'a',snapshotVersion:2,sourceGeneration:1,token:'x'}])expect((await consume(f,body)).acked).toBe(1);
 f.env.RESULT_ARTIFACT_QUEUE_ENABLED='false';f.env.DB={prepare:()=>{throw Error('UNEXPECTED_DB')}};expect((await consume(f,{})).retries[0].delaySeconds).toBe(300);
 expect((await resultArtifactQueueDiagnostics(f.env,{role:'TEACHER'} as any)).status).toBe(403);
});
it('requires the dedicated queue binding when enabled',async()=>{const f=fixture();delete f.env.RESULT_ARTIFACT_QUEUE;await expect(dispatchResultArtifactQueue(f.env)).rejects.toThrow('RESULT_ARTIFACT_QUEUE_NOT_CONFIGURED')});
it('rejects a token superseded by the watchdog inside the exam lock before any private write',async()=>{
 const f=fixture();await startResultArtifactPreparation(request(),f.env,user,'a');await dispatchResultArtifactQueue(f.env);const old=f.sent.shift();f.db.prepare("UPDATE result_artifact_queue_jobs SET next_dispatch_at='2000-01-01'").run();await dispatchResultArtifactQueue(f.env);
 const {prepareResultArtifacts}=await import('../worker/lib/result-artifacts');
 const response=await prepareResultArtifacts(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2,managed:true,attemptToken:'artifact-attempt_test',queueToken:old.token,expectedGeneration:old.sourceGeneration,expectedCursor:''})}),f.env,user,'a');expect(response.status).toBe(409);expect(f.objects.size).toBe(0);expect(prep(f).prepared_count).toBe(0);
});
it('bounds discovery to 100 tickets and eventually discovers the remaining source job',async()=>{
 const f=fixture(0);
 for(let i=0;i<101;i++){const id='queue'+String(i).padStart(3,'0');f.db.prepare("INSERT INTO exam_administrations VALUES(?, 'e','RESULT_NETWORK','PUBLISHED',2,'2099-01-01')").run(id);f.db.prepare("INSERT INTO result_artifact_preparation_jobs(administration_id,snapshot_version,actor_user_id,status) VALUES(?,2,'admin-user','RUNNING')").run(id)}
 expect((await dispatchResultArtifactQueue(f.env)).dispatched).toBe(100);expect((await dispatchResultArtifactQueue(f.env)).dispatched).toBe(1);expect(f.sent).toHaveLength(101);
});

it('does not acknowledge or touch data when an unknown queue name reaches the shared Worker',async()=>{
 const {default:worker}=await import('../worker/result-worker-entry');const m=message({});
 const env={DB:{prepare:()=>{throw Error('UNEXPECTED_DB')}}} as any;
 await worker.queue({queue:'wrong-name',messages:[m]} as any,env);expect(m.acked).toBe(0);expect(m.retries[0].delaySeconds).toBe(300);
 await expect(worker.queue({queue:'same',messages:[m]} as any,{...env,RESULT_ARTIFACT_QUEUE_NAME:'same',RESULT_RETENTION_QUEUE_NAME:'same'})).rejects.toThrow('RESULT_QUEUE_ROUTE_CONFLICT');
});
