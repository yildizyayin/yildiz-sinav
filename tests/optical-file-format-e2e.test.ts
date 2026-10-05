import {expect,it} from 'vitest';
import {parseFmtText} from '../worker/lib/fmt';
import {decodeUploadedBytes,parseUploadedText,parseWithTemplate} from '../worker/lib/parse';

function definition(){
 const raw={recordLength:52,indexBase:0,fields:{student_number:{start:0,length:5},name:{start:5,length:20},class:{start:25,length:3},booklet:{start:28,length:1},tckn:{start:29,length:11}},answers:{MAT:{start:40,length:6,questionCount:6},TUR:{start:46,length:6,questionCount:6}}};
 const parsed=parseFmtText(JSON.stringify(raw),'school.fmt');expect(parsed.ok).toBe(true);return parsed.definition!;
}
function record(){return '01234'+'AYSE YILMAZ'.padEnd(20)+'7A '.padEnd(3)+'B'+'12345678901'+'A B-CD'+'ABCDE_';}

it('parses one FMT definition into TXT and DAT fixed-width records without shifting internal blanks',()=>{
 const def=definition();const template={id:'opt-test',name:'Optik Test',parser_definition:JSON.stringify(def)};
 for(const fileName of ['scan.txt','scan.dat']){
  const parsed=parseWithTemplate(record(),fileName,template);expect(parsed.ambiguous).toBe(false);expect(parsed.records).toHaveLength(1);
  expect(parsed.records[0]).toMatchObject({student_number:'01234',name:'AYSE YILMAZ',grade_level:7,section:'A',booklet:'B',tckn:'12345678901',source_type:fileName.endsWith('.dat')?'DAT':'TXT'});
  expect(parsed.records[0].answers_by_subject.MAT).toBe('A_B_CD');expect(parsed.records[0].answers_by_subject.TUR).toBe('ABCDE_');
 }
});

it('auto-selects the only compatible FMT template and refuses ambiguous fixed-width definitions',()=>{
 const def=definition(),text=record();
 const one=parseUploadedText(text,'scan.dat',[{id:'a',name:'A',parser_definition:JSON.stringify(def)}]);expect(one.templateId).toBe('a');expect(one.confidence).toBeGreaterThan(0.9);
 const ambiguous=parseUploadedText(text,'scan.dat',[{id:'a',name:'A',parser_definition:JSON.stringify(def)},{id:'b',name:'B',parser_definition:JSON.stringify(def)}]);expect(ambiguous.ambiguous).toBe(true);expect(ambiguous.records).toEqual([]);
});

it('keeps delimited TXT/DAT A-B booklet and answer positions canonical',()=>{
 const text='student_number;name;class;booklet;answers_MAT\n42;Ali Kaya;8/B;A;AB- D0';
 for(const fileName of ['export.txt','export.dat']){
  const parsed=parseUploadedText(text,fileName,[]);expect(parsed.records[0]).toMatchObject({student_number:'42',name:'Ali Kaya',grade_level:8,section:'B',booklet:'A'});expect(parsed.records[0].answers_by_subject.MAT).toBe('AB__D_');
 }
});

it('falls back from invalid UTF-8 to Windows-1254 for legacy DAT bytes',()=>{
 const bytes=Uint8Array.from([0xde,0x65,0x6b,0x65,0x72]).buffer; // Şeker in Windows-1254
 expect(decodeUploadedBytes(bytes)).toBe('Şeker');
});
