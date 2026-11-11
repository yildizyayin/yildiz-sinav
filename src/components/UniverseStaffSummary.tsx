import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useFeatures } from '../lib/useFeatures';

/**
 * Öğrenme Evreni on staff home pages (owner, 11 Nov 2026). Teachers and guidance teachers: their open Evren tasks and
 * how many students finished them. Managers: the institution's last 7 days. Counts only; shown only when Öğrenme
 * Evreni is switched on for the institution.
 */
export function UniverseStaffSummary({ mode }: { mode: 'TEACHER' | 'MANAGER' }) {
  const features = useFeatures();
  const on = features.has('LEARNING_UNIVERSE');
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!on) return;
    const path = mode === 'MANAGER' ? '/api/reporting/universe/institution-usage' : '/api/reporting/universe/tasks';
    api<any>(path).then(setData).catch(() => setData(null));
  }, [on, mode]);
  if (!on || !data || data.enabled === false) return null;
  if (mode === 'TEACHER') {
    const tasks: any[] = data.tasks || [];
    const recipients = tasks.reduce((n, t) => n + t.recipients, 0), done = tasks.reduce((n, t) => n + t.done, 0);
    return <div className="panel teacher-today-card universe-staff" aria-labelledby="us-t">
      <div className="teacher-today-head"><h3 id="us-t">Evren görevleri</h3><Link className="link-button" to="/evren-gorevleri">Görev ver →</Link></div>
      {!tasks.length ? <p className="muted">Açık Evren göreviniz yok. Sınıfınıza bir kazanım verebilirsiniz.</p> : <>
        <p><b>{tasks.length}</b> açık görev · <b>{done}</b> / {recipients} öğrenci tamamladı</p>
        <ul className="teacher-today-list">{tasks.slice(0, 3).map((t) => <li key={t.id}><span>{t.outcome.code} {t.outcome.title}</span><small>{t.className ? `${t.className} · ` : ''}{t.done}/{t.recipients}</small></li>)}</ul>
      </>}
    </div>;
  }
  return <div className="panel teacher-today-card universe-staff" aria-labelledby="us-m">
    <div className="teacher-today-head"><h3 id="us-m">Öğrenme Evreni · son 7 gün</h3><Link className="link-button" to="/evren-merkezi">Evren Merkezi →</Link></div>
    <ul className="teacher-today-list">
      <li><span><b>{data.plays}</b> oyun · {data.students} öğrenci{data.avgPercent != null ? ` · ortalama %${data.avgPercent}` : ''}</span></li>
      <li><span><b>{data.nibiruExams}</b> Nibiru denemesi</span></li>
      <li><span><b>{data.tasks.active}</b> açık öğretmen görevi · {data.tasks.done}/{data.tasks.recipients} tamamlandı</span></li>
      {data.contentWaiting > 0 && <li><span><b>{data.contentWaiting}</b> kurum etkinliği onayınızı bekliyor</span></li>}
    </ul>
  </div>;
}
