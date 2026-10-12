import {describe,it,expect} from 'vitest';
import {buildPositionAnswerKeys} from '../worker/lib/studio-position-keys';
import {compareBooklets} from '../worker/lib/booklet-review';

const original=[
 {bookletCode:'A',questionId:'q1',position:1,subjectId:'math',correctAnswer:'A',optionCount:4},
 {bookletCode:'A',questionId:'q2',position:2,subjectId:'math',correctAnswer:'B',optionCount:4},
 {bookletCode:'A',questionId:'q3',position:3,subjectId:'math',correctAnswer:'C',optionCount:4},
 {bookletCode:'B',questionId:'q3',position:1,subjectId:'math',correctAnswer:'C',optionCount:4},
 {bookletCode:'B',questionId:'q1',position:2,subjectId:'math',correctAnswer:'A',optionCount:4},
 {bookletCode:'B',questionId:'q2',position:3,subjectId:'math',correctAnswer:'B',optionCount:4},
];
const subjects=[{subject_id:'math',code:'MAT',question_count:3,wrong_divisor:3}];
function run(answers:string){
 const mapped=buildPositionAnswerKeys(original);
 if(!mapped.ok)throw Error(mapped.error);
 const keys=mapped.keys.flatMap(k=>mapped.codes.map(code=>({
  subject_id:k.subjectId,booklet_code:code,question_no:k.position,
  correct_answer:k.answers[code],accepted_answers:k.answers[code]
 })));
 return compareBooklets({answers_by_subject:{MAT:answers}} as any,mapped.codes,subjects,keys);
}
describe('studio A/B answer position -> actual optical evaluator',()=>{
 it('reads the B answer key at the physical position, not the A order',()=>{
  const result=run('CAB');
  expect(result.find(x=>x.code==='B')).toMatchObject({available:true,correct:3,wrong:0,blank:0,net:3});
  expect(result.find(x=>x.code==='A')).toMatchObject({available:true,correct:0,wrong:3,blank:0,net:-1});
 });
 it('distinguishes correct, wrong and blank for each booklet',()=>{
  const result=run('C_D');
  expect(result.find(x=>x.code==='B')).toMatchObject({available:true,correct:1,wrong:1,blank:1,net:0.6667});
  expect(result.find(x=>x.code==='A')).toMatchObject({available:true,correct:0,wrong:2,blank:1,net:-0.6667});
 });
 it('never guesses a missing B answer key',()=>{
  const mapped=buildPositionAnswerKeys(original);
  if(!mapped.ok)throw Error(mapped.error);
  const keys=mapped.keys.flatMap(k=>mapped.codes.map(code=>({subject_id:k.subjectId,booklet_code:code,question_no:k.position,correct_answer:k.answers[code]})))
   .filter(k=>!(k.booklet_code==='B'&&k.question_no===2));
  expect(compareBooklets({answers_by_subject:{MAT:'CAB'}} as any,mapped.codes,subjects,keys).find(x=>x.code==='B'))
   .toMatchObject({available:false,reason:'Cevap anahtarı eksik.'});
 });
});
