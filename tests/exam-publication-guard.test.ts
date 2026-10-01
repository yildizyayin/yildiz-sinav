import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {examPublicationGuard,examCorrectionOpen} from '../worker/lib/exam-publication-guard';
it('blocks either channel and allows answer correction only after explicit versioned withdrawal',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE exam_delivery_profiles(exam_id TEXT,result_freeze_status TEXT,snapshot_version INTEGER);
 CREATE TABLE exam_administrations(id TEXT,exam_id TEXT,channel TEXT,status TEXT,ranking_frozen_at TEXT,published_snapshot_version INTEGER);
 INSERT INTO exam_delivery_profiles VALUES('e','OPEN',0);
 INSERT INTO exam_administrations VALUES('a','e','RESULT_NETWORK','PUBLISHED','old',1);`);
 const env={DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({first:async()=>db.prepare(sql).get(...args)})})}} as any;
 expect((await examPublicationGuard(env,'e'))!.status).toBe(400);expect(await examCorrectionOpen(env,'e')).toBe(false);
 // A status change alone must not bypass a still-frozen network publication.
 db.exec("UPDATE exam_administrations SET status='UPLOADING'");expect((await examPublicationGuard(env,'e'))!.status).toBe(400);
 db.exec("UPDATE exam_administrations SET status='READY',ranking_frozen_at=NULL");expect(await examPublicationGuard(env,'e')).toBeNull();expect(await examCorrectionOpen(env,'e')).toBe(true);
 db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='PUBLISHED',snapshot_version=2");expect((await examPublicationGuard(env,'e'))!.status).toBe(400);
 db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='OPEN'");expect(await examPublicationGuard(env,'e')).toBeNull();
 db.exec("UPDATE exam_administrations SET published_snapshot_version=NULL;UPDATE exam_delivery_profiles SET snapshot_version=0");expect(await examCorrectionOpen(env,'e')).toBe(false);
 }finally{db.close()}
});
