import {mergeFrozenOutcomes,outcomeFeedback} from './frozen-outcome-summary';
type AccuracySource='EXAM'|'QUESTION_BANK'|'MINI_TEST'|'FOY';
type SourceInput={sourceType:AccuracySource|'COMBINED_BASE';report:any};

/**
 * Merge only accuracy-like frozen evidence. Mini-game metrics stay separate and
 * are never converted into correct/wrong/blank counts.
 */
export function combineExpandedFrozenReports(sources:SourceInput[],gameActivity:any|null){
 const groups=new Map<string,any>();
 const coverage:any[]=[];const sourceTypes:string[]=[];
 for(const {sourceType,report} of sources){
  if(sourceType==='COMBINED_BASE'){
   for(const value of report?.sourceTypes||[])if(['EXAM','QUESTION_BANK','MINI_TEST'].includes(value)&&!sourceTypes.includes(value))sourceTypes.push(value);
   if(Array.isArray(report?.sourceCoverage))coverage.push(...report.sourceCoverage);
  }else{
   if(!sourceTypes.includes(sourceType))sourceTypes.push(sourceType);
   coverage.push({sourceType,coverage:report?.coverage??null,unavailableCount:(report?.unavailableExamIds||report?.unavailableRunIds||report?.unavailableTestIds||[]).length});
  }
  for(const raw of report?.groups||[]){
   const correct=Number(raw.correct||0),wrong=Number(raw.wrong||0),blank=Number(raw.blank||0),invalid=Number(raw.invalid||0);
   if(!raw.subjectId||!raw.curriculumVersionId||!raw.academicYear||!Number.isInteger(Number(raw.gradeLevel)))continue;
   const key=JSON.stringify([raw.subjectId,raw.curriculumVersionId,raw.academicYear,Number(raw.gradeLevel),raw.programVersion??null]);
   let group=groups.get(key);
   if(!group){group={subjectId:raw.subjectId,subjectName:raw.subjectName||null,curriculumVersionId:raw.curriculumVersionId,academicYear:raw.academicYear,gradeLevel:Number(raw.gradeLevel),programVersion:raw.programVersion??null,correct:0,wrong:0,blank:0,invalid:0,sourceBreakdown:[]};groups.set(key,group);}
   if(!group.subjectName&&raw.subjectName)group.subjectName=raw.subjectName;
   group.correct+=correct;group.wrong+=wrong;group.blank+=blank;group.invalid+=invalid;
   if(sourceType==='COMBINED_BASE'&&Array.isArray(raw.sourceBreakdown)){
    for(const part of raw.sourceBreakdown){if(['EXAM','QUESTION_BANK','MINI_TEST'].includes(part?.sourceType))group.sourceBreakdown.push({sourceType:part.sourceType,correct:Number(part.correct||0),wrong:Number(part.wrong||0),blank:Number(part.blank||0),evidenceCount:Number(part.evidenceCount||0)});}
   }else group.sourceBreakdown.push({sourceType,correct,wrong,blank,evidenceCount:correct+wrong+blank});
  }
 }
 const accuracyGroups=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>{const evidenceCount=g.correct+g.wrong+g.blank;return{...g,evidenceCount,accuracyPercent:evidenceCount?Math.round(g.correct/evidenceCount*10000)/100:null};});
 const outcomes=mergeFrozenOutcomes(sources);
 return{
  outcomes,
  outcomeFeedback:outcomeFeedback(outcomes),
  sourceTypes:[...sourceTypes,...(gameActivity?['MINI_GAME']:[])],
  calculationPolicy:'SELECTED_FROZEN_SOURCE_EVENT_WEIGHTED_ACCURACY_V2',
  groups:accuracyGroups,
  sourceCoverage:coverage,
  gameActivity:gameActivity?{
   policy:gameActivity.policy||'FROZEN_MINI_GAME_CONTEXT_V1',
   groups:Array.isArray(gameActivity.groups)?gameActivity.groups:[],
   coverage:gameActivity.coverage??null,
   unavailableSessionIds:Array.isArray(gameActivity.unavailableSessionIds)?gameActivity.unavailableSessionIds:[],
   message:gameActivity.message||null,
  }:null,
  officialScore:null,nationalRank:null,
  message:'Sınav, soru pratiği, yeni mini test ve föy doğruluğu soru olayı sayısıyla ağırlıklandırılır. Mini oyun puanı doğruluk hesabına katılmaz ve ayrı öğrenme etkinliği metriği olarak gösterilir.',
 };
}
