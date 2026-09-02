import { describe, expect, it } from 'vitest';
import { decodeUploadedBytes, normalizeAnswerSequence, parseUploadedText, parseWithTemplate } from '../worker/lib/parse';

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

describe('Sekonic FMT/DAT formats',()=>{
 it('parses Optik 7108 without shifting blank answers',()=>{
  const parser={type:'fixed-width',recordLength:171,signature:'7108',fields:{student_number:{start:10,end:15},name:{start:15,end:35},class:{start:35,end:37},booklet:{start:50,end:51}},answers:{TUR:{start:51,end:71},SOS:{start:71,end:91},DIN:{start:91,end:111},ING:{start:111,end:131},MAT:{start:131,end:151},FEN:{start:151,end:171}}};
  const header='7108'+' '.repeat(6)+'8001'.padStart(5)+'ARAS      '+'BULUT     '+'8A'+' '.repeat(13)+'A';
  const blocks=['ABCD ABCD ABCD ABCD ','A'.repeat(20),'B'.repeat(20),'C'.repeat(20),'D'.repeat(20),'ABCD'.repeat(5)];
  const result=parseWithTemplate(header+blocks.join(''),'7108.dat',{id:'7108',name:'Optik 7108 Sekonic',parser_definition:JSON.stringify(parser)});
  expect(result.records[0]).toMatchObject({student_number:'8001',name:'ARAS      BULUT',grade_level:8,section:'A',booklet:'A'});
  expect(result.records[0].answers_by_subject.TUR).toBe('ABCD_ABCD_ABCD_ABCD_');
  expect(result.records[0].answers_by_subject.FEN).toHaveLength(20);
 });

 it('parses Optik 129 TYT subject blocks and Windows-1254 names',()=>{
  const parser={type:'fixed-width',recordLength:222,fields:{student_number:{start:11,end:16},name:{start:16,end:36},class:{start:48,end:51},booklet:{start:55,end:56}},answers:{TYT_TUR:{start:56,end:96},TYT_SOS:{start:96,end:142},TYT_MAT:{start:142,end:182},TYT_FEN:{start:182,end:222}}};
  const header=' '.repeat(3)+'12345678'+'12001'+'ÇAĞRI ÖZTÜRK'.padEnd(20)+' '.repeat(12)+'12A'+' '.repeat(4)+'B';
  const line=header+'A'.repeat(40)+'B'.repeat(46)+'C'.repeat(40)+'D'.repeat(40);
  const result=parseWithTemplate(line,'129.dat',{id:'129',name:'Optik 129 Sekonic',parser_definition:JSON.stringify(parser)});
  expect(result.records[0]).toMatchObject({student_number:'12001',name:'ÇAĞRI ÖZTÜRK',grade_level:12,section:'A',booklet:'B'});
  expect(result.records[0].answers_by_subject.TYT_SOS).toHaveLength(46);
  const encoded=Uint8Array.from([0xc7,0x41,0xd0,0x52,0x49]).buffer;
  expect(decodeUploadedBytes(encoded)).toBe('ÇAĞRI');
 });
});
