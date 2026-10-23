import { useEffect, useState } from 'react';
import { api } from '../api';

/** A077: real counts of running, waiting and failed work for the Super Admin. */
export function OperationsSummaryPanel() {
  const [d, setD] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/admin/operations-summary').then((r) => (r?.backgroundReports && r?.failures && r?.waitingForPeople && Array.isArray(r?.problems) ? setD(r) : setError('beklenmeyen yanıt'))).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="admin-home-panel"><div className="alert error">Operasyon özeti alınamadı: {error}</div></div>;
  if (!d) return null;
  const row = (label: string, value: number, bad = false) => <div className="admin-home-health-row" key={label}><span className={`admin-home-health-dot ${value < 0 ? 'action' : bad && value > 0 ? 'action' : 'ready'}`} /><span>{label}</span><strong>{value < 0 ? 'okunamadı' : value}</strong></div>;
  return <div className="admin-home-panel">
    <div className="admin-home-panel-head"><div><span className="eyebrow">OPERASYON</span><h2>İşler ve hatalar</h2></div></div>
    <p>{d.status === 'OK' ? 'Bekleyen hata yok.' : d.problems.join(' ')} {d.scheduledJobs.paused ? 'Zamanlanmış işler duraklatılmış.' : 'Zamanlanmış işler çalışıyor.'}</p>
    <div className="admin-home-health-list">
      {row('Kuyruktaki rubrik çıktıları', d.backgroundReports.rubricExports.waiting)}
      {row('Başarısız rubrik çıktıları', d.backgroundReports.rubricExports.failed, true)}
      {row('Kuyruktaki sınıf/kurum raporları', d.backgroundReports.cohortReports.waiting)}
      {row('Başarısız sınıf/kurum raporları', d.backgroundReports.cohortReports.failed, true)}
      {row('Kontrol bekleyen aktarımlar', d.waitingForPeople.importsNeedingReview)}
      {row('Tamamlanmamış optik yüklemeler', d.waitingForPeople.opticalBatchesNotCommitted)}
      {row('Başarısız aktarımlar', d.failures.imports, true)}
      {row('Gönderilemeyen bildirimler', d.failures.notificationDeliveries, true)}
      {row('Gönderimde takılan duyurular', d.failures.announcementsStuckSending, true)}
    </div>
  </div>;
}
