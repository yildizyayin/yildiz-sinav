import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readProgram} from '../scripts/meb2018-programs.mjs';
import {catalogItems,reverifyMeb2018,PLAN} from '../scripts/production-meb2018-curricula.mjs';
import {importProductionCurricula} from '../scripts/production-question-curricula.mjs';
import {evaluatedExam} from './helpers/exam-flow';
import {scopedOutcomeCatalog} from '../worker/lib/exam-outcome-matching';

/**
 * Owner (9 Nov): in 2026-2027 grades 4, 8 and 12 still follow the previous MEB programmes, so 8th-grade (LGS) exams need
 * those official outcomes (T.8.3.5, M.8.1.2.1, F.8.1.1.1, İTA.8.1.4, 8.1.1, E8.1.SI1 …). They are read from the text of
 * the official PDFs collected from mufredat.meb.gov.tr and imported only when the PDF and its re-read are unchanged.
 */
const text=(key:string)=>readFileSync(`data/maarif/meb2018/${key}.txt`,'utf8');
const catalog=JSON.parse(readFileSync('data/meb2018-catalog-2027.json','utf8'));
it('reads every 8th-grade outcome of the six LGS programmes with its official code and full sentence',()=>{
 const counts=Object.fromEntries(catalog.items.filter((i:any)=>i.grade===8).map((i:any)=>[i.subjectCode+i.grade,i.outcomes.length]));
 expect(counts).toEqual({TUR8:76,MAT8:52,FEN8:61,INK8:39,DIN8:28,ING8:70});
 const find=(s:string,c:string)=>readProgram(text(PLAN.find(p=>p[1]===s)![0]),s,8).find((o:any)=>o.code===c)!.title;
 expect(find('TUR','T.8.3.20')).toBe('Okuduğu metinlerdeki hikâye unsurlarını belirler.'); // no space after the code in the PDF
 expect(find('DIN','8.2.1')).toBe('İslam’ın paylaşma ve yardımlaşmaya verdiği önemi ayet ve hadisler ışığında yorumlar.'); // wrapped, indented line
 expect(find('FEN','F.8.1.2.2')).toMatch(/uzmanlara iklim bilimci \(klimatolog\) adı verildiğini söyler\.$/); // hyphenated word joined
 expect(find('ING','E8.1.SI1')).toBe('Students will be able to interact with reasonable ease in structured situations and short conversations involving accepting and refusing an offer/invitation, apologizing and making simple inquiries.');
 for(const i of catalog.items)for(const o of i.outcomes)expect(o.title,`${o.code}`).toMatch(/[.!?)]$/);
});
it('the committed catalogue is exactly what the readers produce from the reviewed official text',()=>{
 const collected=JSON.parse(readFileSync('data/maarif/meb2018/collected.json','utf8'));
 expect(catalogItems(collected,text)).toEqual(catalog.items);
 expect(catalog.items.every((i:any)=>i.academicYear==='2026-2027'&&i.sourceKind==='MEB_MUFREDAT'&&/^https:\/\/mufredat\.meb\.gov\.tr\//.test(i.sourceUrl))).toBe(true);
});
it('refuses to import when the official PDF or its content changed',async()=>{
 const one={items:[catalog.items[0]]},pdf=Buffer.from('synthetic pdf bytes');
 await expect(reverifyMeb2018(one,async()=>pdf,async()=>text('tur-2019'))).rejects.toThrow(/OFFICIAL_PDF_CHANGED/);
 const sha=createHash('sha256').update(pdf).digest('hex');
 const same={items:[{...catalog.items[0],pdfSha256:sha}]};
 await expect(reverifyMeb2018(same,async()=>pdf,async()=>text('tur-2019'))).resolves.toMatchObject({sources:1});
 await expect(reverifyMeb2018(same,async()=>pdf,async()=>text('tur-2019').replace('T.8.3.20.Okuduğu','T.8.3.20. Değişen'))).rejects.toThrow(/OFFICIAL_CONTENT_CHANGED/);
 await expect(reverifyMeb2018({items:[{...same.items[0],sourceUrl:'https://example.com/x.pdf'}]},async()=>pdf,async()=>'')).rejects.toThrow(/OFFICIAL_SOURCE_REQUIRED/);
});
it('imports as a verified 2026-2027 MEB_MUFREDAT version through the same importer as TYMM',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
 try{
  for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n<='0114_question_curriculum_subjects.sql').sort())db.exec(readFileSync('migrations/'+name,'utf8'));
  db.exec("INSERT OR IGNORE INTO subjects(id,code,name) VALUES('sub_tur','TUR','Türkçe')");
  const query=async(sql:string,params:any[]=[])=>db.prepare(sql).all(...params);
  const item=catalog.items.find((i:any)=>i.subjectCode==='TUR');
  await importProductionCurricula({query,imports:[item],evidence:{verifiedAt:'2026-11-09T00:00:00Z'},runId:'test'});
  await importProductionCurricula({query,imports:[item],evidence:{verifiedAt:'2026-11-09T00:00:00Z'},runId:'test'});
  expect(db.prepare("SELECT academic_year,grade_level,source_kind,verified FROM curriculum_versions WHERE source_kind='MEB_MUFREDAT'").all()).toEqual([{academic_year:'2026-2027',grade_level:8,source_kind:'MEB_MUFREDAT',verified:1}]);
  expect((db.prepare("SELECT count(*) n FROM outcomes WHERE code LIKE 'T.8.%' AND official=1").get() as any).n).toBe(76);
  expect((db.prepare("SELECT source_kind FROM official_knowledge_events").get() as any).source_kind).toBe('MEB_MUFREDAT');
 }finally{db.close();}
});
it('a 2026-2027 8th-grade exam uses the previous programme; a 2027-2028 exam keeps the TYMM catalogue',async()=>{
 const t=await evaluatedExam('direct');
 try{
  t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code,source_kind) VALUES
   ('cv_old','2026-2027',8,'old','MEB',1,'SCHOOL','MEB_MUFREDAT'),('cv_new','2027-2028',8,'new','MEB',1,'SCHOOL','MEB_TYMM');
   INSERT OR IGNORE INTO subjects(id,code,name) VALUES('sub_tur','TUR','Türkçe');
   INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active) VALUES
   ('o_old','cv_old','sub_tur',8,'T.8.3.5','Bağlamdan yararlanarak bilmediği kelime ve kelime gruplarının anlamını tahmin eder.',1,1),
   ('o_new','cv_new','sub_tur',8,'T.D.8.1','Sentetik TYMM kazanımı.',1,1);`);
  const now=await scopedOutcomeCatalog(t.env as any,{academicYear:'2026-2027',gradeLevel:8,programCode:'SCHOOL'} as any,'sub_tur');
  expect(now.map((o:any)=>o.code)).toContain('T.8.3.5'); expect(now.map((o:any)=>o.code)).not.toContain('T.D.8.1');
  const next=await scopedOutcomeCatalog(t.env as any,{academicYear:'2027-2028',gradeLevel:8,programCode:'SCHOOL'} as any,'sub_tur');
  expect(next.map((o:any)=>o.code)).toEqual(['T.D.8.1']);
 }finally{t.db.close();}
},60000);
it('reads the six 4th-grade programmes of the previous MEB curriculum with official codes (owner, 9 Nov)',()=>{
 const counts=Object.fromEntries(catalog.items.filter((i:any)=>i.grade===4).map((i:any)=>[i.subjectCode+i.grade,i.outcomes.length]));
 // equal to the number of distinct grade-4 codes in each official PDF's text
 expect(counts).toEqual({TUR4:77,MAT4:71,FEN4:43,DIN4:16,ING4:47,SOS4:33});
 const find=(s:string,c:string)=>readProgram(text(PLAN.find(p=>p[1]===s)![0]),s,4).find((o:any)=>o.code===c)!.title;
 expect(find('TUR','T.4.3.6')).toBe('Okuma stratejilerini uygular.'); // no full stop after the code in the PDF
 expect(find('MAT','M.4.1.4.1')).toBe('Üç basamaklı doğal sayılarla iki basamaklı doğal sayıları çarpar.');
 expect(find('SOS','SB.4.1.1')).toBe('Resmî kimlik belgesini inceleyerek kişisel kimliğine ilişkin çıkarımlarda bulunur.');
 expect(catalog.items.find((i:any)=>i.subjectCode==='SOS').outcomes.every((o:any)=>o.unit)).toBe(true);
});
