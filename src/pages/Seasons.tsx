import { useEffect, useMemo, useState } from 'react';
import { api, post, qs } from '../api';
import { useAuth } from '../auth';

export function Seasons() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState(user?.institution_id || '');
  const [seasons, setSeasons] = useState<any[]>([]);
  const [fromSeasonId, setFromSeasonId] = useState('');
  const [nextAcademicYear, setNextAcademicYear] = useState('2027-2028');
  const [keepSections, setKeepSections] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') return;
    void api<any>('/api/institutions').then((r) => {
      const list = r.institutions || [];
      setInstitutions(list);
      if (!institutionId && list[0]?.id) setInstitutionId(list[0].id);
    }).catch((e) => setError(e.message));
  }, [user?.role]);

  const load = async () => {
    if (!institutionId) return;
    setError('');
    try {
      const r = await api<any>(`/api/seasons${qs({ institutionId })}`);
      const list = r.seasons || [];
      setSeasons(list);
      if (!fromSeasonId && list[0]?.id) setFromSeasonId(list[0].id);
    } catch (e: any) { setError(e.message || 'Sezonlar yüklenemedi.'); }
  };

  useEffect(() => { setPreview(null); void load(); }, [institutionId]);

  const currentSeason = useMemo(() => seasons.find((s) => s.id === fromSeasonId), [seasons, fromSeasonId]);

  const showPreview = async () => {
    setError(''); setSuccess(''); setPreview(null);
    try {
      const r = await post<any>('/api/seasons/rollover-preview', { institutionId, fromSeasonId, nextAcademicYear });
      setPreview(r);
    } catch (e: any) { setError(e.message || 'Sezon önizlemesi oluşturulamadı.'); }
  };

  const commit = async () => {
    setError(''); setSuccess('');
    try {
      const r = await post<any>('/api/seasons/rollover-commit', { institutionId, fromSeasonId, nextAcademicYear, keepSections });
      setSuccess(`${nextAcademicYear} sezonu oluşturuldu. ${r.created || 0} öğrenci yeni sezona aktarıldı.`);
      setPreview(null);
      await load();
    } catch (e: any) { setError(e.message || 'Yeni sezon oluşturulamadı.'); }
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Akademik yıl</span><h1>Sezon Yönetimi</h1><p>Yeni eğitim yılını önce önizleyin; tarihsel sınıf kayıtlarını değiştirmeden yeni enrollment kayıtları oluşturun.</p></div></div>
    {user?.role === 'SUPER_ADMIN' && <div className="card"><label>Kurum<select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></div>}
    {error && <div className="alert error">{error}</div>}{success && <div className="alert success">{success}</div>}

    <div className="grid-2">
      <div className="table-card">
        <div className="section-head"><div><span className="eyebrow">Sezon geçmişi</span><h2>Eğitim yılları</h2></div></div>
        <table><thead><tr><th>Akademik Yıl</th><th>Durum</th><th>Öğrenci</th><th>Lisans</th><th>Anlaşma</th></tr></thead><tbody>
          {seasons.map((s) => <tr key={s.id}><td><strong>{s.academic_year}</strong></td><td>{s.status}</td><td>{s.enrollment_count}</td><td>{s.licensed_student_count} / {s.licensed_student_limit}</td><td>{s.agreement_status}</td></tr>)}
        </tbody></table>{!seasons.length && <div className="empty">Henüz sezon bulunmuyor.</div>}
      </div>

      <div className="card">
        <div className="section-head"><div><span className="eyebrow">Yeni sezon</span><h2>Sınıf yükseltme</h2></div></div>
        <label>Kaynak sezon<select value={fromSeasonId} onChange={(e) => { setFromSeasonId(e.target.value); setPreview(null); }}>{seasons.map((s) => <option key={s.id} value={s.id}>{s.academic_year}</option>)}</select></label>
        <label>Yeni akademik yıl<input value={nextAcademicYear} onChange={(e) => { setNextAcademicYear(e.target.value); setPreview(null); }} placeholder="2027-2028" /></label>
        <label className="check"><input type="checkbox" checked={keepSections} onChange={(e) => setKeepSections(e.target.checked)} /> Geçen yılki şubeleri koru</label>
        <button className="primary" onClick={() => void showPreview()} disabled={!institutionId || !fromSeasonId || !nextAcademicYear}>Önizleme Oluştur</button>
        {currentSeason && <p className="muted">Kaynak: {currentSeason.academic_year}. Eski kayıtlar değiştirilmeyecek.</p>}
      </div>
    </div>

    {preview && <div className="card">
      <div className="section-head"><div><span className="eyebrow">Onay öncesi kontrol</span><h2>{preview.nextAcademicYear} geçiş özeti</h2></div></div>
      <div className="kpi-grid">{(preview.groups || []).map((g: any) => <div className="kpi" key={`${g.from}-${g.to}`}><span>{g.from}. Sınıf → {g.to ? `${g.to}. Sınıf` : 'Mezun/Terminal'}</span><strong>{g.count}</strong><small>öğrenci</small></div>)}</div>
      <div className="alert">Bu işlem mevcut sezonu değiştirmez; yeni akademik yıl için yeni enrollment kayıtları oluşturur.</div>
      <button className="primary large" onClick={() => void commit()}>Yeni Sezonu Oluştur</button>
    </div>}
  </>;
}
