import { useEffect, useState } from 'react';
import { BookCopy, Download, KeyRound, Sparkles } from 'lucide-react';
import { api } from '../api';

/**
 * Dejavu, staff side (owner, 10 Nov 2026): prepare and preview the personal books of the students you may see,
 * for a whole class at once, and print them in one PDF (the answer key apart, if you like).
 */
const title = (v: string) => String(v || '').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase('tr-TR'));

export function DejavuStaff() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { api<any>('/api/classes').then((r) => { const list = r.classes || []; setClasses(list); if (list.length === 1) setClassId(list[0].id); }).catch((e) => setError(e.message)); }, []);
  const load = async (id = classId) => { if (!id) { setData(null); return; } setError(''); try { setData(await api<any>(`/api/reporting/classes/${encodeURIComponent(id)}/dejavu`)); } catch (e: any) { setError(e.message); setData(null); } };
  useEffect(() => { void load(classId); }, [classId]);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(''); setNote(''); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(''); } };
  const prepareClass = () => run('class', async () => {
    const r = await api<any>(`/api/reporting/classes/${encodeURIComponent(classId)}/dejavu`, { method: 'POST', body: '{}' });
    const made = r.results.filter((x: any) => x.bookId), empty = made.filter((x: any) => !x.questionCount).length, noData = r.results.filter((x: any) => x.error).length;
    setNote(`${made.length} öğrenciye kitap hazırlandı${empty ? `, ${empty} kitapta henüz soru yok` : ''}${noData ? `; ${noData} öğrencinin yeterli kanıtı yok` : ''}.`);
    await load();
  });
  const prepareOne = (studentId: string) => run(studentId, async () => { const r = await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/dejavu`, { method: 'POST', body: '{}' }); setNote(`Kitap hazırlandı: ${r.outcomeCount} kazanım, ${r.questionCount} soru${r.shortages?.length ? ` · ${r.shortages.length} kazanımda yeterli yeni soru yok` : ''}.`); await load(); });
  const ready = (data?.students || []).filter((s: any) => s.latest?.questionCount > 0).length;
  return <>
    <div className="page-head"><div><span className="eyebrow">Dejavu</span><h1>Kişiye özel kitaplar</h1><p>Her öğrencinin kitabı birleşik karnesine göre hazırlanır: öğrenilmemiş kazanımlar, daha önce görmediği onaylı sorular. Branş öğretmeninin hazırladığı kitapta yalnız kendi dersinin kazanımları yer alır.</p></div><BookCopy /></div>
    {error && <div className="alert error" role="alert">{error}</div>}{note && <div className="alert success">{note}</div>}
    <div className="panel"><div className="form-grid"><label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Sınıf seçin</option>{classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.student_count != null ? ` · ${c.student_count} öğrenci` : ''}</option>)}</select></label></div>
      {data && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="primary" disabled={!!busy} onClick={() => void prepareClass()}><Sparkles size={16} /> {busy === 'class' ? 'Hazırlanıyor…' : 'Sınıfın tamamına yeni kitap hazırla'}</button>
        <a className={`secondary${ready ? '' : ' disabled'}`} aria-disabled={!ready} href={ready ? `/api/reporting/classes/${encodeURIComponent(classId)}/dejavu/pdf` : undefined}><Download size={16} /> Toplu PDF (cevap anahtarsız) · {ready} kitap</a>
        <a className={`ghost${ready ? '' : ' disabled'}`} aria-disabled={!ready} href={ready ? `/api/reporting/classes/${encodeURIComponent(classId)}/dejavu/pdf?answerKey=1` : undefined}>Cevap anahtarlı</a>
        <small className="muted" style={{ alignSelf: 'center' }}>Tek seferde en çok {data.limit} öğrenci.</small>
      </div>}
    </div>
    {data && <div className="panel" style={{ padding: 0 }}>{(data.students || []).map((s: any) => <div key={s.studentId} className="list-card" style={{ borderRadius: 0, borderWidth: '0 0 1px 0', alignItems: 'center' }}>
      <div style={{ display: 'grid', gap: 3, flex: 1, minWidth: 0 }}><strong>{title(`${s.firstName || ''} ${s.lastName || ''}`)}</strong>
        <small className="muted">{s.latest ? `${s.latest.outcomeCount} kazanım · ${s.latest.questionCount} soru · ${s.latest.answered} cevaplandı, ${s.latest.correct} doğru` : 'Henüz kitap yok'}{s.subjectLimited ? ' · yalnız sizin dersleriniz' : ''}</small></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="ghost" disabled={!!busy} onClick={() => void prepareOne(s.studentId)}>{busy === s.studentId ? 'Hazırlanıyor…' : 'Yeni kitap'}</button>
        {s.latest?.questionCount > 0 && <><a className="ghost" href={`/api/reporting/dejavu/${encodeURIComponent(s.latest.id)}/pdf?answerKey=0`}><Download size={15} /> PDF</a><a className="ghost" href={`/api/reporting/dejavu/${encodeURIComponent(s.latest.id)}/answer-key`}><KeyRound size={15} /> Cevap anahtarı</a></>}
      </div>
    </div>)}{!data.students?.length && <div className="empty">Bu sınıfta erişebildiğiniz öğrenci yok.</div>}</div>}
  </>;
}
