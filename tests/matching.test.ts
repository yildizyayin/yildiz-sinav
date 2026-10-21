import { describe, expect, it } from 'vitest';
import { matchParticipant } from '../worker/lib/matching';
import type { CanonicalRecord, MatchCandidate } from '../worker/types';

const base: CanonicalRecord = { row_no:1,student_number:'1001',name:'Ahmet Yılmaz',grade_level:7,section:'A',booklet:'A',answers_by_subject:{MAT:'ABCDE'},source_type:'TXT',confidence:1,issues:[] };
const candidates: MatchCandidate[] = [
 {student_id:'a',status:'ACTIVE',normalized_name:'ahmet yilmaz',tckn:'10000000001',student_number:'1001',grade_level:7,section:'A'},
 {student_id:'g',status:'GUEST',normalized_name:'mehmet kaya',tckn:null,student_number:'2001',grade_level:7,section:'A'},
];

describe('guest/active matching',()=>{
 it('matches active by institution-season candidate and student number',()=>expect(matchParticipant(base,candidates).status).toBe('ACTIVE_MATCH'));
 it('uses T.C. identity before student number and name',()=>expect(matchParticipant({...base,tckn:'10000000001',student_number:'9999',name:'Farklı İsim'},candidates)).toMatchObject({status:'ACTIVE_MATCH',student_id:'a'}));
 it('can match by T.C. identity when the name field is blank',()=>expect(matchParticipant({...base,tckn:'10000000001',student_number:undefined,name:''},candidates)).toMatchObject({status:'ACTIVE_MATCH',student_id:'a'}));
 it('matches a unique student number without a name',()=>expect(matchParticipant({...base,tckn:undefined,name:''},candidates)).toMatchObject({status:'ACTIVE_MATCH',student_id:'a',issues:[]}));
 it('matches by name and class when identifiers are absent',()=>expect(matchParticipant({...base,tckn:undefined,student_number:undefined},candidates)).toMatchObject({status:'ACTIVE_MATCH',student_id:'a'}));
 it('reuses an existing guest instead of creating duplicates',()=>expect(matchParticipant({...base,student_number:'2001',name:'Mehmet Kaya'},candidates)).toMatchObject({status:'GUEST_MATCH',student_id:'g'}));
 it('creates a new guest when no safe match exists',()=>expect(matchParticipant({...base,student_number:'2999',name:'Yeni Öğrenci'},candidates).status).toBe('NEW_GUEST'));
 it('does not guess when duplicate names exist',()=>{
  const dup=[...candidates,{student_id:'x',status:'ACTIVE' as const,normalized_name:'ali demir',tckn:null,student_number:null,grade_level:7,section:'A'},{student_id:'y',status:'GUEST' as const,normalized_name:'ali demir',tckn:null,student_number:null,grade_level:7,section:'A'}];
  expect(matchParticipant({...base,student_number:undefined,name:'Ali Demir'},dup).status).toBe('AMBIGUOUS');
 });
 it('keeps the 55 registered and 15 unregistered review counts distinct',()=>{
  const registered=Array.from({length:55},(_,i)=>({
   student_id:`student-${i}`,status:'ACTIVE' as const,normalized_name:`ogrenci ${i}`,tckn:null,student_number:String(1000+i),grade_level:12,section:'A',
  }));
  const rows=[...registered.map((candidate)=>({...base,student_number:candidate.student_number,name:candidate.normalized_name})),...Array.from({length:15},(_,i)=>({...base,student_number:`guest-${i}`,name:`Yeni Öğrenci ${i}`}))];
  const statuses=rows.map((row)=>matchParticipant(row,registered).status);
  expect(statuses.filter((status)=>status==='ACTIVE_MATCH')).toHaveLength(55);
  expect(statuses.filter((status)=>status==='NEW_GUEST')).toHaveLength(15);
 });
});

import { isValidTckn } from '../worker/lib/matching';
// Builds a checksum-valid T.C. number from 9 leading digits (test data only).
const tc = (nine: string) => { const d = [...nine].map(Number); const d10 = (((d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7])) % 10 + 10) % 10; const d11 = (d.reduce((a,b)=>a+b,0) + d10) % 10; return nine + d10 + d11; };
describe('A026: never attach a sheet to the wrong child',()=>{
 const A = tc('123456789'), B = tc('987654321');
 const regs: MatchCandidate[] = [
  {student_id:'ali',status:'ACTIVE',normalized_name:'ali gultekin',tckn:A,student_number:'101',grade_level:12,section:'A'},
  {student_id:'ayse',status:'ACTIVE',normalized_name:'ayse sahin',tckn:B,student_number:'102',grade_level:12,section:'A'},
 ];
 const row = (x: Partial<CanonicalRecord>): CanonicalRecord => ({...base,grade_level:12,section:'A',...x});
 it('recognises real T.C. numbers and not phone numbers in the TC/TEL field',()=>{
  expect(isValidTckn(A)).toBe(true);expect(isValidTckn(B)).toBe(true);
  expect(isValidTckn('532123456789')).toBe(false);expect(isValidTckn(A.slice(0,10)+String((Number(A[10])+1)%10))).toBe(false);expect(isValidTckn('01234567890')).toBe(false);
 });
 it('order: T.C. first, then school number, then name',()=>{
  expect(matchParticipant(row({tckn:B,student_number:'101',name:'Ali Gültekin'}),regs)).toMatchObject({student_id:'ayse'});
  expect(matchParticipant(row({tckn:undefined,student_number:'102',name:'Ayşe Şahin'}),regs)).toMatchObject({student_id:'ayse',issues:[]});
  expect(matchParticipant(row({tckn:undefined,student_number:undefined,name:'Ayşe Şahin'}),regs)).toMatchObject({student_id:'ayse'});
 });
 it('a school number whose owner has a different valid T.C. number is not linked silently',()=>{
  const r = matchParticipant(row({tckn:tc('555555555'),student_number:'101',name:'Ali Gültekin'}),regs);
  expect(r.status).toBe('AMBIGUOUS');expect(r.student_id).toBeUndefined();expect(r.issues[0]).toContain('T.C. kimlik numarası o öğrenciye ait değil');
  // a phone number in the TC/TEL field does not block the school-number match
  expect(matchParticipant(row({tckn:'5321234567',student_number:'101',name:'Ali Gültekin'}),regs)).toMatchObject({status:'ACTIVE_MATCH',student_id:'ali'});
 });
 it('names whose Turkish letters were lost (U+FFFD) still find the one registered student, for review; two fits stay ambiguous',()=>{
  const lost = 'AL� G�LTEK�N';
  const r = matchParticipant(row({tckn:undefined,student_number:undefined,name:lost}),regs);
  expect(r).toMatchObject({status:'ACTIVE_MATCH',student_id:'ali'});expect(r.issues[0]).toContain('harfler kaybolmuş');
  expect(matchParticipant(row({tckn:undefined,student_number:'101',name:lost}),regs)).toMatchObject({student_id:'ali',issues:[]});
  const twins = [...regs,{student_id:'alp',status:'ACTIVE' as const,normalized_name:'alp gultekin',tckn:null,student_number:null,grade_level:12,section:'A'}];
  expect(matchParticipant(row({tckn:undefined,student_number:undefined,name:'AL� G�LTEK�N'}),twins).status).toBe('AMBIGUOUS');
  // a lost letter stands for one letter, never for a space or a missing word
  expect(matchParticipant(row({tckn:undefined,student_number:undefined,name:'AL�GULTEKIN'}),regs).status).toBe('NEW_GUEST');
 });
});
