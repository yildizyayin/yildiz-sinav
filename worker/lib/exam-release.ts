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
  return { open, appState: app?.s || 'OPEN', networkState: net?.status || null, networkId: net?.id || null, students: Number(students?.c || 0), plannedAt, openedAt: app?.published_at || net?.published_at || null, correctionOpen: await examCorrectionOpen(env, examId) };
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
