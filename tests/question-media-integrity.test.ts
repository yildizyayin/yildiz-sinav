import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { sealQuestionMedia,verifyQuestionMediaIntegrity } from '../worker/lib/question-media-integrity';

const admin={id:'admin',role:'SUPER_ADMIN'} as any;
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,review_status TEXT,review_revision INTEGER DEFAULT 0,reviewed_by TEXT,reviewed_at TEXT,review_checks_json TEXT,updated_at TEXT);
 CREATE TABLE question_assets(id TEXT PRIMARY KEY,question_id TEXT,r2_key TEXT,external_url TEXT,mime_type TEXT);
 INSERT INTO question_bank(id,review_status) VALUES('q','REVIEW');
 INSERT INTO question_assets(id,question_id,r2_key,external_url,mime_type) VALUES('a','q','question-media/tmp/a',NULL,'image/png');`);
 sqlite.exec(readFileSync(new URL('../migrations/0074_question_media_integrity.sql',import.meta.url),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...bound:any[])=>prepare(sql,bound),first:async()=>sqlite.prepare(sql).get(...args),all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>{const r=sqlite.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
 const objects=new Map<string,{bytes:Uint8Array;contentType:string;customMetadata:Record<string,string>}>();
 objects.set('question-media/tmp/a',{bytes:new TextEncoder().encode('immutable-image-bytes'),contentType:'image/png',customMetadata:{}});
 const FILES:any={
  get:async(key:string)=>{const o=objects.get(key);if(!o)return null;return{size:o.bytes.byteLength,httpMetadata:{contentType:o.contentType},customMetadata:o.customMetadata,arrayBuffer:async()=>o.bytes.slice().buffer};},
  head:async(key:string)=>{const o=objects.get(key);return o?{size:o.bytes.byteLength,httpMetadata:{contentType:o.contentType},customMetadata:o.customMetadata}:null;},
  put:async(key:string,value:any,options:any)=>{const bytes=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(await new Response(value).arrayBuffer());objects.set(key,{bytes,contentType:options?.httpMetadata?.contentType||'application/octet-stream',customMetadata:options?.customMetadata||{}});return{key};},
 };
 const env:any={DB:{prepare,batch:async(statements:any[])=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}},FILES};
 return{sqlite,env,objects};
}

it('copies local media to a content-addressed key and records digest/size before approval',async()=>{
 const f=fixture();try{
  const response=await sealQuestionMedia(f.env,admin,'q');expect(response.status).toBe(200);const body:any=await response.json();expect(body.ok).toBe(true);expect(body.sealed).toHaveLength(1);
  const row:any=f.sqlite.prepare(`SELECT r2_key,byte_sha256,byte_size,sealed_at,external_url FROM question_assets WHERE id='a'`).get();
  expect(row.r2_key).toMatch(/^question-media\/immutable\/[0-9a-f]{2}\/[0-9a-f]{64}$/);expect(row.byte_sha256).toHaveLength(64);expect(row.byte_size).toBe(21);expect(row.sealed_at).toBeTruthy();expect(row.external_url).toBeNull();
  expect(await verifyQuestionMediaIntegrity(f.env,'q')).toEqual({ok:true});
  const replay:any=await (await sealQuestionMedia(f.env,admin,'q')).json();expect(replay.sealed[0].reused).toBe(true);
 }finally{f.sqlite.close();}
});

it('rejects mutable external media and detects missing/tampered immutable objects',async()=>{
 const f=fixture();try{
  f.sqlite.exec(`UPDATE question_assets SET r2_key=NULL,external_url='https://example.test/image.png' WHERE id='a'`);
  const blocked=await sealQuestionMedia(f.env,admin,'q');expect(blocked.status).toBe(409);expect((await blocked.json() as any).error.code).toBe('QUESTION_MEDIA_EXTERNAL_MUTABLE');
  f.sqlite.exec(`UPDATE question_assets SET external_url=NULL,r2_key='question-media/immutable/aa/${'a'.repeat(64)}',byte_sha256='${'a'.repeat(64)}',byte_size=3,sealed_at=CURRENT_TIMESTAMP WHERE id='a'`);
  expect(await verifyQuestionMediaIntegrity(f.env,'q')).toMatchObject({ok:false,code:'QUESTION_MEDIA_MISSING'});
  f.objects.set(`question-media/immutable/aa/${'a'.repeat(64)}`,{bytes:new Uint8Array([1,2,3]),contentType:'image/png',customMetadata:{sha256:'b'.repeat(64)}});
  expect(await verifyQuestionMediaIntegrity(f.env,'q')).toMatchObject({ok:false,code:'QUESTION_MEDIA_INTEGRITY_FAILED'});
 }finally{f.sqlite.close();}
});
