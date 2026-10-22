import { useEffect, useState } from 'react';
import { api } from '../api';

/** A042: written outcome report — class, sections and students, in points and percentages (never nets). */
export function WrittenReportPanel({ paperId }: { paperId: string }) {
  const [r, setR] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>(`/api/written-papers/${paperId}/report`).then(setR).catch((e) => setError(e.message)); }, [paperId]);
  if (error) return <div className="alert error">{error}</div>;
  if (!r) return null;
  const label = (o: any) => o.code ? `${o.code} · ${o.title}` : o.title;
  const cell = (o: any) => o ? `${o.earned}/${o.possible} (%${o.percent ?? '—'})` : '—';
  return <div className="panel" style={{ marginTop: 16 }}>
    <h3>Kazanım raporu</h3>
    <p className="note">{r.scale.note} Güçlü: %{r.scale.strongAtPercent} ve üzeri · Gelişecek: %{r.scale.improveBelowPercent} altı. Yalnız notu kesinleşmiş öğrenciler sayılır.</p>
    <table><thead><tr><th>Kazanım</th><th>Sınıf</th>{r.sections.map((s: any) => <th key={s.section}>Şube {s.section}</th>)}</tr></thead><tbody>
      {r.outcomes.map((o: any) => <tr key={o.key}><td>{label(o)}</td><td>{cell(r.class.outcomes.find((x: any) => x.key === o.key))}</td>{r.sections.map((s: any) => <td key={s.section}>{cell(s.outcomes.find((x: any) => x.key === o.key))}</td>)}</tr>)}
      <tr><td><strong>Ortalama not</strong></td><td>{r.class.averageTotal ?? '—'} ({r.class.students} öğrenci)</td>{r.sections.map((s: any) => <td key={s.section}>{s.averageTotal ?? '—'} ({s.students})</td>)}</tr>
    </tbody></table>
    <table style={{ marginTop: 12 }}><thead><tr><th>No</th><th>Öğrenci</th><th>Not</th><th>Güçlü kazanımlar</th><th>Gelişecek kazanımlar</th></tr></thead><tbody>
      {r.students.map((s: any) => <tr key={s.id}><td>{s.studentNumber}</td><td>{s.name}</td><td>{s.total}</td><td>{s.strengths.join(', ') || '—'}</td><td>{s.improvements.join(', ') || '—'}</td></tr>)}
    </tbody></table>
    {r.pending.length > 0 && <p>Notu kesinleşmemiş: {r.pending.map((s: any) => `${s.studentNumber} ${s.name}`).join(', ')}</p>}
  </div>;
}
