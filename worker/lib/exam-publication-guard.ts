import type {Env} from '../types';
import {badRequest,one} from './db';

// Call inside the exam operation lock, before changing source evidence.
export async function examPublicationGuard(env:Env,examId:string):Promise<Response|null>{
 const profile=await one<{result_freeze_status:string}>(env.DB.prepare('SELECT result_freeze_status FROM exam_delivery_profiles WHERE exam_id=?').bind(examId));
 const network=await one<{id:string}>(env.DB.prepare("SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND ranking_frozen_at IS NOT NULL LIMIT 1").bind(examId));
 if(network||profile&&['FROZEN','PUBLISHED'].includes(profile.result_freeze_status))return badRequest('Dondurulmuş veya yayımlanmış sınavın kaynak verisi değiştirilemez. İlgili yayını gerekçeyle düzeltmeye açın.','RESULTS_FROZEN');
 return null;
}

export async function examCorrectionOpen(env:Env,examId:string):Promise<boolean>{
 const profile=await one<any>(env.DB.prepare("SELECT exam_id FROM exam_delivery_profiles WHERE exam_id=? AND result_freeze_status='OPEN' AND snapshot_version>0").bind(examId));
 const network=await one<any>(env.DB.prepare("SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='READY' AND ranking_frozen_at IS NULL AND published_snapshot_version>0 LIMIT 1").bind(examId));
 // S042: a school's or a dealer's own exam stays open for its owner's key correction; the result network takes its
 // results back and evaluates every upload again with the new key (own-exams.ts correctOwnExamKey).
 const own=await one<any>(env.DB.prepare("SELECT 1 x FROM result_network_own_exams o JOIN exams e ON e.id=o.exam_id WHERE o.exam_id=? AND e.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM exam_administrations a WHERE a.exam_id=o.exam_id AND a.channel='RESULT_NETWORK' AND a.status='PUBLISHED') AND NOT EXISTS(SELECT 1 FROM scan_batches b WHERE b.exam_id=o.exam_id AND b.status='COMMITTED')").bind(examId));
 return !!(profile||network||own);
}
