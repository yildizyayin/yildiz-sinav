import { Link } from 'react-router-dom';

export type Readiness = { ready_to_publish?: boolean; blockers?: Array<{ code: string; message: string }>; warnings?: Array<{ code: string; message: string }>; checks?: Array<{code:string;label:string;status:string;actual:number;expected:number;optional?:boolean}> };

export function readinessTarget(code: string) {
  if (code === 'OUTCOMES_REQUIRED') return { tab: 'outcomes', id: 'exam-outcomes' };
  if (code === 'SCORING_VERIFICATION_REQUIRED') return { tab: 'general', id: 'exam-scoring' };
  if (code === 'INSTITUTION_ASSIGNMENT_REQUIRED') return { tab: 'key', id: 'exam-institutions' };
  if (['SUBJECTS_REQUIRED', 'BOOKLETS_REQUIRED', 'QUESTION_STRUCTURE_INCOMPLETE'].includes(code)) return { tab: 'key', id: 'exam-structure' };
  return { tab: 'key', id: 'exam-answers' };
}

export function ExamReadiness({ readiness, onFix, examId }: { readiness?: Readiness; onFix?: (code: string) => void; examId?: string }) {
  if (!readiness) return <p>Aktifleştirme kontrolü yüklenemedi. Sınavı yenileyin.</p>;
  return <div role="status">
    {!!readiness.checks?.length && <div className="exam-readiness-checks">{readiness.checks.map(check=><div key={check.code} className={`exam-review-check ${check.status==='GREEN'?'ok':check.optional?'warn':'error'}`}><strong>{check.label}</strong><small>{check.actual}/{check.expected}{check.optional?' · İsteğe bağlı':''}</small></div>)}</div>}
    {readiness.ready_to_publish ? <p>Sınav değerlendirmeye hazır. Aktifleştirme öğrenci sonuçlarını yayınlamaz.</p> : <div className="alert warning"><div><strong>Sınav taslakta: tamamlanması gerekenler</strong>{readiness.blockers?.length ? <ul>{readiness.blockers.map(item => <li key={item.code}>{item.message} {onFix ? <button type="button" className="secondary" onClick={() => onFix(item.code)}>Düzelt</button> : examId ? <Link className="secondary" to={`/exam-definitions?examId=${encodeURIComponent(examId)}&fix=${encodeURIComponent(item.code)}`}>Düzelt</Link> : null}</li>)}</ul> : <p>Ders yapısını, kitapçıkları, cevap anahtarını ve puanlama profilini kontrol edin.</p>}<p>Eksikleri düzenleyip kaydedin; ardından sınavı aktifleştirin.</p></div></div>}
    {!!readiness.warnings?.length&&<div className="alert warning"><div><strong>Kazanım kontrolü</strong><ul>{readiness.warnings.map(item=><li key={item.code}>{item.message}</li>)}</ul></div></div>}
  </div>;
}
