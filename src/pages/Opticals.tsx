import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, CircleAlert, CopyPlus, FileText, FileUp, FlaskConical, MousePointer2, Plus, Save, ScanLine, Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import { analyzeFixedWidthSample } from '../lib/guidedDefinitions';

type Section = 'parser' | 'camera' | 'print' | 'fiducials';
type Method = 'PHOTO' | 'TXT' | 'MANUAL';
type Rect = { id: string; type: string; subjectCode?: string; xMm: number; yMm: number; widthMm: number; heightMm: number };
type Suggestion = { xPct: number; yPct: number; wPct: number; hPct: number };
type AnswerRange = { subjectCode: string; start: number; end: number };
type PrintField = { key: string; xMm: number; yMm: number; widthMm?: number; heightMm?: number };

const EXAMPLES: Record<Section, any> = {
  parser: { type: 'fixed-width', recordLength: 120, signature: '', fields: { student_number: { start: 0, end: 8 }, name: { start: 8, end: 38 }, class: { start: 38, end: 42 }, booklet: { start: 42, end: 43 } }, answers: { MAT: { start: 43, end: 63 } } },
  camera: { regions: [{ id: 'answers-main', type: 'answers', xMm: 20, yMm: 80, widthMm: 160, heightMm: 150 }] },
  print: { fields: [{ key: 'studentName', xMm: 20, yMm: 20 }, { key: 'studentNumber', xMm: 20, yMm: 30 }] },
  fiducials: { targets: [[8, 8], [202, 8], [8, 289], [202, 289]] },
};

function pretty(value: unknown) {
  if (!value) return '';
  try { return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2); } catch { return String(value); }
}

function assetLabel(value: string) {
  return value === 'BLANK_FORM' ? 'Boş Form / Fotoğraf' : value === 'FMT_SAMPLE' ? 'TXT / DAT / FMT Örneği' : 'Baskı Tabanı';
}

function safeJson(value: unknown) {
  if (!value) return null;
  if (typeof value === 'object') return value as any;
  try { return JSON.parse(String(value)); } catch { return null; }
}

async function detectDenseRegions(file: File): Promise<Suggestion[]> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  bitmap.close();

  const cols = 24, rows = 34;
  const cellW = width / cols, cellH = height / rows;
  const active = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x0 = Math.floor(gx * cellW), x1 = Math.min(width, Math.ceil((gx + 1) * cellW));
    const y0 = Math.floor(gy * cellH), y1 = Math.min(height, Math.ceil((gy + 1) * cellH));
    let dark = 0, total = 0;
    const step = 2;
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const lum = 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
      if (lum < 145) dark++;
      total++;
    }
    active[gy][gx] = total > 0 && dark / total > 0.075;
  }

  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const boxes: Suggestion[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!active[y][x] || seen[y][x]) continue;
    const stack = [[x, y]]; seen[y][x] = true;
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop()!; count++;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && active[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
      }
    }
    if (count < 2) continue;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w * h > cols * rows * 0.35) continue;
    boxes.push({ xPct: minX / cols * 100, yPct: minY / rows * 100, wPct: w / cols * 100, hPct: h / rows * 100 });
  }
  return boxes.sort((a, b) => (b.wPct * b.hPct) - (a.wPct * a.hPct)).slice(0, 16);
}

export function Opticals() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionDetail, setVersionDetail] = useState<any>(null);
  const [method, setMethod] = useState<Method>('PHOTO');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', vendor: '', version: 'v1', pageWidthMm: 210, pageHeightMm: 297 });
  const [newVersion, setNewVersion] = useState('');

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [regions, setRegions] = useState<Rect[]>([]);
  const [fiducials, setFiducials] = useState<Array<[number, number]>>([]);
  const [drawMode, setDrawMode] = useState<'REGION' | 'FIDUCIAL'>('REGION');
  const [regionKind, setRegionKind] = useState('answers');
  const [regionSubject, setRegionSubject] = useState('MAT');
  const drawRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Suggestion | null>(null);

  const [sample, setSample] = useState<File | null>(null);
  const [sampleText, setSampleText] = useState('');
  const [fixed, setFixed] = useState<any>(null);
  const [fieldRanges, setFieldRanges] = useState({ studentStart: 0, studentEnd: 0, nameStart: 0, nameEnd: 0, classStart: 0, classEnd: 0, bookletStart: 0, bookletEnd: 0 });
  const [answerRanges, setAnswerRanges] = useState<AnswerRange[]>([]);
  const [parserTest, setParserTest] = useState<any>(null);

  const [printFields, setPrintFields] = useState<PrintField[]>([]);
  const [advanced, setAdvanced] = useState<Record<Section, string>>({ parser: '', camera: '', print: '', fiducials: '' });

  const selectedVersion = versionDetail?.version;
  const readiness = versionDetail?.readiness;
  const pageW = Number(selectedVersion?.page_width_mm || 210);
  const pageH = Number(selectedVersion?.page_height_mm || 297);

  const loadTemplates = async () => { const r = await api<any>('/api/optical-definitions'); setTemplates(r.templates || []); };
  const loadTemplate = async (id: string) => {
    if (!id) return;
    const r = await api<any>(`/api/optical-definitions/${id}`); setTemplateDetail(r);
    if (!selectedVersionId || !(r.versions || []).some((v: any) => v.id === selectedVersionId)) setSelectedVersionId(r.versions?.[0]?.id || '');
  };
  const loadVersion = async (id: string) => {
    if (!id) return;
    const r = await api<any>(`/api/optical-definition-versions/${id}`); setVersionDetail(r); setParserTest(null);
    const camera = safeJson(r.version.camera_geometry); const fid = safeJson(r.version.fiducials); const print = safeJson(r.version.print_fields);
    setRegions((camera?.regions || []).map((x: any, i: number) => ({ id: x.id || `region-${i + 1}`, type: x.type || 'answers', subjectCode: x.subjectCode, xMm: Number(x.xMm), yMm: Number(x.yMm), widthMm: Number(x.widthMm), heightMm: Number(x.heightMm) })));
    setFiducials((fid?.targets || []).map((x: any) => Array.isArray(x) ? [Number(x[0]), Number(x[1])] : [Number(x.xMm), Number(x.yMm)]));
    const pf = Array.isArray(print?.fields) ? print.fields : [];
    setPrintFields(pf.map((x: any) => ({ key: x.key, xMm: Number(x.xMm), yMm: Number(x.yMm), widthMm: x.widthMm == null ? undefined : Number(x.widthMm), heightMm: x.heightMm == null ? undefined : Number(x.heightMm) })));
    setAdvanced({ parser: pretty(r.version.parser_definition), camera: pretty(r.version.camera_geometry), print: pretty(r.version.print_fields), fiducials: pretty(r.version.fiducials) });
  };

  useEffect(() => { void loadTemplates().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (selectedTemplateId) void loadTemplate(selectedTemplateId).catch((e) => setError(e.message)); }, [selectedTemplateId]);
  useEffect(() => { if (selectedVersionId) void loadVersion(selectedVersionId).catch((e) => setError(e.message)); }, [selectedVersionId]);
  useEffect(() => { if (!photo) { setPhotoUrl(''); return; } const url = URL.createObjectURL(photo); setPhotoUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);

  const createTemplate = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>('/api/optical-definitions', { method: 'POST', body: JSON.stringify(newTemplate) }); await loadTemplates(); setSelectedTemplateId(r.templateId); setSelectedVersionId(r.versionId); setNotice('Optik taslağı oluşturuldu. Şimdi fotoğraf veya TXT/DAT üzerinden tanıtın.'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const createVersion = async () => {
    if (!selectedTemplateId || !newVersion.trim()) return;
    setBusy(true); setError('');
    try { const r = await api<any>(`/api/optical-definitions/${selectedTemplateId}/versions`, { method: 'POST', body: JSON.stringify({ version: newVersion.trim(), cloneFromVersionId: selectedVersionId || null }) }); await loadTemplate(selectedTemplateId); setSelectedVersionId(r.versionId); setNewVersion(''); setNotice('Yeni taslak sürüm açıldı.'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const pointPct = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - box.left) / box.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - box.top) / box.height * 100)) };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!photoUrl || selectedVersion?.active) return;
    const p = pointPct(e);
    if (drawMode === 'FIDUCIAL') { setFiducials((x) => [...x, [p.x / 100 * pageW, p.y / 100 * pageH]].slice(-8)); return; }
    startRef.current = p; setDraft({ xPct: p.x, yPct: p.y, wPct: 0, hPct: 0 }); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || drawMode !== 'REGION') return; const p = pointPct(e); const s = startRef.current;
    setDraft({ xPct: Math.min(s.x, p.x), yPct: Math.min(s.y, p.y), wPct: Math.abs(p.x - s.x), hPct: Math.abs(p.y - s.y) });
  };
  const onPointerUp = () => {
    if (!draft || draft.wPct < 1 || draft.hPct < 1) { startRef.current = null; setDraft(null); return; }
    addSuggestionAsRegion(draft); startRef.current = null; setDraft(null);
  };
  const addSuggestionAsRegion = (s: Suggestion) => setRegions((current) => [...current, { id: `region-${current.length + 1}`, type: regionKind, subjectCode: regionKind === 'answers' ? regionSubject.trim().toUpperCase() : undefined, xMm: s.xPct / 100 * pageW, yMm: s.yPct / 100 * pageH, widthMm: s.wPct / 100 * pageW, heightMm: s.hPct / 100 * pageH }]);

  const analysePhoto = async () => {
    if (!photo) return;
    setBusy(true); setError('');
    try { const found = await detectDenseRegions(photo); setSuggestions(found); setNotice(found.length ? `Fotoğrafta ${found.length} yoğun işaret bölgesi bulundu. Sistem konumları önerdi; hangi alanın öğrenci no, kitapçık veya ders cevapları olduğunu siz onaylayın.` : 'Otomatik bölge önerisi bulunamadı. Fotoğraf üzerinde alanları elle çizebilirsiniz.'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const savePhotoDefinition = async () => {
    if (!selectedVersionId) return;
    if (!regions.length) { setError('En az bir okuma alanı çizmelisiniz.'); return; }
    if (fiducials.length < 3) { setError('Kamera hizalaması için fotoğraf üzerinde en az 3 gerçek referans noktası işaretleyin.'); return; }
    setBusy(true); setError('');
    try {
      await api(`/api/optical-definition-versions/${selectedVersionId}/camera`, { method: 'PUT', body: JSON.stringify({ definition: { regions } }) });
      await api(`/api/optical-definition-versions/${selectedVersionId}/fiducials`, { method: 'PUT', body: JSON.stringify({ definition: { targets: fiducials } }) });
      if (photo) { const fd = new FormData(); fd.append('file', photo); fd.append('assetType', 'BLANK_FORM'); await api(`/api/optical-definition-versions/${selectedVersionId}/assets`, { method: 'POST', body: fd }); }
      setNotice('Fotoğraf tabanlı kamera geometrisi kaydedildi. Fotoğraf referans dosyası olarak R2 alanına alındı.'); await loadVersion(selectedVersionId);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const readSample = async (file?: File) => {
    if (!file) return; setSample(file); const text = await file.text(); setSampleText(text);
    const suggestion = analyzeFixedWidthSample(text); setFixed(suggestion); setParserTest(null);
    if (suggestion) {
      setFieldRanges({ studentStart: suggestion.studentNumber?.start ?? 0, studentEnd: suggestion.studentNumber?.end ?? 0, nameStart: suggestion.name?.start ?? 0, nameEnd: suggestion.name?.end ?? 0, classStart: 0, classEnd: 0, bookletStart: 0, bookletEnd: 0 });
      setAnswerRanges(suggestion.answerBlocks.map((x, i) => ({ subjectCode: i === 0 ? 'MAT' : '', start: x.start, end: x.end })));
      setNotice(`TXT/DAT örneği analiz edildi. Baskın kayıt uzunluğu ${suggestion.recordLength}; ${suggestion.answerBlocks.length} olası cevap bloğu bulundu. Alanları kontrol edip kaydedin.`);
    } else setError('TXT/DAT yapısı otomatik analiz edilemedi. Manuel alan tanımını kullanabilirsiniz.');
  };

  const buildParser = () => {
    if (!fixed) return null;
    const fields: any = { name: { start: fieldRanges.nameStart, end: fieldRanges.nameEnd } };
    if (fieldRanges.studentEnd > fieldRanges.studentStart) fields.student_number = { start: fieldRanges.studentStart, end: fieldRanges.studentEnd };
    if (fieldRanges.classEnd > fieldRanges.classStart) fields.class = { start: fieldRanges.classStart, end: fieldRanges.classEnd };
    if (fieldRanges.bookletEnd > fieldRanges.bookletStart) fields.booklet = { start: fieldRanges.bookletStart, end: fieldRanges.bookletEnd };
    const answers: any = {};
    for (const r of answerRanges) if (r.subjectCode.trim() && r.end > r.start) answers[r.subjectCode.trim().toUpperCase()] = { start: r.start, end: r.end };
    return { type: 'fixed-width', recordLength: fixed.recordLength, signature: '', fields, answers };
  };

  const saveParserAndTest = async () => {
    if (!selectedVersionId || !sample || !sampleText) return;
    const parser = buildParser(); if (!parser) return;
    setBusy(true); setError('');
    try {
      await api(`/api/optical-definition-versions/${selectedVersionId}/parser`, { method: 'PUT', body: JSON.stringify({ definition: parser }) });
      const r = await api<any>(`/api/optical-definition-versions/${selectedVersionId}/test-parser`, { method: 'POST', body: JSON.stringify({ sampleText, fileName: sample.name }) }); setParserTest(r);
      if (r.passed) { const fd = new FormData(); fd.append('file', sample); fd.append('assetType', 'FMT_SAMPLE'); await api(`/api/optical-definition-versions/${selectedVersionId}/assets`, { method: 'POST', body: fd }); }
      setNotice(r.passed ? `TXT/DAT parser testi başarılı: ${r.recordCount} kayıt okundu.` : 'Parser kaydedildi fakat örnek dosya testi geçmedi. Alan başlangıç/bitişlerini düzeltin.'); await loadVersion(selectedVersionId);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const savePrintFields = async () => {
    if (!selectedVersionId || !printFields.length) { setError('En az bir baskı alanı ekleyin.'); return; }
    setBusy(true); setError(''); try { await api(`/api/optical-definition-versions/${selectedVersionId}/print`, { method: 'PUT', body: JSON.stringify({ definition: { fields: printFields } }) }); setNotice('Kişiye özel baskı alanları kaydedildi.'); await loadVersion(selectedVersionId); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const saveAdvanced = async (section: Section) => {
    if (!selectedVersionId) return;
    setBusy(true); setError(''); try { const definition = JSON.parse(advanced[section]); await api(`/api/optical-definition-versions/${selectedVersionId}/${section}`, { method: 'PUT', body: JSON.stringify({ definition }) }); setNotice('Gelişmiş tanım kaydedildi.'); await loadVersion(selectedVersionId); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!selectedVersionId || !confirm('Bu optik sürümü READY durumuna alınsın mı?')) return;
    setBusy(true); setError(''); try { await api(`/api/optical-definition-versions/${selectedVersionId}/publish`, { method: 'POST' }); setNotice('Optik sürümü yayına alındı.'); await loadTemplates(); await loadTemplate(selectedTemplateId); await loadVersion(selectedVersionId); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const readinessCards = useMemo(() => [
    ['TXT/DAT', readiness?.parser && readiness?.parserTestPassed], ['Kamera', readiness?.camera], ['Referans', readiness?.fiducials], ['Baskı', readiness?.print],
  ], [readiness]);

  return <>
    <div className="page-head"><div><span className="eyebrow">Optik Tanıtma</span><h1>Fotoğraftan analiz et veya TXT/DAT ile tanıt</h1><p>JSON yazmak zorunda değilsiniz. Boş optiğin fotoğrafını yükleyin, sistem yoğun alanları bulsun; siz alanları etiketleyin. TXT/DAT varsa dosyadan kayıt uzunluğu ve olası cevap bloklarını çıkaralım.</p></div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}

    <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Yeni optik</h2><p>Önce optiğe bir ad verin; sonra tanıtma yöntemini seçin.</p></div><ScanLine /></div><div className="form-grid"><label>Optik adı<input value={newTemplate.name} onChange={(e) => setNewTemplate((x) => ({ ...x, name: e.target.value }))} placeholder="Örn. Kurum Optiği / Optik 129" /></label><label>Kaynak / üretici<input value={newTemplate.vendor} onChange={(e) => setNewTemplate((x) => ({ ...x, vendor: e.target.value }))} placeholder="İsteğe bağlı" /></label><label>Sürüm<input value={newTemplate.version} onChange={(e) => setNewTemplate((x) => ({ ...x, version: e.target.value }))} /></label><label>Sayfa genişliği mm<input type="number" value={newTemplate.pageWidthMm} onChange={(e) => setNewTemplate((x) => ({ ...x, pageWidthMm: Number(e.target.value) }))} /></label><label>Sayfa yüksekliği mm<input type="number" value={newTemplate.pageHeightMm} onChange={(e) => setNewTemplate((x) => ({ ...x, pageHeightMm: Number(e.target.value) }))} /></label></div><button className="primary" disabled={busy || !newTemplate.name.trim()} onClick={createTemplate}><Plus size={16} /> Optiği Tanıtmaya Başla</button></div>

    <div className="exam-grid" style={{ marginBottom: 20 }}>{templates.map((t) => <button key={t.id} className="exam-card" style={{ textAlign: 'left', cursor: 'pointer', outline: selectedTemplateId === t.id ? '2px solid currentColor' : 'none' }} onClick={() => setSelectedTemplateId(t.id)}><div className="exam-top"><div className="quick-icon"><ScanLine /></div>{t.status === 'READY' ? <span className="verified"><CheckCircle2 size={14} /> Hazır</span> : <span className="warning"><CircleAlert size={14} /> Tanım gerekli</span>}</div><h3>{t.name}</h3><p>{t.vendor || 'Genel'} · {t.version_count} sürüm</p></button>)}</div>

    {templateDetail && <div className="panel" style={{ marginBottom: 20 }}><div className="form-grid"><label>Sürüm<select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)}>{templateDetail.versions?.map((v: any) => <option key={v.id} value={v.id}>{v.version}{v.active ? ' · AKTİF' : ''}</option>)}</select></label><label>Yeni sürüm<input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="v2" /></label></div><button className="secondary" disabled={!newVersion.trim()} onClick={createVersion}><CopyPlus size={16} /> Seçili Sürümden Yeni Taslak</button></div>}

    {versionDetail && <>
      <div className="summary-strip" style={{ marginBottom: 20 }}>{readinessCards.map(([label, ok]) => <div className="kpi-card" key={String(label)}><span>{label as string}</span><strong>{ok ? 'Hazır' : 'Eksik'}</strong></div>)}</div>
      {selectedVersion?.active && <div className="alert success">Bu sürüm yayında ve kilitli. Değişiklik için yeni sürüm açın.</div>}

      {!selectedVersion?.active && <>
        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Tanıtma yöntemi</h2><p>Birini seçin; teknik JSON ekranı yalnız gelişmiş kullanım için aşağıda kalır.</p></div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><button className={method === 'PHOTO' ? 'primary' : 'secondary'} onClick={() => setMethod('PHOTO')}><Camera size={16} /> Fotoğraftan Optik Tanımla</button><button className={method === 'TXT' ? 'primary' : 'secondary'} onClick={() => setMethod('TXT')}><FileText size={16} /> TXT / DAT'den Tanımla</button><button className={method === 'MANUAL' ? 'primary' : 'secondary'} onClick={() => setMethod('MANUAL')}><MousePointer2 size={16} /> Manuel / Gelişmiş</button></div></div>

        {method === 'PHOTO' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Fotoğraftan Optik Tanımla</h2><p>Boş ve düz çekilmiş optiği yükleyin. Otomatik analiz yalnız bölge önerir; hangi alanın ne olduğunu siz onaylarsınız. Sistem bilinmeyen optiği uydurmaz.</p></div><Sparkles /></div><div className="form-grid"><label>Optik fotoğrafı<input type="file" accept="image/*" onChange={(e) => { setPhoto(e.target.files?.[0] || null); setSuggestions([]); }} /></label><label>Çizilecek alan<select value={regionKind} onChange={(e) => setRegionKind(e.target.value)}><option value="answers">Ders cevap alanı</option><option value="bubble-grid">Öğrenci No / Kodlama alanı</option><option value="booklet">Kitapçık alanı</option></select></label>{regionKind === 'answers' && <label>Ders kodu<input value={regionSubject} onChange={(e) => setRegionSubject(e.target.value.toUpperCase())} placeholder="MAT / TUR / FEN" /></label>}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}><button className="secondary" disabled={!photo || busy} onClick={() => void analysePhoto()}><Sparkles size={16} /> Fotoğrafı Analiz Et</button><button className={drawMode === 'REGION' ? 'primary' : 'secondary'} onClick={() => setDrawMode('REGION')}>Alan Çiz</button><button className={drawMode === 'FIDUCIAL' ? 'primary' : 'secondary'} onClick={() => setDrawMode('FIDUCIAL')}>Referans Noktası İşaretle</button><button className="ghost" onClick={() => { setRegions([]); setFiducials([]); }}>İşaretleri Temizle</button></div>
          {photoUrl && <div ref={drawRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ position: 'relative', maxWidth: 850, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, overflow: 'hidden', touchAction: 'none', cursor: drawMode === 'REGION' ? 'crosshair' : 'copy' }}><img src={photoUrl} alt="Optik referansı" style={{ width: '100%', display: 'block', userSelect: 'none', pointerEvents: 'none' }} />{suggestions.map((s, i) => <button title="Bu öneriyi seçili alan türüyle ekle" key={`s-${i}`} onClick={(e) => { e.stopPropagation(); addSuggestionAsRegion(s); }} style={{ position: 'absolute', left: `${s.xPct}%`, top: `${s.yPct}%`, width: `${s.wPct}%`, height: `${s.hPct}%`, border: '2px dashed #f59e0b', background: 'rgba(245,158,11,.08)', cursor: 'pointer' }} />)}{regions.map((r) => <div key={r.id} style={{ position: 'absolute', left: `${r.xMm / pageW * 100}%`, top: `${r.yMm / pageH * 100}%`, width: `${r.widthMm / pageW * 100}%`, height: `${r.heightMm / pageH * 100}%`, border: '2px solid #2563eb', background: 'rgba(37,99,235,.12)', pointerEvents: 'none', fontSize: 11 }}>{r.subjectCode || r.type}</div>)}{fiducials.map((p, i) => <div key={`f-${i}`} style={{ position: 'absolute', left: `${p[0] / pageW * 100}%`, top: `${p[1] / pageH * 100}%`, width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#dc2626', border: '2px solid white', pointerEvents: 'none' }} />)}{draft && <div style={{ position: 'absolute', left: `${draft.xPct}%`, top: `${draft.yPct}%`, width: `${draft.wPct}%`, height: `${draft.hPct}%`, border: '2px solid #16a34a', background: 'rgba(22,163,74,.12)', pointerEvents: 'none' }} />}</div>}
          {!!regions.length && <div className="cards-list" style={{ marginTop: 12 }}>{regions.map((r, i) => <div className="list-card" key={r.id}><div style={{ flex: 1 }}><strong>{i + 1}. {r.subjectCode || r.type}</strong><span>x {r.xMm.toFixed(1)} · y {r.yMm.toFixed(1)} · {r.widthMm.toFixed(1)}×{r.heightMm.toFixed(1)} mm</span></div><button className="ghost" onClick={() => setRegions((x) => x.filter((z) => z.id !== r.id))}>Sil</button></div>)}</div>}
          <div className="alert warning" style={{ marginTop: 12 }}>Referans noktası = optikte fiziksel olarak bulunan siyah hizalama işareti/köşe hedefi. Sayfa köşesini gerçek işaret yoksa referans diye tanımlamayın. En az 3 gerçek nokta gerekli. Şu an: {fiducials.length}</div><button className="primary" disabled={busy || !photo || !regions.length || fiducials.length < 3} onClick={savePhotoDefinition}><Save size={16} /> Fotoğraf Tanımını Kaydet</button></div>}

        {method === 'TXT' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>TXT / DAT dosyasından optiği tanıt</h2><p>Örnek dosyadan satır uzunluğunu ve olası cevap bloklarını analiz ederiz. Başlangıç/bitiş alanlarını siz doğrularsınız.</p></div><FlaskConical /></div><input type="file" accept=".txt,.dat,text/plain" onChange={(e) => void readSample(e.target.files?.[0])} />{fixed && <><div className="alert success" style={{ marginTop: 12 }}>Kayıt uzunluğu: <strong>{fixed.recordLength}</strong> karakter · analiz edilen aynı uzunluktaki satır: <strong>{fixed.lineCount}</strong></div><div className="form-grid"><label>Öğrenci No başlangıç<input type="number" value={fieldRanges.studentStart} onChange={(e) => setFieldRanges((x) => ({ ...x, studentStart: Number(e.target.value) }))} /></label><label>Öğrenci No bitiş<input type="number" value={fieldRanges.studentEnd} onChange={(e) => setFieldRanges((x) => ({ ...x, studentEnd: Number(e.target.value) }))} /></label><label>Ad Soyad başlangıç<input type="number" value={fieldRanges.nameStart} onChange={(e) => setFieldRanges((x) => ({ ...x, nameStart: Number(e.target.value) }))} /></label><label>Ad Soyad bitiş<input type="number" value={fieldRanges.nameEnd} onChange={(e) => setFieldRanges((x) => ({ ...x, nameEnd: Number(e.target.value) }))} /></label><label>Sınıf başlangıç<input type="number" value={fieldRanges.classStart} onChange={(e) => setFieldRanges((x) => ({ ...x, classStart: Number(e.target.value) }))} /></label><label>Sınıf bitiş<input type="number" value={fieldRanges.classEnd} onChange={(e) => setFieldRanges((x) => ({ ...x, classEnd: Number(e.target.value) }))} /></label><label>Kitapçık başlangıç<input type="number" value={fieldRanges.bookletStart} onChange={(e) => setFieldRanges((x) => ({ ...x, bookletStart: Number(e.target.value) }))} /></label><label>Kitapçık bitiş<input type="number" value={fieldRanges.bookletEnd} onChange={(e) => setFieldRanges((x) => ({ ...x, bookletEnd: Number(e.target.value) }))} /></label></div><h3>Olası cevap blokları</h3>{answerRanges.map((r, i) => <div className="form-grid" key={i}><label>Ders kodu<input value={r.subjectCode} onChange={(e) => setAnswerRanges((x) => x.map((z, j) => j === i ? { ...z, subjectCode: e.target.value.toUpperCase() } : z))} placeholder="MAT" /></label><label>Başlangıç<input type="number" value={r.start} onChange={(e) => setAnswerRanges((x) => x.map((z, j) => j === i ? { ...z, start: Number(e.target.value) } : z))} /></label><label>Bitiş<input type="number" value={r.end} onChange={(e) => setAnswerRanges((x) => x.map((z, j) => j === i ? { ...z, end: Number(e.target.value) } : z))} /></label></div>)}<button className="secondary" onClick={() => setAnswerRanges((x) => [...x, { subjectCode: '', start: 0, end: 0 }])}><Plus size={15} /> Cevap Bloğu Ekle</button><div style={{ marginTop: 12 }}><button className="primary" disabled={busy || !answerRanges.some((x) => x.subjectCode && x.end > x.start) || fieldRanges.nameEnd <= fieldRanges.nameStart} onClick={saveParserAndTest}><FlaskConical size={16} /> Parser'ı Kaydet ve Gerçek Dosyayla Test Et</button></div>{parserTest && <div className={parserTest.passed ? 'alert success' : 'alert error'} style={{ marginTop: 12 }}><strong>{parserTest.passed ? 'Test başarılı' : 'Test başarısız'}</strong> · {parserTest.recordCount} kayıt · güven %{Math.round((parserTest.confidence || 0) * 100)}{parserTest.sample?.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(parserTest.sample.slice(0, 2), null, 2)}</pre>}</div>}</>}</div>}

        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Kişiye özel baskı alanları</h2><p>Ad, öğrenci no, sınıf vb. alanların optikte nereye basılacağını mm olarak tanımlayın. Bu bölüm kamera okumadan bağımsızdır.</p></div></div><button className="secondary" onClick={() => setPrintFields((x) => [...x, { key: 'studentName', xMm: 0, yMm: 0 }])}><Plus size={15} /> Baskı Alanı Ekle</button>{printFields.map((f, i) => <div className="form-grid" key={i}><label>Alan<select value={f.key} onChange={(e) => setPrintFields((x) => x.map((z, j) => j === i ? { ...z, key: e.target.value } : z))}><option value="studentName">Ad Soyad</option><option value="studentNumber">Öğrenci No</option><option value="class">Sınıf</option><option value="section">Şube</option><option value="institutionCode">Kurum Kodu</option><option value="qr">QR</option><option value="barcode">Barkod</option><option value="studentNumberBubbles">Öğrenci No Baloncukları</option></select></label><label>X mm<input type="number" step="0.1" value={f.xMm} onChange={(e) => setPrintFields((x) => x.map((z, j) => j === i ? { ...z, xMm: Number(e.target.value) } : z))} /></label><label>Y mm<input type="number" step="0.1" value={f.yMm} onChange={(e) => setPrintFields((x) => x.map((z, j) => j === i ? { ...z, yMm: Number(e.target.value) } : z))} /></label><button className="ghost" onClick={() => setPrintFields((x) => x.filter((_, j) => j !== i))}>Sil</button></div>)}<button className="primary" disabled={!printFields.length || busy} onClick={savePrintFields}><Save size={16} /> Baskı Alanlarını Kaydet</button></div>

        {method === 'MANUAL' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Manuel / Gelişmiş Teknik Tanım</h2><p>Yalnız özel durumlar için. Normal kullanımda fotoğraf ve TXT/DAT sihirbazları yeterlidir.</p></div></div>{(['parser', 'camera', 'print', 'fiducials'] as Section[]).map((section) => <details key={section} style={{ marginBottom: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>{section.toUpperCase()}</summary><textarea rows={12} spellCheck={false} value={advanced[section] || pretty(EXAMPLES[section])} onChange={(e) => setAdvanced((x) => ({ ...x, [section]: e.target.value }))} style={{ width: '100%', marginTop: 8, fontFamily: 'ui-monospace,monospace', fontSize: 12 }} /><button className="secondary" onClick={() => void saveAdvanced(section)}><Save size={15} /> Kaydet</button></details>)}</div>}
      </>}

      <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Yayın kontrolü</h2><p>Optik ancak kamera, gerçek referans noktaları, baskı alanları ve gerçek TXT/DAT parser testi tamamlandığında READY olur.</p></div>{readiness?.ready ? <CheckCircle2 /> : <CircleAlert />}</div>{!readiness?.ready && <div className="alert warning">{(readiness?.errors || []).join(' · ')}</div>}<button className="primary" disabled={busy || !readiness?.ready || selectedVersion?.active} onClick={publish}><Send size={16} /> Optiği Yayınla</button></div>

      <div className="panel"><div className="panel-head"><div><h2>Referans dosyaları</h2><p>Fotoğraf, TXT/DAT örneği ve baskı tabanı sürüme bağlı saklanır.</p></div><FileUp /></div><div className="cards-list">{(versionDetail.assets || []).map((a: any) => <div className="list-card" key={a.id}><div><strong>{assetLabel(a.asset_type)}</strong><span>{a.file_name} · {new Date(a.created_at).toLocaleString('tr-TR')}</span></div></div>)}</div></div>
    </>}
  </>;
}
