import type { AuthUser, Env } from '../types';
import { all,audit,badRequest,forbidden,json,notFound,one,uuid } from './db';

type InstrumentSchema={scale?:{min?:number;max?:number};items?:Array<{id:string;dimension:string;text:string;reverse?:boolean}>};
type ScoreResult={dimensions:Record<string,number>;confidence:Record<string,number>;answered:number;total:number};

function parseJson<T>(value:unknown,fallback:T):T{if(typeof value!=='string'||!value)return fallback;try{return JSON.parse(value) as T}catch{return fallback}}

export function scoreGuidanceResponses(schema:InstrumentSchema,responses:Record<string,unknown>):ScoreResult{
 const items=Array.isArray(schema?.items)?schema.items:[];if(!items.length)throw new Error('INSTRUMENT_SCHEMA_EMPTY');
 const min=Number(schema.scale?.min??1),max=Number(schema.scale?.max??5);if(!(max>min))throw new Error('INSTRUMENT_SCALE_INVALID');
 const sums=new Map<string,{sum:number,count:number}>();let answered=0;
 for(const item of items){
  const raw=Number(responses?.[item.id]);if(!Number.isFinite(raw)||raw<min||raw>max)throw new Error(`RESPONSE_REQUIRED:${item.id}`);
  const value=item.reverse?max-(raw-min):raw;const normalized=((value-min)/(max-min))*100;const current=sums.get(item.dimension)||{sum:0,count:0};current.sum+=normalized;current.count++;sums.set(item.dimension,current);answered++;
 }
 const dimensions:Record<string,number>={},confidence:Record<string,number>={};for(const [key,row] of sums){dimensions[key]=Number((row.sum/row.count).toFixed(1));confidence[key]=Number(Math.min(1,row.count/2).toFixed(2));}
 return{dimensions,confidence,answered,total:items.length};
}

export function guidanceBand(score:number){return score>=75?'STRONG':score>=50?'BALANCED':score>=30?'DEVELOPING':'NEEDS_SUPPORT'}

function instrumentSummary(title:string,result:ScoreResult){
 const ordered=Object.entries(result.dimensions).sort((a,b)=>a[1]-b[1]);if(!ordered.length)return `${title}: yorumlanabilir eğitimsel sinyal oluşmadı.`;
 const focus=ordered.slice(0,2).map(([k,v])=>`${k} ${Math.round(v)}/100`).join(', ');const strong=ordered.slice(-2).reverse().map(([k,v])=>`${k} ${Math.round(v)}/100`).join(', ');
 return `${title}: geliştirme odağı ${focus}; güçlü sinyaller ${strong}. Bu sonuç eğitimsel rehberlik içindir, tanı değildir.`;
}

async function enrollment(env:Env,studentId:string){return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status IN ('ACTIVE','GRADUATED') ORDER BY CASE e.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,e.created_at DESC LIMIT 1`).bind(studentId))}

async function counselorCanAccess(env:Env,user:AuthUser,studentId:string){
 if(user.role!=='GUIDANCE_TEACHER'||!user.institution_id)return false;const enr=await enrollment(env,studentId);if(!enr||enr.institution_id!==user.institution_id)return false;
 return Boolean(await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND institution_id=? AND assignment_type='GUIDANCE' AND active=1 AND (class_id=? OR class_id IS NULL) LIMIT 1`).bind(user.id,user.institution_id,enr.class_id)));
}

async function instrumentByCode(env:Env,code:string){return one<any>(env.DB.prepare(`SELECT * FROM guidance_assessment_instruments WHERE code=? AND active=1 AND clinical_use=0`).bind(code))}
async function sessionById(env:Env,id:string){return one<any>(env.DB.prepare(`SELECT s.*,i.code instrument_code,i.title instrument_title,i.category,i.version,i.question_schema_json FROM guidance_assessment_sessions s JOIN guidance_assessment_instruments i ON i.id=s.instrument_id WHERE s.id=?`).bind(id))}

export async function listGuidanceInstruments(env:Env){
 const rows=await all<any>(env.DB.prepare(`SELECT id,code,title,category,version,description,requires_counselor_approval,evidence_level FROM guidance_assessment_instruments WHERE active=1 AND clinical_use=0 ORDER BY CASE category WHEN 'RBA' THEN 0 ELSE 1 END,title`));
 return rows;
}

export async function proposeGuidanceAssessment(env:Env,user:AuthUser,code:string,reason?:string,evidence?:unknown){
 if(user.role!=='STUDENT'||!user.student_id)return {ok:false as const,response:forbidden('Rehberlik testi önerisi öğrenci hesabından oluşturulabilir.')};
 const enr=await enrollment(env,user.student_id);if(!enr)return {ok:false as const,response:badRequest('Aktif öğrenci kaydı bulunamadı.')};
 const instrument=await instrumentByCode(env,code);if(!instrument)return {ok:false as const,response:notFound('Seçilen rehberlik aracı bulunamadı.')};
 const existing=await one<any>(env.DB.prepare(`SELECT id,status FROM guidance_assessment_sessions WHERE student_id=? AND instrument_id=? AND status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED') ORDER BY created_at DESC LIMIT 1`).bind(user.student_id,instrument.id));
 if(existing)return {ok:true as const,reused:true,session:await sessionById(env,existing.id)};
 const id=uuid('gas');await env.DB.prepare(`INSERT INTO guidance_assessment_sessions(id,institution_id,student_id,instrument_id,proposed_by,proposed_by_user_id,proposal_reason,proposal_evidence_json,status) VALUES(?,?,?,?,'NIBIRU',?,?,?,'PROPOSED')`).bind(id,enr.institution_id,user.student_id,instrument.id,user.id,String(reason||'Nibiru rehberlik önerisi').slice(0,1000),evidence?JSON.stringify(evidence):null).run();
 await audit(env.DB,user.id,enr.institution_id,'GUIDANCE_ASSESSMENT_PROPOSED','guidance_assessment',id,{instrument:instrument.code,source:'NIBIRU'});
 return {ok:true as const,reused:false,session:await sessionById(env,id)};
}

export async function myGuidanceSessions(env:Env,user:AuthUser){
 if(user.role!=='STUDENT'||!user.student_id)return forbidden('Bu liste öğrenci hesabına açıktır.');
 const rows=await all<any>(env.DB.prepare(`SELECT s.id,s.status,s.proposal_reason,s.approved_at,s.submitted_at,s.reviewed_at,s.counselor_note,s.created_at,i.code,i.title,i.category,i.version,i.description,i.question_schema_json FROM guidance_assessment_sessions s JOIN guidance_assessment_instruments i ON i.id=s.instrument_id WHERE s.student_id=? ORDER BY s.created_at DESC LIMIT 50`).bind(user.student_id));
 return json({ok:true,sessions:rows.map(row=>({...row,question_schema:['APPROVED','IN_PROGRESS'].includes(row.status)?parseJson(row.question_schema_json,{}):undefined,question_schema_json:undefined}))});
}

export async function counselorQueue(env:Env,user:AuthUser){
 if(user.role!=='GUIDANCE_TEACHER'||!user.institution_id)return forbidden('Rehberlik onay kuyruğu gerçek rehber öğretmen hesabına açıktır.');
 const rows=await all<any>(env.DB.prepare(`SELECT s.id,s.student_id,s.status,s.proposal_reason,s.created_at,s.approved_at,s.submitted_at,s.scored_result_json,i.code,i.title,i.category,se.first_name,se.last_name,e.class_id,c.name class_name
 FROM guidance_assessment_sessions s JOIN guidance_assessment_instruments i ON i.id=s.instrument_id JOIN student_entities se ON se.id=s.student_id
 JOIN student_enrollments e ON e.student_id=s.student_id AND e.institution_id=s.institution_id AND e.status IN ('ACTIVE','GRADUATED')
 LEFT JOIN classes c ON c.id=e.class_id
 WHERE s.institution_id=? AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=s.institution_id AND ta.assignment_type='GUIDANCE' AND ta.active=1 AND (ta.class_id=e.class_id OR ta.class_id IS NULL))
 AND s.status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED') ORDER BY CASE s.status WHEN 'SUBMITTED' THEN 0 WHEN 'PROPOSED' THEN 1 ELSE 2 END,s.created_at`).bind(user.institution_id,user.id));
 return json({ok:true,sessions:rows.map(row=>({...row,scored_result:row.status==='SUBMITTED'?parseJson<ScoreResult|null>(row.scored_result_json,null):null,scored_result_json:undefined}))});
}

export async function counselorDecision(request:Request,env:Env,user:AuthUser,id:string,action:'approve'|'reject'){
 const session=await sessionById(env,id);if(!session)return notFound('Rehberlik oturumu bulunamadı.');if(!await counselorCanAccess(env,user,session.student_id))return forbidden('Bu öğrencinin rehberlik onayını verme yetkiniz yok.');
 if(session.status!=='PROPOSED')return badRequest('Yalnız öneri durumundaki test onaylanabilir veya reddedilebilir.','INVALID_GUIDANCE_STATE');const body:any=await request.json().catch(()=>({}));
 if(action==='approve')await env.DB.prepare(`UPDATE guidance_assessment_sessions SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,approval_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PROPOSED'`).bind(user.id,String(body.note||'').slice(0,1000)||null,id).run();
 else await env.DB.prepare(`UPDATE guidance_assessment_sessions SET status='REJECTED',approved_by=?,approved_at=CURRENT_TIMESTAMP,approval_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PROPOSED'`).bind(user.id,String(body.note||'').slice(0,1000)||null,id).run();
 await audit(env.DB,user.id,session.institution_id,action==='approve'?'GUIDANCE_ASSESSMENT_APPROVED':'GUIDANCE_ASSESSMENT_REJECTED','guidance_assessment',id,{instrument:session.instrument_code});
 return json({ok:true,session:await sessionById(env,id)});
}

export async function submitGuidanceAssessment(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='STUDENT'||!user.student_id)return forbidden('Rehberlik testini yalnız öğrenci kendi hesabından doldurabilir.');const session=await sessionById(env,id);if(!session||session.student_id!==user.student_id)return notFound('Rehberlik oturumu bulunamadı.');
 if(!['APPROVED','IN_PROGRESS'].includes(session.status))return badRequest('Bu test gerçek rehber öğretmeni tarafından onaylanmadan uygulanamaz.','COUNSELOR_APPROVAL_REQUIRED');const body:any=await request.json().catch(()=>({}));const responses=body.responses&&typeof body.responses==='object'?body.responses:{};
 let result:ScoreResult;try{result=scoreGuidanceResponses(parseJson<InstrumentSchema>(session.question_schema_json,{}),responses)}catch(e){return badRequest(e instanceof Error?e.message:'Yanıtlar geçersiz.','GUIDANCE_RESPONSE_INVALID')}
 await env.DB.prepare(`UPDATE guidance_assessment_sessions SET status='SUBMITTED',response_json=?,scored_result_json=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(responses),JSON.stringify(result),id).run();
 await audit(env.DB,user.id,session.institution_id,'GUIDANCE_ASSESSMENT_SUBMITTED','guidance_assessment',id,{instrument:session.instrument_code,answered:result.answered});
 return json({ok:true,status:'SUBMITTED',message:'Yanıtların kaydedildi. Sonuçlar gelişim profiline eklenmeden önce gerçek rehber öğretmenin incelemesini bekliyor.'});
}

async function syncRbaProfile(env:Env,session:any,result:ScoreResult){
 if(session.category!=='RBA')return;const d=result.dimensions,c=result.confidence;const avgConf=Object.values(c).length?Object.values(c).reduce((a,b)=>a+b,0)/Object.values(c).length:0;
 await env.DB.prepare(`INSERT INTO rba_profiles(student_id,version,analytical_score,verbal_processing_score,numeric_processing_score,consistency_score,error_repetition_score,pace_score,plan_adherence_score,persistence_score,performance_stability_score,confidence,evidence_json,updated_at)
 VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(student_id) DO UPDATE SET version=rba_profiles.version+1,analytical_score=excluded.analytical_score,verbal_processing_score=excluded.verbal_processing_score,numeric_processing_score=excluded.numeric_processing_score,consistency_score=excluded.consistency_score,error_repetition_score=excluded.error_repetition_score,pace_score=excluded.pace_score,plan_adherence_score=excluded.plan_adherence_score,persistence_score=excluded.persistence_score,performance_stability_score=excluded.performance_stability_score,confidence=excluded.confidence,evidence_json=excluded.evidence_json,updated_at=CURRENT_TIMESTAMP`)
 .bind(session.student_id,d.analytical??null,d.verbal_processing??null,d.numeric_processing??null,d.consistency??null,d.error_repetition==null?null:Number((100-d.error_repetition).toFixed(1)),d.pace??null,d.plan_adherence??null,d.persistence??null,d.performance_stability??null,Number(avgConf.toFixed(2)),JSON.stringify({source:'COUNSELOR_REVIEWED_GUIDANCE_ASSESSMENT',sessionId:session.id,instrument:session.instrument_code})).run();
 await env.DB.prepare(`INSERT OR REPLACE INTO rba_assessments(id,student_id,instrument_version,response_json,result_json,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`rba_${session.id}`,session.student_id,session.version,session.response_json||'{}',JSON.stringify(result)).run();
}

export async function reviewGuidanceAssessment(request:Request,env:Env,user:AuthUser,id:string){
 const session=await sessionById(env,id);if(!session)return notFound('Rehberlik oturumu bulunamadı.');if(!await counselorCanAccess(env,user,session.student_id))return forbidden('Bu öğrencinin rehberlik sonucunu inceleme yetkiniz yok.');if(session.status!=='SUBMITTED')return badRequest('Yalnız gönderilmiş test sonucu incelenebilir.','INVALID_GUIDANCE_STATE');
 const result=parseJson<ScoreResult>(session.scored_result_json,{dimensions:{},confidence:{},answered:0,total:0});const body:any=await request.json().catch(()=>({}));const note=String(body.note||'').slice(0,2000)||null;
 await env.DB.prepare(`UPDATE guidance_assessment_sessions SET status='REVIEWED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,counselor_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='SUBMITTED'`).bind(user.id,note,id).run();
 const statements=[] as D1PreparedStatement[];for(const [key,score] of Object.entries(result.dimensions)){statements.push(env.DB.prepare(`INSERT OR REPLACE INTO guidance_development_signals(id,institution_id,student_id,source_session_id,signal_key,score,confidence,summary) VALUES(?,?,?,?,?,?,?,?)`).bind(`gds_${id}_${key}`,session.institution_id,session.student_id,id,key,score,result.confidence[key]??0.5,`${guidanceBand(score)} · ${key}`));}if(statements.length)await env.DB.batch(statements);
 await syncRbaProfile(env,session,result);await audit(env.DB,user.id,session.institution_id,'GUIDANCE_ASSESSMENT_REVIEWED','guidance_assessment',id,{instrument:session.instrument_code,dimensions:Object.keys(result.dimensions)});
 return json({ok:true,session:await sessionById(env,id),summary:instrumentSummary(session.instrument_title,result)});
}

export async function reviewedGuidanceDevelopmentContext(env:Env,studentId:string){
 const sessions=await all<any>(env.DB.prepare(`SELECT s.id,s.reviewed_at,s.counselor_note,i.code,i.title,i.category,s.scored_result_json FROM guidance_assessment_sessions s JOIN guidance_assessment_instruments i ON i.id=s.instrument_id WHERE s.student_id=? AND s.status='REVIEWED' AND s.reviewed_by IS NOT NULL ORDER BY s.reviewed_at DESC LIMIT 8`).bind(studentId));
 if(!sessions.length)return {available:false,reviewedAssessments:0,signals:[],summary:null};
 const signals=await all<any>(env.DB.prepare(`SELECT signal_key,round(avg(score),1) score,round(avg(confidence),2) confidence,count(*) evidence FROM guidance_development_signals WHERE student_id=? GROUP BY signal_key ORDER BY score ASC,evidence DESC LIMIT 12`).bind(studentId));
 const focus=signals.slice(0,3).map(x=>`${x.signal_key} ${x.score}/100`).join(', ');return {available:true,reviewedAssessments:sessions.length,signals,latest:sessions.map(s=>({code:s.code,title:s.title,category:s.category,reviewedAt:s.reviewed_at,counselorNote:s.counselor_note})),summary:focus?`Rehber öğretmen onaylı gelişim odağı: ${focus}.`:'Rehber öğretmen onaylı değerlendirmeler mevcut.'};
}

export function guidanceInstrumentForMessage(message:string){
 const m=String(message||'').toLocaleLowerCase('tr-TR');if(!/(test|ölçek|değerlendirme|rba)/i.test(m))return null;if(m.includes('rba'))return 'RBA_EDU_V1';if(/çalışma|alışkanlık/.test(m))return 'STUDY_HABITS_V1';if(/hedef|motivasyon/.test(m))return 'GOAL_MOTIVATION_V1';if(/sınav|hazırlık|süre/.test(m))return 'EXAM_READINESS_V1';return null;
}
