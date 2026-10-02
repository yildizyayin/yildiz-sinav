import type {Env} from '../types';
import {all} from './db';
import {sweepRetiredResultArtifactVersion} from './result-artifacts';

// Caller holds the exam operation lock and rechecks the due publication.
// No FK: cascading this away would lose orphan cleanup and allow version reuse.
export async function retireResultArtifactVersions(env:Env,administrationId:string,examId:string){
 const row=await env.DB.prepare(`SELECT MAX(version) version FROM (
  SELECT snapshot_version version FROM exam_result_snapshots WHERE exam_id=?
  UNION ALL SELECT snapshot_version FROM result_artifact_manifest WHERE administration_id=?
  UNION ALL SELECT published_snapshot_version FROM exam_administrations WHERE id=?
 )`).bind(examId,administrationId,administrationId).first<{version:number|null}>();
 if(!row?.version)return;
 if(!Number.isSafeInteger(row.version)||row.version<1)throw Error('RESULT_ARTIFACT_RETIREMENT_VERSION_INVALID');
 const inserted=await env.DB.prepare(`INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES(?,?,?)
  ON CONFLICT(administration_id) DO UPDATE SET retired_through_version=MAX(retired_through_version,excluded.retired_through_version),
  next_sweep_at=CURRENT_TIMESTAMP WHERE result_artifact_retirements.exam_id=excluded.exam_id`).bind(administrationId,examId,row.version).run();
 if(!inserted.meta?.changes)throw Error('RESULT_ARTIFACT_RETIREMENT_SCOPE_FAILED');
}

export async function sweepRetiredResultArtifactJob(env:Env,administrationId:string,fastDrain=false){
 if(env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||!env.RESULT_FILES)throw Error('RESULT_ARTIFACT_CLEANUP_DISABLED');
 const job=await env.DB.prepare(`SELECT administration_id,retired_through_version,sweep_version,MAX(0,CAST(strftime('%s',next_sweep_at)-strftime('%s','now') AS INTEGER)) wait_seconds FROM result_artifact_retirements WHERE administration_id=?`).bind(administrationId).first<{administration_id:string;retired_through_version:number;sweep_version:number;wait_seconds:number}>();
 if(!job)return {active:false,hasMore:false,delaySeconds:0};
 if(job.wait_seconds>0)return {active:false,hasMore:true,delaySeconds:Math.min(86400,job.wait_seconds)};
 if(!Number.isSafeInteger(job.retired_through_version)||job.sweep_version>job.retired_through_version)throw Error('RESULT_ARTIFACT_RETIREMENT_SCOPE_INVALID');
 try{
  const result=await sweepRetiredResultArtifactVersion(env.RESULT_FILES,job.administration_id,job.sweep_version);
  const completedCycle=!result.hasMore&&job.sweep_version===job.retired_through_version;
  const nextVersion=result.hasMore?job.sweep_version:completedCycle?1:job.sweep_version+1;
  const updated=await env.DB.prepare(`UPDATE result_artifact_retirements SET sweep_version=?,last_sweep_at=CURRENT_TIMESTAMP,next_sweep_at=datetime('now',?) WHERE administration_id=? AND retired_through_version=? AND sweep_version=?`).bind(nextVersion,completedCycle?'+1 day':fastDrain?'+0 seconds':'+1 minute',job.administration_id,job.retired_through_version,job.sweep_version).run();
  return {active:true,hasMore:!completedCycle||!updated.meta?.changes,delaySeconds:fastDrain?0:60};
 }catch(error){
  await env.DB.prepare(`UPDATE result_artifact_retirements SET next_sweep_at=datetime('now','+5 minutes') WHERE administration_id=? AND retired_through_version=? AND sweep_version=?`).bind(job.administration_id,job.retired_through_version,job.sweep_version).run();
  throw error;
 }
}

export async function sweepRetiredResultArtifacts(env:Env){
 if(env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||!env.RESULT_FILES)return {enabled:false,processed:0,failed:0};
 const jobs=await all<{administration_id:string}>(env.DB.prepare(`SELECT administration_id FROM result_artifact_retirements WHERE next_sweep_at<=CURRENT_TIMESTAMP ORDER BY next_sweep_at,administration_id LIMIT 5`));
 let failed=0;
 for(const job of jobs){try{await sweepRetiredResultArtifactJob(env,job.administration_id)}catch{failed++}}
 return {enabled:true,processed:jobs.length,failed};
}
