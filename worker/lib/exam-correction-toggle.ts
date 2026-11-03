import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, one } from './db';
import { examCorrectionOpen } from './exam-publication-guard';

/**
 * Tek "Düzeltme" anahtarı (owner, 3 Nov). Until now an exam had two correction switches — the app's result
 * publication (exam_delivery_profiles) and the result network's (exam_administrations) — and a correction needed both
 * open. This opens and closes them together:
 *  - OPEN (reason, Super Admin): every publication the exam has is reopened with the same reason; uploads become
 *    re-evaluable, the scoring profile and the key can be changed. Students see no result until it is closed (as before).
 *  - CLOSE (Super Admin): only when every upload is evaluated again; each publication goes back to the state it had
 *    (app: frozen or published; network: published with fresh ranks).
 * Each step is the existing audited action (EXAM_RESULTS_REOPENED, RESULT_NETWORK_RESULTS_REOPENED, freeze, publish).
 */
type State = {
  open: boolean;
  app: { state: string | null; snapshotVersion: number };
  network: { id: string; status: string; publishedVersion: number } | null;
  canOpen: boolean;
  pending: Array<{ id: string; institution: string; total: number; status: string }>;
};

async function readState(env: Env, examId: string): Promise<State> {
  const app = await one<any>(env.DB.prepare('SELECT result_freeze_status,snapshot_version FROM exam_delivery_profiles WHERE exam_id=?').bind(examId));
  const net = await one<any>(env.DB.prepare(`SELECT id,status,COALESCE(published_snapshot_version,0) v FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' ORDER BY created_at DESC LIMIT 1`).bind(examId));
  const pending = await all<any>(env.DB.prepare(`SELECT b.id,b.status,COALESCE(i.name,'Kurum') institution,(SELECT count(*) FROM scan_records r WHERE r.batch_id=b.id AND r.resolution_status<>'CANCELLED') total
    FROM scan_batches b LEFT JOIN institutions i ON i.id=b.institution_id
    WHERE b.exam_id=? AND b.status<>'COMMITTED' AND NOT EXISTS(SELECT 1 FROM scan_batch_deletions d WHERE d.batch_id=b.id)
      AND EXISTS(SELECT 1 FROM scan_records r WHERE r.batch_id=b.id AND r.resolution_status<>'CANCELLED') ORDER BY b.created_at`).bind(examId));
  const appState = app?.result_freeze_status ?? null;
  const canOpen = ['FROZEN', 'PUBLISHED'].includes(String(appState)) || net?.status === 'PUBLISHED';
  return { open: await examCorrectionOpen(env, examId), app: { state: appState, snapshotVersion: Number(app?.snapshot_version || 0) },
    network: net ? { id: net.id, status: net.status, publishedVersion: Number(net.v) } : null, canOpen, pending: pending.map((p) => ({ id: p.id, institution: p.institution, total: Number(p.total), status: p.status })) };
}

export async function getCorrection(env: Env, exam: any) { return json({ ok: true, ...(await readState(env, exam.id)) }); }

const internal = (body: unknown) => new Request('https://anunex.internal/correction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function errorOf(r: Response) { const b: any = await r.clone().json().catch(() => null); return b?.error || { code: 'CORRECTION_STEP_FAILED', message: 'İşlem tamamlanamadı.' }; }

export async function toggleCorrection(request: Request, env: Env, user: AuthUser, exam: any): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden('Düzeltme anahtarını yalnız Süper Admin açıp kapatabilir.');
  const body: any = await request.json().catch(() => ({}));
  const action = String(body.action || '').toUpperCase();
  const state = await readState(env, exam.id);
  if (action === 'OPEN') {
    const reason = String(body.reason || '').trim();
    if (reason.length < 10 || reason.length > 500) return badRequest('Düzeltme için 10–500 karakterlik bir gerekçe yazın.', 'CORRECTION_REASON_REQUIRED');
    if (state.open) return json({ ok: false, error: { code: 'CORRECTION_ALREADY_OPEN', message: 'Bu sınav zaten düzeltmeye açık.' }, state }, 409);
    if (!state.canOpen) return json({ ok: false, error: { code: 'NOTHING_PUBLISHED', message: 'Bu sınavın yayımlanmış ya da dondurulmuş sonucu yok; düzeltmeye gerek yok, doğrudan düzenleyebilirsiniz.' }, state }, 409);
    const steps: string[] = [];
    if (state.network?.status === 'PUBLISHED') {
      const { reopenNetworkResults } = await import('./result-network-correction');
      const r = await reopenNetworkResults(internal({ reason, expectedSnapshotVersion: state.network.publishedVersion }), env, user, state.network.id);
      if (!r.ok) return json({ ok: false, error: await errorOf(r), state: await readState(env, exam.id) }, r.status);
      steps.push('NETWORK_REOPENED');
    }
    if (['FROZEN', 'PUBLISHED'].includes(String(state.app.state))) {
      const { reopenExamResults } = await import('./platform-expansion');
      const r = await reopenExamResults(internal({ reason, expectedSnapshotVersion: state.app.snapshotVersion }), env, user, exam.id);
      if (!r.ok) return json({ ok: false, error: await errorOf(r), steps, state: await readState(env, exam.id) }, r.status);
      steps.push('APP_REOPENED');
    }
    return json({ ok: true, steps, state: await readState(env, exam.id) });
  }
  if (action === 'CLOSE') {
    if (!state.open) return json({ ok: false, error: { code: 'CORRECTION_NOT_OPEN', message: 'Bu sınav düzeltmeye açık değil.' }, state }, 409);
    if (state.pending.length) return json({ ok: false, error: { code: 'CORRECTION_PENDING_EVALUATION', message: `Kapatmadan önce ${state.pending.length} yükleme yeniden değerlendirilmeli.` }, state }, 409);
    const steps: string[] = [];
    // The app publication returns to the state it had when it was opened (the reopen audit records it).
    if (state.app.state === 'OPEN' && state.app.snapshotVersion > 0) {
      const last = await one<any>(env.DB.prepare(`SELECT details_json FROM audit_logs WHERE action='EXAM_RESULTS_REOPENED' AND entity_type='exam' AND entity_id=? ORDER BY created_at DESC,id DESC LIMIT 1`).bind(exam.id));
      let previous = 'PUBLISHED'; try { previous = JSON.parse(last?.details_json || '{}').previousState || 'PUBLISHED'; } catch { /* published */ }
      const pe = await import('./platform-expansion');
      const frozen = await pe.freezeExam(env, user, exam.id);
      if (!frozen.ok) return json({ ok: false, error: await errorOf(frozen), steps, state: await readState(env, exam.id) }, frozen.status);
      steps.push('APP_FROZEN');
      if (previous === 'PUBLISHED') {
        const published = await pe.publishExam(env, user, exam.id);
        if (!published.ok) return json({ ok: false, error: await errorOf(published), steps, state: await readState(env, exam.id) }, published.status);
        steps.push('APP_PUBLISHED');
      }
    }
    if (state.network && state.network.status !== 'PUBLISHED' && state.network.publishedVersion > 0) {
      const { freezeAndPublishAdministration } = await import('../result-network-entry');
      const r = await freezeAndPublishAdministration(internal({}), env, user, state.network.id);
      if (!r.ok) return json({ ok: false, error: await errorOf(r), steps, state: await readState(env, exam.id) }, r.status);
      steps.push('NETWORK_PUBLISHED');
    }
    return json({ ok: true, steps, state: await readState(env, exam.id) });
  }
  return badRequest('İşlem OPEN veya CLOSE olmalı.', 'CORRECTION_ACTION_INVALID');
}
