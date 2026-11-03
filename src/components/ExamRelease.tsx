import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Send } from 'lucide-react';
import { api } from '../api';
import './exam-release.css';

/**
 * Tek "Sonuçları aç" (owner, 3 Nov): one button opens the results in the app (students, parents) and on
 * sonuc.anunex.com together. A planned result time does the same by itself; correction is the Düzeltme switch.
 */
type State = { open: boolean; students: number; plannedAt: string | null; openedAt: string | null; correctionOpen: boolean };
const when = (s: string | null) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z').toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

export function ExamRelease({ examId, onChanged }: { examId: string; onChanged?: () => void }) {
  const [s, setS] = useState<State | null>(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const [error, setError] = useState(''); const [note, setNote] = useState('');
  const url = `/api/exam-definitions/${encodeURIComponent(examId)}/release`;
  const load = () => api<any>(url).then((r) => { setS(r); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setS(null); setAsk(false); setNote(''); void load(); }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async () => {
    setBusy(true); setError('');
    try { await api(url, { method: 'POST' }); setAsk(false); setNote('Sonuçlar açıldı: uygulamada ve sonuc.anunex.com’da öğrenciler görebilir.'); await load(); onChanged?.(); }
    catch (e: any) { setError(e.message); await load(); } finally { setBusy(false); }
  };
  if (!s) return error ? <div className="alert error" role="alert">{error}</div> : null;
  return <section className="panel exam-release" aria-labelledby="er-title">
    <div className="er-row">
      <div><h2 id="er-title">Sonuçlar</h2>
        <p className="er-state" role="status">{s.open ? <><CheckCircle2 size={16} aria-hidden="true" /> Açık{s.openedAt ? ` · ${when(s.openedAt)}` : ''}. Öğrenciler uygulamada ve sonuc.anunex.com’da görüyor; sonradan yüklenenler sıralamaya eklenir.</>
          : s.correctionOpen ? <>Sınav düzeltmede. Sonuçlar Düzeltme kapatılınca yeniden açılır.</>
          : s.plannedAt ? <><Clock size={16} aria-hidden="true" /> {when(s.plannedAt)}’de kendiliğinden açılacak · {s.students} öğrenci değerlendirildi.</>
          : <>Kapalı · {s.students} öğrenci değerlendirildi. Açınca uygulamada ve sonuc.anunex.com’da birlikte görünür.</>}</p></div>
      {!s.open && !s.correctionOpen && !ask && <button type="button" className="primary" disabled={busy || !s.students} onClick={() => setAsk(true)}><Send size={16} aria-hidden="true" /> Sonuçları aç</button>}
    </div>
    {ask && <div className="er-confirm" role="alertdialog" aria-labelledby="er-q"><p id="er-q"><strong>Emin misiniz?</strong> {s.students} öğrencinin sonucu şimdi açılacak; sıralar hesaplanır, öğrenci ve veliler görür.{s.plannedAt ? ` Planlanan saat (${when(s.plannedAt)}) beklenmeyecek.` : ''}</p>
      <div className="er-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setAsk(false)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={() => void open()}>{busy ? 'Açılıyor…' : 'Evet, sonuçları aç'}</button></div></div>}
    {error && <div className="alert error" role="alert">{error}</div>}
    {note && <div className="alert success" role="status">{note}</div>}
  </section>;
}
