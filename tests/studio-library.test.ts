import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';

const manager={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;
const teacher={id:'tx',role:'TEACHER',institution_id:'instX'} as any;
const teacher2={id:'ty',role:'TEACHER',institution_id:'instX'} as any;

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE subjects(id TEXT PRIMARY KEY,name TEXT);INSERT INTO subjects VALUES('tur','Türkçe');
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,document_type TEXT,title TEXT,grade_level INTEGER,subject_id TEXT,status TEXT,config_json TEXT,created_at TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 INSERT INTO studio_documents VALUES('d1','instX','tx','PRACTICE_EXAM','Benim','5','tur','DRAFT','{}','2026-10-21 10:00'),('d2','instX','ty','PRACTICE_EXAM','Onun',5,'tur','DRAFT','{}','2026-10-21 11:00'),('d3','instY','zz','PRACTICE_EXAM','Başka kurum',5,'tur','DRAFT','{}','2026-10-21 12:00');`);
 db.exec(readFileSync('migrations/0119_studio_library.sql','utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};}});
 const env={DB:{prepare}} as any;
 const call=async(user:any,method:string,path:string,body?:any)=>{const r=await handlePlatformApi(new Request(`https://t${path}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),env,user);return {status:r!.status,body:await r!.json() as any};};
 return {db,call};
}

it('library lists subject names, mine and favourites; teachers see only their own documents; never another institution',async()=>{
 const f=setup();try{
  expect((await f.call(manager,'POST','/api/platform/studio/d2/favorite')).status).toBe(200);
  const m=await f.call(manager,'GET','/api/platform/studio');
  expect(m.body.documents.map((d:any)=>[d.id,d.subject_name,d.is_mine,d.is_favorite])).toEqual([['d2','Türkçe',0,1],['d1','Türkçe',0,0]]);
  const t=await f.call(teacher,'GET','/api/platform/studio');
  expect(t.body.documents.map((d:any)=>[d.id,d.is_mine])).toEqual([['d1',1]]);
  expect((await f.call(teacher,'POST','/api/platform/studio/d2/favorite')).status).toBe(403);
  expect((await f.call(manager,'POST','/api/platform/studio/d3/favorite')).status).toBe(403);
  await f.call(manager,'DELETE','/api/platform/studio/d2/favorite');
  expect((await f.call(manager,'GET','/api/platform/studio')).body.documents[0].is_favorite).toBe(0);
 }finally{f.db.close();}
});

it('templates keep only form choices, are private unless a manager shares them, and only owner or manager may delete',async()=>{
 const f=setup();try{
  const saved=await f.call(teacher,'POST','/api/platform/studio/templates',{name:'5. sınıf konu tarama',kind:'TOPIC_SCAN',shared:true,config:{gradeLevel:'5',subjectId:'tur',questionCount:'10',questionIds:['x'],title:'yok'}});
  expect(saved.status).toBe(201);
  const mine=await f.call(teacher,'GET','/api/platform/studio/templates');
  expect(mine.body.templates).toHaveLength(1);expect(mine.body.templates[0]).toMatchObject({name:'5. sınıf konu tarama',kind:'TOPIC_SCAN',shared:false,mine:true,config:{gradeLevel:'5',subjectId:'tur',questionCount:'10'}});
  expect(mine.body.templates[0].config.questionIds).toBeUndefined();
  expect((await f.call(teacher2,'GET','/api/platform/studio/templates')).body.templates).toHaveLength(0);
  await f.call(manager,'POST','/api/platform/studio/templates',{name:'Kurum denemesi',kind:'PRACTICE_EXAM',shared:true,config:{questionCount:'40'}});
  expect((await f.call(teacher2,'GET','/api/platform/studio/templates')).body.templates.map((t:any)=>[t.name,t.shared,t.mine])).toEqual([['Kurum denemesi',true,false]]);
  const shared=(await f.call(teacher2,'GET','/api/platform/studio/templates')).body.templates[0].id;
  expect((await f.call(teacher2,'DELETE',`/api/platform/studio/templates/${shared}`)).status).toBe(403);
  expect((await f.call(manager,'DELETE',`/api/platform/studio/templates/${mine.body.templates[0].id}`)).status).toBe(200);
  expect((await f.call(teacher,'POST','/api/platform/studio/templates',{name:'',kind:'TOPIC_SCAN'})).body.error.code).toBe('TEMPLATE_NAME_REQUIRED');
  expect((await f.call(teacher,'POST','/api/platform/studio/templates',{name:'x',kind:'NOPE'})).body.error.code).toBe('INVALID_TEMPLATE_KIND');
 }finally{f.db.close();}
});
