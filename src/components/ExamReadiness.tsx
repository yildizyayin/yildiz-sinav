type Readiness = { ready_to_publish?: boolean; blockers?: Array<{ code: string; message: string }>; warnings?: Array<{ code: string; message: string }>; checks?: Array<{code:string;label:string;status:string;actual:number;expected:number;optional?:boolean}> };

export function examReadinessTarget(code: string) {
  if (code === 'SCORING_VERIFICATION_REQUIRED') return { tab: 'general', id: 'exam-scoring-profile' };
  if (code === 'INSTITUTION_ASSIGNMENT_REQUIRED') return { tab: 'key', id: 'exam-institution-assignment' };
  if (code === 'OUTCOMES_REQUIRED') return { tab: 'outcomes', id: 'exam-outcomes' };
  if (['SUBJECTS_REQUIRED','BOOKLETS_REQUIRED','QUESTION_STRUCTURE_INCOMPLETE','ANSWER_KEYS_INCOMPLETE','INCOMPLETE_ANSWER_KEY'].includes(code)) return { tab: 'key', id: 'exam-answer-structure' };
  return { tab: 'general', id: 'exam-card-settings' };
}

export function ExamReadiness({ readiness, onFix, fixHref }: { readiness?: Readiness; onFix?: (code: string) => void; fixHref?: (code: string) => string }) {
  if (!readiness) return <p>Aktifleştirme kontrolü yüklenemedi. Sınavı yenileyin.</p>;
  return <div role="status">
    {!!readiness.checks?.length && <div className="exam-readiness-checks">{readiness.checks.map(check=><div key={check.code} className={`exam-review-check ${check.status==='GREEN'?'ok':check.optional?'warn':'error'}`}><strong>{check.label}</strong><small>{check.actual}/{check.expected}{check.optional?' · İsteğe bağlı':''}</small></div>)}</div>}
    {readiness.ready_to_publish ? <p>Sınav değerlendirmeye hazır. Aktifleştirme öğrenci sonuçlarını yayınlamaz.</p> : <div className="alert warning"><div><strong>Sınav taslakta: tamamlanması gerekenler</strong>{readiness.blockers?.length ? <ul>{readiness.blockers.map(item => <li key={item.code}>{item.message} {onFix ? <button type="button" className="secondary" onClick={() => onFix(item.code)} aria-label={`Düzelt: ${item.message}`}>Düzelt</button> : fixHref ? <a className="secondary" href={fixHref(item.code)} aria-label={`Düzelt: ${item.message}`}>Düzelt</a> : null}</li>)}</ul> : <p>Ders yapısını, kitapçıkları, cevap anahtarını ve puanlama profilini kontrol edin.</p>}<p>Eksikleri düzenleyip kaydedin; ardından sınavı aktifleştirin.</p></div></div>}
    {!!readiness.warnings?.length&&<div className="alert warning"><div><strong>Kazanım kontrolü</strong><ul>{readiness.warnings.map(item=><li key={item.code}>{item.message}</li>)}</ul></div></div>}
  </div>;
}
