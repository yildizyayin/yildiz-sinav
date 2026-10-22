import { useEffect, useState } from 'react';
import { api, qs } from '../api';

/** A038: Super Admin starts open-ended / short-answer production; drafts land in the review queue. */
const STATUS: Record<string, string> = { REQUESTED: 'Sırada', RUNNING: 'Çalışıyor', REVIEW_READY: 'İncelemeye hazır', FAILED: 'Başarısız', CANCELLED: 'İptal' };
export function OpenEndedJobsPanel({ academicYear }: { academicYear: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [form, setForm] = useState({ gradeLevel: 7, subjectId: '', outcomeCode: '', format: 'OPEN_ENDED', questionCount: 1, maxPoints: 10 });
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { const r = await api<any>(`/api/open-ended-jobs${qs({ academicYear })}`); setJobs(r.jobs || []); setEnabled(!!r.enabled); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [academicYear]);
  useEffect(() => { api<any>('/api/written-scenarios/subjects').then((r) => { setSubjects(r.subjects || []); setForm((f) => ({ ...f, subjectId: f.subjectId || r.subjects?.[0]?.id || '' })); }).catch(() => {}); }, []);
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setError(''); setNotice(''); try { await fn(); setNotice(ok); } catch (e: any) { setError(e.message); } finally { setBusy(false); await load(); } };
  const create = () => act(async () => { const r = await api<any>('/api/open-ended-jobs', { method: 'POST', body: JSON.stringify({ ...form, academicYear }) }); await api(`/api/open-ended-jobs/${r.job.id}/run`, { method: 'POST', body: '{}' }); }, 'Taslaklar bağımsız kontrolden geçti ve insan incelemesine düştü.');
  return <section className="qt-card"><h2>Açık uçlu / kısa cevaplı soru üretimi · {academicYear}</h2>
    <p>Yalnız doğrulanmış programdaki kazanımdan üretilir. Her taslak model cevap ve puanları toplamı soru puanına eşit analitik rubrik taşır; farklı bir model bağımsız kontrol eder. Kontrolü geçemeyen hiçbir taslak kaydedilmez. Taslaklar soru havuzunda insan onayı bekler ve çoktan seçmeli otomatik değerlendirmeye hiçbir zaman girmez.</p>
    {!enabled && <div className="alert warn">Üretim veya bağımsız kontrol şu an kapalı (D1 bütçesi nedeniyle ajanlar geçici olarak durduruldu).</div>}
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <div className="form-grid">
      <label>Sınıf<input type="number" min={1} max={12} value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: Number(e.target.value) })} /></label>
      <label>Ders<select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Kazanım kodu<input value={form.outcomeCode} onChange={(e) => setForm({ ...form, outcomeCode: e.target.value })} /></label>
      <label>Biçim<select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}><option value="OPEN_ENDED">Açık uçlu</option><option value="SHORT_ANSWER">Kısa cevaplı</option></select></label>
      <label>Soru sayısı<input type="number" min={1} max={3} value={form.questionCount} onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })} /></label>
      <label>Soru puanı<input type="number" min={1} max={100} value={form.maxPoints} onChange={(e) => setForm({ ...form, maxPoints: Number(e.target.value) })} /></label>
    </div>
    <button className="primary" disabled={busy || !enabled || !form.outcomeCode.trim()} onClick={() => void create()}>Üret ve kontrol et</button>
    <table style={{ marginTop: 12 }}><thead><tr><th>Kazanım</th><th>Biçim</th><th>Soru / puan</th><th>Durum</th><th>Deneme</th><th></th></tr></thead><tbody>
      {jobs.map((j) => <tr key={j.id}><td>{j.outcomeCode || j.outcomeTitle}</td><td>{j.format === 'SHORT_ANSWER' ? 'Kısa cevaplı' : 'Açık uçlu'}</td><td>{j.questionCount} × {j.maxPoints}</td><td>{STATUS[j.status] || j.status}{j.errorCode ? ` · ${j.errorCode}` : ''}</td><td>{j.attemptCount}/3</td>
        <td>{['REQUESTED', 'FAILED'].includes(j.status) && j.attemptCount < 3 && <button className="ghost" disabled={busy || !enabled} onClick={() => void act(() => api(`/api/open-ended-jobs/${j.id}/run`, { method: 'POST', body: '{}' }), 'Yeniden denendi.')}>Yeniden dene</button>}
          {['REQUESTED', 'FAILED', 'RUNNING'].includes(j.status) && <button className="ghost" disabled={busy} onClick={() => void act(() => api(`/api/open-ended-jobs/${j.id}/cancel`, { method: 'POST', body: '{}' }), 'İstek iptal edildi.')}>İptal</button>}</td></tr>)}
    </tbody></table>{!jobs.length && <p className="empty">Bu yıl için açık uçlu üretim isteği yok.</p>}
  </section>;
}
