import type { AuthUser,Env } from '../types';
import { all,audit,badRequest,forbidden,json,one,uuid } from './db';
import { decodeUploadedBytes,parseUploadedText,parseWithTemplate,type ParserTemplate } from './parse';
import { counselorDecision,counselorQueue,guidanceInstrumentForMessage,listGuidanceInstruments,myGuidanceSessions,proposeGuidanceAssessment,reviewGuidanceAssessment,reviewedGuidanceDevelopmentContext,submitGuidanceAssessment } from './guidance-assessments';


function guidanceAdminAllowed(user:AuthUser){return user.role==='SUPER_ADMIN'||user.role==='INSTITUTION_MANAGER';}
function parseGuidanceJson<T>(value:unknown,fallback:T):T{if(typeof value!=='string'||!value)return fallback;try{return JSON.parse(value) as T}catch{return fallback;}}
const GUIDANCE_CATEGORIES=['RBA','STUDY_HABITS','GOAL_MOTIVATION','EXAM_READINESS','STUDY_PREFERENCES','CUSTOM_EDUCATIONAL'];
const GUIDANCE_DELIVERY_MODES=['ONLINE','PRINT_OPTICAL'];

export async function listGuidanceAdminInstruments(env:Env,user:AuthUser){
 if(!guidanceAdminAllowed(user))return forbidden('RBA ve rehberlik test kataloğuna erişim yetkiniz yok.');
 const where=user.role==='SUPER_ADMIN'?'':' AND active=1';
 const rows=await all<any>(env.DB.prepare(`SELECT id,code,title,category,version,description,question_schema_json,delivery_modes_json,optical_config_json,active,evidence_level FROM guidance_assessment_instruments WHERE 1=1${where} ORDER BY category,title`));
 return json({ok:true,instruments:rows.map(row=>({...row,questionSchema:parseGuidanceJson(row.question_schema_json,{}),questionCount:parseGuidanceJson<any>(row.question_schema_json,{items:[]}).items?.length||0,deliveryModes:parseGuidanceJson<string[]>(row.delivery_modes_json,['ONLINE']),opticalConfig:parseGuidanceJson(row.optical_config_json,null),question_schema_json:undefined,delivery_modes_json:undefined,optical_config_json:undefined}))});
}

export async function upsertGuidanceInstrument(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden('RBA ve rehberlik testlerini yalnız Süper Admin yükleyebilir.');
 const body:any=await request.json().catch(()=>({}));
 const code=String(body.code||'').trim().toUpperCase();
 const title=String(body.title||'').trim();
 const category=String(body.category||'CUSTOM_EDUCATIONAL').trim().toUpperCase();
 const version=String(body.version||'1.0').trim();
 const description=String(body.description||'').trim();
 const schema=body.questionSchema;
 const items=Array.isArray(schema?.items)?schema.items:[]; const min=Number(schema?.scale?.min??1); const max=Number(schema?.scale?.max??5);
 if(!/^[A-Z0-9_]{3,64}$/.test(code)||!title||!GUIDANCE_CATEGORIES.includes(category)||!version||!items.length||items.length>200||min!==1||max!==5)return badRequest('Kod, başlık, kategori, 1–200 soru ve 1–5 ölçek zorunludur.','GUIDANCE_INSTRUMENT_INVALID');
 const ids=new Set<string>();for(const item of items){if(!item||typeof item.id!=='string'||typeof item.dimension!=='string'||typeof item.text!=='string'||!item.text.trim()||ids.has(item.id)){return badRequest('Her soru benzersiz id, boyut ve metin içermelidir.','GUIDANCE_ITEM_INVALID');}ids.add(item.id);}
 const deliveryModes=[...(Array.isArray(body.deliveryModes)?body.deliveryModes:[])].filter((x:string)=>GUIDANCE_DELIVERY_MODES.includes(x));if(!deliveryModes.length)return badRequest('En az bir teslim yöntemi seçilmelidir.','GUIDANCE_DELIVERY_REQUIRED');
 const opticalConfig=body.opticalConfig&&typeof body.opticalConfig==='object'?body.opticalConfig:{answerBlockCode:category==='RBA'?'RBA':code.slice(0,3),scaleMap:{A:1,B:2,C:3,D:4,E:5}};
 const existing=await one<any>(env.DB.prepare('SELECT id FROM guidance_assessment_instruments WHERE code=?').bind(code));
 if(existing)await env.DB.prepare(`UPDATE guidance_assessment_instruments SET title=?,category=?,version=?,description=?,question_schema_json=?,delivery_modes_json=?,optical_config_json=?,active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(title,category,version,description,JSON.stringify({scale:{min,max},items}),JSON.stringify(deliveryModes),JSON.stringify(opticalConfig),existing.id).run();
 else await env.DB.prepare(`INSERT INTO guidance_assessment_instruments(id,code,title,category,version,description,question_schema_json,requires_counselor_approval,clinical_use,evidence_level,active,delivery_modes_json,optical_config_json) VALUES(?,?,?,?,?,?,?,1,0,'INTERNAL_EDUCATIONAL',1,?,?)`).bind(uuid('gai'),code,title,category,version,description,JSON.stringify({scale:{min,max},items}),JSON.stringify(deliveryModes),JSON.stringify(opticalConfig)).run();
 await audit(env.DB,user.id,user.institution_id,'GUIDANCE_INSTRUMENT_UPSERTED','guidance_instrument',code,{category,deliveryModes,questionCount:items.length});
 return json({ok:true,code,questionCount:items.length,deliveryModes});
}

export async function evaluateGuidanceOptical(request:Request,env:Env,user:AuthUser){
 if(!guidanceAdminAllowed(user))return forbidden('Matbu optik değerlendirme yetkiniz yok.');
 const form=await request.formData();const file=form.get('file');if(!(file instanceof File))return badRequest('FMT/TXT/DAT/CSV dosyası seçin.');
 if(file.size>12*1024*1024)return badRequest('Dosya 12 MB sınırını aşıyor.');
 const code=String(form.get('instrumentCode')||'').trim().toUpperCase();const instrument=await one<any>(env.DB.prepare('SELECT * FROM guidance_assessment_instruments WHERE code=? AND active=1').bind(code));if(!instrument)return notFound('Rehberlik testi bulunamadı.');
 const deliveryModes=parseGuidanceJson<string[]>(instrument.delivery_modes_json,['ONLINE']);if(!deliveryModes.includes('PRINT_OPTICAL'))return badRequest('Bu test matbu optik kullanıma açılmamış.','GUIDANCE_PRINT_DISABLED');
 const institutionId=user.role==='SUPER_ADMIN'?String(form.get('institutionId')||''):user.institution_id;if(!institutionId)return badRequest('Kurum seçilmelidir.');
 if(user.role!=='SUPER_ADMIN'&&institutionId!==user.institution_id)return forbidden();
 const templateRows=await all<ParserTemplate>(env.DB.prepare(`SELECT v.id,t.name,v.parser_definition FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1 AND v.parser_definition IS NOT NULL`));
 const templateId=String(form.get('templateVersionId')||'');const templates=templateId?templateRows.filter(x=>x.id===templateId):templateRows;if(templateId&&!templates.length)return badRequest('Optik şablon bulunamadı.');
 const text=decodeUploadedBytes(await file.arrayBuffer());const parsed=templateId?parseWithTemplate(text,file.name,templates[0]):parseUploadedText(text,file.name,templates);
 if(!parsed.records.length)return badRequest(parsed.issues[0]||'Optik dosyası okunamadı.',parsed.ambiguous?'OPTICAL_TEMPLATE_AMBIGUOUS':'OPTICAL_TEMPLATE_REQUIRED');
 const opticalConfig=parseGuidanceJson<any>(instrument.optical_config_json,{answerBlockCode:'RBA',scaleMap:{A:1,B:2,C:3,D:4,E:5}});const schema=parseGuidanceJson<InstrumentSchema>(instrument.question_schema_json,{scale:{min:1,max:5},items:[]});const answerBlock=String(opticalConfig.answerBlockCode||'RBA').toUpperCase();const scaleMap=opticalConfig.scaleMap||{A:1,B:2,C:3,D:4,E:5};
 const batchId=uuid('gob');await env.DB.prepare(`INSERT INTO guidance_optical_batches(id,institution_id,instrument_id,optical_template_version_id,source_file_name,record_count,status,created_by) VALUES(?,?,?,?,?,?,'PREVIEW',?)`).bind(batchId,institutionId,instrument.id,templateId||parsed.templateId||null,file.name,parsed.records.length,user.id).run();
 let processed=0,matched=0,invalid=0,unmatched=0;const issues:any[]=[];
 for(const record of parsed.records){
  processed++;const studentNo=String(record.student_number||'').trim();if(!studentNo){unmatched++;issues.push({row:record.row_no,reason:'Öğrenci numarası bulunamadı.'});continue;}
  const student=await one<any>(env.DB.prepare(`SELECT s.id,e.student_number FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id AND e.institution_id=? WHERE e.student_number=? AND s.status IN ('ACTIVE','GUEST') ORDER BY CASE WHEN e.status='ACTIVE' THEN 0 ELSE 1 END LIMIT 1`).bind(institutionId,studentNo));
  if(!student){unmatched++;issues.push({row:record.row_no,studentNumber:studentNo,reason:'Öğrenci numarası kurumda bulunamadı.'});continue;}
  const raw=String(record.answers_by_subject?.[answerBlock]||Object.values(record.answers_by_subject||{})[0]||'').toUpperCase();const answers=Array.from(raw);if(answers.length<schema.items.length){invalid++;issues.push({row:record.row_no,studentNumber:studentNo,reason:`Beklenen ${schema.items.length}, bulunan ${answers.length} cevap.`});continue;}
  const responses:Record<string,number>={};let bad=false;for(let i=0;i<schema.items.length;i++){const value=scaleMap[answers[i]];if(!Number.isFinite(Number(value))){bad=true;break;}responses[schema.items[i].id]=Number(value);}
  if(bad){invalid++;issues.push({row:record.row_no,studentNumber:studentNo,reason:'Cevaplar A–E ölçeğine eşleşmedi.'});continue;}
  let scored;try{scored=scoreGuidanceResponses(schema,responses)}catch{invalid++;issues.push({row:record.row_no,studentNumber:studentNo,reason:'RBA cevapları puanlanamadı.'});continue;}
  const open=await one<any>(env.DB.prepare(`SELECT id FROM guidance_assessment_sessions WHERE student_id=? AND instrument_id=? AND status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED') ORDER BY created_at DESC LIMIT 1`).bind(student.id,instrument.id));
  if(open)await env.DB.prepare(`UPDATE guidance_assessment_sessions SET status='SUBMITTED',response_json=?,scored_result_json=?,submitted_at=CURRENT_TIMESTAMP,delivery_mode='PRINT_OPTICAL',optical_batch_id=?,student_number_snapshot=?,proposed_by='GUIDANCE_TEACHER',proposed_by_user_id=?,proposal_reason=? WHERE id=?`).bind(JSON.stringify(responses),JSON.stringify(scored),batchId,studentNo,user.id,'Matbu optik değerlendirme',open.id).run();
  else await env.DB.prepare(`INSERT INTO guidance_assessment_sessions(id,institution_id,student_id,instrument_id,proposed_by,proposed_by_user_id,proposal_reason,status,response_json,scored_result_json,submitted_at,delivery_mode,optical_batch_id,student_number_snapshot) VALUES(?,?,?,?,'GUIDANCE_TEACHER',?,?, 'SUBMITTED',?,?,CURRENT_TIMESTAMP,?,?,?)`).bind(uuid('gas'),institutionId,student.id,instrument.id,user.id,'Matbu optik değerlendirme',JSON.stringify(responses),JSON.stringify(scored),'PRINT_OPTICAL',batchId,studentNo).run();
  matched++;
 }
 const status=invalid||unmatched?'PARTIAL':'COMMITTED';await env.DB.prepare(`UPDATE guidance_optical_batches SET record_count=?,processed_count=?,matched_count=?,invalid_count=?,status=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(parsed.records.length,processed,matched,invalid+unmatched,status,batchId).run();
 await audit(env.DB,user.id,institutionId,'GUIDANCE_OPTICAL_EVALUATED','guidance_optical_batch',batchId,{instrumentCode:code,processed,matched,invalid,unmatched,templateId:templateId||parsed.templateId||null});
 return json({ok:true,batchId,processed,matched,invalid,unmatched,status,issues:issues.slice(0,50)});
}

export async function handleGuidanceAssessmentApi(request:Request,env:Env,user:AuthUser,url:URL):Promise<Response|null>{
 const path=url.pathname;
 if(path==='/api/nibiru/guidance/admin/instruments'&&request.method==='GET')return listGuidanceAdminInstruments(env,user);
 if(path==='/api/nibiru/guidance/admin/instruments'&&request.method==='POST')return upsertGuidanceInstrument(request,env,user);
 if(path==='/api/nibiru/guidance/admin/optical-evaluate'&&request.method==='POST')return evaluateGuidanceOptical(request,env,user);
 if(path==='/api/nibiru/guidance/instruments'&&request.method==='GET')return json({ok:true,instruments:await listGuidanceInstruments(env),policy:'Yalnız eğitimsel, tanısal olmayan araçlar; öğrenci uygulaması için gerçek rehber öğretmen onayı gerekir.'});
 if(path==='/api/nibiru/guidance/assessments/my'&&request.method==='GET')return myGuidanceSessions(env,user);
 if(path==='/api/nibiru/guidance/assessments/propose'&&request.method==='POST'){
  if(user.role!=='STUDENT'||!user.student_id)return forbidden('Rehberlik testi önerisi öğrenci hesabına açıktır.');const body:any=await request.json().catch(()=>({}));const code=String(body.instrumentCode||'').trim();if(!code)return badRequest('instrumentCode zorunludur.');const result=await proposeGuidanceAssessment(env,user,code,body.reason||'Öğrenci Nibiru üzerinden rehberlik değerlendirmesi istedi.',body.evidence);return result.ok?json({ok:true,reused:result.reused,session:result.session,message:'Öneri gerçek rehber öğretmenin onay kuyruğuna gönderildi.'},result.reused?200:201):result.response;
 }
 if(path==='/api/nibiru/guidance/assessments/counselor-queue'&&request.method==='GET')return counselorQueue(env,user);
 if(path==='/api/nibiru/guidance/development-profile'&&request.method==='GET'){
  if(user.role!=='STUDENT'||!user.student_id)return forbidden('Gelişim profili öğrenci hesabına açıktır.');return json({ok:true,development:await reviewedGuidanceDevelopmentContext(env,user.student_id),policy:'Yalnız gerçek rehber öğretmen tarafından incelenmiş sonuçlar kullanılır.'});
 }
 const action=path.match(/^\/api\/nibiru\/guidance\/assessments\/([^/]+)\/(approve|reject|submit|review)$/);
 if(action){const [,id,op]=action;if((op==='approve'||op==='reject')&&request.method==='PATCH')return counselorDecision(request,env,user,id,op as 'approve'|'reject');if(op==='submit'&&request.method==='POST')return submitGuidanceAssessment(request,env,user,id);if(op==='review'&&request.method==='PATCH')return reviewGuidanceAssessment(request,env,user,id);return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Bu yöntem desteklenmiyor.'}},405);}
 return null;
}

export async function guidanceAssessmentChatExtension(env:Env,user:AuthUser,message:string){
 if(user.role!=='STUDENT'||!user.student_id)return {proposal:null,development:null};
 const code=guidanceInstrumentForMessage(message);let proposal:any=null;
 if(code){const result=await proposeGuidanceAssessment(env,user,code,'Nibiru konuşmasında öğrenci eğitimsel rehberlik testi istedi.',{messageIntent:'GUIDANCE_ASSESSMENT'});proposal=result.ok?{reused:result.reused,session:result.session}:{error:'PROPOSAL_FAILED'};}
 const development=await reviewedGuidanceDevelopmentContext(env,user.student_id);
 return{proposal,development};
}
