// Inputs are the authorized source reducers' summaries, never client metrics.
export function combineFrozenReports(sources:{sourceType:'EXAM'|'QUESTION_BANK'|'MINI_TEST';report:any}[]){
 const groups=new Map<string,any>();
 for(const {sourceType,report} of sources)for(const g of report.groups||[]){
  const key=JSON.stringify([g.subjectId,g.curriculumVersionId,g.academicYear,g.gradeLevel,g.programVersion??null]);
  let group=groups.get(key);
  if(!group){group={subjectId:g.subjectId,subjectName:g.subjectName||null,curriculumVersionId:g.curriculumVersionId,academicYear:g.academicYear,gradeLevel:g.gradeLevel,programVersion:g.programVersion??null,correct:0,wrong:0,blank:0,invalid:0,sourceBreakdown:[]};groups.set(key,group);}
  if(!group.subjectName&&g.subjectName)group.subjectName=g.subjectName;
  group.correct+=g.correct;group.wrong+=g.wrong;group.blank+=g.blank;group.invalid+=g.invalid||0;
  group.sourceBreakdown.push({sourceType,correct:g.correct,wrong:g.wrong,blank:g.blank,evidenceCount:g.evidenceCount});
 }
 return {sourceTypes:sources.map(s=>s.sourceType),calculationPolicy:'SELECTED_FROZEN_SOURCE_EVENT_WEIGHTED_ACCURACY_V1',groups:[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>{const evidenceCount=g.correct+g.wrong+g.blank;return {...g,evidenceCount,accuracyPercent:evidenceCount?Math.round(g.correct/evidenceCount*10000)/100:null};}),officialScore:null,nationalRank:null};
}
