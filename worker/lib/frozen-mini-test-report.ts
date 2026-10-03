import {frozenExamReport} from './frozen-exam-report';

export function frozenMiniTestReport(rows:any[],academicYear:string,subjectIds:string[]|null){
 const snapshots:any[]=[];let legacyTests=0;
 for(const row of rows){
  let meta:any;try{meta=JSON.parse(row.metadata_json);}catch{if(!subjectIds)legacyTests++;continue;}
  const proof=meta?.miniEvidence;
  if(row.source_type!=='MINI_TEST'||row.source_id!==row.id||row.status!=='SCORED'||meta.selectionMode!=='NEW'||meta.practiceOnly!==false||proof?.policy!=='MINI_TEST_CONTENT_AT_START_V1'||typeof proof.enrollmentId!=='string'||!proof.enrollmentId||typeof proof.seasonId!=='string'||!proof.seasonId||!Number.isInteger(proof.gradeLevel)||proof.gradeLevel<1||proof.gradeLevel>12||!Array.isArray(proof.questionEvidence)||!proof.questionEvidence.length||proof.questionEvidence.some((q:any)=>!['CORRECT','WRONG','BLANK'].includes(q?.status)||!Array.isArray(q?.outcomeRefs)||q.outcomeRefs.some((r:any)=>typeof r?.outcomeId!=='string'||!r.outcomeId||(r.programVersion!=null&&typeof r.programVersion!=='string')))){if(!subjectIds)legacyTests++;continue;}
  if(proof.academicYear!==academicYear)continue;
  snapshots.push({exam_id:row.id,academic_year:proof.academicYear,grade_level:proof.gradeLevel,payload_json:JSON.stringify({schemaVersion:1,questionEvidencePolicy:'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',questionEvidence:proof.questionEvidence})});
 }
 const reduced=frozenExamReport(snapshots,subjectIds);
 return {sourceTypes:['MINI_TEST'],calculationPolicy:'SELECTED_FROZEN_MINI_TEST_QUESTION_ACCURACY_V1',groups:reduced.groups.map(({examCount,...group}:any)=>({...group,testCount:examCount})),coverage:subjectIds?null:{legacyTests,excludedEvidence:reduced.coverage?.excludedEvidence||0},officialScore:null,nationalRank:null};
}
