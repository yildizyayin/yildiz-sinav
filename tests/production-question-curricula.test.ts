import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {productionCurriculumPlan,reverifyCurricula,importProductionCurricula,expandBranchCatalog} from '../scripts/production-question-curricula.mjs';
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
it('imports exactly the registered contexts without inventing annual plans or changing official codes',()=>{
 const plan=productionCurriculumPlan(read('data/question-branch-catalog-2028.json'),read('data/question-full-math-target-2028.json'),read('data/app-question-scope-2028.json'));
 expect(plan).toHaveLength(77);expect(plan.reduce((n:number,p:any)=>n+p.outcomes.length,0)).toBe(2916);
 const changed=expandBranchCatalog(read('data/question-branch-catalog-2028.json')); changed.programs[0].outcomes[0].title='changed';
 expect(()=>productionCurriculumPlan(changed,read('data/question-full-math-target-2028.json'),read('data/app-question-scope-2028.json'))).toThrow(/REGISTRY_CONTENT_MISMATCH/);
});
it('rejects unavailable or changed official sources before publication',async()=>{
 const branch={programs:[{indexUrl:'https://tymm.meb.gov.tr/a',grade:5,themes:[]}]};
 await expect(reverifyCurricula(branch,{grades:[]},async()=>'<h1>6. Sınıf</h1>')).rejects.toThrow('INDEX_GRADE_CHANGED');
 await expect(reverifyCurricula({programs:[{...branch.programs[0],indexUrl:'https://example.com'}]},{grades:[]},async()=>'' )).rejects.toThrow('OFFICIAL_SOURCE_REQUIRED');
});
function database(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
 // Full schema ensures production SQL and provenance are exercised, not mocked insert strings.
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n<='0114_question_curriculum_subjects.sql').sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 db.exec("INSERT OR IGNORE INTO subjects(id,code,name) VALUES('s','MAT','Matematik')");
 return db;
}
it('stages and validates real nodes, preserves official identities across versions, and is idempotent',async()=>{
 const db=database();try{
  const query=async(sql:string,params:any[]=[])=>db.prepare(sql).all(...params);
  const item={academicYear:'2027-2028',grade:5,subjectCode:'MAT',programVersion:'fixture-v1',sourceUrl:'https://tymm.meb.gov.tr/fixture',scopeKind:'THEME',outcomes:[{code:'FIXTURE.5.1',title:'Fixture only, not an official MEB outcome',unit:'fixture',topic:'fixture'}]};
  const options={query,imports:[item,{...item,programVersion:'fixture-v2'}],evidence:{verifiedAt:'2026-10-19T00:00:00Z'},runId:'test'};
  await importProductionCurricula(options);await importProductionCurricula(options);
  expect((db.prepare('SELECT count(*) n FROM curriculum_versions WHERE verified=1').get() as any).n).toBe(2);
  expect((db.prepare('SELECT count(*) n FROM learning_nodes WHERE official_code=?').get('FIXTURE.5.1') as any).n).toBe(2);
  expect((db.prepare('SELECT count(*) n FROM official_knowledge_events').get() as any).n).toBe(2);
  expect((db.prepare('SELECT count(*) n FROM audit_logs').get() as any).n).toBe(2);
 }finally{db.close();}
});
it('keeps a partially imported version unverified when node/content checks fail and never replaces bad rows silently',async()=>{
 const db=database();try{
  db.exec('DROP TRIGGER trg_outcome_learning_node_insert');
  const query=async(sql:string,params:any[]=[])=>db.prepare(sql).all(...params);
  const item={academicYear:'2027-2028',grade:5,subjectCode:'MAT',programVersion:'interrupted-fixture',sourceUrl:'https://tymm.meb.gov.tr/fixture',scopeKind:'THEME',outcomes:[{code:'FIXTURE.ONLY',title:'Not an official outcome',unit:'fixture'}]};
  await expect(importProductionCurricula({query,imports:[item],evidence:{verifiedAt:'2026-10-19T00:00:00Z'},runId:'test'})).rejects.toThrow('IMPORTED_CONTEXT_MISMATCH');
  expect((db.prepare('SELECT verified FROM curriculum_versions WHERE program_version=?').get(item.programVersion) as any).verified).toBe(0);
  expect((db.prepare('SELECT count(*) n FROM official_knowledge_events').get() as any).n).toBe(0);
 }finally{db.close();}
});
