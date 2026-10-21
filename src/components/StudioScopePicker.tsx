import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

/** A083: program → grade → subject → unit → topic → outcome, chosen from lists with approved stock beside each item. */
export type StudioScope = { academicYear: string; gradeLevel: string; subjectId: string; outcomeCodes: string[] };
export type StudioAvailability = { available: number | null; message: string | null; opticalCapacity: number; loading: boolean; bands?: { EASY?: number; MEDIUM?: number; HARD?: number } | null };
type Outcome = { code: string; title: string; unit: string; topic: string; approved: number };
type Subject = { id: string; name: string; approved: number };

const GRADES = [5, 6, 7, 8, 9, 10, 11, 12];
const MAX = 30;

export function StudioScopePicker({ value, onChange, institutionId, needsInstitution, questionCount, optionMode, onAvailability }: {
  value: StudioScope; onChange: (next: StudioScope) => void; institutionId?: string; needsInstitution: boolean;
  questionCount: number; optionMode: string; onAvailability: (a: StudioAvailability) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [info, setInfo] = useState<StudioAvailability>({ available: null, message: null, opticalCapacity: 44, loading: false });
  const [error, setError] = useState('');
  const key = JSON.stringify([value, institutionId, questionCount, optionMode]);

  useEffect(() => {
    if (needsInstitution && !institutionId) { setSubjects([]); setOutcomes([]); const a = { available: null, message: null, opticalCapacity: 44, loading: false }; setInfo(a); onAvailability(a); return; }
    let live = true;
    const params = new URLSearchParams({ gradeLevel: value.gradeLevel, questionCount: String(questionCount || 1), optionMode });
    if (value.subjectId) params.set('subjectId', value.subjectId);
    if (value.academicYear) params.set('academicYear', value.academicYear);
    if (value.outcomeCodes.length) params.set('outcomeCodes', value.outcomeCodes.join(','));
    if (institutionId) params.set('institutionId', institutionId);
    const loading = { ...info, loading: true }; setInfo(loading); onAvailability(loading);
    const timer = setTimeout(() => {
      api<any>(`/api/platform/studio/catalog?${params}`).then(r => {
        if (!live) return;
        setSubjects(Array.isArray(r.subjects) ? r.subjects : []); setOutcomes(Array.isArray(r.outcomes) ? r.outcomes : []); setError('');
        const a = { available: typeof r.available === 'number' ? r.available : null, message: r.message ?? null, opticalCapacity: Number(r.opticalCapacity) || 44, loading: false, bands: r.bands && typeof r.bands === 'object' ? r.bands : null };
        setInfo(a); onAvailability(a);
      }).catch(e => { if (!live) return; setError(e?.message || 'Müfredat ve soru stoku alınamadı.'); const a = { available: null, message: null, opticalCapacity: 44, loading: false }; setInfo(a); onAvailability(a); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsInstitution]);

  const tree = useMemo(() => {
    const units = new Map<string, Map<string, Outcome[]>>();
    for (const o of outcomes) { if (!units.has(o.unit)) units.set(o.unit, new Map()); const t = units.get(o.unit)!; if (!t.has(o.topic)) t.set(o.topic, []); t.get(o.topic)!.push(o); }
    return [...units.entries()].map(([unit, topics]) => ({ unit, topics: [...topics.entries()].map(([topic, list]) => ({ topic, list })), all: [...topics.values()].flat() }));
  }, [outcomes]);
  const chosen = new Set(value.outcomeCodes);
  const set = (codes: string[]) => onChange({ ...value, outcomeCodes: codes.slice(0, MAX) });
  const toggle = (code: string) => set(chosen.has(code) ? value.outcomeCodes.filter(c => c !== code) : [...value.outcomeCodes, code]);
  const toggleUnit = (codes: string[]) => { const allOn = codes.every(c => chosen.has(c)); set(allOn ? value.outcomeCodes.filter(c => !codes.includes(c)) : [...new Set([...value.outcomeCodes, ...codes])]); };

  return <div className="studio-scope">
    <div className="studio-scope-row">
      <label>Program<select value={value.academicYear} onChange={e => onChange({ ...value, academicYear: e.target.value, outcomeCodes: [] })}>
        <option value="2027-2028">Maarif Modeli · 2027–2028</option><option value="2026-2027">2026–2027</option><option value="">Tüm yıllar</option></select></label>
      <label>Sınıf<select value={value.gradeLevel} onChange={e => onChange({ ...value, gradeLevel: e.target.value, subjectId: '', outcomeCodes: [] })}>
        {GRADES.map(g => <option key={g} value={String(g)}>{g}. sınıf{g === 8 ? ' · LGS' : g === 12 ? ' · YKS' : ''}</option>)}</select></label>
      <label>Ders<select value={value.subjectId} onChange={e => onChange({ ...value, subjectId: e.target.value, outcomeCodes: [] })}>
        <option value="">Tüm dersler</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name} · {s.approved} onaylı</option>)}</select></label>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {value.subjectId && <div className="studio-outcomes" aria-label="Kazanımlar">
      <div className="studio-outcomes-head"><strong>Kazanımlar</strong><span className="muted">{value.outcomeCodes.length ? `${value.outcomeCodes.length}/${MAX} seçili` : 'Seçmezseniz dersin tamamından seçilir'}</span>{value.outcomeCodes.length > 0 && <button type="button" className="link-button" onClick={() => set([])}>Seçimi temizle</button>}</div>
      {!tree.length && <p className="muted">Bu sınıf ve ders için doğrulanmış kazanım kaydı yok.</p>}
      {tree.map(u => { const codes = u.all.map(o => o.code), stock = u.all.reduce((s, o) => s + o.approved, 0), on = codes.filter(c => chosen.has(c)).length;
        return <details key={u.unit} open={on > 0 || tree.length === 1}>
          <summary><input type="checkbox" aria-label={`${u.unit} tamamı`} checked={on === codes.length} ref={el => { if (el) el.indeterminate = on > 0 && on < codes.length; }} onChange={() => toggleUnit(codes)} onClick={e => e.stopPropagation()} /><span>{u.unit}</span><em className={stock ? '' : 'none'}>{stock} soru</em></summary>
          {u.topics.map(t => <div key={t.topic} className="studio-topic"><small>{t.topic}</small>
            {t.list.map(o => <label key={o.code} className={`studio-outcome${o.approved ? '' : ' empty'}`}><input type="checkbox" checked={chosen.has(o.code)} disabled={!chosen.has(o.code) && value.outcomeCodes.length >= MAX} onChange={() => toggle(o.code)} /><code>{o.code}</code><span>{o.title}</span><em>{o.approved ? `${o.approved} soru` : 'soru yok'}</em></label>)}
          </div>)}
        </details>; })}
    </div>}
    <div className={`studio-stock${info.available !== null && info.available < questionCount ? ' short' : ''}`} role="status">
      {info.loading ? 'Soru stoku hesaplanıyor…' : info.available === null ? (needsInstitution && !institutionId ? 'Stok, kurum seçildikten sonra gösterilir.' : '') : <><strong>{info.available}</strong> uygun onaylı soru · istenen {questionCount}</>}
      {!info.loading && info.message && <small>{info.message}</small>}
    </div>
  </div>;
}
