import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resultRetentionFixture} from './helpers/result-retention-fixture';
import {purgeResultNetworkAdministrationPage} from '../worker/result-network-entry';
import {consumeResultRetentionQueue,dispatchResultRetentionQueue,resultRetentionQueueDiagnostics} from '../worker/lib/result-retention-queue';

function fixture(count=1){
 const f=resultRetentionFixture(count);f.db.exec(readFileSync(new URL('../migrations/0063_result_retention_queue.sql',import.meta.url),'utf8'));
 const sent:any[]=[];let failSend=false;
 f.env.RESULT_RETENTION_QUEUE_ENABLED='true';f.env.RESULT_RETENTION_QUEUE={send:async(body:any,options:any)=>{if(failSend)throw Error('SECRET_MUST_NOT_LEAK');sent.push({body,options})}};
 return {...f,sent,setFailSend:(value:boolean)=>{failSend=value}};
}
function message(body:any){let acks=0;const retries:any[]=[];return {body,ack:()=>{acks++},retry:(options:any)=>{retries.push(options)},get acks(){return acks},retries}}
const consume=(f:ReturnType<typeof fixture>,m:ReturnType<typeof message>)=>consumeResultRetentionQueue({messages:[m]} as any,f.env,purgeResultNetworkAdministrationPage);

it('gates paused/unconfigured queues and unauthorized diagnostics before database access',async()=>{
 const env={DB:{prepare:()=>{throw Error('UNEXPECTED_DB')}}} as any;
 expect(await dispatchResultRetentionQueue(env)).toEqual({enabled:false,dispatched:0,failed:0});
 env.RESULT_RETENTION_QUEUE_ENABLED='true';await expect(dispatchResultRetentionQueue(env)).rejects.toThrow('RESULT_RETENTION_QUEUE_NOT_CONFIGURED');
 const m=message({});await consumeResultRetentionQueue({messages:[m]} as any,env,async()=>{throw Error('UNEXPECTED_PURGE')});expect(m.retries).toEqual([{delaySeconds:300}]);expect(m.acks).toBe(0);
 expect((await resultRetentionQueueDiagnostics(env,{role:'TEACHER'} as any)).status).toBe(403);
});
it('drains a cohort through continuations, rejects duplicate old tokens and excludes tokens from diagnostics',async()=>{
 const f=fixture(161);try{
 expect((await dispatchResultRetentionQueue(f.env)).dispatched).toBe(1);
 const original=message(f.sent.shift().body);await consume(f,original);expect(original.acks).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:81});
 const duplicate=message(original.body);await consume(f,duplicate);expect(duplicate.acks).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:81});
 for(let i=0;i<2;i++){const next=f.sent.shift();expect(Object.keys(next.body).sort()).toEqual(['administrationId','kind','schemaVersion','token']);expect(next.options.delaySeconds).toBe(0);await consume(f,message(next.body));}
 expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(0);expect(f.db.prepare('SELECT status,processed_pages FROM result_retention_queue_jobs').get()).toEqual({status:'DONE',processed_pages:3});
 const report=await resultRetentionQueueDiagnostics(f.env,{role:'SUPER_ADMIN'} as any);const bytes=await report.text();expect(bytes).not.toContain('dispatch_token');expect(bytes).not.toContain(original.body.token);expect(JSON.parse(bytes).counts.done).toBe(1);
 }finally{f.db.close()}
});
it('redispatches a lost notification and refuses the superseded token or a changed expiry',async()=>{
 const f=fixture();try{
 await dispatchResultRetentionQueue(f.env);const lost=f.sent.shift().body;
 f.db.exec("UPDATE result_retention_queue_jobs SET next_dispatch_at='2000-01-01'");await dispatchResultRetentionQueue(f.env);const replacement=f.sent.shift().body;
 expect(replacement.token).not.toBe(lost.token);await consume(f,message(lost));expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 f.db.exec("UPDATE exam_administrations SET retention_due_at='2099-01-01' WHERE id='a'");await consume(f,message(replacement));expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(0);
 }finally{f.db.close()}
});
it('persists sanitized send failures and resumes through the durable source',async()=>{
 const f=fixture();try{
 f.setFailSend(true);expect((await dispatchResultRetentionQueue(f.env)).failed).toBe(1);
 expect(f.db.prepare('SELECT status,failure_count,last_error_code FROM result_retention_queue_jobs').get()).toEqual({status:'ERROR',failure_count:1,last_error_code:'RESULT_RETENTION_SEND_FAILED'});
 const bytes=await (await resultRetentionQueueDiagnostics(f.env,{role:'SUPER_ADMIN'} as any)).text();expect(bytes).not.toContain('SECRET_MUST_NOT_LEAK');
 f.setFailSend(false);f.db.exec("UPDATE result_retention_queue_jobs SET next_dispatch_at='2000-01-01'");await dispatchResultRetentionQueue(f.env);await consume(f,message(f.sent.shift().body));expect(f.db.prepare('SELECT status FROM result_retention_queue_jobs').get()).toEqual({status:'DONE'});
 }finally{f.db.close()}
});
it('recovers a continuation send failure without repeating the completed page',async()=>{
 const f=fixture(81);try{
 await dispatchResultRetentionQueue(f.env);const original=message(f.sent.shift().body);f.setFailSend(true);await consume(f,original);expect(original.retries).toEqual([{delaySeconds:300}]);expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:1});
 f.setFailSend(false);const retry=message(original.body);await consume(f,retry);expect(retry.acks).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:1});
 f.db.exec("UPDATE result_retention_queue_jobs SET next_dispatch_at='2000-01-01'");await dispatchResultRetentionQueue(f.env);
 const next=f.sent.find(x=>x.body.kind==='COHORT_PURGE');await consume(f,message(next.body));expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(0);
 }finally{f.db.close()}
});
it('retries a failed purge page without losing source rows and backs off busy locks',async()=>{
 const f=fixture();try{
 await dispatchResultRetentionQueue(f.env);const body=f.sent.shift().body;f.db.exec("INSERT INTO exam_operation_locks VALUES('e','another-owner','BUSY')");const busy=message(body);await consume(f,busy);expect(busy.retries).toEqual([{delaySeconds:30}]);expect(busy.acks).toBe(0);
 f.db.exec('DELETE FROM exam_operation_locks');f.setFailEvent();const failed=message(body);await consume(f,failed);expect(failed.retries).toEqual([{delaySeconds:300}]);expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 expect((f.db.prepare('SELECT last_error_code FROM result_retention_queue_jobs').get() as any).last_error_code).toBe('RESULT_RETENTION_PROCESS_FAILED');
 f.setFailEvent(false);await consume(f,message(body));expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(0);
 }finally{f.db.close()}
});
it('drains artifact pages without minute delays and leaves new versions untouched',async()=>{
 const f=fixture();try{
 f.db.exec("UPDATE exam_administrations SET status='PURGED' WHERE id='a';INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',1)");
 for(let i=0;i<101;i++)f.objects.set('private-results/a/v1/'+i,'');f.objects.set('private-results/a/v2/new','');
 await dispatchResultRetentionQueue(f.env);
 for(let i=0;i<3;i++){const next=f.sent.shift();expect(next.options.delaySeconds).toBe(0);await consume(f,message(next.body));}
 expect([...f.objects.keys()]).toEqual(['private-results/a/v2/new']);expect(f.db.prepare('SELECT status,processed_pages FROM result_retention_queue_jobs').get()).toEqual({status:'DONE',processed_pages:3});expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('acks malformed or unknown notifications without touching participant data',async()=>{
 const f=fixture();try{
 for(const body of [null,{schemaVersion:1,kind:'COHORT_PURGE',administrationId:'a',token:'unknown'},{schemaVersion:1,kind:'COHORT_PURGE',administrationId:'a',token:'unknown',objectKey:'private-data'}]){const m=message(body);await consume(f,m);expect(m.acks).toBe(1)}
 expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('keeps a failed artifact job waiting for its due retry and then drains it',async()=>{
 const f=fixture();try{
 f.db.exec("UPDATE exam_administrations SET status='PURGED' WHERE id='a';INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',1)");f.objects.set('private-results/a/v1/file','');
 await dispatchResultRetentionQueue(f.env);const body=f.sent.shift().body;f.setFailDelete(true);const failed=message(body);await consume(f,failed);expect(failed.retries).toEqual([{delaySeconds:300}]);expect(f.objects.size).toBe(1);
 f.setFailDelete(false);const early=message(body);await consume(f,early);expect(early.acks).toBe(0);expect(early.retries[0].delaySeconds).toBeGreaterThan(0);expect(f.db.prepare('SELECT status FROM result_retention_queue_jobs').get()).toEqual({status:'ERROR'});
 f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await consume(f,message(body));expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT status FROM result_retention_queue_jobs').get()).toEqual({status:'DONE'});
 }finally{f.db.close()}
});
it('bounds discovery to 100 notifications, advances remaining jobs and bounds diagnostics',async()=>{
 const f=fixture();try{
 for(let i=0;i<101;i++)f.db.prepare("INSERT INTO exam_administrations VALUES(?,?,'RESULT_NETWORK','PUBLISHED',1,'2000-01-01')").run('bulk-'+String(i).padStart(3,'0'),'exam-'+i);
 expect((await dispatchResultRetentionQueue(f.env)).dispatched).toBe(100);expect(f.sent).toHaveLength(100);
 expect((await dispatchResultRetentionQueue(f.env)).dispatched).toBe(2);
 const report=await (await resultRetentionQueueDiagnostics(f.env,{role:'SUPER_ADMIN'} as any)).json() as any;expect(report.jobs).toHaveLength(100);expect(report.hasMore).toBe(true);expect(report.counts.total).toBe(102);
 }finally{f.db.close()}
});
it('reconciles a crash after the final source commit without leaving a false pending job',async()=>{
 const f=fixture();try{
 await dispatchResultRetentionQueue(f.env);const lost=f.sent.shift().body;await purgeResultNetworkAdministrationPage(f.env,'a');
 expect(f.db.prepare('SELECT status FROM result_retention_queue_jobs').get()).toEqual({status:'PENDING'});
 expect((await dispatchResultRetentionQueue(f.env)).dispatched).toBe(1); // New artifact retirement only.
 expect(f.db.prepare("SELECT status FROM result_retention_queue_jobs WHERE kind='COHORT_PURGE'").get()).toEqual({status:'DONE'});const late=message(lost);await consume(f,late);expect(late.acks).toBe(1);
 }finally{f.db.close()}
});
