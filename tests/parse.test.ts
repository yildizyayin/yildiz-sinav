import { describe, expect, it } from 'vitest';
import { normalizeAnswerSequence, parseUploadedText, parseWithTemplate } from '../worker/lib/parse';

describe('TXT/DAT/CSV parser detection',()=>{
 it('auto detects a generic delimited optical export',()=>{const text='student_number,name,class,booklet,answers_MAT,answers_TUR\n1001,Ahmet Yılmaz,7/A,A,ABCDE,EDCBA';const r=parseUploadedText(text,'sample.csv',[]);expect(r.confidence).toBeGreaterThan(.9);expect(r.records[0].answers_by_subject.MAT).toBe('ABCDE')});
 it('never fakes success for unknown format',()=>{const r=parseUploadedText('RANDOM UNKNOWN BINARYISH TEXT','unknown.dat',[]);expect(r.records).toHaveLength(0);expect(r.issues[0]).toMatch(/belirlenemedi/i)});

 it('preserves internal blanks instead of shifting later questions',()=>{
  const n=normalizeAnswerSequence('AB DE');
  expect(n.sequence).toBe('AB_DE');
  expect(n.sequence).toHaveLength(5);
 });

 it('preserves leading and trailing blank positions in a delimited answer field',()=>{
  const text='student_number,name,class,booklet,answers_MAT\n1001,Ahmet Yılmaz,7/A,A," ABCD "';
  const r=parseUploadedText(text,'sample.csv',[]);
  expect(r.records[0].answers_by_subject.MAT).toBe('_ABCD_');
  expect(r.records[0].answers_by_subject.MAT).toHaveLength(6);
 });

 it('preserves fixed-width blank positions using raw answer slices',()=>{
  const parser={type:'fixed-width',recordLength:20,fields:{student_number:{start:0,end:2},name:{start:2,end:8},class:{start:8,end:11},booklet:{start:11,end:12}},answers:{MAT:{start:12,end:20}}};
  const line='01AHMET 7/AAAB CD E ';
  expect(line).toHaveLength(20);
  const r=parseWithTemplate(line,'sample.dat',{id:'t1',name:'Test',parser_definition:JSON.stringify(parser)});
  expect(r.records[0].answers_by_subject.MAT).toBe('AB_CD_E_');
  expect(r.records[0].answers_by_subject.MAT).toHaveLength(8);
 });

 it('marks unsupported answer characters as positional blanks and reports them',()=>{
  const n=normalizeAnswerSequence('ABXDE');
  expect(n.sequence).toBe('AB_DE');
  expect(n.invalidPositions).toEqual([3]);
 });
});
