import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { clipEmbed } from '../lib/physicalLink';
import './outcome-videos.css';

/**
 * Kazanım Videoları (owner, 12 Nov 2026): what a learner sees for each outcome — the system's video, the school's own
 * link, or the YouTube segment found automatically — and the teacher's controls: add the school's link, remove an
 * automatic video (another one is searched), ask for a search now.
 */
const mmss = (s: number | null | undefined) => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const METHOD: Record<string, string> = { GEMINI: 'Gemini izledi, bölümü seçti', CHAPTER: 'videonun bölüm listesinden', SHORT_TITLE: 'kısa ve konuya özel video' };
const SEARCH: Record<string, string> = { WAITING: 'Aramada sırada', NOT_FOUND: 'Uygun bölüm bulunamadı, sonra yeniden denenecek', ERROR: 'Arama hatası, yarın yeniden denenecek', FOUND: 'Bulundu' };

export function OutcomeVideos() {
  const { user } = useAuth();
  const [f, setF] = useState({ grade: '', subjectId: '', q: '', filter: 'all' });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [watch, setWatch] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', title: '', start: '', end: '' });
  const [busy, setBusy] = useState(false);
  const canAdd = user?.role !== 'SUPER_ADMIN';

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
    try { setData(await api<any>(`/api/outcome-videos${qs ? `?${qs}` : ''}`)); setError(''); } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void load(); }, [f.grade, f.subjectId, f.filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(done); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const st = data?.status;
  const [cov, setCov] = useState<any[] | null>(null);
  const loadCoverage = async () => { try { setCov((await api<any>('/api/outcome-videos/coverage')).rows); } catch (e: any) { setError(e.message); } };

  return <div className="ov">
    <div className="page-head"><div><span className="eyebrow">İçerik</span><h1>Kazanım Videoları</h1>
      <p className="muted">Öğrenci bir kazanımda zorlandığında önce sistemdeki video, yoksa okulunuzun eklediği video, o da yoksa YouTube’dan otomatik bulunan ve yalnız o kazanımın anlatıldığı bölüm gösterilir. Otomatik videolar onay beklemez; uygun bulmadığınızı kaldırabilirsiniz.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success">{notice}</div>}

    {st && <div className="ov-stats">
      <div><b>{st.found}</b><span>otomatik bölüm bulundu</span><small>toplam {st.total} kazanım</small></div>
      <div><b>{st.waiting}</b><span>aramada sırada</span><small>{st.missed} kazanımda henüz bulunamadı</small></div>
      <div><b>{st.today.searches}/{st.today.searchCap}</b><span>bugünkü YouTube araması</span><small>ücretsiz kota</small></div>
      <div><b>{st.gemini ? `${st.today.geminiMinutes}/${st.today.geminiMinuteCap} dk` : 'Kapalı'}</b><span>Gemini ile izleme</span><small>{st.gemini ? 'ücretsiz kota' : 'kapalı; videonun bölüm listesi ve kısa videolar kullanılıyor'}</small></div>
      {!st.youtube && <div className="warn"><b>YouTube kapalı</b><span>YouTube API anahtarı tanımlı değil</span></div>}
    </div>}

    <details className="ov-coverage" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !cov) void loadCoverage(); }}>
      <summary>Kapsam: sınıf ve derse göre video durumu</summary>
      {cov && <div className="ov-table"><table><thead><tr><th>Sınıf</th><th>Ders</th><th>Kazanım</th><th>Sistem</th><th>Okulunuz</th><th>Otomatik</th><th>Videosu olan</th><th>Bulunamadı</th></tr></thead>
        <tbody>{cov.map((r) => { const has = Math.min(r.total, r.system + r.teacher + r.auto); return <tr key={`${r.grade}-${r.subject}`}><td>{r.grade ?? '—'}</td><td>{r.subject}</td><td>{r.total}</td><td>{r.system}</td><td>{r.teacher}</td><td>{r.auto}</td><td><b>%{r.total ? Math.round(has * 100 / r.total) : 0}</b></td><td>{r.missed}</td></tr>; })}</tbody></table></div>}
      {cov && !cov.length && <div className="empty">Kazanım yok.</div>}
    </details>

    <form className="ov-filters" onSubmit={(e) => { e.preventDefault(); void load(); }}>
      <label>Sınıf<select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">Tümü</option>{Array.from({ length: 12 }, (_, k) => k + 1).map((g) => <option key={g} value={g}>{g}. sınıf</option>)}</select></label>
      <label>Ders<select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">Tümü</option>{(data?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Göster<select value={f.filter} onChange={(e) => setF({ ...f, filter: e.target.value })}><option value="all">Tüm kazanımlar</option><option value="auto">Otomatik videosu olanlar</option><option value="reported">Öğrencinin bildirdikleri</option><option value="none">Videosu olmayanlar</option></select></label>
      <label className="grow">Ara<input value={f.q} placeholder="Kazanım kodu ya da metni" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
      <button type="submit" className="primary">Ara</button>
    </form>

    {data && !data.outcomes.length && <div className="empty">Bu seçimde kazanım yok.</div>}
    <ul className="ov-list">{data?.outcomes.map((o: any) => {
      const shown = o.system ? { kind: 'SYSTEM', url: o.system.url, title: o.system.title } : o.teacher ? { ...o.teacher, kind: 'TEACHER' } : o.auto ? { ...o.auto, kind: 'AUTO' } : null;
      const embed = shown ? clipEmbed(shown.url.replace(/[?&]t=\d+s$/, ''), (shown as any).start, (shown as any).end) : null;
      return <li key={o.id} className="ov-item">
        <div className="ov-head"><small>{[o.code, o.subject, o.grade ? `${o.grade}. sınıf` : null].filter(Boolean).join(' · ')}</small><strong>{o.title}</strong></div>
        {shown ? <div className="ov-video">
          <span className={`ov-chip ${shown.kind.toLowerCase()}`}>{shown.kind === 'SYSTEM' ? 'Sistem videosu' : shown.kind === 'TEACHER' ? 'Okulunuzun videosu' : 'Otomatik YouTube bölümü'}</span>
          <span className="ov-title">{shown.title}</span>
          {shown.kind !== 'SYSTEM' && (shown as any).end != null && <small>{mmss((shown as any).start)}–{mmss((shown as any).end)}</small>}
          {shown.kind === 'AUTO' && <small>{o.auto.channel ? `${o.auto.channel} · ` : ''}{METHOD[o.auto.method] || ''}{o.auto.reports ? ` · ${o.auto.reports} öğrenci “konuyla ilgili değil” dedi` : ''}</small>}
        </div> : <div className="ov-video none"><span className="ov-chip none">Video yok</span><small>{o.search ? SEARCH[o.search.status] || o.search.status : 'Henüz aranmadı; sırası gelince aranacak'}</small></div>}
        {o.teacher && o.auto && <small className="muted">Okulunuzun videosu otomatik bölümün yerine gösteriliyor.</small>}
        <div className="ov-actions">
          {embed && <button type="button" onClick={() => setWatch(watch === o.id ? null : o.id)}>{watch === o.id ? 'Kapat' : 'İzle'}</button>}
          {o.auto && <button type="button" disabled={busy} onClick={() => act(() => api(`/api/outcome-videos/auto/${encodeURIComponent(o.auto.id)}/remove`, { method: 'POST', body: '{}' }), 'Video kaldırıldı; bu kazanım için başka bir video aranacak.')}>Kaldır, başka video bul</button>}
          {!o.auto && !o.system && !o.teacher && <button type="button" disabled={busy} onClick={() => act(() => api(`/api/outcome-videos/search/${encodeURIComponent(o.id)}`, { method: 'POST', body: '{}' }), 'Kazanım aramada öne alındı; 15 dakika içinde aranır.')}>Şimdi aramaya al</button>}
          {canAdd && !o.teacher && <button type="button" onClick={() => { setAdding(adding === o.id ? null : o.id); setForm({ url: '', title: '', start: '', end: '' }); }}>Okulun videosunu ekle</button>}
          {canAdd && o.teacher && <button type="button" disabled={busy} onClick={() => act(() => api(`/api/outcome-videos/teacher/${encodeURIComponent(o.teacher.id)}`, { method: 'DELETE' }), 'Okulunuzun videosu kaldırıldı.')}>Okulun videosunu kaldır</button>}
        </div>
        {watch === o.id && embed && <div className="ov-player"><iframe title={shown!.title} src={embed} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
        {adding === o.id && <form className="ov-form" onSubmit={(e) => { e.preventDefault(); void act(() => api('/api/outcome-videos/teacher', { method: 'POST', body: JSON.stringify({ outcomeId: o.id, ...form }) }), 'Video eklendi; okulunuzun öğrencileri bu kazanımda artık bu videoyu görür.').then(() => setAdding(null)); }}>
          <label className="wide">Video bağlantısı<input required value={form.url} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          <label className="wide">Başlık<input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Başlangıç (dk:sn)<input value={form.start} placeholder="0:00" onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label>Bitiş (dk:sn)<input value={form.end} placeholder="isteğe bağlı" onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
          <div className="ov-actions"><button type="submit" className="primary" disabled={busy}>Kaydet</button><button type="button" onClick={() => setAdding(null)}>Vazgeç</button></div>
        </form>}
      </li>;
    })}</ul>
    {data?.outcomes.length === 60 && <p className="muted">İlk 60 kazanım gösteriliyor; sınıf, ders ya da arama ile daraltın.</p>}
  </div>;
}
