/**
 * Recommended MCQ choice counts for ANUNEX creation UI. Not a legal mandate:
 * the publishing workflow must preserve the actual validated question format.
 * Legacy D1 question/exam CHECK constraints currently permit only 4/5.
 */
export function recommendedOptionCount(grade:number, examType?:string):3|4|5|null{
 const type=String(examType||'').toUpperCase();
 if(['TYT','AYT','YDT','YKS'].includes(type))return 5;
 if(type==='LGS')return 4;
 if(!Number.isInteger(grade)||grade<1||grade>12)return null;
 if(grade<=3)return 3;
 if(grade<=8)return 4;
 return 5;
}
export function validateAnswerForOptions(optionCount:number,answer:string):boolean{
 return [3,4,5].includes(optionCount)&&/^[A-E]$/.test(answer)&&answer.charCodeAt(0)-64<=optionCount;
}
