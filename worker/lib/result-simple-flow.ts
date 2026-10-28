import type { Env } from '../types';
import { all, one, uuid } from './db';

/**
 * S030/D-S038: sonuc.anunex.com is an open evaluation platform. Every uploaded sheet is a participant; there is no
 * "guest" step. Only a sheet whose score would be wrong (booklet unknown in a multi-booklet exam, two people on one
 * record) is left out of the evaluation with its exact reason, and the rest is evaluated.
 */
const UNRESOLVED = `resolution_status!='CANCELLED' AND (match_status IN ('NEW_GUEST','AMBIGUOUS','INVALID') OR issues_json!='[]')`;

const batchStatusSql = (env: Env, batchId: string) => env.DB.prepare(`UPDATE scan_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM scan_records WHERE batch_id=? AND ${UNRESOLVED}) THEN 'NEEDS_REVIEW' ELSE 'READY' END WHERE id=? AND status IN ('PREVIEW','NEEDS_REVIEW','READY')`).bind(batchId, batchId);

/**
 * D-S038 (owner, 28 Oct): on sonuc every uploaded student is evaluated; there are no registered students and no
 * guests. Warnings that do not stop scoring are kept as notes, not blockers: an invalid mark is already counted as
 * blank, an unreadable name becomes "Ad okunamadı · No …", and "not matched to a registered student" is meaningless
 * here. Only what makes a score wrong still blocks: a missing booklet when the exam has more than one booklet.
 */
const NAME_ONLY = /Öğrenci numarası bulunamadı; ad soyad ve sınıf ile eşleşti/i;
const NON_BLOCKING = [NAME_ONLY, /geçersiz karakter/i, /Kayıtlı öğrenciyle eşleşmedi/i, /^Ad soyad okunamadı\.?$/i, /ad soyad farklı görünüyor/i];
export const isNonBlocking = (issue: string) => NON_BLOCKING.some((r) => r.test(issue));
export const unreadableName = (c: any, rowNo: number) => `Ad okunamadı · ${String(c?.student_number || '').trim() ? `No ${String(c.student_number).trim()}` : `Satır ${rowNo}`}`;

/** Every sheet that can be scored becomes a participant at once (the result network has no guest step). */
export async function acceptReadableSheets(env: Env, batchId: string, actorId: string, institutionId: string): Promise<number> {
  const rows = await all<{ id: string; row_no: number; canonical_json: string; issues_json: string }>(env.DB.prepare(`SELECT id,row_no,canonical_json,issues_json FROM scan_records WHERE batch_id=? AND ((resolution_status!='CANCELLED'
    AND (match_status IN ('NEW_GUEST','INVALID') OR (match_status IN ('ACTIVE_MATCH','GUEST_MATCH') AND issues_json!='[]')))
    OR (resolution_status='CANCELLED' AND issues_json LIKE '["Değerlendirme dışı:%'))`).bind(batchId));
  // D-S039: a sheet whose grade belongs to another school level (a 7th grader in a 12th-grade exam) is not this
  // exam's student; it stays out with that reason so it can be uploaded under the right exam.
  const exam = await one<{ g: number | null }>(env.DB.prepare('SELECT e.grade_level g FROM scan_batches b JOIN exams e ON e.id=b.exam_id WHERE b.id=?').bind(batchId));
  const level = (g: number) => (g <= 4 ? 1 : g <= 8 ? 2 : 3);
  const misfit: Array<{ id: string; issue: string }> = [];
  const accepted: Array<{ id: string; c: string; u: number }> = [];
  for (const r of rows) {
    let c: any = {}; try { c = JSON.parse(r.canonical_json || '{}'); } catch { continue; }
    let stored: string[] = []; try { stored = JSON.parse(r.issues_json || '[]'); } catch { /* */ }
    // A row set aside automatically before D-S038 carries its reasons as one "Değerlendirme dışı: a · b" line.
    stored = stored.flatMap((x) => String(x).startsWith('Değerlendirme dışı:') ? String(x).slice('Değerlendirme dışı:'.length).split(' · ').map((y) => y.trim()).filter(Boolean) : [String(x)]);
    const all = [...new Set([...(Array.isArray(c.issues) ? c.issues : []), ...stored].map(String))];
    if (all.some((x) => !isNonBlocking(x))) continue;
    const g = Number(c.grade_level || 0), eg = Number(exam?.g || 0);
    if (g >= 1 && g <= 12 && eg >= 1 && eg <= 12 && level(g) !== level(eg)) { misfit.push({ id: r.id, issue: `Sınıf düzeyi bu sınava uymuyor: ${g}. sınıf öğrencisi, sınav ${eg}. sınıf için. Bu öğrenciyi kendi sınavına yükleyin.` }); continue; }
    const notes = all.filter((x) => !/Kayıtlı öğrenciyle eşleşmedi/i.test(x));
    if (!String(c.name || '').trim()) { c.name = unreadableName(c, Number(r.row_no)); notes.push('Ad soyad okunamadı; numarayla değerlendirildi.'); }
    c.issues = []; if (notes.length) c.notes = [...new Set([...(Array.isArray(c.notes) ? c.notes : []), ...notes])];
    // A match by name alone is not trusted on sonuc (two students can share a name): the sheet is its own participant.
    accepted.push({ id: r.id, c: JSON.stringify(c), u: all.some((x) => NAME_ONLY.test(x)) ? 1 : 0 });
  }
  if (misfit.length) await env.DB.batch(misfit.map((m) => env.DB.prepare(`UPDATE scan_records SET match_status='INVALID',resolution_status='PENDING',issues_json=? WHERE id=? AND batch_id=?`).bind(JSON.stringify([m.issue]), m.id, batchId)));
  if (!accepted.length) { await batchStatusSql(env, batchId).run(); return 0; }
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < accepted.length; i += 400) {
    const chunk = JSON.stringify(accepted.slice(i, i + 400));
    statements.push(env.DB.prepare(`UPDATE scan_records SET match_status=CASE WHEN match_status IN ('NEW_GUEST','INVALID') THEN 'GUEST_MATCH' ELSE match_status END,match_confidence=1,
      matched_student_id=CASE WHEN (SELECT json_extract(value,'$.u') FROM json_each(?1) WHERE json_extract(value,'$.id')=scan_records.id)=1 THEN NULL ELSE matched_student_id END,resolution_status='RESOLVED',issues_json='[]',
      canonical_json=(SELECT json_extract(value,'$.c') FROM json_each(?1) WHERE json_extract(value,'$.id')=scan_records.id)
      WHERE batch_id=?2 AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?1))`).bind(chunk, batchId));
  }
  statements.push(batchStatusSql(env, batchId));
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
    .bind(uuid('aud'), actorId, institutionId, 'SCAN_BATCH_PARTICIPANTS_ACCEPTED', 'scan_batch', batchId, JSON.stringify({ accepted: accepted.length, reason: 'Sonuç ağı: yüklenen her öğrenci değerlendirilir (D-S038).' })));
  await env.DB.batch(statements);
  return accepted.length;
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
