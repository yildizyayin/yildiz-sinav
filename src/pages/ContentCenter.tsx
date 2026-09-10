import { useEffect, useState } from 'react';
import { BookOpen, Check, CheckCircle2, ChevronRight, Eye, FileText, PlaySquare, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, WandSparkles, XCircle } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import './content-center.css';

const difficultyLabels: Record<number, string> = {
  1: 'Başlangıç', 2: 'Kolay', 3: 'Orta', 4: 'Orta-üstü', 5: 'Zor', 6: 'Olimpiyat',
};

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

export function ContentCenter() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'questions' | 'studio' | 'videos'>('questions');
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ q: '', gradeLevel: '', subjectId: '', difficultyLevel: '', reviewStatus: '' });
  const [qform, setQform] = useState({ stemText: '', gradeLevel: '8', subjectId: 'sub_math', topic: '', subtopic: '', difficultyLevel: '3', optionA: '', optionB: '', optionC: '', optionD: '', optionE: '', correctAnswer: 'A', solutionText: '', sourceLabel: 'Kendi İçeriğimiz', copyrightStatus: 'OWNED' });
  const [dform, setDform] = useState({ title: '', documentType: 'PRACTICE_EXAM', gradeLevel: '8', subjectId: 'sub_math', questionCount: '20' });
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
      const options = [qform.optionA, qform.optionB, qform.optionC, qform.optionD, qform.optionE].map((text, index) => ({ label: String.fromCharCode(65 + index), text: text.trim() || `Seçenek ${String.fromCharCode(65 + index)}` }));
      const response = await api<any>('/api/platform/questions', { method: 'POST', body: JSON.stringify({ ...qform, gradeLevel: Number(qform.gradeLevel), difficultyLevel: Number(qform.difficultyLevel), options, originKind: 'MANUAL' }) });
      if (user?.role !== 'SUPER_ADMIN') await api(`/api/question-bank-standard/${response.id}`, { method: 'PATCH', body: JSON.stringify({ topic: qform.topic, subtopic: qform.subtopic, difficultyLevel: Number(qform.difficultyLevel), sourceLabel: qform.sourceLabel, copyrightStatus: qform.copyrightStatus, originKind: 'MANUAL' }) });
      setNotice(user?.role === 'SUPER_ADMIN' ? `Soru onaylı havuza kaydedildi · ${response.id}` : `Soru inceleme kuyruğuna gönderildi · ${response.id}`);
      setQform(form => ({ ...form, stemText: '', solutionText: '' }));
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const review = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api(`/api/question-bank-standard/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(status === 'APPROVED' ? 'Soru basılabilir onaylı havuza alındı.' : 'Soru reddedildi.');
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const createDoc = async () => {
    try {
      const response = await api<any>('/api/platform/studio', { method: 'POST', body: JSON.stringify({ ...dform, gradeLevel: Number(dform.gradeLevel), questionCount: Number(dform.questionCount) }) });
      setNotice(`Belge taslağı oluşturuldu · ${response.selectedQuestions}/${response.requestedQuestions} soru seçildi.`);
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
      <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}><BookOpen size={16} /> Soru havuzu <span>{stats?.total ?? questions.length}</span></button>
      <button className={tab === 'studio' ? 'active' : ''} onClick={() => setTab('studio')}><WandSparkles size={16} /> Studio <span>{docs.length}</span></button>
      <button className={tab === 'videos' ? 'active' : ''} onClick={() => setTab('videos')}><PlaySquare size={16} /> Video <span>{videos.length}</span></button>
    </div>

    {tab === 'questions' && <>
      <div className="content-summary-grid"><div><span>Toplam soru</span><strong>{stats?.total ?? questions.length}</strong><small>arşiv dışı içerik</small></div><div><span>Onaylı</span><strong>{approvedCount}</strong><small>öğrenci akışına açık</small></div><div><span>Kitapta kullanılabilir</span><strong>{printableCount}</strong><small>telif filtresinden geçen</small></div><div><span>Aktif seviye</span><strong>6</strong><small>başlangıçtan olimpiyata</small></div></div>
      <div className="question-workspace">
        <section className="question-list-column">
          <div className="question-filter-card"><div className="filter-title"><div><span className="eyebrow">Kütüphane</span><h2>Soru listesi</h2></div><span className="result-count">{questions.length} sonuç</span></div><div className="filter-row"><label className="search-field"><Search size={16} /><input placeholder="Soru, konu veya alt konu ara" value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} onKeyDown={event => event.key === 'Enter' && void load(filters)} /></label><select aria-label="Sınıf filtresi" value={filters.gradeLevel} onChange={event => setFilters({ ...filters, gradeLevel: event.target.value })}><option value="">Tüm sınıflar</option>{[5, 6, 7, 8, 9, 10, 11, 12].map(grade => <option key={grade} value={grade}>{grade}. sınıf</option>)}</select><select aria-label="Zorluk filtresi" value={filters.difficultyLevel} onChange={event => setFilters({ ...filters, difficultyLevel: event.target.value })}><option value="">Tüm seviyeler</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level} · {difficultyLabels[level]}</option>)}</select><select aria-label="Durum filtresi" value={filters.reviewStatus} onChange={event => setFilters({ ...filters, reviewStatus: event.target.value })}><option value="">Tüm durumlar</option><option value="DRAFT">Taslak</option><option value="REVIEW">İncelemede</option><option value="APPROVED">Onaylı</option><option value="REJECTED">Reddedildi</option></select><button className="primary filter-submit" onClick={() => void load(filters)}><SlidersHorizontal size={15} /> Filtrele</button></div></div>
          <div className="question-list-card">{questions.map(question => { const selected = selectedQuestion?.id === question.id; return <button className={`question-row ${selected ? 'selected' : ''}`} key={question.id} onClick={() => setSelectedQuestion(question)}><span className="question-row-check">{selected ? <Check size={14} /> : <span />}</span><span className="question-row-body"><strong>{question.stem_text}</strong><small>{question.grade_level || '—'}. sınıf · {question.subject_name || question.subject_id || 'Ders belirtilmedi'} · {[question.topic, question.subtopic].filter(Boolean).join(' / ') || 'Konu belirtilmedi'}</small><span className="question-row-tags">{question.has_learning_link ? <em className="tag verified"><ShieldCheck size={12} /> Kazanım eşlemesi</em> : <em className="tag">Eşleme bekliyor</em>}<em className={`tag status-${String(question.review_status || '').toLowerCase()}`}>{reviewLabel(question.review_status)}</em></span></span><DifficultyMeter question={question} compact /><ChevronRight size={16} className="question-row-arrow" /></button>; })}{!questions.length && <div className="empty">Filtrelere uyan soru bulunamadı.</div>}</div>
        </section>
        <aside className="question-preview-card">{selectedQuestion ? <><div className="preview-head"><div><span className="eyebrow">Soru önizleme</span><h2>İçerik detayı</h2></div><button className="icon-button" title="Önizleme" aria-label="Önizleme"><Eye size={17} /></button></div><div className="preview-meta"><span className="tag">{selectedQuestion.grade_level || '—'}. sınıf</span><span className="tag">{selectedQuestion.subject_name || selectedQuestion.subject_id || 'Ders'}</span><span className={`tag status-${String(selectedQuestion.review_status || '').toLowerCase()}`}>{reviewLabel(selectedQuestion.review_status)}</span></div><h3>{selectedQuestion.stem_text}</h3><div className="preview-options">{(selectedQuestion.options || []).map((option: any, index: number) => { const letter = typeof option === 'string' && option.length === 1 ? option : String(option?.label || option?.letter || String.fromCharCode(65 + index)); const value = typeof option === 'string' ? (option.length === 1 ? `Seçenek ${option}` : option) : String(option?.text || option?.content || option?.value || `Seçenek ${letter}`); return <div className={String(selectedQuestion.correct_answer || '').toUpperCase() === letter.toUpperCase() ? 'correct' : ''} key={`${value}-${index}`}><span>{letter}</span>{value}</div>; })}</div><div className="preview-detail-grid"><div><small>Zorluk</small><DifficultyMeter question={selectedQuestion} /></div><div><small>Kaynak</small><strong>{selectedQuestion.source_label || 'Belirtilmedi'}</strong></div><div><small>Telif</small><strong>{selectedQuestion.copyright_status || 'Belirtilmedi'}</strong></div><div><small>Kazanım</small><strong>{selectedQuestion.has_learning_link ? 'Eşleştirildi' : 'Bekliyor'}</strong></div></div>{selectedQuestion.solution_text && <div className="solution-preview"><span>Çözüm notu</span><p>{selectedQuestion.solution_text}</p></div>}{user?.role === 'SUPER_ADMIN' && selectedQuestion.review_status !== 'APPROVED' && selectedQuestion.review_status !== 'ARCHIVED' && <div className="preview-actions"><button className="primary" onClick={() => void review(selectedQuestion.id, 'APPROVED')}><CheckCircle2 size={15} /> Onayla</button><button className="danger" onClick={() => void review(selectedQuestion.id, 'REJECTED')}><XCircle size={15} /> Reddet</button></div>}</> : <div className="empty">Detayını görmek için listeden bir soru seç.</div>}</aside>
      </div>
      <details className="question-create-card" open><summary><span><Plus size={17} /> Yeni soru ekle</span><small>Altı seviyeli zorluk, telif ve inceleme akışı</small></summary><div className="create-inner"><div className="create-intro"><span className="eyebrow">İçerik girişi</span><h2>Yeni soruyu havuza al</h2><p>Kurum ve öğretmen içerikleri inceleme kuyruğuna gider. Öğrenci yalnızca onaylı, güvenli içerikleri görür.</p></div><div className="form-grid"><label>Sınıf<input type="number" min="1" max="12" value={qform.gradeLevel} onChange={event => setQform({ ...qform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={qform.subjectId} onChange={event => setQform({ ...qform, subjectId: event.target.value })} /></label><label>Konu<input value={qform.topic} onChange={event => setQform({ ...qform, topic: event.target.value })} /></label><label>Alt konu<input value={qform.subtopic} onChange={event => setQform({ ...qform, subtopic: event.target.value })} /></label><label>Zorluk seviyesi<select value={qform.difficultyLevel} onChange={event => setQform({ ...qform, difficultyLevel: event.target.value })}>{[1, 2, 3, 4, 5, 6].map(level => <option value={level} key={level}>{level} · {difficultyLabels[level]}</option>)}</select><span className="create-level-note"><DifficultyMeter question={{ difficulty_level: Number(qform.difficultyLevel) }} /></span></label><label>Doğru cevap<input value={qform.correctAnswer} maxLength={1} onChange={event => setQform({ ...qform, correctAnswer: event.target.value.toUpperCase() })} /></label><label>Kaynak<input value={qform.sourceLabel} onChange={event => setQform({ ...qform, sourceLabel: event.target.value })} /></label><label>Telif<select value={qform.copyrightStatus} onChange={event => setQform({ ...qform, copyrightStatus: event.target.value })}><option value="OWNED">Bize ait</option><option value="LICENSED">Lisanslı / izinli</option><option value="PUBLIC_DOMAIN">Açık / kamu malı</option><option value="USER_PROVIDED">Kullanıcı sağladı</option><option value="RESTRICTED">Kısıtlı · basılamaz</option></select></label></div><label className="options-field-label">Şıklar <small>Öğrencinin göreceği seçenek metinleri</small></label><div className="option-input-grid">{[['A', 'optionA'], ['B', 'optionB'], ['C', 'optionC'], ['D', 'optionD'], ['E', 'optionE']].map(([letter, key]) => <label key={letter}><span>{letter}</span><input value={qform[key as keyof typeof qform] as string} onChange={event => setQform({ ...qform, [key]: event.target.value })} placeholder={`${letter}. seçenek`} /></label>)}</div><div className="create-text-grid"><label>Soru metni<textarea rows={5} value={qform.stemText} onChange={event => setQform({ ...qform, stemText: event.target.value })} /></label><label>Çözüm notu<textarea rows={5} value={qform.solutionText} onChange={event => setQform({ ...qform, solutionText: event.target.value })} /></label></div><div className="create-footer"><span><ShieldCheck size={15} /> Kaydetmeden önce telif ve seviye bilgilerini kontrol edin.</span><button className="primary" onClick={addQuestion} disabled={!qform.stemText.trim()}><Plus size={16} /> Soruyu kaydet</button></div></div></details>
    </>}

    {tab === 'studio' && <div className="module-stack"><div className="module-card"><div className="module-heading"><div><span className="eyebrow">Soru havuzundan üret</span><h2>Yazılı / deneme oluştur</h2><p>Onaylı soru havuzundan hedef sayıda soru seçerek taslak oluşturur. Öğretmen kontrolünden sonra baskı aşamasına alınır.</p></div><FileText size={22} /></div><div className="form-grid"><label>Başlık<input value={dform.title} onChange={event => setDform({ ...dform, title: event.target.value })} /></label><label>Tür<select value={dform.documentType} onChange={event => setDform({ ...dform, documentType: event.target.value })}><option value="PRACTICE_EXAM">Deneme</option><option value="WRITTEN_EXAM">Yazılı</option><option value="WORKSHEET">Föy</option><option value="PERSONAL_BOOK">Kişisel kitap</option></select></label><label>Sınıf<input type="number" value={dform.gradeLevel} onChange={event => setDform({ ...dform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={dform.subjectId} onChange={event => setDform({ ...dform, subjectId: event.target.value })} /></label><label>Soru sayısı<input type="number" value={dform.questionCount} onChange={event => setDform({ ...dform, questionCount: event.target.value })} /></label></div><button className="primary" onClick={createDoc} disabled={!dform.title.trim()}><WandSparkles size={16} /> Taslak oluştur</button></div><div className="module-table"><table><thead><tr><th>Belge</th><th>Tür</th><th>Sınıf</th><th>Soru</th><th>Durum</th></tr></thead><tbody>{docs.map(document => <tr key={document.id}><td><strong>{document.title}</strong></td><td>{document.document_type}</td><td>{document.grade_level || '—'}</td><td>{document.question_count || 0}</td><td><span className="tag">{document.status}</span></td></tr>)}</tbody></table></div></div>}
    {tab === 'videos' && <div className="module-stack"><div className="module-card"><div className="module-heading"><div><span className="eyebrow">Kazanım desteği</span><h2>Video ekle</h2><p>YouTube veya kendi video kaynağını sınıf ve ders ile eşleştirin.</p></div><PlaySquare size={22} /></div>{user?.role === 'SUPER_ADMIN' && <><div className="form-grid"><label>Başlık<input value={vform.title} onChange={event => setVform({ ...vform, title: event.target.value })} /></label><label>URL<input value={vform.url} onChange={event => setVform({ ...vform, url: event.target.value })} /></label><label>Sınıf<input type="number" value={vform.gradeLevel} onChange={event => setVform({ ...vform, gradeLevel: event.target.value })} /></label><label>Ders kodu<input value={vform.subjectId} onChange={event => setVform({ ...vform, subjectId: event.target.value })} /></label></div><button className="primary" onClick={addVideo} disabled={!vform.title || !vform.url}>Videoyu ekle</button></>}</div><div className="video-grid">{videos.map(video => <div className="video-card" key={video.id}><span className="tag">{video.provider}</span><h3>{video.title}</h3><p>{video.grade_level ? `${video.grade_level}. sınıf · ` : ''}{video.subject_name || ''}</p><a className="secondary" href={video.url} target="_blank" rel="noreferrer">Videoyu aç <ChevronRight size={15} /></a></div>)}</div></div>}
  </div>;
}
