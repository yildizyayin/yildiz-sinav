import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
import {expect,it} from 'vitest';
import {buildAnswerKeyTemplateRows,parseAnswerKeyFileText,parseAnswerKeyWorkbookRows} from '../src/lib/guidedDefinitions';
import {replaceAnswerKey} from '../worker/exam-admin-entry';

const subjects=[{id:'tur',code:'TUR',name:'Türkçe'},{id:'mat',code:'MAT',name:'Matematik'}] as any;
const sections=[{subjectCode:'TUR',label:'Türkçe',questionStart:1,questionEnd:3,questionCount:3,optionCount:5},{subjectCode:'MAT',label:'Matematik',questionStart:4,questionEnd:6,questionCount:3,optionCount:5}];
// Canonical (A) answers and the printed position of each question in B, C, D.
const answers=['A','B','C','D','E','A'];
const printed:Record<string,number[]>={A:[1,2,3,4,5,6],B:[3,1,2,6,4,5],C:[2,3,1,5,6,4],D:[1,3,2,4,6,5]};

function filledTemplate(){
 const t=buildAnswerKeyTemplateRows({title:'Deneme',gradeLevel:7,examType:'STANDARD',publisherName:'ANUNEX',sessionLabel:'1. Oturum',booklets:['A','B','C','D'],sections,subjectName:(c,f)=>f});
 const header=t.rows[t.answerHeaderRow].map(String);
 const col=(name:string)=>header.indexOf(name);
 for(let i=0;i<6;i++){const row=t.rows[t.answerHeaderRow+1+i];row[col('Doğru Cevap')]=answers[i];for(const b of ['B','C','D'])row[col(`${b} Soru No`)]=printed[b][i];}
 return t;
}

it('template has one value per cell and a question-number column for every booklet A–D',()=>{
 const t=filledTemplate();const header=t.rows[t.answerHeaderRow];
 expect(['A Soru No','B Soru No','C Soru No','D Soru No','Doğru Cevap'].every(h=>header.includes(h))).toBe(true);
 const first=t.rows[t.answerHeaderRow+1];expect([first[0],first[4],first[5],first[6],first[7],first[8]]).toEqual([1,1,3,2,1,'A']);
 const onlyAB=buildAnswerKeyTemplateRows({title:'',gradeLevel:7,examType:'STANDARD',publisherName:'',sessionLabel:'',booklets:['A','B'],sections,subjectName:(c,f)=>f});
 expect(onlyAB.rows[onlyAB.answerHeaderRow].filter(c=>/Soru No$/.test(String(c)))).toEqual(['A Soru No','B Soru No']);
});

it('a filled template read back from .xlsx and from a Turkish-Excel CSV (;) gives the same key per booklet',()=>{
 const t=filledTemplate();
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t.rows),'S');
 const back=XLSX.read(XLSX.write(wb,{type:'array',bookType:'xlsx'}),{type:'array'});
 const rows=XLSX.utils.sheet_to_json(back.Sheets.S,{header:1,defval:''}) as unknown[][];
 const fromXlsx=parseAnswerKeyWorkbookRows(rows,subjects);
 const csv=t.rows.map(r=>r.map(String).join(';')).join('\r\n');
 const fromCsv=parseAnswerKeyFileText('﻿'+csv,subjects);
 for(const parsed of [fromXlsx,fromCsv]){
  expect(parsed.detectedBooklets).toEqual(['A','B','C','D']);expect(parsed.warnings).toEqual([]);
  const tur=Object.fromEntries(parsed.entries.filter(e=>e.subjectId==='tur').map(e=>[e.bookletCode,[e.answers,e.bookletQuestionNumbers]]));
  expect(tur).toEqual({A:['ABC',[1,2,3]],B:['ABC',[3,1,2]],C:['ABC',[2,3,1]],D:['ABC',[1,3,2]]});
  expect(parsed.entries.find(e=>e.subjectId==='mat'&&e.bookletCode==='C')).toMatchObject({answers:'DEA',bookletQuestionNumbers:[5,6,4]});
 }
});

it('warns about a partly empty booklet column and repeated numbers',()=>{
 const t=filledTemplate();const header=t.rows[t.answerHeaderRow].map(String);
 t.rows[t.answerHeaderRow+1][header.indexOf('B Soru No')]='';t.rows[t.answerHeaderRow+5][header.indexOf('C Soru No')]=5;
 const parsed=parseAnswerKeyWorkbookRows(t.rows as any,subjects);
 expect(parsed.warnings.join(' ')).toContain('Türkçe / Kitapçık B: 1 sorunun numarası boş');
 expect(parsed.warnings.join(' ')).toContain('Matematik / Kitapçık C: soru numarası tekrar ediyor (5)');
});

function examDb(bookletCodes:string[]){
 const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'));
 db.exec(`PRAGMA foreign_keys=OFF;INSERT OR IGNORE INTO subjects(id,code,name) VALUES('tur','TUR','Türkçe'),('mat','MAT','Matematik');
 INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type,grade_level,status,sponsor_mode,created_by) VALUES('ex','CENTRAL',NULL,'2026-2027','D','STANDARD',7,'DRAFT','ADMIN_SPONSORED','admin');`);
 db.prepare(`INSERT INTO exam_subjects(exam_id,subject_id,question_count,question_start,question_end,option_count,sort_order) VALUES('ex','tur',3,1,3,5,1),('ex','mat',3,4,6,5,2)`).run();
 for(const b of bookletCodes)db.prepare(`INSERT INTO exam_booklets(exam_id,code,active) VALUES('ex',?,1)`).run(b);
 [1,2,3,4,5,6].forEach(n=>db.prepare(`INSERT INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES(?,?,?,?,?)`).run('q'+n,'ex',n<=3?'tur':'mat',n,n));
 const wrap=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...a:any[])=>wrap(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};}});
 const env:any={DB:{prepare:(s:string)=>wrap(s),batch:async(st:any[])=>st.map(s=>/^\s*(SELECT|WITH)/i.test(s.sql)?{results:db.prepare(s.sql).all(...s.args),success:true,meta:{}}:(db.prepare(s.sql).run(...s.args),{results:[],success:true,meta:{changes:1}}))}};
 const put=async(entries:any[])=>{const r=await replaceAnswerKey(new Request('https://t/api/exam-definitions/ex/answer-key',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({entries})}),env,{id:'admin',role:'SUPER_ADMIN',institution_id:null} as any,'ex');return {status:r.status,body:await r.json() as any};};
 return {db,put};
}

it('server stores each booklet\'s key at its printed positions, refuses booklets the exam does not have and out-of-range numbers',async()=>{
 const parsed=parseAnswerKeyWorkbookRows(filledTemplate().rows as any,subjects);
 const ab=examDb(['A','B']);try{
  const refused=await ab.put(parsed.entries);
  expect(refused.status).toBe(400);expect(refused.body.error.code).toBe('INVALID_BOOKLET');expect(refused.body.error.message).toContain('C, D');
  const okEntries=parsed.entries.filter((e:any)=>['A','B'].includes(e.bookletCode));
  const ok=await ab.put(okEntries);expect(ok.status,JSON.stringify(ok.body)).toBe(200);
  const rows=ab.db.prepare(`SELECT q.question_no n,k.booklet_code b,k.correct_answer a,o.printed_question_no p FROM answer_keys k JOIN exam_questions q ON q.id=k.exam_question_id JOIN exam_question_booklet_orders o ON o.exam_question_id=q.id AND o.booklet_code=k.booklet_code WHERE q.subject_id='tur' ORDER BY b,n`).all();
  expect(rows.map((r:any)=>`${r.b}${r.n}:${r.a}@${r.p}`)).toEqual(['A1:A@1','A2:B@2','A3:C@3','B1:A@3','B2:B@1','B3:C@2']);
  const bad=okEntries.map((e:any)=>e.subjectId==='mat'&&e.bookletCode==='B'?{...e,bookletQuestionNumbers:[6,4,9]}:e);
  const out=await ab.put(bad);expect(out.body.error.code).toBe('BOOKLET_QUESTION_OUT_OF_RANGE');expect(out.body.error.message).toContain('(4–6): 9');
 }finally{ab.db.close();}
});
