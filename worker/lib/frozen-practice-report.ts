import {addFrozenOutcomeEvidence,finishFrozenOutcomes} from './frozen-outcome-summary';
import type {FrozenOutcomeMap} from './frozen-outcome-summary';
function evidenceTime(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))return NaN;
 return Date.parse(value.replace(' ','T')+(/[Zz]|[+-]\d{2}:\d{2}$/.test(value)?'':'Z'));
}

// Authorization and source selection belong to the caller. No live content joins.
export function frozenPracticeReport(rows:any[], academicYear:string, subjectIds:string[]|null, repeatPolicy:'FIRST'|'LATEST'='LATEST') {
  const selected=new Map<string,{row:any,evidence:any}>();
  let legacyRuns=0,excludedEvidence=0,repeatedAttempts=0;
  const seenRuns=new Set<string>();
  for(const row of rows){
    let evidence:any;
    try{evidence=JSON.parse(row.metadata_json)?.frozenEvidence;}catch{if(!subjectIds)legacyRuns++;continue;}
    if(evidence?.policy!=='QUESTION_PRACTICE_READ_CONTEXT_V1'){if(!subjectIds)legacyRuns++;continue;}
    if(evidence.academicYear!==academicYear)continue;
    const refs=Array.isArray(evidence.outcomeRefs)?evidence.outcomeRefs:[];
    if(subjectIds&&(!refs.length||refs.some((ref:any)=>!ref||!subjectIds.includes(ref.subjectId))))continue;
    if(row.source_type!=='QUESTION_BANK'||row.status!=='SCORED'||typeof row.id!=='string'||!row.id||typeof row.completed_at!=='string'||!Number.isFinite(evidenceTime(row.completed_at))||typeof evidence.questionId!=='string'||!evidence.questionId||row.source_id!==evidence.questionId||typeof evidence.contentDigest!=='string'||!/^[a-f0-9]{64}$/.test(evidence.contentDigest)||typeof evidence.enrollmentId!=='string'||!evidence.enrollmentId||typeof evidence.seasonId!=='string'||!evidence.seasonId||!Number.isInteger(evidence.gradeLevel)||evidence.gradeLevel<1||evidence.gradeLevel>12||!['CORRECT','WRONG','BLANK'].includes(evidence.status)||!refs.length||refs.some((ref:any)=>!ref||ref.verified!==1||(ref.programVersion!=null&&typeof ref.programVersion!=='string')||typeof ref.outcomeId!=='string'||!ref.outcomeId||typeof ref.subjectId!=='string'||!ref.subjectId||typeof ref.curriculumVersionId!=='string'||!ref.curriculumVersionId||ref.academicYear!==evidence.academicYear||ref.gradeLevel!==evidence.gradeLevel)){
      excludedEvidence++;continue;
    }
    const contexts=new Set(refs.map((ref:any)=>JSON.stringify([ref.subjectId,ref.curriculumVersionId,ref.programVersion??null])));
    if(contexts.size!==1){excludedEvidence++;continue;}
    if(seenRuns.has(row.id))continue;
    seenRuns.add(row.id);
    const key=JSON.stringify([evidence.questionId,evidence.contentDigest,evidence.enrollmentId,evidence.academicYear,evidence.gradeLevel,refs[0].subjectId,refs[0].curriculumVersionId,refs[0].programVersion??null]);
    const previous=selected.get(key);
    if(previous){
      repeatedAttempts++;
      const delta=evidenceTime(row.completed_at)-evidenceTime(previous.row.completed_at);
      const comparison=delta|| (row.id<previous.row.id?-1:row.id>previous.row.id?1:0);
      if(repeatPolicy==='FIRST'?comparison>=0:comparison<=0)continue;
    }
    selected.set(key,{row,evidence});
  }
  const groups=new Map<string,any>();
  const outcomeRows: FrozenOutcomeMap = new Map();
  for(const {evidence} of selected.values()){
    const ref=evidence.outcomeRefs[0];
    const key=JSON.stringify([ref.subjectId,ref.curriculumVersionId,evidence.academicYear,evidence.gradeLevel,ref.programVersion??null]);
    let group=groups.get(key);
    if(!group){group={subjectId:ref.subjectId,subjectName:null,curriculumVersionId:ref.curriculumVersionId,programVersion:typeof ref.programVersion==='string'?ref.programVersion:null,academicYear:evidence.academicYear,gradeLevel:evidence.gradeLevel,correct:0,wrong:0,blank:0};groups.set(key,group);}
    group[evidence.status.toLowerCase()]++;
    addFrozenOutcomeEvidence(outcomeRows,evidence.outcomeRefs,evidence.status,group);
  }
  return {outcomes:finishFrozenOutcomes(outcomeRows),sourceTypes:['QUESTION_BANK'],calculationPolicy:'SELECTED_FROZEN_PRACTICE_QUESTION_ACCURACY_V1',repeatPolicy,groups:[...groups.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,group])=>{const evidenceCount=group.correct+group.wrong+group.blank;return {...group,evidenceCount,accuracyPercent:evidenceCount?Math.round(group.correct/evidenceCount*10000)/100:null};}),coverage:subjectIds?null:{legacyRuns,excludedEvidence,repeatedAttempts},officialScore:null,nationalRank:null};
}
