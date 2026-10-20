import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ScanLine, TriangleAlert, X } from 'lucide-react';
import { api, ApiError } from '../api';
import { imageFileToImageData, parseRuntimeTemplate, readOmrImage, type OmrReadResult } from '../lib/omrEngine';
import { studioBooklets } from './StudioDownloads';

/**
 * A018: scan a printed Studio booklet's optical page with a phone photo.
 * The server maps answers by printed position to the stored booklet order, checks the booklet bubble,
 * and never silently replaces an earlier result; this screen surfaces each of those decisions.
 */
type Problem = { code: string; message: string; previous?: any };

export function opticalAnswerSequence(read: OmrReadResult | null): string {
  return read ? String(read.answers_by_subject?.GENEL ?? '') : '';
}

export function StudioOpticalScan({ document, onClose }: { document: any; onClose: () => void }) {
  const booklets = studioBooklets(document);
  const [booklet, setBooklet] = useState(booklets[0] || 'A');
  const [template, setTemplate] = useState<any>(null);
  const [templateError, setTemplateError] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [read, setRead] = useState<OmrReadResult | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [confirmBooklet, setConfirmBooklet] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTemplate(null); setTemplateError(''); setRead(null); setProblem(null); setResult(null);
    api<any>(`/api/platform/studio/${encodeURIComponent(document.id)}/optical-template?booklet=${booklet}`)
      .then(r => setTemplate(parseRuntimeTemplate({ ...r.template.optical, id: `studio-${document.id}-${booklet}`, name: `${document.title} · ${booklet}` })))
      .catch(e => setTemplateError(e?.status === 404 ? `Önce Kitapçık ${booklet} PDF'ini indirin; optik şablon PDF ile birlikte oluşur.` : e.message || 'Optik şablon alınamadı.'));
  }, [document.id, booklet]);
  useEffect(() => {
    const scope = document.institution_id ? `&institutionId=${encodeURIComponent(document.institution_id)}` : '';
    api<any>(`/api/students?status=ACTIVE${scope}`).then(r => setStudents(r.students || [])).catch(() => setStudents([]));
  }, [document.institution_id]);

  const sequence = opticalAnswerSequence(read);
  const readBooklet = read?.booklet || null;
  const blanks = useMemo(() => [...sequence].filter(c => c === '_').length, [sequence]);

  const scan = async (file: File | undefined) => {
    if (!file || !template) return;
    setReading(true); setRead(null); setProblem(null); setResult(null); setConfirmBooklet(false);
    try { setRead(readOmrImage(await imageFileToImageData(file), template)); }
    catch { setProblem({ code: 'READ_FAILED', message: 'Fotoğraf okunamadı. Optiğin tamamını, düz ve iyi ışıkta çekin.' }); }
    finally { setReading(false); }
  };

  const submit = async (replace = false) => {
    if (!read || !studentId) return;
    setBusy(true); setProblem(null);
    try {
      const body: any = { studentId, booklet, readBooklet, answers: sequence, confirmBooklet: confirmBooklet || undefined };
      if (replace) { body.replace = true; body.replaceReason = replaceReason; }
      const r = await api<any>(`/api/platform/studio/${encodeURIComponent(document.id)}/optical-submit`, { method: 'POST', body: JSON.stringify(body) });
      setResult(r); setReplaceReason('');
    } catch (e: any) {
      const err = e instanceof ApiError ? (e as any) : null;
      setProblem({ code: err?.code || 'SUBMIT_FAILED', message: e.message || 'Sonuç kaydedilemedi.', previous: err?.details?.previous });
    } finally { setBusy(false); }
  };

  const student = students.find(s => s.id === studentId);
  return <div className="studio-optical-scan" role="dialog" aria-label="Optik okut">
    <div className="studio-optical-head"><strong><ScanLine size={16} /> Optik okut · {document.title}</strong><button type="button" onClick={onClose} aria-label="Kapat"><X size={16} /></button></div>
    <div className="studio-optical-grid">
      <label>Kitapçık<select value={booklet} onChange={e => setBooklet(e.target.value)}>{booklets.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
      <label>Öğrenci<select value={studentId} onChange={e => { setStudentId(e.target.value); setResult(null); setProblem(null); }}><option value="">Öğrenci seçin</option>{students.map(s => <option key={s.id} value={s.id}>{[s.student_number, `${s.first_name || ''} ${s.last_name || ''}`.trim(), s.grade_level ? `${s.grade_level}/${s.section || ''}` : ''].filter(Boolean).join(' · ')}</option>)}</select></label>
      <label>Optik fotoğrafı<input type="file" accept="image/*" capture="environment" disabled={!template || reading} onChange={e => void scan(e.target.files?.[0])} /></label>
    </div>
    {templateError && <div className="alert error" role="alert">{templateError}</div>}
    {reading && <div className="alert info" role="status"><Camera size={14} /> Okunuyor…</div>}
    {read && <div className="studio-optical-read">
      <div>Okunan kitapçık: <b>{readBooklet || 'okunamadı'}</b> · Güven: %{Math.round(read.confidence * 100)} · Boş/kararsız: {blanks}</div>
      <div className="studio-optical-answers">{[...sequence].map((c, i) => <span key={i} className={c === '_' ? 'blank' : ''}>{i + 1}:{c === '_' ? '–' : c}</span>)}</div>
      {read.issues.length > 0 && <ul className="muted">{read.issues.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {!readBooklet && <label className="check"><input type="checkbox" checked={confirmBooklet} onChange={e => setConfirmBooklet(e.target.checked)} /> Kitapçık işareti okunamadı; öğrencinin {booklet} kitapçığını çözdüğünü doğruluyorum.</label>}
      <button type="button" className="primary" disabled={busy || !studentId || (!readBooklet && !confirmBooklet)} onClick={() => void submit(false)}>{busy ? 'Kaydediliyor…' : `${student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : 'Öğrenci'} için sonucu kaydet`}</button>
      {!studentId && <small className="muted">Sonucu kaydetmek için öğrenciyi seçin.</small>}
    </div>}
    {problem && <div className="alert error" role="alert"><TriangleAlert size={14} /> {problem.message}
      {problem.code === 'ALREADY_SCANNED' && <div className="studio-optical-replace"><label>Gerekçe<input value={replaceReason} onChange={e => setReplaceReason(e.target.value)} placeholder="Ör. ilk okutmada yanlış öğrenci seçildi" /></label><button type="button" disabled={busy || replaceReason.trim().length < 5} onClick={() => void submit(true)}>Önceki sonucun yerine kaydet</button></div>}
      {problem.code === 'BOOKLET_MISMATCH' && readBooklet && booklets.includes(readBooklet) && <button type="button" onClick={() => setBooklet(readBooklet)}>{readBooklet} kitapçığı şablonuna geç</button>}
    </div>}
    {result && <div className="alert success" role="status"><CheckCircle2 size={14} /> {result.replaced ? 'Önceki sonuç değiştirildi' : 'Sonuç kaydedildi'} · Kitapçık {result.booklet} · {result.correct}/{result.total} doğru · {result.blank} boş · %{Math.round(result.score * 100)}</div>}
  </div>;
}
