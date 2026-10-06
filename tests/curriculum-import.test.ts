import { describe, expect, it } from 'vitest';
import { parseCurriculumCsv, validateCurriculumImportMetadata } from '../worker/lib/curriculum-import';

describe('official curriculum import',()=>{
 it('parses semicolon-delimited MEB-style normalized CSV without inventing fields',()=>{
  const text='subject_code;grade_level;outcome_code;topic;subtopic;title\nMAT;7;MAT.7.1;Sayılar;Tam Sayılar;Tam sayılarla işlemleri uygular.\nTUR;7;TUR.7.1;Anlam;;Metindeki ana düşünceyi belirler.';
  const r=parseCurriculumCsv(text,'SCHOOL',7);
  expect(r.errors).toEqual([]);
  expect(r.rows).toHaveLength(2);
  expect(r.rows[0].subjectCode).toBe('MAT');
  expect(r.rows[0].gradeLevel).toBe(7);
  expect(r.rows[0].title).toContain('Tam sayılar');
 });

 it('rejects school rows that do not match the selected grade',()=>{
  const text='subject_code,grade_level,title\nMAT,8,Sayılarla işlem yapar.';
  const r=parseCurriculumCsv(text,'SCHOOL',7);
  expect(r.rows[0].issues.some(x=>x.includes('eşleşmiyor'))).toBe(true);
 });

 it('flags duplicate outcome rows instead of silently merging them',()=>{
  const text='subject_code,grade_level,outcome_code,title\nMAT,7,MAT.1,Aynı çıktı\nMAT,7,MAT.1,Aynı çıktı';
  const r=parseCurriculumCsv(text,'SCHOOL',7);
  expect(r.rows[1].issues.some(x=>x.includes('birden fazla'))).toBe(true);
 });

 it('requires official metadata and HTTPS source URL',()=>{
  const bad=validateCurriculumImportMetadata({academicYear:'2026-2027',programCode:'SCHOOL',gradeLevel:7,programVersion:'v1',authority:'MEB',sourceUrl:'http://example.com',sourceTitle:'Kaynak'});
  expect(bad.valid).toBe(false);
  const good=validateCurriculumImportMetadata({academicYear:'2026-2027',programCode:'SCHOOL',gradeLevel:7,programVersion:'v1',authority:'MEB',sourceUrl:'https://tymm.meb.gov.tr/file.csv',sourceTitle:'Resmî Program'});
  expect(good.valid).toBe(true);
 });

 it('keeps TYT/AYT grade null',()=>{
  const text='subject_code,outcome_code,title\nMAT,TYT.MAT.1,Temel matematik kapsamı';
  const r=parseCurriculumCsv(text,'TYT',null);
  expect(r.rows[0].gradeLevel).toBeNull();
 });

 it('preserves unit/topic hierarchy and accepts non-outcome nodes without codes',()=>{
  const text='subject_code,grade_level,node_type,parent_code,unit,topic,subtopic,outcome_code,title\nMAT,7,UNIT,,Sayılar,,,,Sayılar ünitesi\nMAT,7,TOPIC,,Sayılar,,,,Tam sayılar\nMAT,7,SUB_OUTCOME,,Sayılar,Tam sayılar,İşlemler,MAT.7.1.1,Tam sayılarla işlem yapar.';
  const r=parseCurriculumCsv(text,'SCHOOL',7);
  expect(r.errors).toEqual([]);
  expect(r.rows).toHaveLength(3);
  expect(r.rows[0]).toMatchObject({nodeType:'UNIT',unit:'Sayılar',outcomeCode:null});
  expect(r.rows[1]).toMatchObject({nodeType:'TOPIC',parentCode:null});
  expect(r.rows[2]).toMatchObject({nodeType:'SUB_OUTCOME',parentCode:null,outcomeCode:'MAT.7.1.1'});
  expect(r.rows.every(row=>row.issues.length===0)).toBe(true);
 });
 it('preserves multiline quoted fields and physical row numbers',()=>{
  const r=parseCurriculumCsv('subject_code;outcome_code;title\nMAT;M1;"İlk; satır\nİkinci ""alıntı"""\nMAT;M2;Son','TYT',null);
  expect(r.errors).toEqual([]);expect(r.rows[0].title).toBe('İlk; satır\nİkinci "alıntı"');expect(r.rows[1].rowNo).toBe(4);expect(r.rows.every(x=>!x.issues.length)).toBe(true);
 });
 it('rejects malformed structure and unknown optional headers',()=>{
  expect(parseCurriculumCsv('subject_code,outcome_code,title\nMAT,M1,"a','TYT',null).errors.length).toBeGreaterThan(0);
  expect(parseCurriculumCsv('subject_code,outcome_code,title,sub_topic\nMAT,M1,a,b','TYT',null).errors.length).toBeGreaterThan(0);
  const r=parseCurriculumCsv('subject_code,outcome_code,title,node_type\nMAT,M1,a,NOT_OUTCOME','TYT',null);expect(r.rows[0].issues.length).toBeGreaterThan(0);
 });
 it('rejects missing parents and cycles while accepting forward parent references',()=>{
  const head='subject_code,outcome_code,title,parent_code\n';
  const good=parseCurriculumCsv(head+'MAT,child,Çocuk,parent\nMAT,parent,Üst,','TYT',null);expect(good.rows.every(x=>!x.issues.length)).toBe(true);
  expect(parseCurriculumCsv(head+'MAT,child,Çocuk,missing','TYT',null).rows[0].issues.length).toBeGreaterThan(0);
  const cycle=parseCurriculumCsv(head+'MAT,a,A,b\nMAT,b,B,a','TYT',null);expect(cycle.rows.every(x=>x.issues.some(i=>i.includes('döngü')))).toBe(true);
 });

});
