import { withExamOperationLock } from './exam-operation-lock';
import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';

export type ExamScheduleInput = {
  applicationStartAt?: string | null;
  applicationEndAt?: string | null;
  resultPublishAt?: string | null;
};

function normalizeIso(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = String(value).trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function validateExamSchedule(input: ExamScheduleInput) {
  const applicationStartAt = normalizeIso(input.applicationStartAt);
  const applicationEndAt = normalizeIso(input.applicationEndAt);
  const resultPublishAt = normalizeIso(input.resultPublishAt);
  if (input.applicationStartAt !== undefined && applicationStartAt === undefined) return { ok:false as const, message:'Uygulama başlangıç tarihi geçersiz.' };
  if (input.applicationEndAt !== undefined && applicationEndAt === undefined) return { ok:false as const, message:'Uygulama bitiş tarihi geçersiz.' };
  if (input.resultPublishAt !== undefined && resultPublishAt === undefined) return { ok:false as const, message:'Sonuç yayın tarihi geçersiz.' };
  if (applicationStartAt && applicationEndAt && applicationStartAt > applicationEndAt) return { ok:false as const, message:'Uygulama başlangıcı bitiş tarihinden sonra olamaz.' };
  if (applicationEndAt && resultPublishAt && resultPublishAt < applicationEndAt) return { ok:false as const, message:'Sonuç yayın zamanı uygulama bitişinden önce olamaz.' };
  return { ok:true as const, value:{ applicationStartAt, applicationEndAt, resultPublishAt } };
}

async function canManageSchedule(env:Env,user:AuthUser,examId:string){
  if(user.role==='SUPER_ADMIN')return true;
  if(user.role!=='INSTITUTION_MANAGER'||!user.institution_id)return false;
  const row=await one<any>(env.DB.prepare(`SELECT e.institution_id,COALESCE(p.scope,'INSTITUTION') scope
    FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id WHERE e.id=?`).bind(examId));
  return !!row && row.scope==='INSTITUTION' && row.institution_id===user.institution_id;
}

export async function getExamSchedule(env:Env,user:AuthUser,examId:string):Promise<Response>{
  if(!await canManageSchedule(env,user,examId))return forbidden();
  const row=await one<any>(env.DB.prepare(`SELECT e.id,e.application_start_at,e.application_end_at,p.result_publish_at,p.result_freeze_status,p.published_at,p.snapshot_version
    FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id WHERE e.id=?`).bind(examId));
  if(!row)return notFound('Sınav bulunamadı.');
  return json({ok:true,schedule:row});
}

export async function saveExamSchedule(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
  if(!await canManageSchedule(env,user,examId))return forbidden();
  const exists=await one<any>(env.DB.prepare('SELECT id,institution_id FROM exams WHERE id=?').bind(examId));
  if(!exists)return notFound('Sınav bulunamadı.');
  const body:any=await request.json().catch(()=>({}));
  const verdict=validateExamSchedule(body);
  if(!verdict.ok)return badRequest(verdict.message,'INVALID_EXAM_SCHEDULE');
  const current=await one<any>(env.DB.prepare(`SELECT e.application_start_at,e.application_end_at,p.result_publish_at,p.result_freeze_status,p.published_at
    FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id WHERE e.id=?`).bind(examId));
  const applicationStartAt=verdict.value.applicationStartAt===undefined?current?.application_start_at??null:verdict.value.applicationStartAt;
  const applicationEndAt=verdict.value.applicationEndAt===undefined?current?.application_end_at??null:verdict.value.applicationEndAt;
  const resultPublishAt=verdict.value.resultPublishAt===undefined?current?.result_publish_at??null:verdict.value.resultPublishAt;
  const finalVerdict=validateExamSchedule({applicationStartAt,applicationEndAt,resultPublishAt});
  if(!finalVerdict.ok)return badRequest(finalVerdict.message,'INVALID_EXAM_SCHEDULE');
  if(current?.result_freeze_status==='PUBLISHED'&&body.resultPublishAt!==undefined&&resultPublishAt!==current?.result_publish_at){
    return badRequest('Yayınlanmış bir sonuç yeniden geleceğe planlanamaz. Yayın zamanı değiştirilemez.','RESULT_ALREADY_PUBLISHED');
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE exams SET application_start_at=?,application_end_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(applicationStartAt,applicationEndAt,examId),
    env.DB.prepare(`INSERT INTO exam_delivery_profiles(exam_id,result_publish_at,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(exam_id) DO UPDATE SET result_publish_at=excluded.result_publish_at,updated_at=CURRENT_TIMESTAMP`).bind(examId,resultPublishAt),
  ]);
  await audit(env.DB,user.id,exists.institution_id||user.institution_id||null,'EXAM_RESULT_SCHEDULE_UPDATED','exam',examId,{applicationStartAt,applicationEndAt,resultPublishAt});
  return getExamSchedule(env,user,examId);
}

export async function publishScheduledExamResults(env:Env):Promise<number>{
  const due=await all<any>(env.DB.prepare(`SELECT p.exam_id,e.institution_id,p.snapshot_version,p.result_publish_at
    FROM exam_delivery_profiles p JOIN exams e ON e.id=p.exam_id
    WHERE p.result_freeze_status='FROZEN' AND p.result_publish_at IS NOT NULL AND datetime(p.result_publish_at)<=CURRENT_TIMESTAMP
    ORDER BY p.result_publish_at ASC LIMIT 100`));
  let count=0;
  for(const row of due){
    const response=await withExamOperationLock(env,row.exam_id,'AUTO_PUBLISH',async()=>{
      const guard=`exam_id=? AND snapshot_version=? AND result_freeze_status='FROZEN' AND result_publish_at=? AND datetime(result_publish_at)<=CURRENT_TIMESTAMP`;
      const results=await env.DB.batch([
        env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json)
          SELECT ?,NULL,?,'EXAM_RESULTS_AUTO_PUBLISHED','exam',?,? WHERE EXISTS (SELECT 1 FROM exam_delivery_profiles WHERE ${guard})`)
          .bind(uuid('aud'),row.institution_id||null,row.exam_id,JSON.stringify({version:row.snapshot_version,resultPublishAt:row.result_publish_at}),row.exam_id,row.snapshot_version,row.result_publish_at),
        env.DB.prepare(`UPDATE exam_delivery_profiles SET result_freeze_status='PUBLISHED',published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE ${guard}`)
          .bind(row.exam_id,row.snapshot_version,row.result_publish_at),
      ]);
      return json({published:Number(results[1].meta?.changes||0)>0});
    });
    if(response.ok&&(await response.json() as any).published)count++;

  }
  return count;
}

export async function resultsAvailableNow(env:Env,examId:string):Promise<boolean>{
  const row=await one<{available:number}>(env.DB.prepare(`SELECT CASE WHEN result_freeze_status='PUBLISHED' AND published_at IS NOT NULL
    AND (result_publish_at IS NULL OR datetime(result_publish_at)<=CURRENT_TIMESTAMP) THEN 1 ELSE 0 END available
    FROM exam_delivery_profiles WHERE exam_id=?`).bind(examId));
  return Number(row?.available||0)===1;
}
