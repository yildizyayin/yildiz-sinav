import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';

const managerX={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE teacher_assignments(user_id TEXT,institution_id TEXT,subject_id TEXT,active INTEGER,assignment_type TEXT);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,question_type TEXT,difficulty_band TEXT DEFAULT 'MEDIUM',owner_type TEXT DEFAULT 'PLATFORM',owner_id TEXT,academic_year TEXT DEFAULT '2027-2028',grade_level INTEGER DEFAULT 5,subject_id TEXT DEFAULT 'tur',review_status TEXT DEFAULT 'APPROVED',copyright_status TEXT DEFAULT 'OWNED',option_count INTEGER DEFAULT 4,stem_text TEXT DEFAULT 'Kök',options_json TEXT DEFAULT '["a","b","c","d"]',correct_answer TEXT DEFAULT 'A');
 CREATE TABLE outcomes(id TEXT,code TEXT);INSERT INTO outcomes VALUES('o1','T.5.1.1'),('o2','T.5.1.2');
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,document_type TEXT,title TEXT,grade_level INTEGER,subject_id TEXT,status TEXT,pdf_r2_key TEXT,config_json TEXT,updated_at TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 CREATE TABLE studio_document_assets(document_id TEXT,booklet_code TEXT,asset_type TEXT,metadata_json TEXT);
 CREATE TABLE assessment_runs(id TEXT,source_type TEXT,source_id TEXT);
 INSERT INTO studio_documents VALUES('doc','instX','tx','PRACTICE_EXAM','D',5,'tur','READY','k','{"academicYear":"2027-2028","optionMode":"MIXED"}',NULL);
 INSERT INTO studio_document_assets VALUES('doc','A','QUESTION_PDF','{}'),('doc','B','QUESTION_PDF','{}');`);
 const q=(id:string,extra:string='',vals:any[]=[])=>db.prepare(`INSERT INTO question_bank(id${extra}) VALUES(?${vals.map(()=>',?').join('')})`).run(id,...vals);
 const link=(qid:string,o:string)=>db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(qid,'ln_'+o);
 // In the document: a (o1, MEDIUM) at A1/B2, b (o2) at A2/B1.
 q('a');link('a','o1');q('b');link('b','o2');
 db.exec(`INSERT INTO studio_document_items VALUES('doc','a','A',1),('doc','b','A',2),('doc','b','B',1),('doc','a','B',2);`);
 // Candidates for a: same outcome+band 'good'; same outcome other band 'hard'; other outcome 'other'; never: REVIEW, other institution, open-ended
 q('good');link('good','o1');q('hard',',difficulty_band',['HARD']);link('hard','o1');q('other');link('other','o2');
 q('rev',',review_status',['REVIEW']);link('rev','o1');q('priv',',owner_type,owner_id',['INSTITUTION','instY']);link('priv','o1');q('open',',question_type',['OPEN_ENDED']);link('open','o1');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};},sql,args});
 const env={DB:{prepare,batch:async(stmts:any[])=>{for(const s of stmts)db.prepare(s.sql).run(...s.args);return [];}}} as any;
 const call=async(user:any,path:string,body?:any)=>{const r=await handlePlatformApi(new Request(`https://t${path}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined),env,user);return {status:r!.status,body:await r!.json() as any};};
 const items=(bk:string)=>db.prepare('SELECT question_id q,sort_order p FROM studio_document_items WHERE document_id=? AND booklet_code=? ORDER BY sort_order').all('doc',bk).map((r:any)=>r.q);
 return {db,call,items};
}

it('previews a booklet with outcomes and difficulty, and marks whether PDFs were already produced',async()=>{
 const f=setup();try{
  const r=await f.call(managerX,'/api/platform/studio/doc/items?booklet=B');
  expect(r.status).toBe(200);
  expect(r.body.items.map((i:any)=>[i.position,i.id,i.outcomes,i.band])).toEqual([[1,'b','T.5.1.2','MEDIUM'],[2,'a','T.5.1.1','MEDIUM']]);
  expect(r.body.items[0].options.map((o:any)=>o.label)).toEqual(['A','B','C','D']);
  expect(r.body).toMatchObject({locked:false,printed:true});
 }finally{f.db.close();}
});

it('swaps a question for an approved one from the same outcome and difficulty in every booklet, and invalidates printed PDFs',async()=>{
 const f=setup();try{
  const r=await f.call(managerX,'/api/platform/studio/doc/swap',{questionId:'a'});
  expect(r.status).toBe(200);expect(r.body).toMatchObject({from:'a',to:'good',sameOutcome:true,sameDifficulty:true,invalidatedPdfs:true});
  expect(f.items('A')).toEqual(['good','b']);expect(f.items('B')).toEqual(['b','good']);
  expect((f.db.prepare('SELECT COUNT(*) n FROM studio_document_assets').get() as any).n).toBe(0);
  expect(f.db.prepare('SELECT status,pdf_r2_key FROM studio_documents').get()).toMatchObject({status:'DRAFT',pdf_r2_key:null});
  // The removed question returns to the pool; once it is archived, same outcome+difficulty is exhausted (REVIEW, other institution, open-ended never qualify).
  f.db.exec(`UPDATE question_bank SET review_status='ARCHIVED' WHERE id='a'`);
  const none=await f.call(managerX,'/api/platform/studio/doc/swap',{questionId:'good'});
  expect(none.status).toBe(409);expect(none.body.error.message).toContain('Aynı kazanımda ve aynı zorlukta');
  const anyBand=await f.call(managerX,'/api/platform/studio/doc/swap',{questionId:'good',sameDifficulty:false});
  expect(anyBand.body.to).toBe('hard');
 }finally{f.db.close();}
});

it('refuses once results exist, and only the owner teacher or the institution staff may change it',async()=>{
 const f=setup();try{
  expect((await f.call({id:'other',role:'TEACHER',institution_id:'instX'},'/api/platform/studio/doc/swap',{questionId:'a'})).status).toBe(403);
  expect((await f.call({id:'my',role:'INSTITUTION_MANAGER',institution_id:'instY'},'/api/platform/studio/doc/items')).status).toBe(403);
  expect((await f.call({id:'s',role:'STUDENT',institution_id:'instX'},'/api/platform/studio/doc/items')).status).toBe(403);
  f.db.exec(`INSERT INTO assessment_runs VALUES('r1','QUESTION_BANK','doc')`);
  const r=await f.call(managerX,'/api/platform/studio/doc/swap',{questionId:'a'});
  expect(r.status).toBe(409);expect(r.body.error.code).toBe('STUDIO_LOCKED');expect(f.items('A')).toEqual(['a','b']);
 }finally{f.db.close();}
});
