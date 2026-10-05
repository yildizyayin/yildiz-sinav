import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {publishScheduledExamVideos} from '../worker/exam-admin-entry';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE video_links(id TEXT PRIMARY KEY,status TEXT,approved INTEGER,publish_at TEXT,published_at TEXT,updated_at TEXT);
 INSERT INTO video_links VALUES('due','SCHEDULED',0,'2026-09-30T17:00:00.000Z',NULL,NULL);
 INSERT INTO video_links VALUES('future','SCHEDULED',0,'2026-09-30T19:00:00.000Z',NULL,NULL);`);
 db.exec(readFileSync(new URL('../migrations/0076_video_link_timestamp_normalization.sql',import.meta.url),'utf8'));
 const fixed=(sql:string)=>sql.replaceAll('CURRENT_TIMESTAMP',"'2026-09-30 18:00:00'");
 const env={DB:{prepare:(sql:string)=>({run:async()=>db.prepare(fixed(sql)).run()})}} as any;
 return{db,env};
}

it('normalizes existing ISO publish_at values so the legacy scheduled publisher is chronological',async()=>{
 const f=fixture();try{
  expect(f.db.prepare(`SELECT publish_at FROM video_links WHERE id='due'`).get()?.publish_at).toBe('2026-09-30 17:00:00');
  expect(f.db.prepare(`SELECT publish_at FROM video_links WHERE id='future'`).get()?.publish_at).toBe('2026-09-30 19:00:00');
  await publishScheduledExamVideos(f.env);
  expect(f.db.prepare(`SELECT status,approved FROM video_links WHERE id='due'`).get()).toMatchObject({status:'PUBLISHED',approved:1});
  expect(f.db.prepare(`SELECT status FROM video_links WHERE id='future'`).get()).toMatchObject({status:'SCHEDULED'});
 }finally{f.db.close();}
});

it('normalizes future INSERT and UPDATE writes at the D1 boundary',()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO video_links VALUES('inserted','SCHEDULED',0,'2026-10-01T08:30:15.250Z',NULL,NULL)`);
  expect(f.db.prepare(`SELECT publish_at FROM video_links WHERE id='inserted'`).get()?.publish_at).toBe('2026-10-01 08:30:15');
  f.db.exec(`UPDATE video_links SET publish_at='2026-10-02T09:45:00.000Z' WHERE id='inserted'`);
  expect(f.db.prepare(`SELECT publish_at FROM video_links WHERE id='inserted'`).get()?.publish_at).toBe('2026-10-02 09:45:00');
 }finally{f.db.close();}
});

it('leaves NULL schedule values untouched',()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO video_links VALUES('unset','SCHEDULED',0,NULL,NULL,NULL)`);
  expect(f.db.prepare(`SELECT publish_at FROM video_links WHERE id='unset'`).get()?.publish_at).toBeNull();
 }finally{f.db.close();}
});
