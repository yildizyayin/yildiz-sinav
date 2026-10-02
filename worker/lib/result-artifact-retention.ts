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

export async function sweepRetiredResultArtifacts(env:Env){
 if(env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||!env.RESULT_FILES)return {enabled:false,processed:0,failed:0};
 const jobs=await all<{administration_id:string;retired_through_version:number;sweep_version:number}>(env.DB.prepare(`SELECT administration_id,retired_through_version,sweep_version FROM result_artifact_retirements WHERE next_sweep_at<=CURRENT_TIMESTAMP ORDER BY next_sweep_at,administration_id LIMIT 5`));
 let failed=0;
 for(const job of jobs){
  if(!Number.isSafeInteger(job.retired_through_version)||job.sweep_version>job.retired_through_version)throw Error('RESULT_ARTIFACT_RETIREMENT_SCOPE_INVALID');
  try{
   const result=await sweepRetiredResultArtifactVersion(env.RESULT_FILES,job.administration_id,job.sweep_version);
   const completedCycle=!result.hasMore&&job.sweep_version===job.retired_through_version;
   const nextVersion=result.hasMore?job.sweep_version:completedCycle?1:job.sweep_version+1;
   // Never forget an empty range: a revoked R2 writer may still finish late.
   await env.DB.prepare(`UPDATE result_artifact_retirements SET sweep_version=?,last_sweep_at=CURRENT_TIMESTAMP,next_sweep_at=datetime('now',?) WHERE administration_id=? AND retired_through_version=? AND sweep_version=?`).bind(nextVersion,completedCycle?'+1 day':'+1 minute',job.administration_id,job.retired_through_version,job.sweep_version).run();
  }catch{
   failed++;
   // A failing bucket page must not starve the other jobs. Keep the marker.
   await env.DB.prepare(`UPDATE result_artifact_retirements SET next_sweep_at=datetime('now','+5 minutes') WHERE administration_id=? AND retired_through_version=? AND sweep_version=?`).bind(job.administration_id,job.retired_through_version,job.sweep_version).run();
  }
 }
 return {enabled:true,processed:jobs.length,failed};
}
