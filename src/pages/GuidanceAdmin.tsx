import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileUp, Printer, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

type Instrument = {
  id: string;
  code: string;
  title: string;
  category: string;
  version: string;
  description: string;
  active: number;
  questionCount: number;
  deliveryModes: string[];
  opticalConfig: { answerBlockCode?: string; scaleMap?: Record<string, number> } | null;
};

const catalog = [
  {
    code: 'RBA_EDU_V1',
    title: 'RBA Öğrenme ve Çalışma Profili',
    category: 'RBA',
    version: '1.0',
    description: 'Öğrencinin çalışma davranışı ve akademik öz-düzenleme sinyallerini eğitim amacıyla değerlendirir. Tanı aracı değildir.',
    items: [
      ['r1', 'analytical', 'Bir soruda çözüm yolunu adımlara ayırırım.'],
      ['r2', 'verbal_processing', 'Okuduğum bilgiyi kendi cümlelerimle açıklayabilirim.'],
      ['r3', 'numeric_processing', 'Sayısal bilgileri karşılaştırırken düzenli bir yöntem kullanırım.'],
      ['r4', 'consistency', 'Çalışma planımı çoğu gün benzer düzende sürdürebilirim.'],
      ['r5', 'error_review', 'Aynı hatayı tekrar etmemek için yanlışlarımı yeniden incelerim.'],
      ['r6', 'pace', 'Çalışırken hızımı sorunun zorluğuna göre ayarlayabilirim.'],
      ['r7', 'plan_adherence', 'Belirlediğim günlük çalışma görevlerini tamamlarım.'],
      ['r8', 'persistence', 'Zorlandığım sorularda hemen bırakmak yerine farklı bir yol denerim.'],
      ['r9', 'performance_stability', 'Deneme performansımı etkileyen çalışma alışkanlıklarını takip ederim.'],
    ],
  },
  {
    code: 'STUDY_HABITS_V1',
    title: 'Çalışma Alışkanlıkları Öz-Değerlendirmesi',
    category: 'STUDY_HABITS',
    version: '1.0',
    description: 'Planlama, odak, tekrar ve görev tamamlama davranışlarını eğitim amacıyla değerlendirir.',
    items: [
      ['s1', 'planning', 'Haftalık çalışma planımı önceden belirlerim.'],
      ['s2', 'focus', 'Çalışma sırasında dikkat dağıtıcıları sınırlarım.'],
      ['s3', 'review', 'Yanlış yaptığım konulara tekrar dönerim.'],
      ['s4', 'completion', 'Başladığım akademik görevleri tamamlarım.'],
    ],
  },
  {
    code: 'GOAL_MOTIVATION_V1',
    title: 'Hedef ve Motivasyon Öz-Değerlendirmesi',
    category: 'GOAL_MOTIVATION',
    version: '1.0',
    description: 'Akademik hedef netliği, ilerleme takibi ve sürdürme davranışlarını eğitim amacıyla değerlendirir.',
    items: [
      ['g1', 'goal_clarity', 'Ulaşmak istediğim akademik hedefi net biçimde biliyorum.'],
      ['g2', 'progress_tracking', 'Hedefime ne kadar yaklaştığımı düzenli takip ederim.'],
      ['g3', 'persistence', 'Kısa süreli düşüşlerde çalışmayı tamamen bırakmam.'],
      ['g4', 'self_adjustment', 'Sonuçlarıma göre çalışma planımı değiştirebilirim.'],
    ],
  },
  {
    code: 'EXAM_READINESS_V1',
    title: 'Sınav Hazırlık Öz-Değerlendirmesi',
    category: 'EXAM_READINESS',
    version: '1.0',
    description: 'Sınav hazırlık düzeni, zaman kullanımı ve deneme sonrası değerlendirme davranışlarını eğitim amacıyla değerlendirir.',
    items: [
      ['e1', 'time_management', 'Denemelerde süreyi bölümlere ayırarak yönetebilirim.'],
      ['e2', 'preparation_consistency', 'Sınava hazırlık çalışmalarımı son güne bırakmam.'],
      ['e3', 'post_exam_review', 'Deneme sonrası yanlış ve boşlarımı incelerim.'],
      ['e4', 'strategy_awareness', 'Hangi soru türlerinde daha çok zaman kaybettiğimi bilirim.'],
    ],
  },
];

function schema(items: string[][]) {
  return { scale: { min: 1, max: 5 }, items: items.map(([id, dimension, text]) => ({ id, dimension, text })) };
}

export function GuidanceAdmin() {
  const { user } = useAuth();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [opticals, setOpticals] = useState<any[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [templateVersionId, setTemplateVersionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setError('');
    const [catalogResponse, institutionResponse, opticalResponse] = await Promise.all([
      api<any>('/api/nibiru/guidance/admin/instruments'),
      api<any>('/api/institutions').catch(() => ({ institutions: [] })),
      api<any>('/api/optical-templates').catch(() => ({ templates: [] })),
    ]);
    setInstruments(catalogResponse.instruments || []);
    setInstitutions(institutionResponse.institutions || []);
    setOpticals(opticalResponse.templates || []);
    setSelectedCode(current => current || catalogResponse.instruments?.[0]?.code || '');
  };

  useEffect(() => {
    void load().catch(e => setError(e.message));
  }, []);

  const selected = useMemo(() => instruments.find(x => x.code === selectedCode), [instruments, selectedCode]);

  const install = async (item: typeof catalog[number]) => {
    setBusy(item.code);
    setError('');
    setNotice('');
    try {
      await api('/api/nibiru/guidance/admin/instruments', {
        method: 'POST',
        body: JSON.stringify({
          code: item.code,
          title: item.title,
          category: item.category,
          version: item.version,
          description: item.description,
          questionSchema: schema(item.items),
          deliveryModes: ['ONLINE', 'PRINT_OPTICAL'],
          opticalConfig: { answerBlockCode: item.category === 'RBA' ? 'RBA' : item.code.slice(0, 3), scaleMap: { A: 1, B: 2, C: 3, D: 4, E: 5 } },
        }),
      });
      setNotice(item.title + ' sisteme yüklendi. Online ve matbu optik kullanıma hazır.');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const evaluateOptical = async () => {
    if (!file || !selectedCode || !institutionId) return;
    setBusy('optical');
    setError('');
    setNotice('');
    setResult(null);
    const body = new FormData();
    body.append('file', file);
    body.append('instrumentCode', selectedCode);
    body.append('institutionId', institutionId);
    if (templateVersionId) body.append('templateVersionId', templateVersionId);
    try {
      setResult(await api<any>('/api/nibiru/guidance/admin/optical-evaluate', { method: 'POST', body }));
      setNotice('Matbu optik kayıtları işlendi. Eşleşenler rehber öğretmen inceleme kuyruğuna alındı.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  if (user?.role !== 'SUPER_ADMIN') {
    return <div className="panel"><h2>Yetki gerekli</h2><p>RBA ve rehberlik test kataloğunu yalnız Süper Admin yönetebilir.</p></div>;
  }

  return <>
    <div className="page-head">
      <div><span className="eyebrow">NIBIRU · RBA / REHBERLİK</span><h1>Test ve optik merkezi</h1><p>Testi bir kez tanımlayın; öğrenci online doldursun veya aynı kazanım/ölçme akışı matbu optikten değerlendirilsin.</p></div>
      <button className="ghost" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <div className="summary-strip" style={{ marginBottom: 20 }}>
      <div className="kpi-card"><span>Yüklü test</span><strong>{instruments.length}</strong></div>
      <div className="kpi-card"><span>Online</span><strong>{instruments.filter(x => x.deliveryModes.includes('ONLINE')).length}</strong></div>
      <div className="kpi-card"><span>Matbu optik</span><strong>{instruments.filter(x => x.deliveryModes.includes('PRINT_OPTICAL')).length}</strong></div>
      <div className="kpi-card"><span>Güvenlik kapısı</span><strong>Rehber onayı</strong></div>
    </div>

    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><div><h2>Hazır eğitimsel testler</h2><p>Bu araçlar tanısal değildir. Sonuçlar gerçek rehber öğretmen incelemeden gelişim profiline yazılmaz.</p></div><ShieldCheck /></div>
      <div className="exam-grid">{catalog.map(item => {
        const current = instruments.find(x => x.code === item.code);
        return <div className="exam-card" key={item.code} style={{ textAlign: 'left' }}>
          <span className="tag">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p>
          <small>{item.items.length} soru · Online + matbu optik</small>
          <button className="primary full" disabled={busy === item.code} onClick={() => void install(item)}>{current ? 'Güncelle / yeniden yükle' : 'Sisteme yükle'}</button>
        </div>;
      })}</div>
    </div>

    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><div><h2>Optik değerlendirme</h2><p>FMT/TXT/DAT/CSV dosyası seçin. Ham dosya kalıcı olarak saklanmaz; yalnız sonuç ve audit kaydı tutulur.</p></div><UploadCloud /></div>
      <div className="form-grid">
        <label>Test<select value={selectedCode} onChange={e => setSelectedCode(e.target.value)}><option value="">Test seçin</option>{instruments.filter(x => x.deliveryModes.includes('PRINT_OPTICAL')).map(x => <option key={x.code} value={x.code}>{x.title} · {x.questionCount} soru</option>)}</select></label>
        <label>Kurum<select value={institutionId} onChange={e => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map(i => <option key={i.id} value={i.id}>{i.name} · {i.code}</option>)}</select></label>
        <label>Optik şablon<select value={templateVersionId} onChange={e => setTemplateVersionId(e.target.value)}><option value="">Otomatik eşleştir</option>{opticals.filter(x => x.version_id).map(x => <option key={x.version_id} value={x.version_id}>{x.name} · {x.version}</option>)}</select></label>
        <label>Dosya<input type="file" accept=".fmt,.txt,.dat,.csv,application/octet-stream,text/plain,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} /><small>TXT, DAT, FMT veya CSV · tek dosya</small></label>
      </div>
      <button className="primary" disabled={busy === 'optical' || !file || !selectedCode || !institutionId} onClick={() => void evaluateOptical}><FileUp size={16} /> {busy === 'optical' ? 'Değerlendiriliyor…' : 'Matbu Optiği Değerlendir'}</button>
      {result && <div className="alert info" style={{ marginTop: 14 }}><strong>{result.processed || 0} kayıt işlendi.</strong> Eşleşen: {result.matched || 0} · Geçersiz: {result.invalid || 0} · Eşleşmeyen: {result.unmatched || 0}. Rehber öğretmen incelemesi zorunludur.</div>}
    </div>

    <div className="panel">
      <div className="panel-head"><div><h2>Mevcut katalog</h2><p>Online öğrenci akışı ve matbu optik aynı test kodunu kullanır.</p></div><ClipboardCheck /></div>
      <div className="table-card"><table><thead><tr><th>Test</th><th>Kategori</th><th>Soru</th><th>Teslim</th><th>Optik blok</th></tr></thead><tbody>{instruments.map(item => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.code} · v{item.version}</small></td><td>{item.category}</td><td>{item.questionCount}</td><td>{item.deliveryModes.join(' / ')}</td><td>{item.opticalConfig?.answerBlockCode || 'RBA'}</td></tr>)}</tbody></table></div>
    </div>

    <div className="alert warning"><Printer size={18} /><div><strong>Matbu baskı kuralı</strong><span>Form, mevcut Optik Form Tasarımcısı ve yayınlanmış FMT/optik sürümüyle basılır. Test cevap bloğu optik tanımında seçilen blok koduyla eşleşmelidir.</span></div></div>
  </>;
}
