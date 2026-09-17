import { describe, expect, it } from 'vitest';
import { matchParticipant } from '../worker/lib/matching';
import type { CanonicalRecord, MatchCandidate } from '../worker/types';

const base: CanonicalRecord = { row_no:1,student_number:'1001',name:'Ahmet Yılmaz',grade_level:7,section:'A',booklet:'A',answers_by_subject:{MAT:'ABCDE'},source_type:'TXT',confidence:1,issues:[] };
const candidates: MatchCandidate[] = [
 {student_id:'a',status:'ACTIVE',normalized_name:'ahmet yilmaz',student_number:'1001',grade_level:7,section:'A'},
 {student_id:'g',status:'GUEST',normalized_name:'mehmet kaya',student_number:'2001',grade_level:7,section:'A'},
];

describe('guest/active matching',()=>{
 it('matches active by institution-season candidate and student number',()=>expect(matchParticipant(base,candidates).status).toBe('ACTIVE_MATCH'));
 it('reuses an existing guest instead of creating duplicates',()=>expect(matchParticipant({...base,student_number:'2001',name:'Mehmet Kaya'},candidates)).toMatchObject({status:'GUEST_MATCH',student_id:'g'}));
 it('creates a new guest when no safe match exists',()=>expect(matchParticipant({...base,student_number:'2999',name:'Yeni Öğrenci'},candidates).status).toBe('NEW_GUEST'));
 it('does not guess when duplicate names exist',()=>{
  const dup=[...candidates,{student_id:'x',status:'ACTIVE' as const,normalized_name:'ali demir',student_number:null,grade_level:7,section:'A'},{student_id:'y',status:'GUEST' as const,normalized_name:'ali demir',student_number:null,grade_level:7,section:'A'}];
  expect(matchParticipant({...base,student_number:undefined,name:'Ali Demir'},dup).status).toBe('AMBIGUOUS');
 });
});
