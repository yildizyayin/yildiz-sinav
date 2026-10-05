import type {AuthUser,Env} from '../types';
import {all,forbidden,json,one} from './db';
import {frozenExamReport} from './frozen-exam-report';
import {frozenPracticeReport} from './frozen-practice-report';
import {frozenMiniTestReport} from './frozen-mini-test-report';
import {groupFoy,groupGames} from './frozen-foy-game-report';
import {combineExpandedFrozenReports} from './expanded-frozen-report';

type ClassScope={id:string;seasonId:string;academicYear:string};
const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
const kinds=['EXAM','QUESTION_BANK','MINI_TEST','FOY','MINI_GAME'] as const;

/** Bounded cohort computation: batch reads, never one HTTP/query chain per student. */
export async function cohortLearningReport(env:Env,user:AuthUser,url:URL,classScope?:ClassScope){
 if(classScope?user.role!=='GUIDANCE_TEACHER':!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();
 const institutionId=user.role==='SUPER_ADMIN'?url.searchParams.get('institutionId'):user.institution_id;
 const year=url.searchParams.get('academicYear')||'';
 const sources=[...new Set((url.searchParams.get('sources')||'').split(',').filter(Boolean))];
 const ids=[...new Set((url.searchParams.get('examIds')||'').split(',').map(x=>x.trim()).filter(Boolean))];
 const repeat=url.searchParams.get('repeatPolicy')||'LATEST';
 const fromDate=url.searchParams.get('fromDate')||'',toDate=url.searchParams.get('toDate')||'';
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if((fromDate||toDate)&&(!validDate(fromDate)||!validDate(toDate)||fromDate>toDate||fromDate.slice(0,4)<year.slice(0,4)||toDate.slice(0,4)>year.slice(5)))return fail(400,'REPORT_DATE_RANGE_INVALID','Geçerli eğitim yılı içinde başlangıç ve bitiş tarihi seçin.');
 const dateRange=(column:string)=>fromDate?` AND date(${column})>=? AND date(${column})<=?`:'';
 const dateParams=fromDate?[fromDate,toDate]:[];
 if(!institutionId||!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!sources.length||sources.some(x=>!kinds.includes(x as any))||ids.length>20||ids.some(x=>x.length>100)||!['FIRST','LATEST'].includes(repeat)||sources.includes('EXAM')&&!ids.length)return fail(400,'REPORT_SELECTION_INVALID','Eğitim yılı, kaynaklar ve sınav kaynağı için en fazla 20 sınav seçin.');
 if(classScope&&year!==classScope.academicYear)return forbidden();
 if(!await one(env.DB.prepare("SELECT id FROM institutions WHERE id=? AND status='ACTIVE'").bind(institutionId)))return forbidden();
 // Repeat the guidance witness here; do not trust a caller-provided class object.
 if(classScope&&!await one(env.DB.prepare(`SELECT c.id FROM classes c JOIN institution_seasons se ON se.id=c.season_id AND se.institution_id=c.institution_id AND se.status='ACTIVE' WHERE c.id=? AND c.institution_id=? AND c.season_id=? AND c.active=1 AND se.academic_year=? AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=c.institution_id AND ta.season_id=c.season_id AND ta.class_id=c.id AND ta.assignment_type='GUIDANCE' AND ta.active=1)`).bind(classScope.id,institutionId,classScope.seasonId,year,user.id)))return forbidden();
 const scope=classScope?' AND e.class_id=? AND e.season_id=? AND e.status=\'ACTIVE\'':'';
 const scopeParams=classScope?[classScope.id,classScope.seasonId]:[];
 const enrollment=`JOIN student_enrollments e ON e.student_id=x.student_id AND e.institution_id=x.institution_id JOIN institution_seasons se ON se.id=e.season_id AND se.institution_id=e.institution_id LEFT JOIN classes c ON c.id=e.class_id AND c.institution_id=e.institution_id AND c.season_id=e.season_id`;
 const identity=`e.id cohort_enrollment_id,e.class_id cohort_class_id,c.name cohort_class_name,e.grade_level cohort_grade`;
 const statements:any[]=[];const labels:string[]=[];
 const add=(kind:string,sql:string,params:any[])=>{if(sources.includes(kind)){labels.push(kind);statements.push(env.DB.prepare(sql).bind(...params))}};
 add('EXAM',`SELECT x.exam_id,x.payload_json,x.grade_level,x.student_id,${identity},? academic_year FROM exam_result_snapshots x JOIN exam_delivery_profiles p ON p.exam_id=x.exam_id AND p.snapshot_version=x.snapshot_version JOIN exam_participants ep ON ep.id=x.participant_id AND ep.exam_id=x.exam_id AND ep.student_id=x.student_id AND ep.institution_id=x.institution_id ${enrollment} WHERE x.institution_id=? AND x.exam_id IN (${ids.length?ids.map(()=>'?').join(','):'NULL'}) AND ep.season_id=e.season_id AND se.academic_year=? AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL AND (p.result_publish_at IS NULL OR datetime(p.result_publish_at)<=CURRENT_TIMESTAMP) AND CASE WHEN json_valid(x.payload_json) THEN json_extract(x.payload_json,'$.exam.academic_year') END=? AND CASE WHEN json_valid(x.payload_json) THEN json_extract(x.payload_json,'$.exam.exam_id') END=x.exam_id ${scope} ORDER BY x.exam_id,x.participant_id LIMIT 5001`,[year,institutionId,...ids,year,year,...scopeParams]);
 add('QUESTION_BANK',`SELECT x.*,${identity} FROM assessment_runs x ${enrollment} WHERE x.institution_id=? AND se.academic_year=? AND x.source_type='QUESTION_BANK' AND x.status='SCORED' AND x.delivery_mode='DIGITAL' AND x.completed_at IS NOT NULL AND e.id=CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.frozenEvidence.enrollmentId') END AND e.season_id=CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.frozenEvidence.seasonId') END AND x.source_id=CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.frozenEvidence.questionId') END AND CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.frozenEvidence.academicYear') END=? ${dateRange('x.completed_at')} ${scope} ORDER BY x.completed_at,x.id LIMIT 5001`,[institutionId,year,year,...dateParams,...scopeParams]);
 add('MINI_TEST',`SELECT x.*,${identity} FROM assessment_runs x JOIN coach_mini_tests t ON t.id=x.id AND t.id=x.source_id AND t.student_id=x.student_id AND t.assignment_id=x.assignment_id JOIN assignments a ON a.id=t.assignment_id AND a.institution_id=x.institution_id ${enrollment} WHERE x.institution_id=? AND se.academic_year=? AND x.source_type='MINI_TEST' AND x.status='SCORED' AND x.delivery_mode='DIGITAL' AND x.completed_at IS NOT NULL AND t.selection_mode='NEW' AND t.status IN ('PASSED','FAILED') AND t.submitted_at IS NOT NULL AND CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.selectionMode') END='NEW' AND CASE WHEN json_valid(x.metadata_json) THEN json_type(x.metadata_json,'$.practiceOnly') END='false' AND e.id=CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.miniEvidence.enrollmentId') END AND e.season_id=CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.miniEvidence.seasonId') END AND CASE WHEN json_valid(x.metadata_json) THEN json_extract(x.metadata_json,'$.miniEvidence.academicYear') END=? ${dateRange('x.completed_at')} ${scope} ORDER BY x.id LIMIT 5001`,[institutionId,year,year,...dateParams,...scopeParams]);
 for(const [kind,table] of [['FOY','frozen_foy_response_evidence'],['MINI_GAME','frozen_game_session_evidence']])add(kind,`SELECT x.*,${identity} FROM ${table} x ${enrollment} WHERE x.institution_id=? AND se.academic_year=? AND x.academic_year=? AND x.enrollment_id=e.id AND x.season_id=e.season_id ${dateRange('x.observed_at')} ${scope} ORDER BY x.observed_at LIMIT 5001`,[institutionId,year,year,...dateParams,...scopeParams]);
 const batches=await env.DB.batch<any>(statements);
 if(batches.some(r=>!r.success))return fail(500,'REPORT_SOURCE_UNAVAILABLE','Rapor kaynağı okunamadı.');
 if(batches.some(r=>r.results.length>5000))return fail(400,'REPORT_SCOPE_TOO_LARGE','Bir kaynak 5.000 kayıt sınırını aşıyor. Tarih aralığını veya kaynak seçimini daraltın; eksik toplam gösterilmedi.');
 const students=new Map<string,{identity:any;rows:Record<string,any[]>}>();
 const coverage=labels.map((sourceType,index)=>({sourceType,rowCount:batches[index].results.length}));
 batches.forEach((batch,index)=>{for(const row of batch.results){const key=row.cohort_enrollment_id;let s=students.get(key);if(!s){s={identity:row,rows:{}};students.set(key,s)}(s.rows[labels[index]]??=[]).push(row)}});
 const groups=new Map<string,any>(),games=new Map<string,any>();
 const excluded:Record<string,any[]>={};
 for(const [enrollmentId,student] of students){
  const reports:any[]=[];const r=student.rows;
  if(r.EXAM)reports.push({sourceType:'EXAM',report:frozenExamReport(r.EXAM,null)});
  if(r.QUESTION_BANK)reports.push({sourceType:'QUESTION_BANK',report:frozenPracticeReport(r.QUESTION_BANK,year,null,repeat as 'FIRST'|'LATEST')});
  if(r.MINI_TEST)reports.push({sourceType:'MINI_TEST',report:frozenMiniTestReport(r.MINI_TEST,year,null)});
  if(r.FOY)reports.push({sourceType:'FOY',report:groupFoy(r.FOY)});
  for(const item of reports)(excluded[item.sourceType]??=[]).push(item.report.coverage||{invalidEvidenceCount:item.report.invalidEvidenceCount||0});
  const merged=combineExpandedFrozenReports(reports,null);
  const cls=student.identity;
  for(const raw of merged.groups){
   const key=JSON.stringify([cls.cohort_class_id,cls.cohort_grade,raw.subjectId,raw.curriculumVersionId,raw.academicYear,raw.gradeLevel,raw.programVersion]);
   let g=groups.get(key);if(!g){g={...raw,classId:cls.cohort_class_id,className:cls.cohort_class_name,enrollmentGrade:cls.cohort_grade,correct:0,wrong:0,blank:0,invalid:0,sourceBreakdown:[],students:new Set<string>()};groups.set(key,g)}
   for(const field of ['correct','wrong','blank','invalid'])g[field]+=raw[field]||0;
   if(raw.evidenceCount>0)g.students.add(enrollmentId);
   for(const part of raw.sourceBreakdown){let target=g.sourceBreakdown.find((x:any)=>x.sourceType===part.sourceType);if(!target){target={sourceType:part.sourceType,correct:0,wrong:0,blank:0,evidenceCount:0};g.sourceBreakdown.push(target)}for(const f of ['correct','wrong','blank','evidenceCount'])target[f]+=part[f]||0}
  }
  if(r.MINI_GAME){const game=groupGames(r.MINI_GAME);(excluded.MINI_GAME??=[]).push({invalidSessionCount:game.invalidSessionCount});for(const raw of game.groups){const key=JSON.stringify([cls.cohort_class_id,cls.cohort_grade,raw.subjectId,raw.curriculumVersionId,raw.academicYear,raw.gradeLevel,raw.programVersion]);let g=games.get(key);if(!g){g={...raw,classId:cls.cohort_class_id,className:cls.cohort_class_name,enrollmentGrade:cls.cohort_grade,sessionCount:0,totalDurationSeconds:0,totalXp:0,scoreSum:0,students:new Set<string>()};games.set(key,g)}g.sessionCount+=raw.sessionCount;g.totalDurationSeconds+=raw.totalDurationSeconds;g.totalXp+=raw.totalXp;g.scoreSum+=raw.totalScore||0;g.students.add(enrollmentId)}}
 }
 if(groups.size+games.size>500)return fail(400,'REPORT_SCOPE_TOO_LARGE','Sınıf ve program bağlamı sayısı rapor sınırını aşıyor.');
 const totals=(items:any[])=>{const result:Record<string,number>={};for(const item of items)for(const [key,value] of Object.entries(item))if(typeof value==='number')result[key]=(result[key]||0)+value;return result};
 return json({ok:true,academicYear:year,sourceTypes:sources,selectedExamIds:ids,repeatPolicy:repeat,dateRange:fromDate?{fromDate,toDate}:null,policy:'COHORT_FROZEN_EVENT_WEIGHTED_ACCURACY_V1',scope:classScope?'CURRENT_GUIDANCE_CLASS':'INSTITUTION_ACADEMIC_YEAR',sourceCoverage:coverage.map(c=>({...c,excluded:totals(excluded[c.sourceType]||[])})),groups:[...groups.values()].map(({students,...g})=>{const evidenceCount=g.correct+g.wrong+g.blank;return {...g,evidenceCount,participatingEnrollmentCount:students.size,accuracyPercent:evidenceCount?Math.round(g.correct/evidenceCount*10000)/100:null}}),gameGroups:[...games.values()].map(({students,scoreSum,...g})=>({...g,participatingEnrollmentCount:students.size,averageScore:g.sessionCount?Math.round(scoreSum/g.sessionCount*100)/100:null})),officialScore:null,nationalRank:null,message:'Seçili sınavlar ile seçilen yıl/tarih aralığının diğer kaynakları soru olayı sayısıyla ağırlıklandırılır. İlk/son soru pratiği her öğrencinin dönem kaydı içinde uygulanır. Oyunlar ayrı gösterilir. Katılmayan öğrenciler sıfır kabul edilmez; bu oran öğrenci başarı oranlarının basit ortalaması değildir.'});
}
