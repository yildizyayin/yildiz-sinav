import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden,notFound} from './db';

/** Read live evidence, never write guessed probabilities or infer cross-year equivalence by title. */
export async function questionCardIntelligence(env:Env,user:AuthUser,id:string,now=new Date()){
 if(user.role!=='SUPER_ADMIN')return forbidden('Soru inceleme bilgileri yalnız Süper Admin içindir.');
 const q=await one<any>(env.DB.prepare('SELECT id,academic_year,grade_level,subject_id,difficulty_level,difficulty,prior_grade_refs_json,lgs_probability,yks_probability,exam_5y_count,review_revision FROM question_bank WHERE id=?').bind(id));
 if(!q)return notFound('Soru bulunamadı.');
 const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.grade_level,cv.program_version,cv.source_url
 FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE l.question_id=? AND o.active=1 AND cv.verified=1 AND o.grade_level=? AND cv.grade_level=o.grade_level AND o.subject_id=? AND cv.academic_year=? ORDER BY o.id`).bind(id,q.grade_level,q.subject_id,q.academic_year));
 const toYear=now.getUTCFullYear(),fromYear=toYear-4;
 const ids=outcomes.map(o=>o.id);let facts:any[]=[];
 if(ids.length)facts=await all<any>(env.DB.prepare(`SELECT DISTINCT f.archive_id,f.exam_family,f.exam_year,f.session_code,f.subject_name,f.question_no,a.landing_url,a.document_url,a.authority
 FROM official_question_outcome_facts f JOIN official_exam_archives a ON a.id=f.archive_id
 WHERE f.verification_status='VERIFIED' AND a.active=1 AND f.exam_year BETWEEN ? AND ?
 AND (f.outcome_id IN (${ids.map(()=>'?').join(',')}) OR EXISTS(SELECT 1 FROM official_outcome_equivalences e WHERE e.current_outcome_id IN (${ids.map(()=>'?').join(',')}) AND e.verified=1 AND e.exam_family=f.exam_family AND e.from_year=f.exam_year
 AND ((e.from_outcome_code IS NOT NULL AND e.from_outcome_code=f.outcome_code_snapshot) OR (e.from_outcome_code IS NULL AND e.from_outcome_title=f.outcome_title_snapshot))))
 ORDER BY f.exam_year DESC,f.exam_family,f.session_code,f.question_no LIMIT 501`).bind(fromYear,toYear,...ids,...ids));
 let prior:any=[];try{prior=JSON.parse(q.prior_grade_refs_json||'[]')}catch{/* Preserve unknown, not an invented prerequisite. */}
 return json({ok:true,questionId:id,revision:q.review_revision,asOf:now.toISOString(),outcomes,
  priorLearning:{status:'UNVERIFIED_MANUAL_REFERENCES',references:Array.isArray(prior)?prior.filter((v:any)=>typeof v==='string'):[],note:'Önceki sınıf bağları insan girişi olabilir; resmî kod ve program bağlantısı ayrıca doğrulanmalıdır.'},
  difficulty:{level:q.difficulty_level??q.difficulty??null,basis:'EDITORIAL_ESTIMATE',measuredDifficulty:null},
  history:{fromYear,toYear,status:facts.length?'VERIFIED_MAPPINGS_PARTIAL_COVERAGE':'NO_VERIFIED_MAPPING',coverageComplete:false,truncated:facts.length>500,
   families:['LGS','YKS'].map(family=>{const rows=facts.filter(f=>f.exam_family===family);return {family,observedQuestionCount:rows.length||null,perYear:Array.from({length:5},(_,i)=>{const year=fromYear+i,count=rows.filter(f=>f.exam_year===year).length;return {year,count:count||null}})};}),facts:facts.slice(0,500),note:'Kazanım bağlantılarının gözlenen sayımıdır; aynı soru türünün sıklığı veya gelecek sınav olasılığı değildir. Veri bulunmayan yıl sıfır sayılmaz.'},
  prediction:{status:'NOT_CALIBRATED',probability:null,note:'Doğrulanmış tahmin modeli yok. Manuel sayısal değerler otomatik tahmin veya kanıt değildir.'},
  manualClaims:{lgsProbability:q.lgs_probability,yksProbability:q.yks_probability,exam5yCount:q.exam_5y_count,verified:false}});
}
