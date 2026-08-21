import app from './v2-secure-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { roleCanManageInstitution } from './lib/permissions';
import { audit, badRequest, forbidden, json, one, uuid } from './lib/db';
import { calibrationWithinTolerance, nextCalibrationStatus, type CalibrationMetrics } from './lib/calibration';

function safeFileName(value:string){return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'file'}

function composeCalibration(previous:any,residual:CalibrationMetrics){
  const px=Number.isFinite(Number(previous?.offset_x_mm))?Number(previous.offset_x_mm):0;
  const py=Number.isFinite(Number(previous?.offset_y_mm))?Number(previous.offset_y_mm):0;
  const psx=Number.isFinite(Number(previous?.scale_x))&&Number(previous.scale_x)!==0?Number(previous.scale_x):1;
  const psy=Number.isFinite(Number(previous?.scale_y))&&Number(previous.scale_y)!==0?Number(previous.scale_y):1;
  const prot=Number.isFinite(Number(previous?.rotation_deg))?Number(previous.rotation_deg):0;
  return {
    offset_x_mm:px+residual.offset_x_mm,
    offset_y_mm:py+residual.offset_y_mm,
    scale_x:psx*residual.scale_x,
    scale_y:psy*residual.scale_y,
    rotation_deg:prot+residual.rotation_deg,
  };
}

async function saveAttempt(request:Request,env:Env,calibrationId:string){
  const user=await getAuthUser(env,request);
  if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401);
  if(!roleCanManageInstitution(user.role))return forbidden();
  const cal=await one<any>(env.DB.prepare(`SELECT c.*,p.institution_id FROM printer_optical_calibrations c JOIN printer_profiles p ON p.id=c.printer_profile_id WHERE c.id=?`).bind(calibrationId));
  if(!cal)return forbidden();
  if(user.role!=='SUPER_ADMIN'&&user.institution_id!==cal.institution_id)return forbidden();
  if(user.role!=='SUPER_ADMIN'&&user.institution_id){const inst=await one<{status:string}>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));if(inst?.status==='PASSIVE')return forbidden('Kurum hesabınız aktif değildir.');}
  const form=await request.formData();const image=form.get('image');const metricsRaw=form.get('metrics')?.toString();const mode=form.get('mode')?.toString()==='MANUAL_VERIFY'?'MANUAL_VERIFY':'AUTO';
  if(!(image instanceof File)||!metricsRaw)return badRequest('Kalibrasyon görseli ve analiz ölçümleri gerekli.');
  let metrics:CalibrationMetrics;try{metrics=JSON.parse(metricsRaw)}catch{return badRequest('Kalibrasyon ölçümleri okunamadı.')}
  if(![metrics.offset_x_mm,metrics.offset_y_mm,metrics.scale_x,metrics.scale_y,metrics.rotation_deg,metrics.confidence].every(Number.isFinite))return badRequest('Geçersiz kalibrasyon ölçümleri.');
  const attemptNo=Number(cal.attempt_count||0)+1;const imageKey=`calibration/${cal.institution_id}/${calibrationId}/${Date.now()}-${safeFileName(image.name||'scan.jpg')}`;
  await env.FILES.put(imageKey,image.stream(),{httpMetadata:{contentType:image.type||'image/jpeg'}});
  const within=calibrationWithinTolerance(metrics);let status=nextCalibrationStatus(attemptNo,within);if(mode==='MANUAL_VERIFY'&&!within)status='MANUAL_REQUIRED';
  const cumulative=composeCalibration(cal,metrics);
  await env.DB.prepare(`INSERT INTO calibration_attempts (id,calibration_id,attempt_no,mode,image_key,offset_x_mm,offset_y_mm,scale_x,scale_y,rotation_deg,confidence,within_tolerance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid('catt'),calibrationId,attemptNo,mode,imageKey,metrics.offset_x_mm,metrics.offset_y_mm,metrics.scale_x,metrics.scale_y,metrics.rotation_deg,metrics.confidence,within?1:0).run();
  await env.DB.prepare(`UPDATE printer_optical_calibrations SET status=?,offset_x_mm=?,offset_y_mm=?,scale_x=?,scale_y=?,rotation_deg=?,attempt_count=?,verified_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,cumulative.offset_x_mm,cumulative.offset_y_mm,cumulative.scale_x,cumulative.scale_y,cumulative.rotation_deg,attemptNo,within?new Date().toISOString():null,calibrationId).run();
  const fresh=await one<any>(env.DB.prepare('SELECT * FROM printer_optical_calibrations WHERE id=?').bind(calibrationId));
  await audit(env.DB,user.id,cal.institution_id,within?'CALIBRATION_VERIFIED':'CALIBRATION_ATTEMPT','calibration',calibrationId,{attemptNo,mode,residual:metrics,cumulative,status});
  return json({ok:true,attemptNo,status,withinTolerance:within,metrics,cumulative,calibration:fresh});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);const m=url.pathname.match(/^\/api\/calibrations\/([^/]+)\/attempt$/);
  if(m&&request.method==='POST')return saveAttempt(request,env,m[1]);
  return app.fetch(request,env);
}} satisfies ExportedHandler<Env>;
