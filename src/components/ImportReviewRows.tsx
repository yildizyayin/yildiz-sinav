import { useEffect, useState } from 'react';
import { api } from '../api';

/** A045: rows that need a person — in-file duplicates, impossible grades, ambiguous matches — resolved one by one. */
const REVIEW = ['AMBIGUOUS', 'INVALID', 'REVIEW_DUPLICATE', 'REVIEW_GRADE'];
export function ImportReviewRows({ jobId, onRemaining }: { jobId: string; onRemaining: (n: number) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState('');
  const load = async () => { try { const r = await api<any>(`/api/imports/${jobId}`); const open = r.rows.filter((x: any) => REVIEW.includes(x.match_status)); setRows(open); onRemaining(open.length); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [jobId]);
  const resolve = async (rowId: string, body: any) => { setError(''); try { await api(`/api/imports/${jobId}/rows/${rowId}/resolve`, { method: 'POST', body: JSON.stringify(body) }); await load(); } catch (e: any) { setError(e.message); } };
  if (!rows.length) return null;
  return <div className="panel" style={{ marginTop: 12 }}>
    <h3>Kontrol gereken satırlar</h3>{error && <div className="alert error">{error}</div>}
    <table><thead><tr><th>Satır</th><th>Numara</th><th>Ad soyad</th><th>Sınıf</th><th>Sorun</th><th>Karar</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td>{r.row_no}</td><td>{r.source.student_number || '—'}</td><td>{r.source.name}</td><td>{r.source.class_name || '—'}</td><td>{(r.issues || []).join(' ')}</td>
        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="ghost" onClick={() => void resolve(r.id, { action: 'SKIP' })}>Atla</button>
          {r.match_status !== 'REVIEW_GRADE' && <button className="ghost" onClick={() => void resolve(r.id, { action: 'NEW' })}>Yeni öğrenci</button>}
          {(r.mapped?.candidates || []).map((c: string) => <button key={c} className="ghost" onClick={() => void resolve(r.id, { action: 'MATCH', studentId: c })}>Eşle: {c.slice(0, 10)}</button>)}
        </td></tr>)}
    </tbody></table>
  </div>;
}
