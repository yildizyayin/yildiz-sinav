import { useEffect, useMemo, useState } from 'react';
import { api, post, qs } from '../api';
import { useAuth } from '../auth';

type AssignmentType = 'SUBJECT' | 'GUIDANCE';

export function TeacherAssignments() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState(user?.institution_id || '');
  const [seasonId, setSeasonId] = useState('');
  const [options, setOptions] = useState<any>({ seasons: [], teachers: [], classes: [], subjects: [] });
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ userId: '', classId: '', subjectId: '', assignmentType: 'SUBJECT' as AssignmentType });

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') return;
    void api<any>('/api/institutions').then((r) => {
      const list = r.institutions || [];
      setInstitutions(list);
      if (!institutionId && list[0]?.id) setInstitutionId(list[0].id);
    }).catch((e) => setError(e.message));
  }, [user?.role]);

  const loadOptions = async (preferredSeasonId?: string) => {
    if (!institutionId) return;
    setError('');
    try {
      const r = await api<any>(`/api/teacher-assignment-options${qs({ institutionId, seasonId: preferredSeasonId || seasonId })}`);
      setOptions(r);
      const nextSeasonId = preferredSeasonId || seasonId || r.season?.id || '';
      if (nextSeasonId !== seasonId) setSeasonId(nextSeasonId);
      setForm((f) => ({
        ...f,
        userId: r.teachers?.some((x: any) => x.id === f.userId) ? f.userId : (r.teachers?.[0]?.id || ''),
        classId: r.classes?.some((x: any) => x.id === f.classId) ? f.classId : (r.classes?.[0]?.id || ''),
        subjectId: r.subjects?.some((x: any) => x.id === f.subjectId) ? f.subjectId : (r.subjects?.[0]?.id || ''),
      }));
    } catch (e: any) { setError(e.message || 'Yetki seçenekleri yüklenemedi.'); }
  };

  const loadAssignments = async (targetSeasonId?: string) => {
    if (!institutionId) return;
    try {
      const r = await api<any>(`/api/teacher-assignments${qs({ institutionId, seasonId: targetSeasonId || seasonId })}`);
      setRows(r.assignments || []);
    } catch (e: any) { setError(e.message || 'Öğretmen yetkileri yüklenemedi.'); }
  };

  useEffect(() => {
    setSeasonId(''); setRows([]); setOptions({ seasons: [], teachers: [], classes: [], subjects: [] });
    void loadOptions();
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId || !seasonId) return;
    void loadOptions(seasonId);
    void loadAssignments(seasonId);
  }, [seasonId]);

  const canSave = useMemo(() => {
    if (!institutionId || !form.userId || !form.classId) return false;
    if (form.assignmentType === 'SUBJECT' && !form.subjectId) return false;
    return true;
  }, [institutionId, form]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!canSave) return;
    setError(''); setSuccess('');
    try {
      await post('/api/teacher-assignments', {
        institutionId,
        userId: form.userId,
        classId: form.classId,
        subjectId: form.assignmentType === 'SUBJECT' ? form.subjectId : null,
        assignmentType: form.assignmentType,
      });
      setSuccess(form.assignmentType === 'SUBJECT' ? 'Branş yetkisi tanımlandı.' : 'Rehberlik yetkisi tanımlandı.');
      await loadAssignments(seasonId);
    } catch (e: any) { setError(e.message || 'Yetki tanımlanamadı.'); }
  };

  const changeStatus = async (id: string, active: boolean) => {
    setError(''); setSuccess('');
    try {
      await api(`/api/teacher-assignments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setSuccess(active ? 'Yetki yeniden aktif edildi.' : 'Yetki pasife alındı.');
      await loadAssignments(seasonId);
    } catch (e: any) { setError(e.message || 'Yetki durumu değiştirilemedi.'); }
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Branş ve rehberlik</span><h1>Öğretmen Yetkileri</h1><p>Branş öğretmenini yalnız kendi dersi ve sınıflarıyla, rehber öğretmenini ise atanmış sınıfın tüm dersleriyle sınırlandırın.</p></div></div>
    {user?.role === 'SUPER_ADMIN' && <div className="card"><label>Kurum<select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></div>}
    {error && <div className="alert error">{error}</div>}{success && <div className="alert success">{success}</div>}

    <div className="grid-2">
      <form className="card" onSubmit={add}>
        <div className="section-head"><div><span className="eyebrow">Yeni yetki</span><h2>Öğretmen ataması</h2></div></div>
        <label>Akademik yıl<select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>{(options.seasons || []).map((s: any) => <option key={s.id} value={s.id}>{s.academic_year} · {s.status}</option>)}</select></label>
        <label>Öğretmen<select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>{(options.teachers || []).map((t: any) => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label>
        <label>Yetki türü<select value={form.assignmentType} onChange={(e) => setForm({ ...form, assignmentType: e.target.value as AssignmentType })}><option value="SUBJECT">Branş Yetkisi</option><option value="GUIDANCE">Rehberlik Yetkisi</option></select></label>
        <label>Sınıf / Şube<select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>{(options.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {form.assignmentType === 'SUBJECT' && <label>Ders / Branş<select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>{(options.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <div className="alert">Aynı öğretmen hem branş öğretmeni hem de belirli bir sınıfın rehber öğretmeni olabilir. Örneğin 7/A'da yalnız Matematik, 8/A'da rehberlik yetkisi varsa 8/A'nın tüm derslerini görebilir.</div>
        <button className="primary" disabled={!canSave}>Yetkiyi Kaydet</button>
      </form>

      <div className="table-card">
        <div className="section-head"><div><span className="eyebrow">Aktif kapsam</span><h2>Tanımlı yetkiler</h2></div></div>
        <table><thead><tr><th>Öğretmen</th><th>Sınıf</th><th>Yetki</th><th>Ders</th><th>Durum</th><th></th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td><strong>{r.teacher_name}</strong></td><td>{r.class_name || '—'}</td><td>{r.assignment_type === 'SUBJECT' ? 'Branş' : 'Rehberlik'}</td><td>{r.assignment_type === 'SUBJECT' ? (r.subject_name || '—') : 'Tüm dersler'}</td><td>{r.active ? 'Aktif' : 'Pasif'}</td><td><button className="ghost" onClick={() => void changeStatus(r.id, !r.active)}>{r.active ? 'Pasife Al' : 'Aktif Et'}</button></td></tr>)}
        </tbody></table>{!rows.length && <div className="empty">Bu sezon için öğretmen yetkisi bulunmuyor.</div>}
      </div>
    </div>
  </>;
}
