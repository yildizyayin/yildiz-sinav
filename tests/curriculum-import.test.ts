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
});
