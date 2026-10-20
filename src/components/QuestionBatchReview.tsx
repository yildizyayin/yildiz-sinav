import { useState } from 'react';
import { CheckCircle2, ListChecks, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../api';

/** A008: fast batch review. Each question is still decided by the server's single-question gate. */
export const BATCH_CHUNK = 50;
const isAi = (q: any) => /^(AI|AI_GENERATED|AI_DRAFT|NIBIRU|NIBIRU_AI)$/i.test(String(q?.origin_kind || ''));
const failureLabels: Record<string, string> = {
  COPYRIGHT_BLOCKED: 'Kısıtlı telif (RESTRICTED) — toplu onaya giremez',
  QUESTION_REVIEW_CHANGED: 'Soru siz incelerken değişti — listeyi yenileyin',
  QUESTION_REVIEW_CONTEXT_CHANGED: 'Kazanım bağlamı değişti — listeyi yenileyin',
  INVALID_QUESTION_CONTENT: 'Şıklar veya cevap anahtarı geçersiz',
  VERIFIED_CURRICULUM_REQUIRED: 'Doğrulanmış 2027–2028 kazanımına bağlı değil',
  AI_CONTENT_INCOMPLETE: 'Soru, çözüm veya kaynak eksik',
  HUMAN_REVIEW_REQUIRED: 'Kontrol listesi tamamlanmadı',
  QUESTION_QUALITY_REVIEW_REQUIRED: 'Gerekçeler eksik (her biri en az 20 karakter)',
};
const standardReasons = {
  outcomeAlignment: 'Seçilen soruların her biri bağlı olduğu 2027–2028 öğrenme çıktısını doğrudan ölçüyor; kazanım ve sınıf düzeyi kontrol edildi.',
  languageAndDistractors: 'Soru dili sınıf düzeyine uygun; çeldiriciler makul, birbirinden ayrışıyor ve tek doğru cevap var.',
  duplicateRationale: 'Listede görüntülenen sorular arasında aynı kök veya aynı çözümü tekrar eden bir soru görülmedi.',
};

export function batchEligible(q: any) { return q?.review_status === 'REVIEW'; }

export function QuestionBatchReview({ questions, selectedIds, setSelectedIds, checkLabels, onDone }: {
  questions: any[]; selectedIds: Set<string>; setSelectedIds: (ids: Set<string>) => void;
  checkLabels: Record<string, string>; onDone: (message: string) => Promise<void> | void;
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [disposition, setDisposition] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [failures, setFailures] = useState<Array<{ id: string; code?: string; message?: string }>>([]);
  const eligible = questions.filter(batchEligible);
  const chosen = questions.filter(q => selectedIds.has(q.id) && batchEligible(q));
  const needsAiReview = chosen.some(isAi);
  const checksComplete = Object.keys(checkLabels).every(key => checks[key]);
  const reasonsComplete = Object.keys(standardReasons).every(key => (reasons[key] || '').trim().length >= 20 && (reasons[key] || '').trim().length <= 1000) && !!disposition;
  const canApprove = chosen.length > 0 && (!needsAiReview || (checksComplete && reasonsComplete));

  const run = async (status: 'APPROVED' | 'REJECTED' | 'DRAFT') => {
    if (!chosen.length || busy) return;
    setBusy(status); setFailures([]);
    const failed: Array<{ id: string; code?: string; message?: string }> = []; let succeeded = 0;
    try {
      for (let start = 0; start < chosen.length; start += BATCH_CHUNK) {
        const items = chosen.slice(start, start + BATCH_CHUNK).map(q => ({ id: q.id, expectedRevision: q.review_revision, expectedContext: isAi(q) ? q.reviewContext : undefined }));
        const body: any = { status, items, note: note.trim() || undefined };
        if (status === 'APPROVED') { body.checks = checks; body.qualityReview = { ...reasons, duplicateDisposition: disposition }; }
        const result: any = await api('/api/question-bank-standard/review-batch', { method: 'POST', body: JSON.stringify(body) });
        succeeded += Number(result.succeeded || 0);
        for (const r of result.results || []) if (!r.ok) failed.push(r);
      }
    } catch (e: any) {
      failed.push({ id: '—', code: 'REQUEST_FAILED', message: e?.message || 'İstek tamamlanamadı.' });
    } finally {
      setBusy(''); setFailures(failed);
      setSelectedIds(new Set(failed.map(f => f.id).filter(id => selectedIds.has(id))));
      const verb = status === 'APPROVED' ? 'onaylandı' : status === 'REJECTED' ? 'reddedildi' : 'düzeltmeye gönderildi';
      await onDone(`${succeeded} soru ${verb}${failed.length ? `; ${failed.length} soru işlenmedi (aşağıda nedenleri)` : ''}.`);
    }
  };

  return <section className="batch-review" aria-label="Hızlı toplu inceleme">
    <div className="batch-review-head">
      <div><span className="eyebrow">Hızlı inceleme</span><strong><ListChecks size={16} /> Bu listede incelemede {eligible.length} soru · {chosen.length} seçili</strong></div>
      <div className="batch-review-select">
        <button type="button" onClick={() => setSelectedIds(new Set(eligible.map(q => q.id)))} disabled={!eligible.length}>İncelemedekilerin tümünü seç</button>
        <button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>Seçimi temizle</button>
      </div>
    </div>
    {chosen.length > 0 && <div className="batch-review-body">
      {needsAiReview && <>
        <p className="muted">Seçilen yapay zekâ sorularının hepsini tek tek okuduğunuzu aşağıda bir kez onaylayın. Her soruya ayrı onay kaydı ve bu toplu işlemin kimliği yazılır. Telifi kısıtlı (RESTRICTED) sorular onaylanamaz.</p>
        <div className="batch-review-checks">{Object.entries(checkLabels).map(([key, label]) => <label key={key} className="check"><input type="checkbox" checked={!!checks[key]} onChange={e => setChecks({ ...checks, [key]: e.target.checked })} /> {label}</label>)}</div>
        <div className="batch-review-reasons">
          <label>Öğrenme çıktısı uyumu<textarea rows={2} value={reasons.outcomeAlignment || ''} onChange={e => setReasons({ ...reasons, outcomeAlignment: e.target.value })} /></label>
          <label>Dil ve çeldiriciler<textarea rows={2} value={reasons.languageAndDistractors || ''} onChange={e => setReasons({ ...reasons, languageAndDistractors: e.target.value })} /></label>
          <label>Tekrar kontrolü<textarea rows={2} value={reasons.duplicateRationale || ''} onChange={e => setReasons({ ...reasons, duplicateRationale: e.target.value })} /></label>
          <label>Tekrar kararı<select value={disposition} onChange={e => setDisposition(e.target.value)}><option value="">Seçin</option><option value="NO_REPETITION_FOUND">İncelenen sorularda tekrar bulunmadı</option><option value="DISTINCT_APPLICATION">Benzer konu, farklı uygulama</option></select></label>
          <button type="button" className="link-button" onClick={() => { setReasons({ ...standardReasons, ...Object.fromEntries(Object.entries(reasons).filter(([, v]) => v.trim())) }); if (!disposition) setDisposition('NO_REPETITION_FOUND'); }}>Standart gerekçeleri doldur (düzenleyebilirsiniz)</button>
        </div>
      </>}
      <label className="batch-review-note">Ret / düzeltme notu<input value={note} onChange={e => setNote(e.target.value)} placeholder="Ör. Bilimsel olarak yanlış gözlem" /></label>
      <div className="batch-review-actions">
        <button type="button" className="primary" disabled={!canApprove || !!busy} onClick={() => void run('APPROVED')}><CheckCircle2 size={16} /> {busy === 'APPROVED' ? 'Onaylanıyor…' : `Seçilen ${chosen.length} soruyu onayla`}</button>
        <button type="button" disabled={!!busy} onClick={() => void run('DRAFT')}><RotateCcw size={16} /> {busy === 'DRAFT' ? 'Gönderiliyor…' : 'Düzeltmeye gönder'}</button>
        <button type="button" className="danger" disabled={!!busy || note.trim().length < 5} title={note.trim().length < 5 ? 'Ret için not yazın' : ''} onClick={() => void run('REJECTED')}><XCircle size={16} /> {busy === 'REJECTED' ? 'Reddediliyor…' : 'Reddet'}</button>
      </div>
    </div>}
    {failures.length > 0 && <div className="alert error" role="alert"><strong>İşlenmeyen sorular</strong><ul>{failures.map(f => <li key={f.id + (f.code || '')}><code>{f.id}</code> — {failureLabels[f.code || ''] || f.message || f.code}</li>)}</ul></div>}
  </section>;
}
