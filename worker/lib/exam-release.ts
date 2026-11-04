import type { AuthUser, Env } from '../types';
import { badRequest, forbidden, json, one } from './db';
import { examCorrectionOpen } from './exam-publication-guard';

/**
 * Tek "Sonuçları aç" (owner, 3 Nov). An exam's results open in one step for the app (students and parents) and for
 * sonuc.anunex.com together: the app result is frozen if needed and published, and the result network administration
 * is ranked and published. The planned result time (takvim) does the same by itself at that time.
 */
async function state(env: Env, examId: string) {
  const app = await one<any>(env.DB.prepare('SELECT result_freeze_status s,published_at,result_publish_at FROM exam_delivery_profiles WHERE exam_id=?').bind(examId));
  const net = await one<any>(env.DB.prepare(`SELECT id,status,published_at,result_release_at FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status IN ('UPLOADING','READY','PUBLISHED') ORDER BY created_at DESC LIMIT 1`).bind(examId));
  const students = await one<any>(env.DB.prepare('SELECT count(*) c FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=?').bind(examId));
  const plannedAt = app?.result_publish_at && Date.parse(String(app.result_publish_at).replace(' ', 'T') + (String(app.result_publish_at).includes('Z') ? '' : 'Z')) > Date.now() ? app.result_publish_at : (net?.result_release_at && Date.parse(net.result_release_at) > Date.now() ? net.result_release_at : null);
  const open = app?.s === 'PUBLISHED' || net?.status === 'PUBLISHED';
  const flagged = !!(await one<any>(env.DB.prepare('SELECT 1 x FROM exams WHERE id=? AND results_auto_open=1').bind(examId)));
  const national = !!(await one<any>(env.DB.prepare(`SELECT 1 x FROM exam_administrations WHERE exam_id=? AND (result_release_at IS NOT NULL OR application_start_at IS NOT NULL OR application_end_at IS NOT NULL) LIMIT 1`).bind(examId)));
  // Owner (4 Nov): a normal exam opens by itself once evaluated; a Türkiye geneli exam (or a planned time) waits.
  const auto = flagged && !national && !plannedAt;
  return { open, auto, national, appState: app?.s || 'OPEN', networkState: net?.status || null, networkId: net?.id || null, students: Number(students?.c || 0), plannedAt, openedAt: app?.published_at || net?.published_at || null, correctionOpen: await examCorrectionOpen(env, examId) };
}

export async function getRelease(env: Env, exam: any) { return json({ ok: true, ...(await state(env, exam.id)) }); }

const errorOf = async (r: Response) => { const b: any = await r.clone().json().catch(() => null); return b?.error || { code: 'RELEASE_STEP_FAILED', message: 'İşlem tamamlanamadı.' }; };

/** Opens the results now: app (freeze when needed, then publish) and the result network. */
export async function releaseNow(env: Env, user: AuthUser, exam: any): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN' && !(user.role === 'INSTITUTION_MANAGER' && exam.owner_type === 'INSTITUTION' && exam.institution_id === user.institution_id)) return forbidden('Sonuçları bu sınavın sahibi açabilir.');
  const s = await state(env, exam.id);
  if (s.correctionOpen) return json({ ok: false, error: { code: 'CORRECTION_OPEN', message: 'Sınav düzeltmede. Sonuçlar Düzeltme kapatılınca açılır.' }, state: s }, 409);
  if (!s.students) return badRequest('Henüz değerlendirilmiş öğrenci yok. Önce bir dosyayı değerlendirin.', 'NO_RESULTS');
  const steps: string[] = []; let network: any = {};
  if (s.appState !== 'PUBLISHED') {
    const pe = await import('./platform-expansion');
    if (s.appState !== 'FROZEN') { const f = await pe.freezeExam(env, user, exam.id); if (!f.ok) return json({ ok: false, error: await errorOf(f), steps, state: await state(env, exam.id) }, f.status); steps.push('APP_FROZEN'); }
    const p = await pe.publishExam(env, user, exam.id); if (!p.ok) return json({ ok: false, error: await errorOf(p), steps, state: await state(env, exam.id) }, p.status); steps.push('APP_PUBLISHED');
  }
  if (s.networkId && s.networkState !== 'PUBLISHED') {
    const { releaseAdministrationNow } = await import('../result-network-entry');
    const r = await releaseAdministrationNow(env, s.networkId, user.id);
    if (!r.ok) return json({ ok: false, error: await errorOf(r), steps, state: await state(env, exam.id) }, r.status);
    network = await r.clone().json().catch(() => ({}));
    await env.DB.prepare('UPDATE exam_administrations SET scheduled_release_done_at=COALESCE(scheduled_release_done_at,CURRENT_TIMESTAMP) WHERE id=?').bind(s.networkId).run();
    steps.push('NETWORK_PUBLISHED');
  }
  // the network publication's own fields (id, snapshotVersion, counts…) stay in the answer for the sonuc screens
  return json({ ...network, ok: true, steps, state: await state(env, exam.id) });
}

/**
 * Owner (4 Nov): "sınavı eklediğim anda yayınlansın" — a normal exam's results open in the app and on sonuc by
 * themselves as soon as they are evaluated, and later uploads join them (live refresh). Only a Türkiye geneli exam
 * (one with a national schedule) or an exam with a planned future result time waits. Correction keeps them closed.
 */
export async function autoOpenExam(env: Env, examId: string): Promise<string[]> {
  const exam = await one<any>(env.DB.prepare(`SELECT id,status FROM exams WHERE id=? AND status IN ('ACTIVE','CLOSED') AND NOT EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=exams.id AND r.app_trashed_at IS NOT NULL)`).bind(examId));
  if (!exam) return [];
  const s = await state(env, examId);
  if (s.correctionOpen || !s.students) return [];
  const steps: string[] = [];
  // Owner (4 Nov): open app results that no longer match the evaluated students (an upload evaluated on sonuc, or one
  // deleted and uploaded again) are written again — whatever the opening rule of the exam.
  if (s.appState === 'PUBLISHED' || s.appState === 'FROZEN') {
    const stale = await one<any>(env.DB.prepare(`SELECT (SELECT count(*) FROM exam_result_snapshots sn JOIN exam_delivery_profiles p ON p.exam_id=sn.exam_id AND p.snapshot_version=sn.snapshot_version WHERE sn.exam_id=?) shown,(SELECT count(*) FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=?) evaluated`).bind(examId, examId));
    if (Number(stale?.shown) !== Number(stale?.evaluated)) { const pe = await import('./platform-expansion'); if (await pe.refreshAppLivePublication(env, examId, null)) steps.push('APP_REFRESHED'); }
  }
  if (!s.auto) return steps;
  if (s.appState !== 'PUBLISHED') { const pe = await import('./platform-expansion'); if (await pe.openAppResultsNow(env, examId)) steps.push('APP'); }
  if (s.networkId && s.networkState !== 'PUBLISHED') {
    const { releaseAdministrationNow } = await import('../result-network-entry');
    const r = await releaseAdministrationNow(env, s.networkId, null);
    if (r.ok) { await env.DB.prepare('UPDATE exam_administrations SET scheduled_release_done_at=COALESCE(scheduled_release_done_at,CURRENT_TIMESTAMP) WHERE id=?').bind(s.networkId).run(); steps.push('NETWORK'); }
    else console.warn('NETWORK_AUTO_OPEN_SKIPPED', examId, r.status);
  }
  return steps;
}

/** Scheduled fallback (every 15 min): evaluated normal exams whose results are not open yet. */
export async function autoOpenDueExams(env: Env, limit = 20): Promise<number> {
  const { all } = await import('./db');
  const rows = await all<any>(env.DB.prepare(`SELECT e.id FROM exams e WHERE e.status IN ('ACTIVE','CLOSED')
    AND EXISTS(SELECT 1 FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=e.id)
    AND ((e.results_auto_open=1
      AND NOT EXISTS(SELECT 1 FROM exam_administrations a WHERE a.exam_id=e.id AND (a.result_release_at IS NOT NULL OR a.application_start_at IS NOT NULL OR a.application_end_at IS NOT NULL))
      AND (COALESCE((SELECT p.result_freeze_status FROM exam_delivery_profiles p WHERE p.exam_id=e.id),'OPEN')<>'PUBLISHED'
        OR EXISTS(SELECT 1 FROM exam_administrations a WHERE a.exam_id=e.id AND a.channel='RESULT_NETWORK' AND a.status IN ('UPLOADING','READY'))))
      -- open app results that do not show every evaluated student
      OR EXISTS(SELECT 1 FROM exam_delivery_profiles p WHERE p.exam_id=e.id AND p.result_freeze_status IN ('FROZEN','PUBLISHED')
        AND (SELECT count(*) FROM exam_result_snapshots sn WHERE sn.exam_id=e.id AND sn.snapshot_version=p.snapshot_version)<>(SELECT count(*) FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=e.id)))
    AND NOT EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL)
    ORDER BY e.updated_at DESC LIMIT ?`).bind(limit));
  let n = 0;
  for (const r of rows) { try { if ((await autoOpenExam(env, r.id)).length) n++; } catch (e) { console.error('AUTO_OPEN_FAILED', r.id, e instanceof Error ? e.message : e); } }
  return n;
}
