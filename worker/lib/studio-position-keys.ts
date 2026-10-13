import {validateAnswerForOptions} from './question-option-policy';
/** Map A/B answer keys by physical position, not by the original question identity. */
export type BookletRow={bookletCode:string;questionId:string;position:number;subjectId:string;correctAnswer:string;optionCount?:number};
export type PositionKey={position:number;subjectId:string;answers:Record<string,string>};
export function buildPositionAnswerKeys(items:readonly BookletRow[]):{ok:true;codes:string[];keys:PositionKey[]}|{ok:false;error:string}{
 const codes=[...new Set(items.map(i=>i.bookletCode))].sort();
 if(!codes.includes('A')||codes.some(c=>!['A','B','C','D'].includes(c)))return {ok:false,error:'BOOKLET_CODES_INVALID'};
 const groups=new Map(codes.map(c=>[c,items.filter(i=>i.bookletCode===c).sort((a,b)=>a.position-b.position)]));
 const main=groups.get('A')!;
 if(!main.length||main.some((q,i)=>q.position!==i+1))return {ok:false,error:'BOOKLET_POSITION_INVALID'};
 const master=new Map(main.map(q=>[q.questionId,q.subjectId+'|'+q.correctAnswer]));
 if(main.some(q=>q.optionCount!==undefined&&!validateAnswerForOptions(q.optionCount,q.correctAnswer)))return {ok:false,error:'BOOKLET_INVALID_ANSWER_FOR_OPTION_COUNT'};
 if(master.size!==main.length)return {ok:false,error:'BOOKLET_DUPLICATE_QUESTION'};
 for(const c of codes){
  const rows=groups.get(c)!;
  if(rows.length!==main.length||new Set(rows.map(q=>q.questionId)).size!==main.length)return {ok:false,error:'BOOKLET_QUESTION_SET_MISMATCH'};
  for(let i=0;i<rows.length;i++){
   const q=rows[i];
   if(q.position!==i+1||master.get(q.questionId)!==q.subjectId+'|'+q.correctAnswer)return {ok:false,error:'BOOKLET_QUESTION_SET_MISMATCH'};
   if(q.optionCount===4&&q.correctAnswer==='E')return {ok:false,error:'BOOKLET_INVALID_ANSWER_FOR_OPTION_COUNT'};
   if(q.subjectId!==main[i].subjectId)return {ok:false,error:'BOOKLET_SUBJECT_POSITION_MISMATCH'};
   if(q.optionCount!==undefined&&main[i].optionCount!==undefined&&q.optionCount!==main[i].optionCount)return {ok:false,error:'BOOKLET_OPTION_COUNT_MISMATCH'};
  }
 }
 return {ok:true,codes,keys:main.map((q,i)=>({position:q.position,subjectId:q.subjectId,answers:Object.fromEntries(codes.map(c=>[c,groups.get(c)![i].correctAnswer]))}))};
}

/** Existing question_outcomes is keyed only by exam_question_id (A position).
 * Reordered booklets must not be released as outcome-accurate until their
 * per-booklet outcome identity can be persisted and consumed by reports. */
export function canPublishOutcomeAccurateBooklets(items:readonly BookletRow[]):boolean {
 const a=items.filter(x=>x.bookletCode==='A');
 if(!a.length||new Set(a.map(x=>x.position)).size!==a.length)return false;
 const positions=new Map(a.map(x=>[x.position,x.questionId]));
 const codes=new Set(items.map(x=>x.bookletCode));
 return [...codes].every(code=>{
  const subset=items.filter(x=>x.bookletCode===code);
  return subset.length===a.length&&subset.every(x=>positions.get(x.position)===x.questionId);
 });
}
