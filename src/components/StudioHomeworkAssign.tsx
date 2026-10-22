import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

/** A060: assign a ready Studio worksheet as online homework to a class, with a due date and the answer reveal moment. */
export function StudioHomeworkAssign({ documentId, onDone, onError }: { documentId: string; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [classes, setClasses] = useState<any[]>([]); const [students, setStudents] = useState<any[]>([]);
  const [classId, setClassId] = useState(''); const [dueAt, setDueAt] = useState(''); const [reveal, setReveal] = useState<'AFTER_DUE' | 'AFTER_SUBMIT'>('AFTER_DUE'); const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([api<any>('/api/classes'), api<any>('/api/students?status=ACTIVE')]).then(([c, s]) => { setClasses(c.classes || []); setStudents(s.students || []); if (c.classes?.[0]) setClassId(c.classes[0].id); }).catch((e) => onError(e.message)); }, []);
  const chosen = useMemo(() => students.filter((s) => s.class_id === classId), [students, classId]);
  const send = async () => {
    setBusy(true);
    try { const r = await api<any>(`/api/platform/studio/${encodeURIComponent(documentId)}/publish-homework`, { method: 'POST', body: JSON.stringify({ studentIds: chosen.map((s) => s.id), dueAt: dueAt || null, answerReveal: reveal }) }); onDone(r.reused ? 'Bu föy daha önce ödev olarak atanmış.' : `Ödev ${chosen.length} öğrenciye atandı.`); }
    catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };
  return <div className="panel" style={{ marginTop: 8 }}>
    <label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <p>{chosen.length} öğrenci</p>
    <label>Son teslim tarihi<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
    <label>Cevaplar ne zaman açılsın?<select value={reveal} onChange={(e) => setReveal(e.target.value as any)}><option value="AFTER_DUE">Son teslim tarihinden sonra</option><option value="AFTER_SUBMIT">Öğrenci gönderir göndermez</option></select></label>
    <button className="primary" disabled={busy || !chosen.length} onClick={() => void send()}>Ödev olarak ata</button>
  </div>;
}
