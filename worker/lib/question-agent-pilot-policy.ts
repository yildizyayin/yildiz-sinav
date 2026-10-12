/** Policy for controlled agent pilot. Pure guard, not an agent scheduler. */
export type QuestionAgentPilotContext = {
 gradeLevel: number;
 academicYear: string;
 curriculumVerified: boolean;
 outcomeActive: boolean;
 questionCount: number;
 generationEnabled: boolean;
 budgetRemaining: number;
 reviewQueueAvailable: boolean;
};
const ALLOWED_GRADES = new Set([5,6,7,9,10,11]);
export function checkQuestionAgentPilot(c:QuestionAgentPilotContext):{ok:boolean;reasons:string[]} {
 const reasons:string[]=[];
 if(!ALLOWED_GRADES.has(c.gradeLevel))reasons.push('GRADE_OUTSIDE_APPROVED_SCOPE');
 if(!/^\\d{4}-\\d{4}$/.test(c.academicYear) ||
   Number(c.academicYear.slice(5))!==Number(c.academicYear.slice(0,4))+1)
   reasons.push('INVALID_ACADEMIC_YEAR');
 if(!c.curriculumVerified || !c.outcomeActive)reasons.push('OFFICIAL_OUTCOME_REQUIRED');
 if(!Number.isInteger(c.questionCount)||c.questionCount<1||c.questionCount>10)
   reasons.push('BATCH_SIZE_OUT_OF_RANGE');
 if(!c.generationEnabled)reasons.push('PRODUCTION_DISABLED');
 if(!Number.isFinite(c.budgetRemaining)||c.budgetRemaining<=0)reasons.push('BUDGET_EXHAUSTED');
 if(!c.reviewQueueAvailable)reasons.push('REVIEW_CAPACITY_REQUIRED');
 return {ok:reasons.length===0,reasons};
}
