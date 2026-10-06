import {mergeFrozenOutcomes,outcomeFeedback,outcomeKey} from './frozen-outcome-summary';

const groupKey=(r:any)=>JSON.stringify([r.classId,r.enrollmentGrade,r.subjectId,r.curriculumVersionId,r.academicYear,r.gradeLevel,r.programVersion]);
const sum=(a:any,b:any,fields:string[])=>{for(const field of fields){const value=Number(a[field]||0)+Number(b[field]||0);if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw new Error('REPORT_AGGREGATE_LIMIT');a[field]=value}};
function breakdown(parts:any[]){const groups=new Map<string,any>();for(const p of parts||[]){let g=groups.get(p.sourceType);if(!g){g={sourceType:p.sourceType};groups.set(p.sourceType,g)}sum(g,p,['correct','wrong','blank','invalid','evidenceCount'])}return [...groups.values()]}
/** Enrollment partitions must be disjoint and complete; participant counts can then be added. */
export function mergeCohortPartition(previous:any|null,page:any){
 const next={...(previous||page),groups:[],gameGroups:[],outcomes:[],sourceCoverage:[]} as any;
 delete next.outcomeFeedback;
 const groups=new Map<string,any>(),games=new Map<string,any>(),outcomes=new Map<string,any>(),coverage=new Map<string,any>();
 for(const report of [previous,page].filter(Boolean)){
  for(const raw of report.groups){const key=groupKey(raw),old=groups.get(key);if(!old){groups.set(key,{...raw,sourceBreakdown:breakdown(raw.sourceBreakdown)});continue;}sum(old,raw,['correct','wrong','blank','invalid','participatingEnrollmentCount']);old.sourceBreakdown=breakdown([...old.sourceBreakdown,...raw.sourceBreakdown]);old.evidenceCount=old.correct+old.wrong+old.blank;old.accuracyPercent=old.evidenceCount?Math.round(old.correct/old.evidenceCount*10000)/100:null;}
  for(const raw of report.gameGroups){const key=groupKey(raw),old=games.get(key);if(!old){games.set(key,{...raw});continue;}sum(old,raw,['sessionCount','totalScore','totalDurationSeconds','totalXp','participatingEnrollmentCount']);old.averageScore=old.sessionCount?Math.round(old.totalScore/old.sessionCount*100)/100:null;}
  for(const raw of report.outcomes){const key=JSON.stringify([raw.classId,raw.enrollmentGrade,outcomeKey(raw)]),old=outcomes.get(key);if(!old){outcomes.set(key,{...raw,sourceBreakdown:breakdown(raw.sourceBreakdown)});continue;}const merged=mergeFrozenOutcomes([{sourceType:'COMBINED_BASE',report:{outcomes:[old,raw]}}])[0];if(!merged)throw new Error('REPORT_AGGREGATE_INVALID');outcomes.set(key,{...merged,classId:old.classId,className:old.className,enrollmentGrade:old.enrollmentGrade,participatingEnrollmentCount:old.participatingEnrollmentCount+raw.participatingEnrollmentCount,sourceBreakdown:breakdown(merged.sourceBreakdown||[])});}
  for(const raw of report.sourceCoverage){let old=coverage.get(raw.sourceType);if(!old){old={sourceType:raw.sourceType,rowCount:0,excluded:{}};coverage.set(raw.sourceType,old)}sum(old,raw,['rowCount']);sum(old.excluded,raw.excluded||{},Object.keys(raw.excluded||{}));}
 }
 if(groups.size+games.size>500||outcomes.size>1000)throw new Error('REPORT_AGGREGATE_LIMIT');
 const sorted=(map:Map<string,any>)=>[...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,v])=>v);
 next.groups=sorted(groups);next.gameGroups=sorted(games);next.outcomes=sorted(outcomes);next.sourceCoverage=[...coverage.values()];
 if(new TextEncoder().encode(JSON.stringify(next)).length>350000)throw new Error('REPORT_AGGREGATE_LIMIT');
 return next;
}
export function finishCohortBackgroundReport(report:any,asOf:string,processedEnrollments:number){return {...report,outcomeFeedback:{...outcomeFeedback(report.outcomes),policy:'COHORT_FROZEN_OUTCOME_FORMATIVE_FEEDBACK_V1'},background:{policy:'DISJOINT_ENROLLMENT_PARTITIONS_WITH_GENERATION_FENCE_V1',asOf,processedEnrollments},officialScore:null,nationalRank:null};}
export function cohortReportCsv(report:any){
 const cell=(v:unknown)=>{let text=String(v??'');if(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
 const rows:any[][]=[['Bölüm','Eğitim yılı','Sınıf','Sınıf düzeyi','Ders','Program sürümü','Kazanım kodu','Kazanım adı','Katılan dönem kaydı','Doğru','Yanlış','Boş','İptal','Doğruluk yüzdesi','Oyun oturumu','Ortalama oyun puanı','Süre (sn)','XP','Öneriler']];
 for(const [kind,values] of [['Ders',report.groups],['Kazanım',report.outcomeFeedback.rows],['Oyun',report.gameGroups]] as [string,any[]][])for(const r of values)rows.push([kind,r.academicYear,r.className,r.enrollmentGrade,r.subjectName,r.programVersion,r.outcomeCode,r.outcomeTitle,r.participatingEnrollmentCount,r.correct,r.wrong,r.blank,r.invalid,r.accuracyPercent,r.sessionCount,r.averageScore,r.totalDurationSeconds,r.totalXp,(r.suggestions||[]).join(' ')]);
 return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
