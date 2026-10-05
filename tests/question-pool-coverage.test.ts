import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { getQuestionPoolCoverage } from '../worker/lib/question-pool-coverage';

const options=JSON.stringify(['one','two','three','four']);

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE subjects(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,code TEXT,title TEXT,subject_id TEXT,grade_level INTEGER,curriculum_version_id TEXT,active INTEGER);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,review_status TEXT,copyright_status TEXT,stem_text TEXT,options_json TEXT,correct_answer TEXT,option_count INTEGER);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 INSERT INTO subjects VALUES('math','Matematik'),('science','Fen');
 INSERT INTO curriculum_versions VALUES('v','2026-2027',7,'2026',1),('unverified','2026-2027',7,'draft',0),('last','2025-2026',7,'old',1),('grade','2026-2027',8,'grade',1);
 INSERT INTO outcomes VALUES('a','M.7.1','Outcome A','math',7,'v',1),('b','M.7.2','Outcome B','math',7,'v',1),('c','M.7.3','Outcome C','science',7,'v',1),('inactive','x','Inactive','math',7,'v',0),('unverified','x','Unverified','math',7,'unverified',1),('wrongyear','x','Wrong year','math',7,'last',1),('wronggrade','x','Wrong grade','math',7,'grade',1);`);
 const bindCounts:number[]=[];
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>{bindCounts.push(values.length);return prepare(sql,values)},all:async()=>({results:db.prepare(sql).all(...args)})});
 const add=(id:string,changes:Record<string,unknown>={},outcome='a')=>{
  const record={owner_type:'PLATFORM',academic_year:'2026-2027',grade_level:7,subject_id:'math',question_type:'MULTIPLE_CHOICE',review_status:'APPROVED',copyright_status:'OWNED',stem_text:`Stem ${id}`,options_json:options,correct_answer:'A',option_count:4,...changes};
  db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,review_status,copyright_status,stem_text,options_json,correct_answer,option_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,...Object.values(record));
  db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(id,`ln_${outcome}`);
 };
 const env={DB:{prepare}} as any;
 const admin={role:'SUPER_ADMIN'} as any;
 const get=(query:string,user=admin)=>getQuestionPoolCoverage(new Request(`https://example.test/api/question-bank-standard/coverage?${query}`),env,user).then(async r=>({status:r.status,body:await r.json() as any}));
 return {db,add,bindCounts,get};
}

it('counts only matching, valid and uniquely approved platform questions, preserving empty outcomes',async()=>{
 const f=fixture();
 try{
  for(let i=0;i<9;i++)f.add(`q${i}`);
  f.add('duplicate',{stem_text:'  STEM Q0 '});
  f.add('review',{review_status:'REVIEW'});
  f.add('draft',{review_status:'DRAFT'});
  f.add('restricted',{copyright_status:'RESTRICTED'});
  f.add('userprovided',{copyright_status:'USER_PROVIDED'});
  f.add('institution',{owner_type:'INSTITUTION'});
  f.add('publisher',{owner_type:'PUBLISHER'});
  f.add('wrongyear',{academic_year:'2025-2026'});
  f.add('wronggrade',{grade_level:8});
  f.add('wrongsubject',{subject_id:'science'});
  f.add('open',{question_type:'OPEN_ENDED'});
  f.add('nokey',{correct_answer:'E'});
  f.add('badoptions',{options_json:'["one","two","three"]',option_count:3});
  f.add('empty',{stem_text:'  '});
  f.add('second',{copyright_status:'LICENSED'},'b');
  f.add('third',{copyright_status:'PUBLIC_DOMAIN'},'b');
  const response=await f.get('academicYear=2026-2027');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ok:true,academicYear:'2026-2027',target:10,nextCursor:null});
  expect(response.body.items).toHaveLength(3);
  expect(response.body.items[0]).toEqual({id:'a',code:'M.7.1',title:'Outcome A',subjectId:'math',subjectName:'Matematik',gradeLevel:7,curriculumVersionId:'v',programVersion:'2026',approvedUniqueCount:9,reviewCount:1,draftCount:1,missingCount:1,status:'MISSING'});
  expect(response.body.items[1]).toMatchObject({id:'b',approvedUniqueCount:2,missingCount:8,status:'MISSING'});
  expect(response.body.items[2]).toMatchObject({id:'c',approvedUniqueCount:0,missingCount:10,status:'MISSING'});
  f.add('tenth',{copyright_status:'PUBLIC_DOMAIN'});
  expect((await f.get('academicYear=2026-2027&gradeLevel=7&subjectId=math')).body.items[0]).toMatchObject({approvedUniqueCount:10,missingCount:0,status:'READY'});
 }finally{f.db.close()}
});

it('guards roles and parameters before querying, then paginates outcome IDs with bounded bindings',async()=>{
 const f=fixture();
 try{
  const denied=await f.get('academicYear=2026-2027',{role:'TEACHER'});
  expect(denied.status).toBe(403);
  for(const query of ['','academicYear=2026-2028','academicYear=2026-2027&gradeLevel=13','academicYear=2026-2027&gradeLevel=1.5','academicYear=2026-2027&limit=0','academicYear=2026-2027&limit=51',`academicYear=2026-2027&cursor=${'x'.repeat(101)}`]){
   expect((await f.get(query)).status).toBe(400);
  }
  expect(f.bindCounts).toEqual([]);
  const first=(await f.get('academicYear=2026-2027&limit=1')).body;
  expect(first.items.map((x:any)=>x.id)).toEqual(['a']);expect(first.nextCursor).toBe('a');
  const second=(await f.get(`academicYear=2026-2027&limit=1&cursor=${first.nextCursor}`)).body;
  expect(second.items.map((x:any)=>x.id)).toEqual(['b']);expect(second.nextCursor).toBe('b');
  const third=(await f.get('academicYear=2026-2027&limit=1&cursor=b')).body;
  expect(third.items.map((x:any)=>x.id)).toEqual(['c']);expect(third.nextCursor).toBeNull();
  expect((await f.get('academicYear=2026-2027&cursor=z')).body).toMatchObject({items:[],nextCursor:null});
  expect(f.bindCounts.every(n=>n<=51)).toBe(true);
 }finally{f.db.close()}
});

it('aggregates malformed and structured options on native D1 at the 50-outcome page limit',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const mf=new Miniflare(convertV4MiniflareOptions({name:'question-pool-coverage',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 const f=fixture();
 try{
  for(let i=0;i<48;i++)f.db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,?,?,?)').run(`o${String(i).padStart(2,'0')}`,`code${i}`,`Outcome ${i}`,'math',7,'v',1);
  f.add('valid');
  f.add('copy',{stem_text:' STEM VALID '});
  f.add('structured',{options_json:JSON.stringify('ABCDE'.slice(0,5).split('').map((label,index)=>({label,text:`choice ${index}`}))),correct_answer:'E',option_count:5});
  f.add('nullcount',{option_count:null});
  f.add('malformed',{options_json:'['});
  f.add('scalar',{options_json:'42'});
  f.add('nulloptions',{options_json:'null'});
  f.add('objectoptions',{options_json:'{"A":"one"}'});
  f.add('emptychoice',{options_json:'["one","two","three",""]'});
  f.add('tabchoice',{options_json:JSON.stringify(['one','two','three','\t\n'])});
  f.add('nbspchoice',{options_json:JSON.stringify(['one','two','three','\u00a0'])});
  f.add('tabstem',{stem_text:'\t\n'});
  f.add('nbspstem',{stem_text:'\u00a0'});
  f.add('wronglabel',{options_json:'[{"label":"B","text":"one"},"two","three","four"]'});
  f.add('missingfields',{options_json:JSON.stringify([{},'two','three','four'])});
  f.add('missinglabel',{options_json:JSON.stringify([{text:'one'},'two','three','four'])});
  f.add('missingtext',{options_json:JSON.stringify([{label:'A'},'two','three','four'])});
  f.add('nulllabel',{options_json:JSON.stringify([{label:null,text:'one'},'two','three','four'])});
  f.add('nulltext',{options_json:JSON.stringify([{label:'A',text:null},'two','three','four'])});
  f.add('wrongkey',{correct_answer:'E'});
  f.add('countmismatch',{option_count:5});
  f.add('draftbad',{review_status:'DRAFT',options_json:'not-json'});
  f.add('reviewbad',{review_status:'REVIEW',options_json:'null'});
  const native=await mf.getD1Database('DB');
  const tables=f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all() as {name:string;sql:string}[];
  await native.batch(tables.map(t=>native.prepare(t.sql)));
  for(const table of tables){
   const rows=f.db.prepare(`SELECT * FROM ${table.name}`).all() as Record<string,unknown>[];
   if(rows.length)await native.batch(rows.map(row=>native.prepare(`INSERT INTO ${table.name}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))));
  }
  const bindCounts:number[]=[],resultCounts:number[]=[];
  const prepare=(sql:string):any=>({bind:(...args:any[])=>{
   bindCounts.push(args.length);
   const stmt=native.prepare(sql).bind(...args);
   return{all:async()=>{const result=await stmt.all();resultCounts.push(result.results.length);return result}};
  }});
  const env={DB:{prepare}} as any;
  const call=async(cursor='')=>{
   const response=await getQuestionPoolCoverage(new Request(`https://example.test/api/question-bank-standard/coverage?academicYear=2026-2027&limit=50${cursor?`&cursor=${cursor}`:''}`),env,{role:'SUPER_ADMIN'} as any);
   expect(response.status).toBe(200);return response.json() as Promise<any>;
  };
  const first=await call();
  expect(first.items).toHaveLength(50);
  expect(first.items[0]).toMatchObject({id:'a',approvedUniqueCount:3,reviewCount:1,draftCount:1,missingCount:7,status:'MISSING'});
  expect(first.nextCursor).toBe('o46');
  const second=await call(first.nextCursor);
  expect(second.items.map((x:any)=>x.id)).toEqual(['o47']);
  expect(second.nextCursor).toBeNull();
  expect(bindCounts.every(n=>n<=51)).toBe(true);
  expect(resultCounts.every(n=>n<=51)).toBe(true);
 }finally{f.db.close();await mf.dispose()}
},30000);
