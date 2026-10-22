import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

/** A039: analytic rubrics of written questions — criteria, partial-credit levels, alternative solutions, teacher approval. */
type Level = { points: number; descriptor: string };
type Criterion = { criterion: string; descriptor?: string; points: number; levels: Level[] };
type Draft = { totalPoints: number; criteria: Criterion[]; alternatives: { answerText: string; note?: string }[]; changeNote: string };
const STATUS: Record<string, string> = { DRAFT: 'Taslak — notlandırmada kullanılamaz', APPROVED: 'Onaylı', ARCHIVED: 'Kaldırıldı' };
const toDraft = (v: any): Draft => ({ totalPoints: v.total_points, changeNote: '', criteria: v.criteria.map((c: any) => ({ criterion: c.criterion, descriptor: c.descriptor || '', points: c.points, levels: c.levels.map((l: any) => ({ points: l.points, descriptor: l.descriptor })) })), alternatives: v.alternatives.map((a: any) => ({ answerText: a.answer_text, note: a.note || '' })) });

export function WrittenRubrics() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [edit, setEdit] = useState<{ version: number | null; draft: Draft } | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { setQuestions((await api<any>('/api/question-rubrics')).questions || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  const show = async (id: string) => { setEdit(null); setError(''); try { setOpen(await api<any>(`/api/question-rubrics/${encodeURIComponent(id)}`)); } catch (e: any) { setError(e.message); } };
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setError(''); setNotice(''); try { await fn(); setNotice(ok); setEdit(null); await show(open.question.id); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const d = edit?.draft;
  const sum = d ? d.criteria.reduce((t, c) => t + (Number(c.points) || 0), 0) : 0;
  const setCrit = (i: number, c: Criterion) => setEdit({ ...edit!, draft: { ...d!, criteria: d!.criteria.map((x, k) => (k === i ? c : x)) } });
  const canEditVersion = (v: any) => v.status === 'DRAFT' && (user?.role === 'SUPER_ADMIN' || v.institution_id === user?.institution_id);

  return <>
    <div className="page-head"><div><span className="eyebrow">Yazılı Sınavlar</span><h1>Analitik Rubrikler</h1><p>Her açık uçlu soru için ölçütler, kısmi puan düzeyleri ve kabul edilen alternatif çözümler. Bir rubrik, branş öğretmeni onaylamadan notlandırmada kullanılmaz; onaylanan sürüm değiştirilemez, düzeltme yeni sürümle yapılır.</p></div><button className="ghost" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <div className="table-card"><table><thead><tr><th>Soru</th><th>Sınıf / ders</th><th>Biçim</th><th>Son sürüm</th><th>Kullanılan</th><th></th></tr></thead><tbody>
      {questions.map((q) => <tr key={q.id}><td>{q.stem}</td><td>{q.grade_level}. sınıf · {q.subject_name}</td><td>{q.written_format === 'SHORT_ANSWER' ? 'Kısa cevaplı' : 'Açık uçlu'}</td><td>{q.latest_version ? `v${q.latest_version}` : '—'}{q.drafts ? ' · taslak var' : ''}</td><td>{q.effective_version ? <span className="status ok">v{q.effective_version} onaylı</span> : <span className="status warn">Onaylı rubrik yok</span>}</td><td><button className="ghost" onClick={() => void show(q.id)}>Aç</button></td></tr>)}
    </tbody></table>{!questions.length && <div className="empty">Branşınızda onaylı yazılı soru yok.</div>}</div>

    {open && <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><div><h2>{open.question.grade_level}. sınıf {open.question.subject_name}{open.question.max_points ? ` · ${open.question.max_points} puan` : ''}</h2><p style={{ whiteSpace: 'pre-wrap' }}>{open.question.stem_text}</p><p><strong>Model cevap:</strong> {open.question.solution_text}</p></div>
        {!edit && <button className="primary" disabled={busy || open.versions.some((v: any) => canEditVersion(v))} onClick={() => setEdit({ version: null, draft: open.versions[0] ? toDraft(open.versions[0]) : { totalPoints: open.question.max_points || 10, criteria: [{ criterion: '', points: open.question.max_points || 10, levels: [] }], alternatives: [], changeNote: '' } })}><Plus size={16} /> Yeni sürüm</button>}</div>
      {!edit && open.versions.map((v: any) => <div key={v.id} className="panel" style={{ marginTop: 12, borderColor: v.version === open.effectiveVersion ? '#16a34a' : undefined }}>
        <div className="panel-head"><div><h3>v{v.version} · {STATUS[v.status]} · {v.total_points} puan{v.institution_id ? ' · okulunuzun sürümü' : ' · platform sürümü'}{v.source === 'AI_DRAFT' ? ' · AI taslağı' : ''}</h3>
          {v.version === open.effectiveVersion && <p><CheckCircle2 size={14} /> Notlandırmada bu sürüm kullanılır.</p>}
          {v.approvals.map((a: any) => <p key={a.id}>Onay: {a.approver_name || a.approved_by} ({a.approver_role === 'TEACHER' ? 'branş öğretmeni' : 'Süper Admin'}) · {a.approved_at}{a.note ? ` · ${a.note}` : ''}</p>)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEditVersion(v) && <button className="ghost" disabled={busy} onClick={() => setEdit({ version: v.version, draft: toDraft(v) })}>Düzenle</button>}
            {v.status !== 'ARCHIVED' && !v.approvals.some((a: any) => (a.institution_id || null) === (user?.role === 'SUPER_ADMIN' ? v.institution_id || null : user?.institution_id)) && <button className="primary" disabled={busy || open.question.review_status !== 'APPROVED'} onClick={() => { if (confirm('Ölçütleri, kısmi puanları, alternatif çözümleri ve toplamı kontrol ettiniz mi? Onaylanan sürüm değiştirilemez.')) void act(() => api(`/api/question-rubrics/${open.question.id}/versions/${v.version}/approve`, { method: 'POST', body: JSON.stringify({ confirm: true }) }), `v${v.version} onaylandı.`); }}>Onayla</button>}
            {canEditVersion(v) && <button className="ghost" disabled={busy} onClick={() => void act(() => api(`/api/question-rubrics/${open.question.id}/versions/${v.version}/archive`, { method: 'POST', body: '{}' }), 'Taslak kaldırıldı.')}><Trash2 size={14} /></button>}
          </div></div>
        <table><thead><tr><th>Ölçüt</th><th>Puan</th><th>Kısmi puan düzeyleri</th></tr></thead><tbody>{v.criteria.map((c: any) => <tr key={c.id}><td>{c.criterion}{c.descriptor ? <small><br />{c.descriptor}</small> : null}</td><td>{c.points}</td><td>{c.levels.map((l: any) => `${l.points}: ${l.descriptor}`).join(' · ')}</td></tr>)}</tbody></table>
        {v.alternatives.length > 0 && <><strong>Kabul edilen alternatif çözümler</strong><ol>{v.alternatives.map((a: any) => <li key={a.id}>{a.answer_text}{a.note ? ` (${a.note})` : ''}</li>)}</ol></>}
      </div>)}

      {edit && d && <div className="panel" style={{ marginTop: 12 }}>
        <h3>{edit.version ? `v${edit.version} taslağını düzenle` : 'Yeni sürüm'}</h3>
        <div className="form-grid"><label>Toplam puan<input type="number" min={1} max={100} value={d.totalPoints} disabled={!!open.question.max_points} onChange={(e) => setEdit({ ...edit, draft: { ...d, totalPoints: Number(e.target.value) } })} /></label><label>Değişiklik notu<input value={d.changeNote} onChange={(e) => setEdit({ ...edit, draft: { ...d, changeNote: e.target.value } })} /></label></div>
        <p className={sum === d.totalPoints ? 'status ok' : 'status warn'}>Ölçüt puanları toplamı: {sum} / {d.totalPoints}</p>
        {d.criteria.map((c, i) => <div key={i} className="panel" style={{ marginTop: 8 }}>
          <div className="form-grid"><label>Ölçüt<input value={c.criterion} onChange={(e) => setCrit(i, { ...c, criterion: e.target.value })} /></label><label>Puan<input type="number" min={1} max={100} value={c.points} onChange={(e) => setCrit(i, { ...c, points: Number(e.target.value) })} /></label><label>Açıklama<input value={c.descriptor || ''} onChange={(e) => setCrit(i, { ...c, descriptor: e.target.value })} /></label></div>
          <small>Kısmi puan düzeyleri (0 ve tam puan zorunlu; boş bırakılırsa yalnız 0 ve tam puan):</small>
          {c.levels.map((l, k) => <div key={k} style={{ display: 'flex', gap: 6, marginTop: 4 }}><input type="number" min={0} max={c.points} value={l.points} style={{ width: 70 }} onChange={(e) => setCrit(i, { ...c, levels: c.levels.map((x, j) => (j === k ? { ...x, points: Number(e.target.value) } : x)) })} /><input value={l.descriptor} placeholder="Bu puan ne zaman verilir?" onChange={(e) => setCrit(i, { ...c, levels: c.levels.map((x, j) => (j === k ? { ...x, descriptor: e.target.value } : x)) })} /><button className="ghost" onClick={() => setCrit(i, { ...c, levels: c.levels.filter((_, j) => j !== k) })}><Trash2 size={14} /></button></div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><button className="ghost" onClick={() => setCrit(i, { ...c, levels: [...c.levels, { points: 0, descriptor: '' }] })}><Plus size={14} /> Düzey</button>{d.criteria.length > 1 && <button className="ghost" onClick={() => setEdit({ ...edit, draft: { ...d, criteria: d.criteria.filter((_, k) => k !== i) } })}><Trash2 size={14} /> Ölçütü sil</button>}</div>
        </div>)}
        <button className="ghost" onClick={() => setEdit({ ...edit, draft: { ...d, criteria: [...d.criteria, { criterion: '', points: 1, levels: [] }] } })}><Plus size={14} /> Ölçüt ekle</button>
        <h4>Alternatif çözümler</h4>
        {d.alternatives.map((a, i) => <div key={i} style={{ display: 'flex', gap: 6, marginTop: 4 }}><textarea value={a.answerText} onChange={(e) => setEdit({ ...edit, draft: { ...d, alternatives: d.alternatives.map((x, k) => (k === i ? { ...x, answerText: e.target.value } : x)) } })} /><input value={a.note || ''} placeholder="Not" onChange={(e) => setEdit({ ...edit, draft: { ...d, alternatives: d.alternatives.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)) } })} /><button className="ghost" onClick={() => setEdit({ ...edit, draft: { ...d, alternatives: d.alternatives.filter((_, k) => k !== i) } })}><Trash2 size={14} /></button></div>)}
        <button className="ghost" onClick={() => setEdit({ ...edit, draft: { ...d, alternatives: [...d.alternatives, { answerText: '' }] } })}><Plus size={14} /> Alternatif çözüm</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="ghost" onClick={() => setEdit(null)}>Vazgeç</button>
          <button className="primary" disabled={busy || sum !== d.totalPoints} onClick={() => void act(() => api(edit.version ? `/api/question-rubrics/${open.question.id}/versions/${edit.version}` : `/api/question-rubrics/${open.question.id}/versions`, { method: edit.version ? 'PUT' : 'POST', body: JSON.stringify({ ...d, criteria: d.criteria.map((c) => ({ ...c, levels: c.levels.length ? c.levels : undefined })) }) }), 'Taslak kaydedildi; onaylanana kadar notlandırmada kullanılmaz.')}>Taslağı kaydet</button></div>
      </div>}
    </div>}
  </>;
}
