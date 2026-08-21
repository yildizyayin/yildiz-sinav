import type { AuthUser, Env } from '../types';
import { all, one } from './db';
import { compareTargetProfile } from './academic-growth';

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(2));
}

function trend(values: number[]): 'RISING'|'STABLE'|'FALLING'|'INSUFFICIENT' {
  if (values.length < 3) return 'INSUFFICIENT';
  const half=Math.ceil(values.length/2);
  const recent=average(values.slice(0,half))||0;
  const older=average(values.slice(half))||0;
  const delta=recent-older;
  return delta>1?'RISING':delta<-1?'FALLING':'STABLE';
}

export function metricLabelForExam(examType: string, subjectName: string, targetType: 'LGS_SCHOOL'|'YKS_PROGRAM') {
  return targetType==='YKS_PROGRAM' ? `${String(examType).toUpperCase()} ${subjectName}` : subjectName;
}

async function activeEnrollment(env:Env,studentId:string){
  return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(studentId));
}

async function activeTarget(env:Env,studentId:string){
  const row=await one<any>(env.DB.prepare(`SELECT sat.*,
    ss.name school_name,ss.city school_city,ss.district school_district,ss.base_score school_base_score,ss.percentile school_percentile,ss.net_profile_json school_nets,ss.source_year school_year,ss.source_url school_source_url,ss.source_verified_at school_verified_at,
    up.university_name,up.program_name,up.faculty_name,up.score_type,up.base_score university_base_score,up.success_rank,up.net_profile_json university_nets,up.source_year university_year,up.source_url university_source_url,up.source_verified_at university_verified_at
    FROM student_academic_targets sat
    LEFT JOIN secondary_school_targets ss ON ss.id=sat.secondary_school_target_id
    LEFT JOIN university_program_targets up ON up.id=sat.university_program_target_id
    WHERE sat.student_id=? AND sat.status='ACTIVE' ORDER BY sat.created_at DESC LIMIT 1`).bind(studentId));
  return row?{...row,school_nets:parseJson<Record<string,number>>(row.school_nets,{}),university_nets:parseJson<Record<string,number>>(row.university_nets,{})}:null;
}

async function performance(env:Env,studentId:string,targetType:'LGS_SCHOOL'|'YKS_PROGRAM'){
  const examWhere=targetType==='LGS_SCHOOL'?`e.exam_type='LGS'`:`e.exam_type IN ('TYT','AYT')`;
  const exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,er.net,er.score,er.success_percent
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id
    WHERE ep.student_id=? AND ${examWhere}
    ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 16`).bind(studentId));

  const subjectRows=exams.length?await all<any>(env.DB.prepare(`SELECT e.exam_type,s.code,s.name,sr.net,sr.success_percent,ep.exam_id
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id
    WHERE ep.student_id=? AND ep.exam_id IN (${exams.map(()=>'?').join(',')})`).bind(studentId,...exams.map(x=>x.id))):[];

  const buckets=new Map<string,{label:string,sum:number,count:number}>();
  for(const row of subjectRows){
    const label=metricLabelForExam(row.exam_type,String(row.name||row.code),targetType);
    const current=buckets.get(label)||{label,sum:0,count:0};
    current.sum+=Number(row.net||0);current.count++;buckets.set(label,current);
  }
  const subjectAverages:Record<string,number>={};
  for(const [,bucket] of buckets)subjectAverages[bucket.label]=Number((bucket.sum/Math.max(1,bucket.count)).toFixed(2));

  const byType:Record<string,any>={};
  for(const type of targetType==='YKS_PROGRAM'?['TYT','AYT']:['LGS']){
    const typed=exams.filter(x=>x.exam_type===type);
    const nets=typed.map(x=>Number(x.net)).filter(Number.isFinite);
    const scores=typed.map(x=>Number(x.score)).filter(Number.isFinite);
    byType[type]={examCount:typed.length,averageNet:average(nets),averageScore:average(scores),trend:trend(nets),latestExam:typed[0]||null};
  }

  const weak=await all<any>(env.DB.prepare(`SELECT s.name subject_name,o.title,o.topic,round(avg(r.success_rate),1) avg_success,count(*) evidence
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
    WHERE r.student_id=? GROUP BY o.id,o.title,o.topic,s.name HAVING count(*)>0 ORDER BY avg_success ASC,evidence DESC LIMIT 6`).bind(studentId));

  const allNets=exams.map(x=>Number(x.net)).filter(Number.isFinite);
  return {exams,subjectAverages,byType,trend:targetType==='LGS_SCHOOL'?byType.LGS.trend:'INSUFFICIENT',averageNet:average(allNets),averageScore:average(exams.map(x=>Number(x.score)).filter(Number.isFinite)),weakOutcomes:weak};
}

export async function buildStudentTargetAnalysisV2(env:Env,user:AuthUser){
  if(user.role!=='STUDENT'||!user.student_id)throw new Error('STUDENT_ONLY');
  const studentId=user.student_id;
  const enrollment=await activeEnrollment(env,studentId);
  const target=await activeTarget(env,studentId);
  if(!target)return {studentId,gradeLevel:enrollment?.grade_level??null,target:null,analysis:null};

  const targetType=target.target_type as 'LGS_SCHOOL'|'YKS_PROGRAM';
  const perf=await performance(env,studentId,targetType);
  const profile=targetType==='LGS_SCHOOL'?target.school_nets:target.university_nets;
  const gaps=compareTargetProfile(perf.subjectAverages,profile||{});
  const source=targetType==='LGS_SCHOOL'
    ?{kind:'MEB_ROTA_MAARIF',year:target.school_year,url:target.school_source_url,verifiedAt:target.school_verified_at}
    :{kind:'YOK_ATLAS',year:target.university_year,url:target.university_source_url,verifiedAt:target.university_verified_at};

  const primaryGap=targetType==='LGS_SCHOOL'
    ?{metric:'LGS',targetScore:target.school_base_score,targetPercentile:target.school_percentile,currentScore:perf.byType.LGS?.averageScore??null,scoreGap:target.school_base_score!=null&&perf.byType.LGS?.averageScore!=null?Number((target.school_base_score-perf.byType.LGS.averageScore).toFixed(2)):null,currentPercentile:null,percentileNote:'Mevcut yüzdelik yalnız karşılaştırılabilir resmî/normlanmış veri varsa hesaplanmalıdır.'}
    :{metric:'YKS',targetRank:target.success_rank,currentRank:null,rankGap:null,targetScore:target.university_base_score,currentScore:null,rankNote:'Kurum içi deneme sırası ÖSYM başarı sırası değildir; Nibiru resmî başarı sırasıyla sahte bir sıralama karşılaştırması yapmaz.'};

  const trendValue=targetType==='LGS_SCHOOL'?perf.byType.LGS?.trend||'INSUFFICIENT':(
    perf.byType.TYT?.trend==='RISING'&&perf.byType.AYT?.trend==='RISING'?'RISING':
    perf.byType.TYT?.trend==='FALLING'&&perf.byType.AYT?.trend==='FALLING'?'FALLING':'STABLE'
  );

  return {studentId,gradeLevel:enrollment?.grade_level??null,target,analysis:{examCount:perf.exams.length,trend:trendValue,examTypeStats:perf.byType,subjectAverages:perf.subjectAverages,gaps,weakOutcomes:perf.weakOutcomes,primaryGap,latestExam:perf.exams[0]||null,source,officialNetProfile:Object.keys(profile||{}).length>0,comparisonPolicy:targetType==='YKS_PROGRAM'?'TYT and AYT are compared separately against matching YÖK Atlas net metrics. Institution ranks are never treated as ÖSYM success ranks.':'Only LGS-format exams are compared with the MEB LGS target profile.'}};
}
