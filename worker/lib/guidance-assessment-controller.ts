import type { AuthUser,Env } from '../types';
import { badRequest,forbidden,json } from './db';
import { counselorDecision,counselorQueue,guidanceInstrumentForMessage,listGuidanceInstruments,myGuidanceSessions,proposeGuidanceAssessment,reviewGuidanceAssessment,reviewedGuidanceDevelopmentContext,submitGuidanceAssessment } from './guidance-assessments';

export async function handleGuidanceAssessmentApi(request:Request,env:Env,user:AuthUser,url:URL):Promise<Response|null>{
 const path=url.pathname;
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
