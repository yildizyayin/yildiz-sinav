import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,title TEXT,status TEXT DEFAULT 'DRAFT',pdf_r2_key TEXT,updated_at TEXT,config_json TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 CREATE TABLE studio_document_assets(id TEXT,document_id TEXT,institution_id TEXT,booklet_code TEXT,asset_type TEXT,r2_key TEXT,file_name TEXT,mime_type TEXT,byte_size INTEGER,metadata_json TEXT,created_at TEXT,UNIQUE(document_id,booklet_code,asset_type));
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,stem_text TEXT,options_json TEXT,correct_answer TEXT,content_mode TEXT DEFAULT 'TEXT',editorial_packet_json TEXT,origin_kind TEXT DEFAULT 'AI_GENERATED');
 CREATE TABLE institutions(id TEXT PRIMARY KEY,name TEXT);INSERT INTO institutions VALUES('instX','Yıldız Koleji');
 CREATE TABLE campus_branding(institution_id TEXT PRIMARY KEY,logo_r2_key TEXT,enabled INTEGER DEFAULT 0,updated_at TEXT);
 CREATE TABLE question_assets(id TEXT,question_id TEXT,asset_type TEXT,r2_key TEXT,external_url TEXT,placement TEXT,option_label TEXT,sort_order INTEGER,alt_text TEXT);
 CREATE TABLE question_content_blocks(id TEXT,question_id TEXT,block_type TEXT,placement TEXT,text_content TEXT,payload_json TEXT,alt_text TEXT,sort_order INTEGER);
 INSERT INTO studio_documents(id,institution_id,created_by,title) VALUES('doc','instX','teacherX','Deneme');
 INSERT INTO question_bank(id,stem_text,options_json,correct_answer,content_mode,editorial_packet_json) VALUES('ai','Yapay zekâ kaynaklı editoryal soru kökü','[{"label":"A","text":"Bir"},{"label":"B","text":"İki"},{"label":"C","text":"Üç"},{"label":"D","text":"Dört"}]','C','TEXT','{"version":1}');
 INSERT INTO studio_document_items VALUES('doc','ai','A',1),('doc','ai','B',1);`);
 const stored=new Map<string,Uint8Array>();
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};}});
 const env={DB:{prepare},FILES:{get:async(key:string)=>stored.has(key)?{arrayBuffer:async()=>stored.get(key)!.slice().buffer}:null,put:async(key:string,bytes:ArrayBuffer|Uint8Array)=>{stored.set(key,new Uint8Array(bytes as ArrayBuffer));}}} as any;
 const send=(user:any,method:string,body?:BodyInit)=>handlePlatformApi(new Request('https://t/api/platform/studio/branding/logo',{method,body}),env,user).then(r=>r!);
 const get=(user:any,path:string)=>handlePlatformApi(new Request(`https://t${path}`),env,user).then(r=>r!);
 return {db,stored,get,send};
}
const manager={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;

it('prints AI editorial questions and stores the booklet; the answer key is a separate staff-only download',async()=>{
 const f=setup();try{
  const pdf=await f.get(manager,'/api/platform/studio/doc/pdf?booklet=B');
  expect(pdf.status).toBe(200);expect(pdf.headers.get('content-type')).toBe('application/pdf');
  expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0,5))).toBe('%PDF-');
  expect([...f.stored.keys()]).toEqual(['studio-documents/instX/doc/B.pdf']);
  const key=await f.get(manager,'/api/platform/studio/doc/answer-key');
  expect(key.status).toBe(200);expect(key.headers.get('content-disposition')).toContain('cevap-anahtari.pdf');
  expect((await f.get({id:'s',role:'STUDENT',institution_id:'instX'},'/api/platform/studio/doc/answer-key')).status).toBe(403);
  expect((await f.get({id:'p',role:'PARENT',institution_id:'instX'},'/api/platform/studio/doc/answer-key')).status).toBe(403);
  expect((await f.get({id:'my',role:'INSTITUTION_MANAGER',institution_id:'instY'},'/api/platform/studio/doc/answer-key')).status).toBe(403);
  expect((await f.get({id:'other',role:'TEACHER',institution_id:'instX'},'/api/platform/studio/doc/answer-key')).status).toBe(403);
 }finally{f.db.close();}
});

it('returns a named, explicit 409 instead of a truncated PDF',async()=>{
 const f=setup();try{
  f.db.exec(`UPDATE question_bank SET stem_text='Desteklenmeyen karakter ☃ içeren kök' WHERE id='ai'`);
  const r=await f.get(manager,'/api/platform/studio/doc/pdf?booklet=A');
  expect(r.status).toBe(409);const body:any=await r.json();
  expect(body.error.code).toBe('PRINT_UNSUPPORTED_CHARACTER');expect(body.error.message).toContain('Soru 1');
  expect(f.stored.size).toBe(0);
 }finally{f.db.close();}
});

const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,2,0,0,0,0x90,0x77,0x53,0xde,0,0,0,12,0x49,0x44,0x41,0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0,0,3,1,1,0,0x18,0xdd,0x8d,0xb0,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
it('lets only institution managers upload a PNG/JPEG print logo that then appears in their booklets with the institution name',async()=>{
 const f=setup();try{
  const form=(bytes:Uint8Array,name='logo.png')=>{const d=new FormData();d.append('file',new File([bytes],name));return d;};
  expect((await f.send({id:'t',role:'TEACHER',institution_id:'instX'},'POST',form(PNG))).status).toBe(403);
  const bad=await f.send(manager,'POST',form(new Uint8Array([1,2,3,4,5]),'x.gif'));expect(bad.status).toBe(400);expect(((await bad.json()) as any).error.code).toBe('LOGO_FORMAT');
  expect((await f.send(manager,'POST',form(PNG))).status).toBe(200);
  expect(((await (await f.send(manager,'GET')).json()) as any)).toMatchObject({institutionName:'Yıldız Koleji',hasLogo:true});
  const logoKey=f.db.prepare('SELECT logo_r2_key k FROM campus_branding WHERE institution_id=?').get('instX') as any;
  expect(logoKey.k).toMatch(/^branding\/instX\/print-logo-\d+\.png$/);
  const pdf=await f.get(manager,'/api/platform/studio/doc/pdf?booklet=A');expect(pdf.status).toBe(200);
  const meta=JSON.parse((f.db.prepare("SELECT metadata_json m FROM studio_document_assets WHERE booklet_code='A'").get() as any).m);
  expect(meta.branding).toEqual({showAnunex:true,showNibiru:true,institutionName:'Yıldız Koleji',institutionLogo:true});
  f.db.exec(`UPDATE studio_documents SET config_json='{"branding":{"showAnunex":false,"showNibiru":false,"useInstitution":false}}'`);
  await f.get(manager,'/api/platform/studio/doc/pdf?booklet=A');
  const meta2=JSON.parse((f.db.prepare("SELECT metadata_json m FROM studio_document_assets WHERE booklet_code='A'").get() as any).m);
  expect(meta2.branding).toEqual({showAnunex:false,showNibiru:false,institutionName:null,institutionLogo:false});
  expect((await f.send(manager,'DELETE')).status).toBe(200);
  expect(((await (await f.send(manager,'GET')).json()) as any).hasLogo).toBe(false);
 }finally{f.db.close();}
});
