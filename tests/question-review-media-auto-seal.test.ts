import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {reviewQuestionWithGate} from '../worker/lib/question-review';

const admin={id:'admin',role:'SUPER_ADMIN'} as any;
function fixture(external=false){
 const db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,review_status TEXT,copyright_status TEXT,question_type TEXT,options_json TEXT,option_count INTEGER,correct_answer TEXT,origin_kind TEXT,review_revision INTEGER DEFAULT 0,reviewed_by TEXT,reviewed_at TEXT,rejection_note TEXT,review_checks_json TEXT,updated_at TEXT);
 CREATE TABLE question_assets(id TEXT PRIMARY KEY,question_id TEXT,r2_key TEXT,external_url TEXT,mime_type TEXT,byte_sha256 TEXT,byte_size INTEGER,sealed_at TEXT);
 INSERT INTO question_bank VALUES('q','REVIEW','OWNED','MULTIPLE_CHOICE','[{"label":"A","text":"1"},{"label":"B","text":"2"},{"label":"C","text":"3"},{"label":"D","text":"4"}]',4,'A','MANUAL',0,NULL,NULL,NULL,NULL,CURRENT_TIMESTAMP);
 INSERT INTO question_assets(id,question_id,r2_key,external_url,mime_type) VALUES('asset','q',${external?'NULL':"'question-media/tmp/a'"},${external?"'https://example.test/a.png'":'NULL'},'image/png');
 CREATE TRIGGER asset_revision AFTER UPDATE ON question_assets BEGIN UPDATE question_bank SET review_revision=review_revision+1 WHERE id=NEW.question_id; END;
 `);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const result=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(result.changes)}}}});
 const objects=new Map<string,any>();if(!external)objects.set('question-media/tmp/a',{bytes:new TextEncoder().encode('image-bytes'),customMetadata:{},contentType:'image/png'});
 const FILES:any={get:async(key:string)=>{const o=objects.get(key);return o?{size:o.bytes.byteLength,httpMetadata:{contentType:o.contentType},customMetadata:o.customMetadata,arrayBuffer:async()=>o.bytes.slice().buffer}:null;},head:async(key:string)=>{const o=objects.get(key);return o?{size:o.bytes.byteLength,customMetadata:o.customMetadata}:null;},put:async(key:string,value:ArrayBuffer,options:any)=>{const bytes=new Uint8Array(value);objects.set(key,{bytes,customMetadata:options.customMetadata||{},contentType:options.httpMetadata?.contentType});}};
 const env:any={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}},FILES};
 return{db,env};
}

it('seals local R2 media during approval and continues on the internally advanced revision',async()=>{
 const f=fixture();try{
  const response=await reviewQuestionWithGate(new Request('https://test/review',{method:'PATCH',body:JSON.stringify({status:'APPROVED',expectedRevision:0})}),f.env,admin,'q');
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,status:'APPROVED',mediaSealed:true});
  const q:any=f.db.prepare(`SELECT review_status,review_revision FROM question_bank WHERE id='q'`).get();expect(q.review_status).toBe('APPROVED');expect(q.review_revision).toBe(1);
  const asset:any=f.db.prepare(`SELECT r2_key,byte_sha256,sealed_at FROM question_assets WHERE id='asset'`).get();expect(asset.r2_key).toMatch(/^question-media\/immutable\//);expect(asset.byte_sha256).toHaveLength(64);expect(asset.sealed_at).toBeTruthy();
 }finally{f.db.close();}
});

it('never auto-imports mutable external media during approval',async()=>{
 const f=fixture(true);try{
  const response=await reviewQuestionWithGate(new Request('https://test/review',{method:'PATCH',body:JSON.stringify({status:'APPROVED',expectedRevision:0})}),f.env,admin,'q');
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:'QUESTION_MEDIA_EXTERNAL_MUTABLE'}});expect(f.db.prepare(`SELECT review_status FROM question_bank WHERE id='q'`).get()?.review_status).toBe('REVIEW');
 }finally{f.db.close();}
});
