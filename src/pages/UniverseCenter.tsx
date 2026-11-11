import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

/**
 * Öğrenme Evreni merkezi (owner, 11 Nov 2026). Content: write activities for a verified outcome and approve them
 * (platform content by the Super Admin, institution content by its manager; rights must be clear). Gaps: what students
 * asked for and did not find. Templates, usage and the reward rules: Super Admin only.
 */
const KINDS: Record<string, string> = { PAIRS: 'Eşleştirme / hafıza kartları', SEQUENCE: 'Sıralama', CLOZE: 'Boşluk doldurma', STEPS: 'Adım adım matematik', AUDIO_QUESTION: 'Dinle ve seç', HOTSPOT: 'Görselde bul' };
const STATUS: Record<string, string> = { DRAFT: 'Taslak', REVIEW: 'Onay bekliyor', APPROVED: 'Onaylı', REJECTED: 'Reddedildi' };
const RIGHTS: Record<string, string> = { OWNED: 'Kendi üretimimiz', LICENSED: 'Lisanslı', PUBLIC_DOMAIN: 'Kamu malı', UNKNOWN: 'Belirsiz' };
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const accept = (s: string) => { const list = s.split('|').map((x) => x.trim()).filter(Boolean); const n = Number(String(list[0] || '').replace(',', '.')); return list.length === 1 && Number.isFinite(n) ? { numeric: { value: n }, accept: list } : { accept: list }; };

/** Builds the public part and the key from simple text fields; the server checks it again before saving. */
export function buildContent(kind: string, f: Record<string, string>): { public: any; answer: any } | { error: string } {
  if (kind === 'PAIRS') {
    const rows = lines(f.pairs || '').map((l) => l.split('=').map((x) => x.trim()));
    if (rows.some((r) => r.length !== 2 || !r[0] || !r[1])) return { error: 'Her satır "sol = sağ" biçiminde olmalı.' };
    return { public: { left: rows.map((r, k) => ({ id: `l${k + 1}`, text: r[0] })), right: rows.map((r, k) => ({ id: `r${k + 1}`, text: r[1] })) }, answer: { pairs: rows.map((_, k) => [`l${k + 1}`, `r${k + 1}`]) } };
  }
  if (kind === 'SEQUENCE') { const it = lines(f.items || ''); return { public: { prompt: f.prompt || null, items: it.map((t, k) => ({ id: `s${k + 1}`, text: t })) }, answer: { order: it.map((_, k) => `s${k + 1}`) } }; }
  if (kind === 'CLOZE') {
    const parts = String(f.text || '').split(/\[([^\]]+)\]/);
    const blanks: any[] = [], rules: Record<string, any> = {}; let text = '';
    parts.forEach((p, k) => { if (k % 2 === 0) text += p; else { const id = `b${blanks.length + 1}`; blanks.push({ id }); rules[id] = accept(p); text += `[${id}]`; } });
    if (!blanks.length) return { error: 'Boşlukları köşeli parantezle yazın: "2³ = [8]". Birden çok kabul için [8|sekiz].' };
    return { public: { text, blanks }, answer: { blanks: rules } };
  }
  if (kind === 'STEPS') {
    const rows = lines(f.steps || '').map((l) => l.split('=').map((x) => x.trim()));
    if (rows.some((r) => r.length !== 2 || !r[0] || !r[1])) return { error: 'Her adım "adım sorusu = cevap" biçiminde olmalı.' };
    return { public: { problem: f.prompt || '', steps: rows.map((r, k) => ({ id: `t${k + 1}`, prompt: r[0] })) }, answer: { steps: Object.fromEntries(rows.map((r, k) => [`t${k + 1}`, accept(r[1])])) } };
  }
  if (kind === 'AUDIO_QUESTION') return { public: { transcript: f.transcript || '', question: f.question || null, options: lines(f.options || '') }, answer: { correct: String(f.correct || '').trim().toLocaleUpperCase('tr-TR') } };
  if (kind === 'HOTSPOT') { try { return { public: JSON.parse(f.public || '{}'), answer: JSON.parse(f.answer || '{}') }; } catch { return { error: 'Görsel etkinlikte iki alan da JSON olmalı.' }; } }
  return { error: 'Tür seçin.' };
}

const FIELDS: Record<string, Array<[string, string, string]>> = {
  PAIRS: [['pairs', 'Kart çiftleri (her satıra "sol = sağ", 2–8 satır)', '2³ = 8\n3² = 9\n10² = 100']],
  SEQUENCE: [['prompt', 'Yönerge', 'İşlem adımlarını doğru sıraya koy.'], ['items', 'Öğeler (doğru sırayla, her satıra bir tane, 3–8)', 'Üssü yaz\nTabanı üs kadar çarp\nSonucu yaz']],
  CLOZE: [['text', 'Metin (boşluk: [cevap], birden çok kabul: [8|sekiz])', '2³ = [8] ve 3² = [9]']],
  STEPS: [['prompt', 'Problem', '3 kalem 12 TL ise 5 kalem kaç TL?'], ['steps', 'Adımlar (her satıra "adım = cevap")', '1 kalem kaç TL? = 4\n5 kalem kaç TL? = 20']],
  AUDIO_QUESTION: [['transcript', 'Okunacak metin (ses yoksa da gösterilir)', ''], ['question', 'Soru', ''], ['options', 'Seçenekler (her satıra bir tane, 3–5)', ''], ['correct', 'Doğru seçenek harfi', 'A']],
  HOTSPOT: [['public', 'Görsel ve yönerge (JSON)', '{"prompt":"…","image":{"url":"https://…","width":800,"height":600,"alt":"…"}}'], ['answer', 'Bölgeler ve doğru bölge (JSON, 0–1 birim)', '{"regions":[{"id":"r1","x":0.1,"y":0.1,"w":0.2,"h":0.2}],"target":["r1"]}']],
};

export function UniverseCenter() {
  const { user } = useAuth();
  const admin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<'CONTENT' | 'GAPS' | 'TEMPLATES' | 'USAGE'>('CONTENT');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  return <div className="page" style={{ display: 'grid', gap: 16 }}>
    <div className="page-head"><div><span className="eyebrow">Öğrenme Evreni</span><h1>Evren Merkezi</h1><p className="muted">Etkinlikler yalnız doğrulanmış MEB kazanımına bağlanır; kullanım hakkı belirsiz içerik onaylanamaz.</p></div></div>
    <div className="segmented" role="tablist">{([['CONTENT', 'İçerik'], ...(admin ? [['GAPS', 'Eksik içerik'], ['TEMPLATES', 'Oyun türleri'], ['USAGE', 'Kullanım']] : [])] as Array<[any, string]>).map(([k, l]) =>
      <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setError(''); setNotice(''); }}>{l}</button>)}</div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {tab === 'CONTENT' && <Content admin={admin} onError={setError} onNotice={setNotice} />}
    {tab === 'GAPS' && admin && <Gaps onError={setError} />}
    {tab === 'TEMPLATES' && admin && <Templates onError={setError} onNotice={setNotice} />}
    {tab === 'USAGE' && admin && <Usage onError={setError} />}
  </div>;
}

function Content({ admin, onError, onNotice }: { admin: boolean; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const [grade, setGrade] = useState('8');
  const [q, setQ] = useState('');
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [outcomeId, setOutcomeId] = useState('');
  const [kind, setKind] = useState('PAIRS');
  const [title, setTitle] = useState('');
  const [rights, setRights] = useState('OWNED');
  const [f, setF] = useState<Record<string, string>>({});
  const [list, setList] = useState<any[]>([]);
  const [status, setStatus] = useState('REVIEW');
  const loadList = () => api<any>(`/api/reporting/universe/contents?status=${status}`).then((r) => setList(r.contents || [])).catch((e) => onError(e.message));
  useEffect(() => { void loadList(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { api<any>(`/api/reporting/universe/outcomes?gradeLevel=${grade}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`).then((r) => setOutcomes(r.outcomes || [])).catch((e) => onError(e.message)); }, 250); return () => clearTimeout(t); }, [grade, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    onError(''); onNotice('');
    const built = buildContent(kind, f);
    if ('error' in built) { onError(built.error); return; }
    try {
      await api('/api/reporting/universe/contents', { method: 'POST', body: JSON.stringify({ contentKind: kind, outcomeId, title: title.trim() || null, copyrightStatus: rights, public: built.public, answer: built.answer }) });
      onNotice('Etkinlik kaydedildi; onaydan sonra öğrencilere açılır.'); setF({}); setTitle(''); setStatus('REVIEW'); await loadList();
    } catch (e: any) { onError(e.message); }
  };
  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => { onError(''); try { await api(`/api/reporting/universe/contents/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ decision }) }); await loadList(); } catch (e: any) { onError(e.message); } };
  return <>
    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Yeni etkinlik</h2>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <label>Sınıf<select value={grade} onChange={(e) => { setGrade(e.target.value); setOutcomeId(''); }}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}. sınıf</option>)}</select></label>
        <label>Kazanım ara<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kod ya da kazanım" /></label>
      </div>
      <label>Kazanım<select value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)}><option value="">{outcomes.length} doğrulanmış kazanım</option>
        {outcomes.map((o) => <option key={o.id} value={o.id}>{o.academic_year} · {o.subject_name} · {o.code} {o.title}</option>)}</select></label>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <label>Etkinlik türü<select value={kind} onChange={(e) => { setKind(e.target.value); setF({}); }}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Başlık (isteğe bağlı)<input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Kullanım hakkı<select value={rights} onChange={(e) => setRights(e.target.value)}>{Object.entries(RIGHTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      {FIELDS[kind].map(([name, label, ph]) => <label key={name}>{label}<textarea rows={name === 'text' || name === 'transcript' ? 3 : 4} value={f[name] || ''} placeholder={ph} onChange={(e) => setF({ ...f, [name]: e.target.value })} /></label>)}
      <div><button className="primary" disabled={!outcomeId} onClick={() => void save()}>Onaya gönder</button></div>
    </section>
    <section className="panel" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 18 }}>Etkinlikler</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {!list.length && <p className="muted">Bu durumda etkinlik yok.</p>}
      {list.map((c) => <div key={c.id} className="card" style={{ display: 'grid', gap: 6, padding: 12 }}>
        <strong>{c.title || KINDS[c.content_kind] || c.content_kind} · {c.outcome_code}</strong>
        <span className="muted">{c.outcome_title} · {c.grade_level}. sınıf · {c.academic_year} · {RIGHTS[c.copyright_status] || c.copyright_status} · {c.owner_type === 'PLATFORM' ? 'Platform' : 'Kurum'} · {STATUS[c.review_status]}</span>
        <code style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(c.content).slice(0, 400)}</code>
        {c.review_status === 'REVIEW' && (admin || c.owner_type === 'INSTITUTION') && <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => void review(c.id, 'APPROVED')}>Onayla</button><button className="ghost" onClick={() => void review(c.id, 'REJECTED')}>Reddet</button></div>}
      </div>)}
    </section>
  </>;
}

function Gaps({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [grade, setGrade] = useState('');
  useEffect(() => { setRows(null); api<any>(`/api/reporting/universe/gaps${grade ? `?gradeLevel=${grade}` : ''}`).then((r) => setRows(r.gaps || [])).catch((e) => onError(e.message)); }, [grade]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="panel" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 18 }}>Öğrencilerin bulamadığı etkinlikler</h2>
      <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Sınıf"><option value="">Bütün sınıflar</option>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}. sınıf</option>)}</select></div>
    {!rows ? <p className="muted">Yükleniyor…</p> : !rows.length ? <p className="muted">Kayıtlı eksik yok.</p> :
      <div className="table-wrap"><table><thead><tr><th>Kazanım</th><th>Sınıf</th><th>Oyun</th><th>Gerekli / var</th><th>İstek</th><th>Onay bekleyen</th><th>Son</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={`${r.academicYear}:${r.outcome.id}:${r.templateKind}`}><td>{r.outcome.subjectName} · {r.outcome.code} {r.outcome.title}</td><td>{r.gradeLevel}</td><td>{r.templateKind}</td><td>{r.needed} / {r.available}</td><td>{r.hits}</td><td>{r.waitingForReview}</td><td>{new Date(String(r.lastSeenAt).replace(' ', 'T') + 'Z').toLocaleDateString('tr-TR')}</td></tr>)}</tbody></table></div>}
  </section>;
}

function Templates({ onError, onNotice }: { onError: (m: string) => void; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [rules, setRules] = useState<any>(null);
  const load = () => api<any>('/api/reporting/universe/templates').then((r) => { setRows(r.templates || []); setRules(r.rules); }).catch((e) => onError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (code: string, patch: any) => { onError(''); try { await api(`/api/reporting/universe/templates/${code}`, { method: 'POST', body: JSON.stringify(patch) }); onNotice('Kaydedildi.'); await load(); } catch (e: any) { onError(e.message); } };
  return <>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Oyun</th><th>İçerik</th><th>Sınıflar</th><th>Süre (sn)</th><th>Açık</th></tr></thead>
      <tbody>{rows.map((t) => <tr key={t.code}><td><strong>{t.title}</strong><br /><small className="muted">{t.description}</small></td><td>{t.content_kind}</td>
        <td><select aria-label={`${t.title} en düşük sınıf`} value={t.min_grade} onChange={(e) => void save(t.code, { minGrade: Number(e.target.value) })}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}</select>{' – '}
          <select aria-label={`${t.title} en yüksek sınıf`} value={t.max_grade} onChange={(e) => void save(t.code, { maxGrade: Number(e.target.value) })}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}</select></td>
        <td>{t.seconds_per_item == null ? '—' : <input type="number" min={15} max={180} defaultValue={t.seconds_per_item} style={{ width: 80 }} onBlur={(e) => Number(e.target.value) !== t.seconds_per_item && void save(t.code, { secondsPerItem: Number(e.target.value) })} />}</td>
        <td><input type="checkbox" aria-label={`${t.title} açık`} checked={!!t.active} onChange={(e) => void save(t.code, { active: e.target.checked })} /></td></tr>)}</tbody></table></div></section>
    {rules && <section className="panel"><h2 style={{ marginTop: 0, fontSize: 18 }}>Ödül kuralları</h2><ul>
      <li>Oyun başına XP: {rules.perPlay}</li><li>Seviye: her {rules.perLevel} XP</li><li>Haftalık hedef (öneri): {rules.weeklyGoal} oyun</li><li>Gecikmeli tekrar önerisi: {rules.reviewAfterDays} gün</li><li>{rules.note}</li></ul></section>}
  </>;
}

function Usage({ onError }: { onError: (m: string) => void }) {
  const [u, setU] = useState<any>(null);
  useEffect(() => { api<any>('/api/reporting/universe/usage').then(setU).catch((e) => onError(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!u) return <p className="muted">Yükleniyor…</p>;
  const stat = (label: string, value: any) => <div className="card" style={{ padding: 12 }}><small className="muted">{label}</small><div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div></div>;
  return <>
    <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
      {stat(`Oyun (son ${u.days} gün)`, u.plays)}{stat('Oynayan öğrenci', u.students)}{stat('Cevaplanan etkinlik', u.itemsAnswered)}{stat('Nibiru denemesi', u.nibiruExams.count)}{stat('Açık öğretmen görevi', u.activeTasks)}{stat('Eksik içerik isteği', u.gaps.hits)}
    </section>
    <section className="panel"><h2 style={{ marginTop: 0, fontSize: 18 }}>Oyun türlerine göre</h2>
      {!u.byTemplate.length ? <p className="muted">Bu dönemde oynanan oyun yok.</p> : <div className="table-wrap"><table><thead><tr><th>Oyun</th><th>Oynanma</th><th>Öğrenci</th><th>Ortalama doğru</th></tr></thead>
        <tbody>{u.byTemplate.map((r: any) => <tr key={r.code}><td>{r.title}</td><td>{r.plays}</td><td>{r.students}</td><td>{r.avgPercent == null ? '—' : `%${r.avgPercent}`}</td></tr>)}</tbody></table></div>}</section>
    <section className="panel"><h2 style={{ marginTop: 0, fontSize: 18 }}>Etkinlik deposu</h2>
      {!u.contents.length ? <p className="muted">Henüz etkinlik yok.</p> : <ul>{u.contents.map((c: any) => <li key={`${c.kind}:${c.status}`}>{KINDS[c.kind] || c.kind} · {STATUS[c.status] || c.status}: {c.n}</li>)}</ul>}</section>
  </>;
}
