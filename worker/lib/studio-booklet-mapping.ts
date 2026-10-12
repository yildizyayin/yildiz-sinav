/**
 * Guard booklet permutations before an exam can be published.
 * Each booklet must contain the exact same question IDs, once each.
 * Only ordering may differ. Prevents silent A/B answer-key corruption.
 */
export type StudioBookletItem={bookletCode:string;questionId:string;position:number;subjectId:string;correctAnswer:string};
export function validateBookletPermutation(items:readonly StudioBookletItem[]):{ok:boolean;codes:string[];errors:string[]}{
 const errors:string[]=[];
 const grouped=new Map<string,StudioBookletItem[]>();
 for(const item of items){
  if(!['A','B','C','D'].includes(item.bookletCode)||!item.questionId||!item.subjectId||!Number.isSafeInteger(item.position)||item.position<1||!['A','B','C','D','E'].includes(item.correctAnswer))errors.push('INVALID_BOOKLET_ITEM');
  grouped.set(item.bookletCode,[...(grouped.get(item.bookletCode)||[]),item]);
 }
 const codes=[...grouped.keys()].sort();
 if(!codes.includes('A'))errors.push('BOOKLET_A_REQUIRED');
 const master=grouped.get('A')||[];
 const canonical=new Map(master.map(i=>[i.questionId,JSON.stringify([i.subjectId,i.correctAnswer])]));
 for(const [code,booklet] of grouped){
  const ids=new Set(booklet.map(i=>i.questionId)),positions=new Set(booklet.map(i=>i.position));
  if(ids.size!==booklet.length||positions.size!==booklet.length)errors.push('DUPLICATE_QUESTION_OR_POSITION');
  if(booklet.some(i=>i.position>booklet.length)||positions.size!==booklet.length)errors.push('NONCONTIGUOUS_POSITIONS');
  if(booklet.length!==master.length||booklet.some(i=>!canonical.has(i.questionId)||canonical.get(i.questionId)!==JSON.stringify([i.subjectId,i.correctAnswer])))errors.push('BOOKLET_CONTENT_MISMATCH');
  if(code!=='A'&&booklet.length===0)errors.push('EMPTY_BOOKLET');
 }
 if(items.length===0)errors.push('NO_BOOKLET_ITEMS');
 return {ok:errors.length===0,codes,errors:[...new Set(errors)]};
}
