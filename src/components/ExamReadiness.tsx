type Readiness = { ready_to_publish?: boolean; blockers?: Array<{ code: string; message: string }> };

export function ExamReadiness({ readiness }: { readiness?: Readiness }) {
  if (!readiness) return <p>Aktifleştirme kontrolü yüklenemedi. Sınavı yenileyin.</p>;
  if (readiness.ready_to_publish) return <p>Sınav değerlendirmeye hazır. Aktifleştirme öğrenci sonuçlarını yayınlamaz.</p>;
  return <div className="alert warning" role="status"><div><strong>Sınav taslakta: tamamlanması gerekenler</strong>{readiness.blockers?.length ? <ul>{readiness.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul> : <p>Ders yapısını, kitapçıkları, cevap anahtarını ve puanlama profilini kontrol edin.</p>}<p>Eksikleri düzenleyip kaydedin; ardından sınavı aktifleştirin.</p></div></div>;
}
