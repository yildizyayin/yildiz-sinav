import { useEffect, useState } from 'react';
import { BookOpen, Check, CheckCircle2, ChevronRight, Eye, FileText, FileUp, PlaySquare, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, WandSparkles, XCircle } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import './content-center.css';
import {QuestionPoolCoverage} from '../components/QuestionPoolCoverage';

const difficultyLabels: Record<number, string> = {
  1: 'Başlangıç', 2: 'Kolay', 3: 'Orta', 4: 'Orta-üstü', 5: 'Zor', 6: 'Olimpiyat',
};

const aiReviewLabels = { answerAndSolution: 'Cevap ve çözümün doğruluğunu kontrol ettim.', curriculum: 'Öğrenme çıktısı ve program bağlantısını kontrol ettim.', ageAppropriate: 'Dil ve zorluk düzeyinin sınıfa uygunluğunu kontrol ettim.', originalityAndRights: 'Özgünlük ve kullanım hakkını kontrol ettim.' };
const isAiQuestion = (q: any) => /^(AI|AI_GENERATED|AI_DRAFT|NIBIRU|NIBIRU_AI)$/i.test(String(q?.origin_kind || ''));

const statusLabels: Record<string, string> = { DRAFT: 'Taslak', REVIEW: 'İncelemede', APPROVED: 'Onaylı', REJECTED: 'Reddedildi', ARCHIVED: 'Arşiv' };

function difficultyMeta(question: any) {
  const level = Math.max(1, Math.min(6, Number(question?.difficulty_level ?? question?.difficulty ?? 3)));
  const tone = level <= 2 ? 'blue' : level === 3 ? 'teal' : level === 4 ? 'amber' : level === 5 ? 'red' : 'violet';
  return { level, tone, label: `${level} · ${difficultyLabels[level]}` };
}

function DifficultyMeter({ question, compact = false }: { question: any; compact?: boolean }) {
  const meta = difficultyMeta(question);
  return <span className={`difficulty-meter ${meta.tone} ${compact ? 'compact' : ''}`} title={`Seviye ${meta.level} · ${difficultyLabels[meta.level]}`}>
    <span className="difficulty-bars">{[1, 2, 3, 4, 5, 6].map(bar => <i key={bar} className={bar <= meta.level ? 'active' : ''} />)}</span>
    <b>{meta.label}</b>
  </span>;
}

function reviewLabel(status: string) { return statusLabels[status] || status || 'Bilinmiyor'; }
function recordedQuality(question:any){try{const value=JSON.parse(question?.review_checks_json||'null')?.qualityReview;return value?.schemaVersion===1?value:null}catch{return null}}


export function ContentCenter() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'questions' | 'studio' | 'videos' | 'coverage'>('questions');
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
  const [aiReview, setAiReview] = useState<{scope:string;checks:Record<string,boolean>}>({scope:'',checks:{}});
  const reviewScope = JSON.stringify([user?.id,user?.role,selectedQuestion?.id, selectedQuestion?.review_revision, selectedQuestion?.reviewContext]);
  const activeChecks = aiReview.scope === reviewScope ? aiReview.checks : {};
  const [qualityReview, setQualityReview] = useState<{scope:string;data:Record<string,string>}>({scope:'',data:{}});
  const activeQuality = qualityReview.scope === reviewScope ? qualityReview.data : {};
  const qualityComplete = ['outcomeAlignment','languageAndDistractors','duplicateRationale'].every(key => (activeQuality[key]||'').trim().length>=20 && (activeQuality[key]||'').trim().length<=1000) && ['NO_REPETITION_FOUND','DISTINCT_APPLICATION'].includes(activeQuality.duplicateDisposition||'');
  const setQualityField = (key:string,value:string) => setQualityReview({scope:reviewScope,data:{...activeQuality,[key]:value}});

  const [rightsReview, setRightsReview] = useState<{scope:string;status:string}>({scope:'',status:''});
  const activeRights = rightsReview.scope === reviewScope ? rightsReview.status : '';
  const savedQuality = recordedQuality(selectedQuestion);
  const rightsReady = ['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(selectedQuestion?.copyright_status);
  const checksComplete = Object.keys(aiReviewLabels).every(key => activeChecks[key] === true);
  const [docs, setDocs] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ q: '', gradeLevel: '', subjectId: '', difficultyLevel: '', reviewStatus: '' });
  const [qform, setQform] = useState({ stemText: '', contentMode: 'TEXT', optionCount: '4', gradeLevel: '8', subjectId: 'sub_math', topic: '', subtopic: '', outcomeRefs: '', priorGradeRefs: '', lgsProbability: '', yksProbability: '', exam5yCount: '', difficultyLevel: '3', optionA: '', optionB: '', optionC: '', optionD: '', optionE: '', correctAnswer: 'A', solutionText: '', sourceLabel: 'Kendi İçeriğimiz', originKind: 'MANUAL', academicYear: '2026-2027', copyrightStatus: 'OWNED', imageAlt: '' });
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [dform, setDform] = useState({ title: '', documentType: 'PRACTICE_EXAM', gradeLevel: '8', subjectId: 'sub_math', questionCount: '20', optionMode: 'MIXED', bookletCodes: 'A,B', deliveryMode: 'PDF_OPTICAL' });
  const [vform, setVform] = useState({ title: '', url: '', gradeLevel: '8', subjectId: 'sub_math' });

  const load = async (activeFilters = filters) => {
    setError('');
    try {
      const tasks: Promise<any>[] = [];
      tasks.push(api<any>(`/api/platform/questions${qs(activeFilters)}`).catch(() => ({ questions: [] })));
      tasks.push(api<any>('/api/platform/studio').catch(() => ({ documents: [] })));
      tasks.push(api<any>('/api/platform/videos').catch(() => ({ videos: [] })));
      tasks.push(api<any>('/api/question-bank-standard/stats').catch(() => null));
      const [questionResponse, documentResponse, videoResponse, statsResponse] = await Promise.all(tasks);
      const nextQuestions = questionResponse.questions || [];
      setQuestions(nextQuestions);
      setSelectedQuestion((current: any) => current && nextQuestions.some((question: any) => question.id === current.id) ? nextQuestions.find((question: any) => question.id === current.id) : nextQuestions[0] || null);
      setDocs(documentResponse.documents || []);
      setVideos(videoResponse.videos || []);
      setStats(statsResponse);
    } catch (e: any) { setError(e.message || 'İçerik verileri yüklenemedi.'); }
  };

  useEffect(() => { void load(); }, []);

  const addQuestion = async () => {
    try {
      if (user?.role !== 'SUPER_ADMIN') throw new Error('Soru yükleme yalnızca Süper Admin tarafından yapılabilir.');
      const optionKeys: Array<'optionA' | 'optionB' | 'optionC' | 'optionD' | 'optionE'> = ['optionA', 'optionB', 'optionC', 'optionD', ...(qform.optionCount === '5' ? ['optionE' as const] : [])];
      const options = optionKeys.map((key, index) => ({ label: String.fromCharCode(65 + index), text: qform[key].trim() }));
      if (options.some(option => !option.text)) throw new Error('Seçeneklerin tamamını doldurun.');
      const payload = { ...qform, nodeIds: qform.outcomeRefs.split(',').map(value => value.trim()).filter(Boolean), priorGradeRefs: qform.priorGradeRefs.split(',').map(value => value.trim()).filter(Boolean), gradeLevel: Number(qform.gradeLevel), difficultyLevel: Number(qform.difficultyLevel), optionCount: Number(qform.optionCount), options, originKind: qform.originKind };
      const body = questionFile ? (() => { const form = new FormData(); form.append('payload', JSON.stringify(payload)); form.append('file', questionFile); return form; })() : JSON.stringify(payload);
      const response = await api<any>('/api/platform/questions', { method: 'POST', body });
      setNotice(`Soru havuza kaydedildi · ${response.id} · ${response.assetCount || 0} medya`);
      setQform(form => ({ ...form, stemText: '', solutionText: '', imageAlt: '', optionA: '', optionB: '', optionC: '', optionD: '', optionE: '' }));
      setQuestionFile(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const saveRights = async () => {
    const question = selectedQuestion;
    if (!question || !activeRights) return;
    try {
      await api(`/api/question-bank-standard/${question.id}`, { method: 'PATCH', body: JSON.stringify({copyrightStatus:activeRights,expectedRevision:question.review_revision}) });
      setNotice('Kullanım hakkı kaydedildi. Güncel soruyu yeniden inceleyip kontrolleri tamamlayın.');
      await load();
    } catch (e:any) { setError(e.message); }
  };

  const review = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api(`/api/question-bank-standard/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, expectedRevision: selectedQuestion?.id === id ? selectedQuestion.review_revision : undefined, checks: isAiQuestion(selectedQuestion) ? activeChecks : undefined, qualityReview: isAiQuestion(selectedQuestion) ? activeQuality : undefined, expectedContext: isAiQuestion(selectedQuestion) ? selectedQuestion.reviewContext : undefined }) });
      setNotice(status === 'APPROVED' ? 'Soru basılabilir onaylı havuza alındı.' : 'Soru reddedildi.');
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const createDoc = async () => {
    try {
      const response = await api<any>('/api/platform/studio', { method: 'POST', body: JSON.stringify({ ...dform, bookletCodes: dform.bookletCodes.split(',').map(code => code.trim()).filter(Boolean), gradeLevel: Number(dform.gradeLevel), questionCount: Number(dform.questionCount) }) });
      setNotice(`Belge taslağı oluşturuldu · ${response.selectedQuestions}/${response.requestedQuestions} soru · ${response.bookletCodes?.join(' / ') || 'A'} kitapçığı.`);
      setDform(form => ({ ...form, title: '' }));
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const addVideo = async () => {
    try {
      await api('/api/platform/videos', { method: 'POST', body: JSON.stringify({ ...vform, gradeLevel: Number(vform.gradeLevel), approved: true }) });
      setNotice('Video kütüphaneye eklendi.');
      setVform(form => ({ ...form, title: '', url: '' }));
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const approvedCount = Number(stats?.approved || 0);
  const printableCount = Number(stats?.printable || 0);

  return <div className="content-center-page">
    <div className="content-center-head">
      <div><span className="eyebrow">Standard · İçerik motoru</span><h1>Soru havuzu</h1><p>Tek kaynakta soru üret, incele ve yazılı, deneme, ödev, föy ile kişisel çalışma akışlarına bağla.</p></div>
      <button className="secondary content-refresh" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <div className="content-tabs" role="tablist" aria-label="İçerik modülleri">
      {user?.role === 'SUPER_ADMIN' && <button className={tab === 'coverage' ? 'active' : ''} onClick={() => setTab('coverage')}>Kazanım kapsamı</button>}
      <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}><BookOpen size={16} /> Soru havuzu <span>{stats?.total ?? questions.length}</span></button>
      <button className={tab === 'studio' ? 'active' : ''} onClick={() => setTab('studio')}><WandSparkles size={16} /> Studio <span>{docs.length}</span></button>
      <button className={tab === 'videos' ? 'active' : ''} onClick={() => setTab('videos')}><PlaySquare size={16} /> Video <span>{videos.length}</span></button>
    </div>

    {tab === 'coverage' && user?.role === 'SUPER_ADMIN' && <QuestionPoolCoverage onDraftsReady={()=>void load()} key={JSON.stringify([user.id,user.role,user.institution_id])}/>}
    {tab === 'questions' && <>
      <div className="content-summary-grid"><div><span>Toplam soru</span><strong>{stats?.total ?? questions.length}</strong><small>arşiv dışı içerik</small></div><div><span>Onaylı</span><strong>{approvedCount}</strong><small>öğrenci akışına açık</small></div><div><span>Kitapta kullanılabilir</span><strong>{printableCount}</strong><small>telif filtresinden geçen</small></div><div><span>Aktif seviye</span><strong>6</strong><small>başlangıçtan olimpiyata</small></div></div>
      <div className="question-workspace">
        <section className="question-list-column">
          <div className="question-filter-card"><div className="filter-title"><div><span className="eyebrow">Kütüphane</span><h2>Soru listesi</h2></div><span className="result-count">{questions.length} sonuç</span></div><div className="filter-row"><label className="search-field"><Search size={16} /><input placeholder="Soru, konu veya alt konu ara" value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} onKeyDown={event => event.key === 'Enter' && void load(filters)} /></label><select aria-label="Sınıf filtresi" value={filters.gradeLevel} onChange={event => setFilters({ ...filters, gradeLevel: event.target.value })}><option value="">Tüm sınıflar</option>{[5, 6, 7, 8, 9, 10, 11, 12].map(grade => <option key={grade} value={grade}>{grade}. sınıf</option>)}</select><select aria-label="Zorluk filtresi" value={filters.difficultyLevel} onChange={event => setFilters({ ...filters, difficultyLevel: event.target.value })}><option value="">Tüm seviyeler</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level} · {difficultyLabels[level]}</option>)}</select><select aria-label="Durum filtresi" value={filters.reviewStatus} onChange={event => setFilters({ ...filters, reviewStatus: event.target.value })}><option value="">Tüm durumlar</option><option value="DRAFT">Taslak</option><option value="REVIEW">İncelemede</option><option value="APPROVED">Onaylı</option><option value="REJECTED">Reddedildi</option></select><button className="primary filter-submit" onClick={() => void load(filters)}><SlidersHorizontal size={15} /> Filtrele</button></div></div>
          <div className="question-list-card">{questions.map(question => { const selected = selectedQuestion?.id === question.id; return <button className={`question-row ${selected ? 'selected' : ''}`} key={question.id} onClick={() => setSelectedQuestion(question)}><span className="question-row-check">{selected ? <Check size={14} /> : <span />}</span><span className="question-row-body"><strong>{question.stem_text || 'Görsel soru'}</strong><small>{question.grade_level || '—'}. sınıf · {question.subject_name || question.subject_id || 'Ders belirtilmedi'} · {[question.topic, question.subtopic].filter(Boolean).join(' / ') || 'Konu belirtilmedi'} · {question.option_count || 4} şık</small><span className="question-row-tags">{question.content_mode && <em className="tag">{question.content_mode === 'MIXED' ? 'Metin + görsel' : question.content_mode === 'IMAGE' ? 'Görsel' : 'Metin'}</em>}{question.has_learning_link ? <em className="tag verified"><ShieldCheck size={12} /> Kazanım eşlemesi</em> : <em className="tag">Eşleme bekliyor</em>}<em className={`tag status-${String(question.review_status || '').toLowerCase()}`}>{reviewLabel(question.review_status)}</em></span></span><DifficultyMeter question={question} compact /><ChevronRight size={16} className="question-row-arrow" /></button>; })}{!questions.length && <div className="empty">Filtrelere uyan soru bulunamadı.</div>}</div>
        </section>
        <aside className="question-preview-card">{selectedQuestion ? <><div className="preview-head"><div><span className="eyebrow">Soru önizleme</span><h2>İçerik detayı</h2></div><button className="icon-button" title="Önizleme" aria-label="Önizleme"><Eye size={17} /></button></div><div className="preview-meta"><span className="tag">{selectedQuestion.grade_level || '—'}. sınıf</span><span className="tag">{selectedQuestion.subject_name || selectedQuestion.subject_id || 'Ders'}</span><span className="tag">{selectedQuestion.option_count || 4} şık</span><span className={`tag status-${String(selectedQuestion.review_status || '').toLowerCase()}`}>{reviewLabel(selectedQuestion.review_status)}</span></div>{selectedQuestion.stem_text && <h3>{selectedQuestion.stem_text}</h3>}{(selectedQuestion.assets || []).filter((asset: any) => asset.placement === 'STEM' || !asset.placement).map((asset: any) => asset.url && <img key={asset.id} src={asset.url} alt={asset.alt_text || 'Soru görseli'} style={{ maxWidth: '100%', borderRadius: 12, margin: '12px 0' }} />)}<div className="preview-options">{(selectedQuestion.options || []).map((option: any, index: number) => { const letter = typeof option === 'string' && option.length === 1 ? option : String(option?.label || option?.letter || String.fromCharCode(65 + index)); const value = typeof option === 'string' ? (option.length === 1 ? `Seçenek ${option}` : option) : String(option?.text || option?.content || option?.value || `Seçenek ${letter}`); return <div className={String(selectedQuestion.correct_answer || '').toUpperCase() === letter.toUpperCase() ? 'correct' : ''} key={`${value}-${index}`}><span>{letter}</span>{value}</div>; })}</div><div className="preview-detail-grid"><div><small>Zorluk</small><DifficultyMeter question={selectedQuestion} /></div><div><small>İçerik</small><strong>{selectedQuestion.content_mode || 'TEXT'}</strong></div><div><small>Telif</small><strong>{selectedQuestion.copyright_status || 'Belirtilmedi'}</strong></div><div><small>Kazanım</small><strong>{selectedQuestion.has_learning_link ? 'Eşleştirildi' : 'Bekliyor'}</strong></div></div>{selectedQuestion.solution_text && <div className="solution-preview"><span>Çözüm notu</span><p>{selectedQuestion.solution_text}</p></div>}{isAiQuestion(selectedQuestion) && <div className="alert info"><strong>Yapay zekâ taslağı</strong><p>İnsan incelemesi tamamlanmadan öğrenci havuzuna alınmaz.</p>{selectedQuestion.source_model && <p>Üretim modeli: {selectedQuestion.source_model}</p>}{Array.isArray(selectedQuestion.reviewContext) && selectedQuestion.reviewContext.map((context:any,index:number) => <p key={context.id || index}>{context.code || context.id || 'Kazanım bağlantısı'} · {context.title || 'Bağlantı bulunamadı'} · {context.academicYear || 'Eğitim yılı belirtilmedi'} · {context.grade_level || '—'}. sınıf · {context.programVersion || 'Program sürümü belirtilmedi'}{context.verified === 1 && context.matchesQuestion === 1 ? '' : ' · Doğrulama veya bağlam eşlemesi bekliyor'}</p>)}</div>}{savedQuality&&<div className="solution-preview"><span>Kaydedilmiş içerik incelemesi</span><p><strong>Çıktı bağlantısı:</strong> {savedQuality.outcomeAlignment}</p><p><strong>Dil ve çeldiriciler:</strong> {savedQuality.languageAndDistractors}</p><p><strong>Benzer soru kararı:</strong> {savedQuality.duplicateDisposition==='DISTINCT_APPLICATION'?'Benzer konu, farklı uygulama':'İncelenen sorularda tekrar bulunmadı'}</p><p>{savedQuality.duplicateRationale}</p></div>}{user?.role === 'SUPER_ADMIN' && isAiQuestion(selectedQuestion) && !rightsReady && <div className="alert info"><p>Kullanım hakkı henüz doğrulanmadı. İncelemeden sonra uygun durumu kaydedin.</p><select aria-label="Doğrulanan kullanım hakkı" value={activeRights} onChange={event => setRightsReview({scope:reviewScope,status:event.target.value})}><option value="">Durum seçin</option><option value="OWNED">Bize ait</option><option value="LICENSED">Lisanslı / izinli</option><option value="PUBLIC_DOMAIN">Kamu malı</option><option value="USER_PROVIDED">Kullanıcı sağladı</option></select><button disabled={!activeRights} onClick={() => void saveRights()}>Kullanım hakkını kaydet</button></div>}{user?.role === 'SUPER_ADMIN' && isAiQuestion(selectedQuestion) && selectedQuestion.review_status !== 'APPROVED' && <fieldset style={{marginTop:16}}><legend>İnsan incelemesi</legend>{Object.entries(aiReviewLabels).map(([key,label]) => <label key={key} style={{display:'flex',gap:8,margin:'8px 0'}}><input type="checkbox" checked={activeChecks[key] === true} onChange={event => setAiReview({scope:reviewScope,checks:{...activeChecks,[key]:event.target.checked}})}/>{label}</label>)}<label>Öğrenme çıktısı bağlantısının gerekçesi<textarea value={activeQuality.outcomeAlignment||''} onChange={event=>setQualityField('outcomeAlignment',event.target.value)} minLength={20} maxLength={1000} placeholder="Sorunun çıktının hangi bölümünü hangi çözüm adımıyla yokladığını açıklayın."/></label><label>Dil, yaş düzeyi ve çeldiriciler<textarea value={activeQuality.languageAndDistractors||''} onChange={event=>setQualityField('languageAndDistractors',event.target.value)} minLength={20} maxLength={1000} placeholder="Anlaşılırlığı, tek doğru cevabı ve çeldiricilerin uygunluğunu nasıl kontrol ettiniz?"/></label><label>Benzer soru incelemesi<select value={activeQuality.duplicateDisposition||''} onChange={event=>setQualityField('duplicateDisposition',event.target.value)}><option value="">Karar seçin</option><option value="NO_REPETITION_FOUND">İncelediğim sorularda tekrar bulmadım</option><option value="DISTINCT_APPLICATION">Benzer konu, farklı uygulama</option></select></label><label>Benzer soru kararının gerekçesi<textarea value={activeQuality.duplicateRationale||''} onChange={event=>setQualityField('duplicateRationale',event.target.value)} minLength={20} maxLength={1000} placeholder="Karşılaştırdığınız soruları ve içerik veya çözüm yolu farkını belirtin. Tekrar ise onaylamak yerine reddedin."/></label><small>Her gerekçe 20–1000 karakter olmalıdır. Benzerlik kararı inceleyenin beyanıdır; otomatik semantik benzersizlik garantisi değildir.</small></fieldset>}{user?.role === 'SUPER_ADMIN' && selectedQuestion.review_status !== 'APPROVED' && selectedQuestion.review_status !== 'ARCHIVED' && <div className="preview-actions"><button className="primary" disabled={isAiQuestion(selectedQuestion) && (!checksComplete || !rightsReady || !qualityComplete)} onClick={() => void review(selectedQuestion.id, 'APPROVED')}><CheckCircle2 size={15} /> Onayla</button><button className="danger" onClick={() => void review(selectedQuestion.id, 'REJECTED')}><XCircle size={15} /> Reddet</button></div>}</> : <div className="empty">Detayını görmek için listeden bir soru seç.</div>}</aside>
      </div>
      {user?.role === 'SUPER_ADMIN' && <details className="question-create-card" open><summary><span><Plus size={17} /> Yeni soru ekle</span><small>Yalnız Süper Admin · metin, görsel veya karma soru</small></summary><div className="create-inner"><div className="create-intro"><span className="eyebrow">Yetkili içerik girişi</span><h2>Yeni soruyu havuza al</h2><p>Sorular yalnızca Süper Admin tarafından yüklenir. Öğretmenler onaylı havuzdan kendi branşlarında sınav üretir.</p></div><div className="form-grid"><label>İçerik kaynağı<select value={qform.originKind} onChange={event => setQform({...qform,originKind:event.target.value})}><option value="MANUAL">El ile hazırlanan içerik</option><option value="AI_GENERATED">Yapay zekâ taslağı · insan incelemesi gerekir</option></select></label><label>Eğitim yılı<input value={qform.academicYear} onChange={event => setQform({...qform,academicYear:event.target.value})} placeholder="2026-2027"/></label><label>İçerik türü<select value={qform.contentMode} onChange={event => setQform({ ...qform, contentMode: event.target.value })}><option value="TEXT">Metin</option><option value="IMAGE">Görsel</option><option value="MIXED">Metin + görsel</option></select></label><label>Şık sayısı<select value={qform.optionCount} onChange={event => setQform({ ...qform, optionCount: event.target.value, correctAnswer: 'A' })}><option value="4">A–D · 4 şık</option><option value="5">A–E · 5 şık</option></select></label><label>Sınıf<input type="number" min="1" max="12" value={qform.gradeLevel} onChange={event => setQform({ ...qform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={qform.subjectId} onChange={event => setQform({ ...qform, subjectId: event.target.value })} /></label><label>Konu<input value={qform.topic} onChange={event => setQform({ ...qform, topic: event.target.value })} /></label><label>Alt konu<input value={qform.subtopic} onChange={event => setQform({ ...qform, subtopic: event.target.value })} /></label><label>Kazanım kodları<input value={qform.outcomeRefs} onChange={event => setQform({ ...qform, outcomeRefs: event.target.value })} placeholder="outcome_id veya ln_... · virgülle" /></label><label>Önceki sınıf bağı<input value={qform.priorGradeRefs} onChange={event => setQform({ ...qform, priorGradeRefs: event.target.value })} placeholder="6. sınıf / Kuvvet · virgülle" /></label><label>LGS olasılığı<input type="number" min="0" max="1" step="0.01" value={qform.lgsProbability} onChange={event => setQform({ ...qform, lgsProbability: event.target.value })} placeholder="0–1" /></label><label>YKS olasılığı<input type="number" min="0" max="1" step="0.01" value={qform.yksProbability} onChange={event => setQform({ ...qform, yksProbability: event.target.value })} placeholder="0–1" /></label><label>Son 5 yıl çıkma sayısı<input type="number" min="0" value={qform.exam5yCount} onChange={event => setQform({ ...qform, exam5yCount: event.target.value })} /></label><label>Zorluk seviyesi<select value={qform.difficultyLevel} onChange={event => setQform({ ...qform, difficultyLevel: event.target.value })}>{[1, 2, 3, 4, 5, 6].map(level => <option value={level} key={level}>{level} · {difficultyLabels[level]}</option>)}</select><span className="create-level-note"><DifficultyMeter question={{ difficulty_level: Number(qform.difficultyLevel) }} /></span></label><label>Doğru cevap<select value={qform.correctAnswer} onChange={event => setQform({ ...qform, correctAnswer: event.target.value })}>{(qform.optionCount === '5' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D']).map(letter => <option key={letter}>{letter}</option>)}</select></label><label>Kaynak<input value={qform.sourceLabel} onChange={event => setQform({ ...qform, sourceLabel: event.target.value })} /></label><label>Telif<select value={qform.copyrightStatus} onChange={event => setQform({ ...qform, copyrightStatus: event.target.value })}><option value="OWNED">Bize ait</option><option value="LICENSED">Lisanslı / izinli</option><option value="PUBLIC_DOMAIN">Açık / kamu malı</option><option value="USER_PROVIDED">Kullanıcı sağladı</option><option value="RESTRICTED">Kısıtlı · basılamaz</option></select></label></div><label className="options-field-label">Şıklar <small>Seçilen sayıda dolu seçenek gerekir</small></label><div className="option-input-grid">{(qform.optionCount === '5' ? [['A', 'optionA'], ['B', 'optionB'], ['C', 'optionC'], ['D', 'optionD'], ['E', 'optionE']] : [['A', 'optionA'], ['B', 'optionB'], ['C', 'optionC'], ['D', 'optionD']]).map(([letter, key]) => <label key={letter}><span>{letter}</span><input value={qform[key as keyof typeof qform] as string} onChange={event => setQform({ ...qform, [key]: event.target.value })} placeholder={`${letter}. seçenek`} /></label>)}</div><div className="create-text-grid"><label>Soru metni {qform.contentMode === 'IMAGE' && <small>Görsel soruda boş bırakılabilir</small>}<textarea rows={5} value={qform.stemText} onChange={event => setQform({ ...qform, stemText: event.target.value })} /></label><label>Çözüm notu<textarea rows={5} value={qform.solutionText} onChange={event => setQform({ ...qform, solutionText: event.target.value })} /></label></div><div className="form-grid"><label>Görsel dosyası <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => setQuestionFile(event.target.files?.[0] || null)} /><small>PNG/JPEG/WEBP/GIF · en fazla 15 MB</small></label><label>Görsel açıklaması<input value={qform.imageAlt} onChange={event => setQform({ ...qform, imageAlt: event.target.value })} placeholder="Erişilebilirlik açıklaması" /></label></div><div className="create-footer"><span><FileUp size={15} /> Görsel R2’ye, soru ve medya ilişkisi ölçme veri modeline kaydedilir.</span><button className="primary" onClick={addQuestion} disabled={(qform.contentMode !== 'IMAGE' && !qform.stemText.trim()) || (qform.contentMode === 'IMAGE' && !questionFile)}><Plus size={16} /> Soruyu kaydet</button></div></div></details>}
    </>}

    {tab === 'studio' && <div className="module-stack"><div className="module-card"><div className="module-heading"><div><span className="eyebrow">Soru havuzundan üret</span><h2>Yazılı / deneme oluştur</h2><p>Branş öğretmeni yalnızca kendi dersindeki onaylı soruları; kurum yöneticisi kurum kapsamındaki havuzu kullanır. A/B kitapçığı ve PDF/optik teslim ayarı burada saklanır.</p></div><FileText size={22} /></div><div className="form-grid"><label>Başlık<input value={dform.title} onChange={event => setDform({ ...dform, title: event.target.value })} /></label><label>Tür<select value={dform.documentType} onChange={event => setDform({ ...dform, documentType: event.target.value })}><option value="PRACTICE_EXAM">Deneme</option><option value="WRITTEN_EXAM">Yazılı</option><option value="WORKSHEET">Föy</option><option value="PERSONAL_BOOK">Kişisel kitap</option></select></label><label>Sınıf<input type="number" value={dform.gradeLevel} onChange={event => setDform({ ...dform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={dform.subjectId} onChange={event => setDform({ ...dform, subjectId: event.target.value })} /></label><label>Soru sayısı<input type="number" value={dform.questionCount} onChange={event => setDform({ ...dform, questionCount: event.target.value })} /></label><label>Şık düzeni<select value={dform.optionMode} onChange={event => setDform({ ...dform, optionMode: event.target.value })}><option value="MIXED">Karışık · 4/5</option><option value="FOUR">Yalnız A–D</option><option value="FIVE">Yalnız A–E</option></select></label><label>Kitapçıklar<select value={dform.bookletCodes} onChange={event => setDform({ ...dform, bookletCodes: event.target.value })}><option value="A">A kitapçığı</option><option value="A,B">A + B kitapçığı</option></select></label><label>Çıktı<select value={dform.deliveryMode} onChange={event => setDform({ ...dform, deliveryMode: event.target.value })}><option value="PDF_OPTICAL">PDF + telefon optiği</option><option value="PDF">PDF</option><option value="DIGITAL">Dijital oturum</option></select></label></div><button className="primary" onClick={createDoc} disabled={!dform.title.trim()}><WandSparkles size={16} /> Taslak oluştur</button></div><div className="module-table"><table><thead><tr><th>Belge</th><th>Tür</th><th>Sınıf</th><th>Soru</th><th>Kitapçık</th><th>Soru</th><th>Durum</th></tr></thead><tbody>{docs.map(document => <tr key={document.id}><td><strong>{document.title}</strong></td><td>{document.document_type}</td><td>{document.grade_level || '—'}</td><td>{document.subject_id || '—'}</td><td>{document.config_json ? (() => { try { return JSON.parse(document.config_json).bookletCodes?.join(' / ') || 'A'; } catch { return 'A'; } })() : 'A'}</td><td>{document.question_count || 0}</td><td><span className="tag">{document.status}</span></td></tr>)}</tbody></table></div></div>}
    {tab === 'videos' && <div className="module-stack"><div className="module-card"><div className="module-heading"><div><span className="eyebrow">Kazanım desteği</span><h2>Video ekle</h2><p>YouTube veya kendi video kaynağını sınıf ve ders ile eşleştirin.</p></div><PlaySquare size={22} /></div>{user?.role === 'SUPER_ADMIN' && <><div className="form-grid"><label>Başlık<input value={vform.title} onChange={event => setVform({ ...vform, title: event.target.value })} /></label><label>URL<input value={vform.url} onChange={event => setVform({ ...vform, url: event.target.value })} /></label><label>Sınıf<input type="number" value={vform.gradeLevel} onChange={event => setVform({ ...vform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={vform.subjectId} onChange={event => setVform({ ...vform, subjectId: event.target.value })} /></label></div><button className="primary" onClick={addVideo} disabled={!vform.title || !vform.url}>Videoyu ekle</button></>}</div><div className="video-grid">{videos.map(video => <div className="video-card" key={video.id}><span className="tag">{video.provider}</span><h3>{video.title}</h3><p>{video.grade_level ? `${video.grade_level}. sınıf · ` : ''}{video.subject_name || ''}</p><a className="secondary" href={video.url} target="_blank" rel="noreferrer">Videoyu aç <ChevronRight size={15} /></a></div>)}</div></div>}
  </div>;
}
