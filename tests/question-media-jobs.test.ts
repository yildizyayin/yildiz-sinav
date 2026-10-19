import {editorialQuestion} from './fixtures/editorial-question';
import {visualBlock} from '../worker/lib/question-editorial';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {handleQuestionMediaJobs} from '../worker/lib/question-media-jobs';
import {sha256} from '../worker/lib/question-team-policy';
const base='https://test/api/question-bank-standard/media-jobs',admin={id:'admin',role:'SUPER_ADMIN'} as any;
const req=(path='',body?:any,method=body?'POST':'GET')=>new Request(base+path,{method,headers:{Origin:'https://test'},...(body?{body:JSON.stringify(body)}:{})});
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('admin');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,review_revision INTEGER,review_status TEXT,copyright_status TEXT,grade_level INTEGER,subject_id TEXT,academic_year TEXT,content_mode TEXT,question_type TEXT,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,review_checks_json TEXT,reviewed_by TEXT,reviewed_at TEXT,updated_at TEXT);
 INSERT INTO question_bank VALUES('q',1,'APPROVED','OWNED',5,'math','2026-2027','TEXT','MULTIPLE_CHOICE','Kaç kalem?','["5","6","7","8"]','A','2 + 3 = 5.',NULL,'admin','today','today');
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);INSERT INTO question_learning_links VALUES('q','ln_o');
 CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,active INTEGER,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT);INSERT INTO outcomes VALUES('o','M.5','Synthetic official fixture',1,5,'math','cv');
 CREATE TABLE curriculum_versions(id TEXT,program_version TEXT,verified INTEGER,grade_level INTEGER,academic_year TEXT);INSERT INTO curriculum_versions VALUES('cv','v1',1,5,'2026-2027');
 CREATE TABLE question_assets(id TEXT PRIMARY KEY,question_id TEXT,asset_type TEXT,r2_key TEXT,title TEXT,approved INTEGER,placement TEXT,sort_order INTEGER,alt_text TEXT,mime_type TEXT,width INTEGER,height INTEGER,rights_status TEXT,byte_sha256 TEXT,byte_size INTEGER,sealed_at TEXT);
 CREATE TABLE question_content_blocks(question_id TEXT);CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 CREATE TRIGGER rev AFTER UPDATE ON question_bank WHEN NEW.review_revision=OLD.review_revision BEGIN UPDATE question_bank SET review_revision=OLD.review_revision+1 WHERE id=NEW.id;END;
 CREATE TRIGGER asset_rev AFTER INSERT ON question_assets BEGIN UPDATE question_bank SET review_revision=review_revision+1 WHERE id=NEW.question_id;END;`);
 db.exec('ALTER TABLE question_bank ADD COLUMN editorial_packet_json TEXT;ALTER TABLE question_content_blocks ADD COLUMN placement TEXT;ALTER TABLE question_content_blocks ADD COLUMN block_type TEXT;ALTER TABLE question_content_blocks ADD COLUMN payload_json TEXT;');
 db.exec(readFileSync(new URL('../migrations/0105_question_team_media.sql',import.meta.url),'utf8'));
 let beforeBatch:(()=>void)|undefined,afterPut:(()=>void)|undefined;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),sql,args});
 const objects=new Map<string,{bytes:Uint8Array;meta:any}>();
 const files={put:async(key:string,raw:any,meta:any)=>{const bytes=new Uint8Array(raw);objects.set(key,{bytes,meta});afterPut?.();},head:async(key:string)=>{const o=objects.get(key);return o?{size:o.bytes.byteLength,customMetadata:o.meta.customMetadata}:null;},get:async(key:string)=>{const o=objects.get(key);return o?{size:o.bytes.byteLength,body:new Blob([o.bytes as any]).stream(),arrayBuffer:async()=>o.bytes.buffer.slice(0),httpMetadata:o.meta.httpMetadata}:null;}};
 const env={ENVIRONMENT:'staging',QUESTION_VIDEO_RENDER_ENABLED:'true',QUESTION_TEAM_CONTROLS_ENABLED:'true',FILES:files,DB:{prepare,batch:async(stmts:any[])=>{beforeBatch?.();db.exec('BEGIN');try{const r=stmts.map(s=>db.prepare(s.sql).run(...s.args));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
 const call=(r:Request,user:any=admin)=>handleQuestionMediaJobs(r,env,user);
 const create=async()=>{const r=await call(req('',{questionId:'q',expectedRevision:Number(db.prepare("SELECT review_revision FROM question_bank WHERE id='q'").get()?.review_revision),requestKey:crypto.randomUUID(),narrationMode:'CAPTIONS'}));return (await r.json() as any).job;};
 const lease=async(id:string)=>{await call(req('/'+id+'/prepare',{}));const token='a'.repeat(64);db.prepare("UPDATE question_media_jobs SET status='RENDERING',lease_hash=?,lease_until='2099-01-01T00:00:00.000Z' WHERE id=?").run(await sha256(token),id);return token;};
 const output=(id:string,token:string)=>{const b=new Uint8Array(32);b.set(new TextEncoder().encode('ftyp'),4);return new Request(base+'/'+id+'/render/output',{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'video/mp4','x-video-duration':'12','x-video-has-audio':'false'},body:b});};
 return {db,env,call,create,lease,output,objects,afterPut:(f:()=>void)=>{afterPut=f;},beforeBatch:(f:()=>void)=>{beforeBatch=f;}};
}
it('records blocked human-review work without calling providers and exposes no leases or storage keys',async()=>{
 const f=fixture();try{
  f.db.exec("UPDATE question_bank SET review_status='REVIEW',copyright_status='RESTRICTED',review_revision=1");const j=await f.create();expect(j.status).toBe('BLOCKED');expect(j.errorCode).toBe('HUMAN_AND_RIGHTS_APPROVAL_REQUIRED');
  expect((await f.call(req('/'+j.id+'/prepare',{}))).status).toBe(409);expect(f.objects.size).toBe(0);
  expect((await f.call(req(),{id:'teacher',role:'TEACHER'})).status).toBe(403);
  expect(JSON.stringify(await (await f.call(req())).json())).not.toMatch(/lease_hash|lease_until|output_key|narration_key/);
 }finally{f.db.close()}
});
it('expires render authority on cancellation or changed official context',async()=>{
 const f=fixture();try{
  const j=await f.create(),token=await f.lease(j.id);
  const input=()=>new Request(base+'/'+j.id+'/render/input',{headers:{Authorization:'Bearer '+token}});
  expect((await f.call(input(),null)).status).toBe(200);
  f.db.exec("UPDATE outcomes SET title='Changed'");expect((await f.call(input(),null)).status).toBe(403);
  f.db.exec("UPDATE outcomes SET title='Synthetic official fixture'");await f.call(req('/'+j.id+'/cancel',{},'PATCH'));
  expect((await f.call(f.output(j.id,token),null)).status).toBe(403);expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});
it('stops output commit when the source changes during R2 upload',async()=>{
 const f=fixture();try{
  const j=await f.create(),token=await f.lease(j.id);f.afterPut(()=>f.db.exec("UPDATE question_bank SET subject_id='other'"));
  expect((await f.call(f.output(j.id,token),null)).status).toBe(409);
  expect(f.db.prepare('SELECT output_key FROM question_media_jobs').get()?.output_key).toBeNull();expect(f.db.prepare('SELECT count(*) n FROM question_assets').get()?.n).toBe(0);
 }finally{f.db.close()}
});
it('requires explicit video review, attaches immutable bytes, and returns the question to review',async()=>{
 const f=fixture();try{
  const j=await f.create(),token=await f.lease(j.id);const rendered=await f.call(f.output(j.id,token),null);expect(rendered.status).toBe(200);const r:any=await rendered.json();expect(r).toMatchObject({published:false,humanReviewRequired:true,job:{status:'REVIEW'}});
  expect((await f.call(req('/'+j.id+'/approve',{}))).status).toBe(400);
  const b={expectedSourceRevision:1,expectedOutputHash:r.job.outputSha256,rightsStatus:'OWNED',checks:{watchedEntireVideo:true,answerAndNarration:true,visualReadability:true,rights:true}};
  expect((await f.call(req('/'+j.id+'/approve',b))).status).toBe(200);expect(f.db.prepare('SELECT review_status FROM question_bank').get()?.review_status).toBe('REVIEW');
  expect((await f.call(req('/'+j.id+'/approve',b))).status).toBe(200);expect(f.db.prepare('SELECT count(*) n FROM question_assets').get()?.n).toBe(1);
 }finally{f.db.close()}
});
it('cannot approve across a curriculum race and does not consume attempts while paused',async()=>{
 const f=fixture();try{
  const j=await f.create();f.db.exec('UPDATE question_team_control SET paused=1');expect((await f.call(req('/'+j.id+'/prepare',{}))).status).toBe(409);expect(f.db.prepare('SELECT attempt_count FROM question_media_jobs').get()?.attempt_count).toBe(0);
  f.db.exec('UPDATE question_team_control SET paused=0');const token=await f.lease(j.id);const r:any=await (await f.call(f.output(j.id,token),null)).json();
  f.beforeBatch(()=>f.db.exec('UPDATE curriculum_versions SET verified=0'));
  expect((await f.call(req('/'+j.id+'/approve',{expectedSourceRevision:1,expectedOutputHash:r.job.outputSha256,rightsStatus:'OWNED',checks:{watchedEntireVideo:true,answerAndNarration:true,visualReadability:true,rights:true}}))).status).toBe(409);
  expect(f.db.prepare('SELECT count(*) n FROM question_assets').get()?.n).toBe(0);
 }finally{f.db.close()}
});

it('freezes a validated table into the video plan and rejects unknown or mismatched visual packets',async()=>{
 const f=fixture();try{const q=editorialQuestion(),block=visualBlock(q.editorial as any)!;f.db.prepare("UPDATE question_bank SET content_mode='MIXED',editorial_packet_json=?,options_json=?,correct_answer=?,review_revision=2 WHERE id='q'").run(JSON.stringify(q.editorial),JSON.stringify(q.options),q.correctAnswer);
 f.db.prepare("INSERT INTO question_content_blocks(question_id,placement,block_type,payload_json) VALUES('q','STEM',?,?)").run(block.blockType,JSON.stringify(block.payload));const j=await f.create();expect(j.status).toBe('QUEUED');const stored:any=f.db.prepare('SELECT plan_json,source_snapshot_json FROM question_media_jobs WHERE id=?').get(j.id);expect(JSON.parse(stored.plan_json).scenes[1].visual.rows).toEqual((q.editorial as any).visual.rows);expect(stored.plan_json).not.toContain('readingPurpose');
 f.db.prepare("UPDATE question_content_blocks SET payload_json='{}'").run();const invalid=await f.create();expect(invalid.status).toBe('BLOCKED');expect(invalid.errorCode).toBe('RICH_VIDEO_PACKET_NOT_SUPPORTED');
 }finally{f.db.close()}
});
