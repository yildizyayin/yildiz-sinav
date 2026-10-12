type Readiness = { ready_to_publish?: boolean; blockers?: Array<{ code: string; message: string }>; warnings?: Array<{ code: string; message: string }>; checks?: Array<{code:string;label:string;status:string;actual:number;expected:number;optional?:boolean}> };

export function ExamReadiness({ readiness }: { readiness?: Readiness }) {
  if (!readiness) return <p>Aktifleştirme kontrolü yüklenemedi. Sınavı yenileyin.</p>;
  return <div role="status">
    {!!readiness.checks?.length && <div className="exam-readiness-checks">{readiness.checks.map(check=><div key={check.code} className={`exam-review-check ${check.status==='GREEN'?'ok':check.optional?'warn':'error'}`}><strong>{check.label}</strong><small>{check.actual}/{check.expected}{check.optional?' · İsteğe bağlı':''}</small></div>)}</div>}
    {readiness.ready_to_publish ? <p>Sınav değerlendirmeye hazır. Aktifleştirme öğrenci sonuçlarını yayınlamaz.</p> : <div className="alert warning"><div><strong>Sınav taslakta: tamamlanması gerekenler</strong>{readiness.blockers?.length ? <ul>{readiness.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul> : <p>Ders yapısını, kitapçıkları, cevap anahtarını ve puanlama profilini kontrol edin.</p>}<p>Eksikleri düzenleyip kaydedin; ardından sınavı aktifleştirin.</p></div></div>}
    {!!readiness.warnings?.length&&<div className="alert warning"><div><strong>Kazanım kontrolü</strong><ul>{readiness.warnings.map(item=><li key={item.code}>{item.message}</li>)}</ul></div></div>}
  </div>;
}
