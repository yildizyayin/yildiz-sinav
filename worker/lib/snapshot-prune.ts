import type { Env } from '../types';
import { all } from './db';

/**
 * Every live refresh writes a new result snapshot version; the old ones are never read again once a newer one exists.
 * A version is removed only when ALL of these hold, so nothing a page, a published result or a prepared file points at
 * is touched:
 *  - it is not the exam's current version (exam_delivery_profiles.snapshot_version) nor the newest version present;
 *  - no administration publishes it (published_snapshot_version);
 *  - no artifact manifest, preparation job, queue job or verification refers to it;
 *  - it is older than KEEP_DAYS.
 */
export const KEEP_DAYS = 3;

const referenced = `
  v.snapshot_version=(SELECT max(s2.snapshot_version) FROM exam_result_snapshots s2 WHERE s2.exam_id=v.exam_id)
  OR EXISTS(SELECT 1 FROM exam_delivery_profiles p WHERE p.exam_id=v.exam_id AND p.snapshot_version=v.snapshot_version)
  OR EXISTS(SELECT 1 FROM exam_administrations a WHERE a.exam_id=v.exam_id AND a.published_snapshot_version=v.snapshot_version)
  OR EXISTS(SELECT 1 FROM result_artifact_manifest m JOIN exam_administrations a ON a.id=m.administration_id WHERE a.exam_id=v.exam_id AND m.snapshot_version=v.snapshot_version)
  OR EXISTS(SELECT 1 FROM result_artifact_preparation_jobs j JOIN exam_administrations a ON a.id=j.administration_id WHERE a.exam_id=v.exam_id AND j.snapshot_version=v.snapshot_version)
  OR EXISTS(SELECT 1 FROM result_artifact_queue_jobs q JOIN exam_administrations a ON a.id=q.administration_id WHERE a.exam_id=v.exam_id AND q.snapshot_version=v.snapshot_version)
  OR EXISTS(SELECT 1 FROM result_artifact_verifications r JOIN exam_administrations a ON a.id=r.administration_id WHERE a.exam_id=v.exam_id AND r.snapshot_version=v.snapshot_version)`;

export async function pruneOldSnapshotVersions(env: Env, limit = 20) {
  const due = await all<{ exam_id: string; snapshot_version: number }>(env.DB.prepare(`SELECT v.exam_id,v.snapshot_version FROM
      (SELECT exam_id,snapshot_version,max(created_at) created_at FROM exam_result_snapshots GROUP BY exam_id,snapshot_version) v
    WHERE v.created_at<=datetime('now','-${KEEP_DAYS} days') AND NOT (${referenced}) LIMIT ?`).bind(limit)).catch((e) => { console.error('SNAPSHOT_PRUNE_SCAN', e instanceof Error ? e.message : e); return []; });
  for (const v of due) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM exam_result_scope_ranks WHERE exam_id=? AND snapshot_version=?').bind(v.exam_id, v.snapshot_version),
      env.DB.prepare('DELETE FROM publisher_question_analytics WHERE exam_id=? AND snapshot_version=?').bind(v.exam_id, v.snapshot_version),
      env.DB.prepare('DELETE FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?').bind(v.exam_id, v.snapshot_version),
    ]);
  }
  return due.length;
}
