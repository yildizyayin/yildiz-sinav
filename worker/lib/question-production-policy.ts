import type {Env} from '../types';
import {one,all} from './db';
export const PRODUCTION_CAMPAIGN='editorial-20261015';
export const AUTONOMOUS_CALIBRATION_KEYS=[1,2,3,4].map(n=>'e1b7adf6-31c2-4dc1-9fa1-84725d84d00'+n);
export async function productionQualityGate(env:Env){
 const gold=await one<any>(env.DB.prepare("SELECT status FROM question_verifier_calibrations WHERE id='editorial-verifier-20261015-v2'"));
 const rows=await all<any>(env.DB.prepare(`SELECT j.outcome_id,j.presentation,j.status,j.attempt_count,j.generated_count FROM question_generation_jobs j WHERE j.request_key IN (?,?,?,?) AND j.quality_profile='EDITORIAL_V1' AND j.editorial_repair_count=0 AND EXISTS(SELECT 1 FROM question_bank q WHERE q.source_job_id=j.id AND q.review_status IN ('REVIEW','APPROVED') AND q.editorial_packet_json IS NOT NULL) AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.entity_id=j.id AND a.action='QUESTION_GENERATION_REVIEW_READY' AND json_valid(a.details_json) AND json_extract(a.details_json,'$.producerCalled')=1 AND json_extract(a.details_json,'$.verification.ok')=1)`).bind(...AUTONOMOUS_CALIBRATION_KEYS));
 const passed=rows.filter(r=>r.status==='REVIEW_READY'&&r.attempt_count===1&&r.generated_count===1);
 const outcomes=new Set(passed.map(r=>r.outcome_id)).size,presentations=new Set(passed.map(r=>r.presentation)).size;
 return {allowed:gold?.status==='PASS'&&passed.length>=3&&outcomes>=2&&presentations>=2,verifierCalibration:gold?.status??'MISSING',passed:passed.length,total:4,successfulOutcomes:outcomes,successfulPresentations:presentations,scope:'SMALL_VERIFIED_PILOT',publisherQualityCertified:false};
}
export async function productionJobState(env:Env,jobId:string){
 if((env as any).QUESTION_PRODUCTION_CAMPAIGNS_ENABLED!=='true')return null;
 return one<any>(env.DB.prepare("SELECT c.status,c.id campaign_id,s.id slot_id,s.question_count,s.lease_until,s.status slot_status FROM question_production_slots s JOIN question_production_campaigns c ON c.id=s.campaign_id WHERE s.job_id=?").bind(jobId));
}
export const productionJobFence=`(NOT EXISTS(SELECT 1 FROM question_production_slots ps WHERE ps.job_id=j.id) OR EXISTS(SELECT 1 FROM question_production_slots ps JOIN question_production_campaigns pc ON pc.id=ps.campaign_id WHERE ps.job_id=j.id AND pc.status='ACTIVE' AND ps.status='RUNNING' AND ps.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ps.question_count=j.question_count AND EXISTS(SELECT 1 FROM users u WHERE u.id=pc.actor_id AND u.active=1 AND u.role='SUPER_ADMIN')))`;
export function productionWorkerCapacity(remainingNeurons:number,active:number,maximum:number){return Math.max(0,Math.min(4,maximum-active,Math.floor(remainingNeurons/8000)));}
