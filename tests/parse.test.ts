import { describe, expect, it } from 'vitest';
import { parseUploadedText } from '../worker/lib/parse';

describe('TXT/DAT/CSV parser detection',()=>{
 it('auto detects a generic delimited optical export',()=>{const text='student_number,name,class,booklet,answers_MAT,answers_TUR\n1001,Ahmet Yılmaz,7/A,A,ABCDE,EDCBA';const r=parseUploadedText(text,'sample.csv',[]);expect(r.confidence).toBeGreaterThan(.9);expect(r.records[0].answers_by_subject.MAT).toBe('ABCDE')});
 it('never fakes success for unknown format',()=>{const r=parseUploadedText('RANDOM UNKNOWN BINARYISH TEXT','unknown.dat',[]);expect(r.records).toHaveLength(0);expect(r.issues[0]).toMatch(/belirlenemedi/i)});
});
