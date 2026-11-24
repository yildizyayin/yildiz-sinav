import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Layers, Printer } from 'lucide-react';
import { api, ApiError } from '../api';
import { printSection } from '../lib/printSection';

/**
 * Birleşik karne (combined-report-cloud.md, 2 Nov). The student picks a year, an exam family and Son 5 / Tümü /
 * Kendim seçeyim; the server builds the report from the signed-in result identity's own published snapshots only.
 * Print opens the browser's print dialog (it is not a file download), and the button says so.
 */
type Option = { examId: string; title: string; examDate: string | null; academicYear: string; family: string; familyLabel: string };
const v = (x: unknown, digits = 2) => x == null || !Number.isFinite(Number(x)) ? 'Yayımlanmadı' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: digits });
const ERR: Record<string, string> = {
  RESULT_SESSION_REQUIRED: 'Oturumunuzun süresi doldu. Yeniden giriş yapın.',
  COMBINED_NO_EXAMS: 'Bu seçimde yayımlanmış sonucunuz yok.',
  COMBINED_SOURCES_UNAVAILABLE: 'Seçilen sınavların yayını değişti ya da kayıtları şu an okunamıyor. Biraz sonra tekrar deneyin.',
  COMBINED_RATE_LIMITED: 'Bir saatte en fazla 30 birleşik karne oluşturabilirsiniz. Biraz sonra tekrar deneyin.',
  COMBINED_EMPTY_SELECTION: 'En az bir sınav seçin.',
};

export function ResultCombinedReport({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [year, setYear] = useState(''); const [family, setFamily] = useState('');
  const [mode, setMode] = useState<'LAST5' | 'ALL' | 'CUSTOM'>('LAST5');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [report, setReport] = useState<any>(null); const [allOutcomes, setAllOutcomes] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    void api<any>('/api/public/results/combined/options').then((r) => { const list: Option[] = r.exams || []; setOptions(list); if (list[0]) { setYear(list[0].academicYear); setFamily(list[0].family); } })
      .catch((e) => { setOptions([]); setError(e instanceof ApiError && ERR[e.code || ''] ? ERR[e.code!] : 'Sınav listesi alınamadı. Bağlantınızı kontrol edin.'); });
    return () => controller.current?.abort();
  }, []);
  const years = useMemo(() => [...new Set((options || []).map((o) => o.academicYear))], [options]);
  const families = useMemo(() => [...new Map((options || []).filter((o) => o.academicYear === year).map((o) => [o.family, o.familyLabel])).entries()], [options, year]);
  const inScope = (options || []).filter((o) => o.academicYear === year && o.family === family);
  useEffect(() => { if (families.length && !families.some(([f]) => f === family)) setFamily(families[0][0]); setPicked([]); }, [year]);

  const build = async () => {
    controller.current?.abort(); const ctrl = new AbortController(); controller.current = ctrl;
    setBusy(true); setError(''); setReport(null);
    try {
      const r = await api<any>('/api/public/results/combined', { method: 'POST', signal: ctrl.signal, body: JSON.stringify({ mode, academicYear: year, family, examIds: mode === 'CUSTOM' ? picked : undefined }) } as any);
      if (!ctrl.signal.aborted) setReport(r);
    } catch (e: any) { if (!ctrl.signal.aborted) setError(e instanceof ApiError ? (ERR[e.code || ''] || e.message) : 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.'); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  };

  const outcomes = report ? (allOutcomes ? report.outcomes : report.outcomes.slice(0, 10)) : [];
  const maxPct = report ? Math.max(1, ...report.trend.map((t: any) => Number(t.successPercent ?? 0))) : 1;
  return <section className="sr-combined" aria-labelledby="sr-cb-title">
    <div className="sr-cb-top"><div><span className="result-kicker">SINAVLARIM</span><h2 id="sr-cb-title">Birleşik karne</h2><p>Seçtiğin sınavların yayımlanmış sonuçlarını tek karnede toplar. Yeni sıralama üretilmez; farklı puanlama türleri ortalanmaz.</p></div><button type="button" onClick={onClose}><ArrowLeft aria-hidden="true" /> Sınavlarıma dön</button></div>

    <div className="sr-panel sr-cb-setup">
      {options === null ? <p className="sr-cb-note" role="status">Sınavların yükleniyor…</p> : !options.length ? <p className="result-empty">Birleştirilecek yayımlanmış sınavın yok.</p> : <>
        <div className="sr-cb-fields">
          <label>Eğitim yılı<select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
          <label>Sınav türü<select value={family} onChange={(e) => { setFamily(e.target.value); setPicked([]); }}>{families.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select></label>
        </div>
        <div className="sr-cb-modes" role="radiogroup" aria-label="Hangi sınavlar">{([['LAST5', 'Son 5 sınav'], ['ALL', `Tümü (${inScope.length})`], ['CUSTOM', 'Kendim seçeyim']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
        {mode === 'CUSTOM' && <fieldset className="sr-cb-pick"><legend>Sınavları seç</legend>{inScope.map((o) => <label key={o.examId}><input type="checkbox" checked={picked.includes(o.examId)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, o.examId] : p.filter((x) => x !== o.examId))} /><span>{o.title}<small>{o.examDate || 'Tarih yok'}</small></span></label>)}</fieldset>}
        <button type="button" className="sr-cb-build" disabled={busy || !year || !family || (mode === 'CUSTOM' && !picked.length)} onClick={() => void build()}><Layers aria-hidden="true" /> {busy ? 'Hazırlanıyor…' : 'Birleşik karneyi oluştur'}</button>
      </>}
      {error && <p className="sr-cb-error" role="alert">{error}</p>}
    </div>

    {report && <div ref={ref} className="sr-cb-report" aria-live="polite">
      <div className="sr-cb-head"><div><h3>{report.selection.familyLabel} · {report.selection.academicYear}</h3><p>{report.totals.exams} sınav{report.range.from ? ` · ${report.range.from} – ${report.range.to}` : ''}</p></div>
        <button type="button" onClick={() => printSection(ref.current)}><Printer aria-hidden="true" /> Yazdır</button></div>
      <div className="sr-cb-kpis"><div><strong>{v(report.totals.netAverage)}</strong><small>ortalama net</small></div><div><strong>{v(report.totals.scoreAverage)}</strong><small>ortalama puan</small></div><div><strong>{report.totals.exams}</strong><small>sınav</small></div><div><strong>{report.outcomeSourceCount}</strong><small>kazanımlı sınav</small></div></div>
      {!!report.warnings.length && <ul className="sr-cb-warnings">{report.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}

      <section className="sr-panel"><h3>Ders ortalamaları</h3><div className="sr-cb-table-wrap"><table className="sr-cb-table"><thead><tr><th>Ders</th><th>Sınav</th><th>D</th><th>Y</th><th>B</th><th>Net</th><th>Başarı</th></tr></thead>
        <tbody>{report.subjects.map((s: any) => <tr key={s.code || s.name}><th>{s.name}{s.questionCountsDiffer && <small>Soru sayısı farklı ({s.questionCounts.join(', ')})</small>}</th><td>{s.exams}</td><td>{v(s.avgCorrect)}</td><td>{v(s.avgWrong)}</td><td>{v(s.avgBlank)}</td><td><b>{v(s.avgNet)}</b></td><td>{s.avgSuccessPercent == null ? 'Yayımlanmadı' : `%${v(s.avgSuccessPercent, 1)}`}</td></tr>)}</tbody></table></div>
        <p className="sr-cb-note">Başarı = net ÷ soru sayısı. Soru sayıları farklı sınavları karşılaştırırken bu sütuna bakın.</p></section>

      <section className="sr-panel"><h3>Gelişim</h3><ol className="sr-cb-trend">{report.trend.map((t: any) => <li key={t.examId}><span className="sr-cb-trend-label">{t.title}<small>{t.examDate || 'Tarih yok'}</small></span>
        <span className="sr-cb-bar" aria-hidden="true"><i style={{ width: `${t.successPercent == null ? 0 : Math.max(2, 100 * Number(t.successPercent) / maxPct)}%` }} /></span>
        <span className="sr-cb-trend-value"><b>{t.successPercent == null ? 'Yayımlanmadı' : `%${v(t.successPercent, 1)}`}</b><small>{v(t.net)} net{t.score != null ? ` · ${v(t.score)} puan` : ''}</small></span></li>)}</ol></section>

      <section className="sr-panel"><h3>Kazanım özeti</h3>
        {!report.outcomes.length ? <p className="result-empty">Seçilen sınavlarda doğrulanmış kazanım verisi yok.</p> : <>
          <p className="sr-cb-note">En çok çalışılması gerekenler üstte. {report.outcomeSourceCount} sınavın kazanım kanıtına dayanır.</p>
          <div className="sr-cb-table-wrap"><table className="sr-cb-table"><thead><tr><th>Kazanım</th><th>Kanıt</th><th>D</th><th>Y</th><th>B</th><th>Başarı</th></tr></thead>
            <tbody>{outcomes.map((o: any) => <tr key={o.outcomeId}><th>{o.title}<small>{[o.subjectName, o.code].filter(Boolean).join(' · ')}</small></th><td>{o.evidence}</td><td>{o.correct}</td><td>{o.wrong ?? 'Yayımlanmadı'}</td><td>{o.blank ?? 'Yayımlanmadı'}</td><td><b>{o.successPercent == null ? 'Yayımlanmadı' : `%${v(o.successPercent, 0)}`}</b></td></tr>)}</tbody></table></div>
          {report.outcomes.length > 10 && <button type="button" className="sr-cb-more" onClick={() => setAllOutcomes((x) => !x)}>{allOutcomes ? 'İlk 10 kazanımı göster' : `Tüm kazanımlar (${report.outcomes.length})`}</button>}
        </>}</section>

      <section className="sr-panel"><h3>Kaynaklar</h3><ul className="sr-cb-sources">{report.sources.map((s: any) => <li key={s.examId}><b>{s.title}</b><small>{s.examDate || 'Tarih yok'} · yayın sürümü {s.snapshotVersion}{s.outcomeAnalysisRevision ? ` · kazanım analizi ${s.outcomeAnalysisRevision}` : ''}{s.usedForOutcomes ? '' : ' · kazanım verisi yok'}</small></li>)}</ul>
        {!!report.skipped.length && <><h4>Kullanılmayanlar</h4><ul className="sr-cb-sources">{report.skipped.map((s: any) => <li key={s.examId}><b>{s.title || 'Sınav'}</b><small>{s.reason}</small></li>)}</ul></>}
        <p className="sr-cb-note">{report.policy}</p></section>
    </div>}
  </section>;
}
