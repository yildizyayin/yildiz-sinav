import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

/**
 * Öğrenme Evreni — teacher tasks (owner, 11 Nov 2026). Pick a class, a verified outcome of its grade (own subjects
 * only for a subject teacher) and, if wanted, one game kind; the students see it first on their learning map.
 * Done is read from their finished Evren games, so nothing needs to be marked by hand.
 */
export function UniverseTasksStaff() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [outcomeId, setOutcomeId] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<any>('/api/classes').then((r) => { const list = r.classes || []; setClasses(list); if (list.length === 1) setClassId(list[0].id); }).catch((e) => setError(e.message)); }, []);
  const loadTasks = (id = classId) => api<any>(`/api/reporting/universe/tasks${id ? `?classId=${encodeURIComponent(id)}` : ''}`).then((r) => setTasks(r.tasks || [])).catch((e) => setError(e.message));
  useEffect(() => {
    setCatalog(null); setOutcomeId(''); setTemplateCode(''); setOpen(null);
    void loadTasks();
    if (classId) api<any>(`/api/reporting/universe/task-outcomes?classId=${encodeURIComponent(classId)}`).then(setCatalog).catch((e) => setError(e.message));
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const f = filter.trim().toLocaleLowerCase('tr-TR');
    return (catalog?.outcomes || []).filter((o: any) => !f || `${o.code} ${o.title} ${o.topic || ''} ${o.subjectName}`.toLocaleLowerCase('tr-TR').includes(f));
  }, [catalog, filter]);
  const chosen = catalog?.outcomes?.find((o: any) => o.id === outcomeId);

  const give = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api<any>('/api/reporting/universe/tasks', { method: 'POST', body: JSON.stringify({ classId, outcomeId, templateCode: templateCode || null, dueAt: dueAt || null, note: note.trim() || null }) });
      setNotice(`Görev ${r.recipients} öğrenciye verildi.${r.skipped ? ` ${r.skipped} öğrenci bu kazanımın sınıf düzeyinde ya da sizin dersinizde olmadığı için atlandı.` : ''}`);
      setOutcomeId(''); setTemplateCode(''); setNote(''); setDueAt(''); await loadTasks();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const showStudents = async (id: string) => { if (open?.id === id) { setOpen(null); return; } try { setOpen(await api<any>(`/api/reporting/universe/tasks/${encodeURIComponent(id)}`)); } catch (e: any) { setError(e.message); } };
  const cancel = async (id: string) => { try { await api(`/api/reporting/universe/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); await loadTasks(); } catch (e: any) { setError(e.message); } };

  return <div className="page" style={{ display: 'grid', gap: 16 }}>
    <div className="page-head"><div><span className="eyebrow">Öğrenme Evreni</span><h1>Evren Görevleri</h1><p className="muted">Sınıfınıza bir kazanım verin; öğrenciler haritalarında ilk sırada görür. Öğrenci o kazanımdan bir Evren oyununu bitirince görev kendiliğinden tamamlanır.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Sınıf seçin</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {classId && !catalog && <p className="muted">Kazanımlar yükleniyor…</p>}
      {catalog && !catalog.outcomes.length && <div className="empty">{catalog.className} için {catalog.academicYear} doğrulanmış programında size açık kazanım yok.</div>}
      {catalog?.outcomes?.length > 0 && <>
        <label>Kazanım ara<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Kod, konu ya da kazanım" /></label>
        <label>Kazanım<select value={outcomeId} onChange={(e) => { setOutcomeId(e.target.value); setTemplateCode(''); }}>
          <option value="">{shown.length} kazanım</option>
          {shown.map((o: any) => <option key={o.id} value={o.id}>{o.subjectName} · {o.code} {o.title}{o.games.length ? '' : ' (etkinlik hazırlanıyor)'}</option>)}
        </select></label>
        {chosen && <>
          {!chosen.games.length && <div className="alert info">Bu kazanım için henüz onaylı etkinlik yok. Görevi verebilirsiniz; öğrenci içerik hazır olunca oynayabilir.</div>}
          <label>Oyun türü<select value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}><option value="">Fark etmez (hazır olan ilk etkinlik)</option>{chosen.games.map((g: any) => <option key={g.code} value={g.code}>{g.title}</option>)}</select></label>
        </>}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <label>Son gün (isteğe bağlı)<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
          <label>Not (isteğe bağlı)<input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Cuma derse kadar" /></label>
        </div>
        <div><button className="primary" disabled={busy || !outcomeId} onClick={() => void give()}>Görevi ver</button></div>
      </>}
    </section>
    <section className="panel" style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Verilen görevler</h2>
      {!tasks.length && <p className="muted">Henüz görev yok.</p>}
      {tasks.map((t) => <div key={t.id} className="card" style={{ display: 'grid', gap: 6, padding: 12 }}>
        <strong>{t.outcome.code} {t.outcome.title}</strong>
        <span className="muted">{[t.className, t.template?.title || 'Herhangi bir etkinlik', t.dueAt ? `son gün ${new Date(`${t.dueAt}T00:00:00`).toLocaleDateString('tr-TR')}` : null, t.createdBy].filter(Boolean).join(' · ')}</span>
        {t.note && <em>{t.note}</em>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span><b>{t.done}</b> / {t.recipients} öğrenci tamamladı</span>
          <button className="ghost" onClick={() => void showStudents(t.id)}>{open?.id === t.id ? 'Listeyi kapat' : 'Öğrenciler'}</button>
          <button className="ghost" onClick={() => void cancel(t.id)}>Geri al</button>
        </div>
        {open?.id === t.id && <ul style={{ margin: 0, paddingLeft: 18 }}>{open.students.map((s: any) => <li key={s.studentId}>{s.firstName} {s.lastName}: {s.done ? 'tamamladı' : 'henüz değil'}</li>)}</ul>}
      </div>)}
    </section>
  </div>;
}
