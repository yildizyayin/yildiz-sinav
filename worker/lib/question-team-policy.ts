import type {Env} from '../types';
import {one} from './db';
export const QUESTION_TEAM_AGENTS=['GENERATOR','VERIFIER','ORIGINALITY','MEDIA','VIDEO'] as const;
export type QuestionTeamAgent=typeof QUESTION_TEAM_AGENTS[number];
export async function questionTeamPaused(env:Env,agents:readonly QuestionTeamAgent[]){
 if(env.QUESTION_TEAM_CONTROLS_ENABLED!=='true')return false;
 const global=await one<any>(env.DB.prepare('SELECT paused FROM question_team_control WHERE id=1'));
 if(!global||global.paused===1)return true;
 const blocked=await one<any>(env.DB.prepare(`SELECT count(*) total,COALESCE(sum(paused),0) n FROM question_team_agent_control WHERE agent_key IN (${agents.map(()=>'?').join(',')})`).bind(...agents));
 return Number(blocked?.total??0)!==agents.length||Number(blocked?.n??0)>0;
}
/** Embedded SQL has only trusted application aliases; no client-supplied names. */
export function mediaSourceFence(alias='j',syntheticAllowed=false){
 const real=`${alias}.synthetic=0 AND EXISTS(SELECT 1 FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE q.id=${alias}.question_id AND q.review_revision=${alias}.source_revision AND q.review_status='APPROVED'
 AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED') AND cv.verified=1 AND o.active=1
 AND (SELECT count(*) FROM question_learning_links WHERE question_id=q.id)=1
 AND o.id=json_extract(${alias}.source_snapshot_json,'$.outcome.id') AND o.code IS json_extract(${alias}.source_snapshot_json,'$.outcome.code')
 AND o.title=json_extract(${alias}.source_snapshot_json,'$.outcome.title') AND cv.id=json_extract(${alias}.source_snapshot_json,'$.outcome.curriculumVersionId')
 AND cv.program_version=json_extract(${alias}.source_snapshot_json,'$.outcome.programVersion')
 AND o.grade_level=q.grade_level AND cv.grade_level=q.grade_level AND cv.academic_year=q.academic_year AND o.subject_id=q.subject_id)`;
 return `(${syntheticAllowed?`(${alias}.synthetic=1 AND ${alias}.question_id IS NULL AND json_extract(${alias}.source_snapshot_json,'$.sourceKind')='SYNTHETIC_TECHNICAL') OR `:''}(${real}))`;
}
export async function mediaSourceValid(env:Env,id:string){
 return !!await one<any>(env.DB.prepare(`SELECT j.id FROM question_media_jobs j WHERE j.id=? AND ${mediaSourceFence('j',env.ENVIRONMENT==='staging')}`).bind(id));
}
export async function sha256(value:string|ArrayBuffer){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
