import type { Env } from '../types';
import { all, uuid } from './db';

/**
 * S030 (owner decision 26 Oct): sonuc.anunex.com is an open evaluation platform. Every readable sheet is a participant;
 * there is no "guest" step. A sheet that cannot be scored (no name, unreadable booklet, ambiguous person) is left out of the
 * evaluation with its exact reason, and the rest is evaluated.
 */
const UNRESOLVED = `resolution_status!='CANCELLED' AND (match_status IN ('NEW_GUEST','AMBIGUOUS','INVALID') OR issues_json!='[]')`;

const batchStatusSql = (env: Env, batchId: string) => env.DB.prepare(`UPDATE scan_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM scan_records WHERE batch_id=? AND ${UNRESOLVED}) THEN 'NEEDS_REVIEW' ELSE 'READY' END WHERE id=? AND status IN ('PREVIEW','NEEDS_REVIEW','READY')`).bind(batchId, batchId);

/** Unmatched but readable sheets become participants at once. */
export async function acceptReadableSheets(env: Env, batchId: string, actorId: string, institutionId: string): Promise<number> {
  const rows = await all<{ id: string }>(env.DB.prepare(`SELECT id FROM scan_records WHERE batch_id=? AND resolution_status!='CANCELLED' AND match_status='NEW_GUEST'
    AND trim(coalesce(json_extract(canonical_json,'$.name'),''))<>'' AND coalesce(json_array_length(json_extract(canonical_json,'$.issues')),0)=0`).bind(batchId));
  if (!rows.length) { await batchStatusSql(env, batchId).run(); return 0; }
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += 90) {
    const chunk = rows.slice(i, i + 90).map((r) => r.id);
    statements.push(env.DB.prepare(`UPDATE scan_records SET match_status='GUEST_MATCH',match_confidence=1,resolution_status='RESOLVED',issues_json='[]' WHERE batch_id=? AND id IN (${chunk.map(() => '?').join(',')})`).bind(batchId, ...chunk));
  }
  statements.push(batchStatusSql(env, batchId));
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
    .bind(uuid('aud'), actorId, institutionId, 'SCAN_BATCH_PARTICIPANTS_ACCEPTED', 'scan_batch', batchId, JSON.stringify({ accepted: rows.length, reason: 'Sonuç ağı: okunabilen her optik katılımcıdır.' })));
  await env.DB.batch(statements);
  return rows.length;
}

const reasonOf = (row: any) => {
  let issues: string[] = []; try { issues = JSON.parse(row.issues_json || '[]'); } catch { /* */ }
  const name = (() => { try { return String(JSON.parse(row.canonical_json || '{}').name || '').trim(); } catch { return ''; } })();
  if (issues.length) return { name, reason: issues.join(' · ') };
  if (!name) return { name, reason: 'Ad soyad okunamadı.' };
  if (row.match_status === 'AMBIGUOUS') return { name, reason: 'Aynı ada sahip birden fazla kayıtlı öğrenci var.' };
  return { name, reason: 'Satır okunamadı.' };
};

/** Before evaluating: sheets that still cannot be scored are left out, each with its reason, so the rest can be evaluated. */
export async function setAsideUnscorable(env: Env, batchId: string, actorId: string, institutionId: string): Promise<Array<{ row: number; name: string; reason: string }>> {
  const rows = await all<any>(env.DB.prepare(`SELECT id,row_no,match_status,issues_json,canonical_json FROM scan_records WHERE batch_id=? AND ${UNRESOLVED} ORDER BY row_no`).bind(batchId));
  if (!rows.length) return [];
  const out = rows.map((r) => ({ id: r.id, row: Number(r.row_no), ...reasonOf(r) }));
  const statements: D1PreparedStatement[] = out.map((r) => env.DB.prepare(`UPDATE scan_records SET resolution_status='CANCELLED',match_status='INVALID',matched_student_id=NULL,issues_json=? WHERE id=? AND batch_id=?`).bind(JSON.stringify([`Değerlendirme dışı: ${r.reason}`]), r.id, batchId));
  statements.push(batchStatusSql(env, batchId));
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
    .bind(uuid('aud'), actorId, institutionId, 'SCAN_BATCH_ROWS_SET_ASIDE', 'scan_batch', batchId, JSON.stringify({ rows: out.map(({ row, reason }) => ({ row, reason })) })));
  await env.DB.batch(statements);
  return out.map(({ row, name, reason }) => ({ row, name, reason }));
}
