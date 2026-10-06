import type {AuthUser,Env} from '../types';
import {all,one} from './db';
import {cohortLearningReport,reduceCohortRows} from './cohort-learning-report';
import {selectFrozenPracticeRows} from './frozen-practice-report';
import {mergeCohortPartition} from './cohort-background-aggregate';

export type CohortFrameStep={pending:any|null;completedReport:any|null;enrollmentId:string;eventCount:number;picks:any[];deleteKeys:number[]};
const sourceUrl=(s:any)=>{const u=new URL('https://internal.invalid/');for(const k of ['institutionId','academicYear','repeatPolicy','fromDate','toDate'])if(s[k])u.searchParams.set(k,s[k]);u.searchParams.set('sources',s.sources.join(','));u.searchParams.set('examIds',s.examIds.join(','));return u};
const mergePages=(a:any,b:any)=>{const r=mergeCohortPartition(a,b);for(const kind of ['groups','outcomes','gameGroups'])for(const value of r[kind])value.participatingEnrollmentCount=Math.min(1,value.participatingEnrollmentCount);return r;};
const compact=(row:any,e:any)=>({id:row.id,completed_at:row.completed_at,source_type:'QUESTION_BANK',source_id:e.questionId,status:'SCORED',metadata_json:JSON.stringify({frozenEvidence:{policy:e.policy,academicYear:e.academicYear,questionId:e.questionId,contentDigest:e.contentDigest,enrollmentId:e.enrollmentId,seasonId:e.seasonId,gradeLevel:e.gradeLevel,status:e.status,outcomeRefs:e.outcomeRefs.map((r:any)=>({verified:r.verified,outcomeId:r.outcomeId,subjectId:r.subjectId,curriculumVersionId:r.curriculumVersionId,academicYear:r.academicYear,gradeLevel:r.gradeLevel,programVersion:r.programVersion??null,outcomeCode:typeof r.outcomeCode==='string'?r.outcomeCode:null,outcomeTitle:typeof r.outcomeTitle==='string'?r.outcomeTitle:null}))}})});
function addPracticeCoverage(frame:any,count:number,coverage:any){let c=frame.localReport.sourceCoverage.find((r:any)=>r.sourceType==='QUESTION_BANK');if(!c){c={sourceType:'QUESTION_BANK',rowCount:0,excluded:{legacyRuns:0,excludedEvidence:0,repeatedAttempts:0}};frame.localReport.sourceCoverage.push(c)}c.rowCount+=count;c.excluded.legacyRuns+=coverage.legacyRuns;c.excluded.excludedEvidence+=coverage.excludedEvidence;}
function advance(frame:any,sources:string[]){frame.sourceIndex++;frame.eventCursor='';frame.phase='READ';if(frame.sourceIndex===sources.length)frame.phase='CLEAN';}

/** One bounded source page, chosen-practice page or cleanup page per queue continuation. */
export async function stepCohortEventFrame(env:Env,user:AuthUser,selection:any,job:any,previous:any|null,enrollmentId:string):Promise<CohortFrameStep>{
 const asOf=job.created_at.includes('T')?job.created_at:job.created_at.replace(' ','T')+'Z';
 let frame=previous;
 if(!frame){
  const identity=await one<any>(env.DB.prepare('SELECT e.id cohort_enrollment_id,e.class_id cohort_class_id,c.name cohort_class_name,e.grade_level cohort_grade FROM student_enrollments e JOIN institution_seasons se ON se.id=e.season_id AND se.institution_id=e.institution_id LEFT JOIN classes c ON c.id=e.class_id AND c.institution_id=e.institution_id AND c.season_id=e.season_id WHERE e.id=? AND e.institution_id=? AND se.academic_year=? AND julianday(e.created_at)<=julianday(?)').bind(enrollmentId,job.institution_id,selection.academicYear,asOf));
  if(!identity)throw new Error('REPORT_SOURCE_CHANGED');
  const response=reduceCohortRows([],[],selection.academicYear,selection.repeatPolicy,selection.sources,selection.examIds,false,selection.fromDate?{fromDate:selection.fromDate,toDate:selection.toDate}:null);
  frame={enrollmentId,identity,sourceIndex:0,eventCursor:'',phase:'READ',practiceValidAttempts:0,practicePicked:0,localReport:await response.json()};
 }
 if((frame.phase==='PICKS'&&selection.sources[frame.sourceIndex]!=='QUESTION_BANK')||(frame.phase==='CLEAN'&&frame.sourceIndex!==selection.sources.length)||typeof frame.eventCursor!=='string'||frame.enrollmentId!==enrollmentId||!Number.isInteger(frame.sourceIndex)||frame.sourceIndex<0||frame.sourceIndex>selection.sources.length||!['READ','PICKS','CLEAN'].includes(frame.phase))throw new Error('REPORT_FRAME_INVALID');
 let eventCount=0,picks:any[]=[],deleteKeys:number[]=[];
 if(frame.phase==='READ'){
  const source=selection.sources[frame.sourceIndex];if(!source)throw new Error('REPORT_FRAME_INVALID');
  const response=await cohortLearningReport(env,user,sourceUrl(selection),undefined,{enrollmentIds:[enrollmentId],asOf,sourcePage:{sourceType:source,afterId:frame.eventCursor}});
  if(!response.ok){const r=await response.json() as any;throw Object.assign(new Error(r.error?.code||'REPORT_SOURCE_RETRY'),{status:response.status});}
  const result=await response.json() as any,rows=result.sourcePage.rows;eventCount=result.sourcePage.rowCount;
  if(source==='QUESTION_BANK'){
   let accepted=rows,selected:any;
   for(;;){
    selected=selectFrozenPracticeRows(accepted,selection.academicYear,null,selection.repeatPolicy);
    picks=selected.selected.map((entry:any)=>{const row=compact(entry.row,entry.evidence);if(entry.repeatKey.length>4096||new TextEncoder().encode(JSON.stringify(row)).length>30000)throw new Error('REPORT_EVENT_TOO_LARGE');return {repeatKey:entry.repeatKey,evidenceTime:entry.evidenceTimeMillis,runId:entry.row.id,runOrder:entry.row.id.split('').map((c:string)=>c.charCodeAt(0).toString(16).padStart(4,'0')).join(''),row}});
    if(new TextEncoder().encode(JSON.stringify(picks)).length<=450000)break;
    if(accepted.length<=1)throw new Error('REPORT_EVENT_TOO_LARGE');accepted=accepted.slice(0,Math.floor(accepted.length/2));
   }
   if(accepted.length<rows.length)result.sourcePage.nextCursor=accepted[accepted.length-1].id;
   eventCount=accepted.length;frame.practiceValidAttempts+=selected.validAttemptCount;addPracticeCoverage(frame,eventCount,selected.coverage);
  }else{
   const response=reduceCohortRows([{results:rows}],[source],selection.academicYear,selection.repeatPolicy,selection.sources,selection.examIds,false,selection.fromDate?{fromDate:selection.fromDate,toDate:selection.toDate}:null);
   if(!response.ok){const r=await response.json() as any;throw Object.assign(new Error(r.error?.code||'REPORT_AGGREGATE_LIMIT'),{status:response.status});}
   frame.localReport=mergePages(frame.localReport,await response.json());
  }
  frame.eventCursor=result.sourcePage.nextCursor||'';
  if(!result.sourcePage.nextCursor){if(source==='QUESTION_BANK'){frame.phase='PICKS';frame.eventCursor='';}else advance(frame,selection.sources);}
 }else if(frame.phase==='PICKS'){
  const rows=await all<any>(env.DB.prepare('SELECT repeat_key,row_json FROM private_cohort_practice_picks WHERE job_id=? AND enrollment_id=? AND repeat_key>? ORDER BY repeat_key LIMIT 251').bind(job.id,enrollmentId,frame.eventCursor));
  const chosen:any[]=[];let bytes=0;for(const row of rows.slice(0,250)){const size=new TextEncoder().encode(row.row_json).length;if(chosen.length&&bytes+size>1024*1024)break;chosen.push(row);bytes+=size;}const raw=chosen.map(r=>({...JSON.parse(r.row_json),...frame.identity}));
  const response=reduceCohortRows([{results:raw}],['QUESTION_BANK'],selection.academicYear,selection.repeatPolicy,selection.sources,selection.examIds,false,selection.fromDate?{fromDate:selection.fromDate,toDate:selection.toDate}:null);
  if(!response.ok)throw new Error('REPORT_AGGREGATE_LIMIT');const page=await response.json() as any;page.sourceCoverage=[];
  frame.localReport=mergePages(frame.localReport,page);frame.practicePicked+=chosen.length;
  if(rows.length>chosen.length)frame.eventCursor=chosen[chosen.length-1].repeat_key;
  else{const coverage=frame.localReport.sourceCoverage.find((r:any)=>r.sourceType==='QUESTION_BANK');coverage.excluded.repeatedAttempts=frame.practiceValidAttempts-frame.practicePicked;if(coverage.excluded.repeatedAttempts<0)throw new Error('REPORT_FRAME_INVALID');advance(frame,selection.sources);}
 }else{
  const rows=await all<any>(env.DB.prepare('SELECT rowid FROM private_cohort_practice_picks WHERE job_id=? AND enrollment_id=? ORDER BY rowid LIMIT 251').bind(job.id,enrollmentId));deleteKeys=rows.slice(0,250).map(r=>r.rowid);
  if(rows.length<=250)return {pending:null,completedReport:frame.localReport,enrollmentId,eventCount,picks,deleteKeys};
 }
 if(new TextEncoder().encode(JSON.stringify(frame)).length>450000)throw new Error('REPORT_AGGREGATE_LIMIT');
 return {pending:frame,completedReport:null,enrollmentId,eventCount,picks,deleteKeys};
}
