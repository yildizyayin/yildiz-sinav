import { useEffect, useState } from 'react';
import { BookOpen, Check, CheckCircle2, ChevronRight, Image, Lightbulb, RotateCcw, Sparkles, Target, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './student-question-practice.css';

const difficultyLabels: Record<number, string> = { 1: 'Başlangıç', 2: 'Kolay', 3: 'Orta', 4: 'Orta-üstü', 5: 'Zor', 6: 'Olimpiyat' };

function difficultyTone(level: number) { return level <= 2 ? 'blue' : level === 3 ? 'teal' : level === 4 ? 'amber' : level === 5 ? 'red' : 'violet'; }

function optionData(option: any, index: number) {
  const fallback = String.fromCharCode(65 + index);
  if (typeof option === 'string') return { letter: option.length === 1 ? option : fallback, text: option.length === 1 ? `Seçenek ${option}` : option };
  return { letter: String(option?.letter || option?.key || option?.label || option?.value || fallback), text: String(option?.text || option?.content || option?.value || option?.label || `Seçenek ${fallback}`) };
}

function DifficultyMeter({ level }: { level: number }) {
  const safeLevel = Math.max(1, Math.min(6, Number(level || 3)));
  return <div className={`student-difficulty ${difficultyTone(safeLevel)}`}><span>{[1, 2, 3, 4, 5, 6].map(item => <i className={item <= safeLevel ? 'active' : ''} key={item} />)}</span><strong>Seviye {safeLevel}</strong><small>{difficultyLabels[safeLevel]}</small></div>;
}

export function StudentQuestionPractice() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<any>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [completedToday, setCompletedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuestions = async () => {
    setLoading(true); setError(''); setResult(null); setAnswer(''); setHintVisible(false); setIndex(0);
    try { const response = await api<any>('/api/platform/student-practice?limit=10'); setQuestions(response.questions || []); setCompletedToday(Number(response.progress?.completedToday || 0)); }
    catch (e: any) { setError(e.message || 'Bugünkü sorular yüklenemedi.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadQuestions(); }, []);

  const current = questions[index];
  const submit = async () => {
    if (!current || !answer || result) return;
    try { setError(''); setResult(await api<any>('/api/platform/student-practice/attempts', { method: 'POST', body: JSON.stringify({ questionId: current.id, answer }) })); setCompletedToday(value => value + 1); }
    catch (e: any) { setError(e.message || 'Cevap kontrol edilemedi.'); }
  };

  const next = () => { setIndex(value => value + 1); setAnswer(''); setResult(null); setHintVisible(false); };
  const progress = questions.length ? Math.min(100, ((index + (result ? 1 : 0)) / questions.length) * 100) : 0;

  return <div className="student-practice-page">
    <div className="student-practice-head"><div><span className="eyebrow">Soru çöz · bugün</span><h1>Kısa bir adım, net bir ilerleme.</h1><p>Onaylı soru havuzundan seviyene uygun sorular seçtik. Her cevap, sana özel gelişim rotanı biraz daha netleştirir.</p></div><Link to="/" className="practice-back">Ana sayfaya dön <ChevronRight size={15} /></Link></div>
    <div className="practice-goal-strip"><div className="practice-goal-copy"><span><Target size={15} /> Bugünkü mini hedef</span><strong>{result ? Math.min(index + 1, questions.length) : index} / {questions.length || 10} soru</strong></div><div className="practice-progress-track"><i style={{ width: `${progress}%` }} /></div><div className="practice-streak"><Sparkles size={16} /><span>Bugün çözülen</span><strong>{completedToday}</strong></div></div>

    {error && <div className="alert error">{error}</div>}
    {loading && <div className="practice-empty"><div className="practice-loader" /><strong>Soruların hazırlanıyor…</strong><span>Seviyene ve sınıfına göre güvenli bir liste oluşturuyoruz.</span></div>}
    {!loading && !error && !current && <div className="practice-empty"><CheckCircle2 size={34} /><strong>Bugünkü çalışma tamamlandı.</strong><span>Yeni bir soru seti almak için tekrar deneyebilirsin.</span><button className="primary" onClick={() => void loadQuestions()}><RotateCcw size={15} /> Yeni soru seti al</button></div>}
    {!loading && current && <div className="practice-layout">
      <main className="practice-question-card">
        <div className="practice-card-top"><span className="practice-number">Soru {String(index + 1).padStart(2, '0')}</span><span className="practice-subject"><BookOpen size={14} /> {current.subject_name || 'Ders'}</span><DifficultyMeter level={current.difficulty_level} /></div>
        <div className="practice-question-content"><span className="eyebrow">{current.topic || 'Kazanım pratiği'}</span>{current.stem_text ? <h2>{current.stem_text}</h2> : <div className="practice-visual-question"><Image size={18} /> Görsel soru</div>}{(current.assets || []).filter((asset: any) => asset.placement === 'STEM' || !asset.placement).map((asset: any) => asset.url && <img key={asset.id} src={asset.url} alt={asset.alt_text || 'Soru görseli'} style={{ display: 'block', maxWidth: '100%', maxHeight: 440, objectFit: 'contain', margin: '12px auto 20px', borderRadius: 10 }} />)}{(current.contentBlocks || []).filter((block: any) => block.block_type === 'TEXT' && block.text_content).map((block: any) => <p key={block.id}>{block.text_content}</p>)}<div className="practice-options">{(current.options || []).map((option: any, optionIndex: number) => { const data = optionData(option, optionIndex); const selected = answer === data.letter; const correct = result && result.correct && selected; const wrong = result && !result.correct && selected; return <button className={`practice-option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} disabled={!!result} key={`${data.letter}-${optionIndex}`} onClick={() => setAnswer(data.letter)}><span className="practice-option-letter">{data.letter}</span><strong>{data.text}</strong>{correct && <CheckCircle2 size={18} />}{wrong && <XCircle size={18} />}</button>; })}</div></div>
        <div className="practice-card-footer"><button className="practice-hint" onClick={() => setHintVisible(value => !value)}><Lightbulb size={16} /> {hintVisible ? 'İpucunu gizle' : 'İpucu al'}</button>{hintVisible && <div className="practice-hint-popover">Soruda verilenleri önce kısa notlara ayır. Sonra seçenekleri tek tek eleyerek ilerle.</div>}<span className="practice-footer-spacer" />{!result ? <><button className="practice-skip" onClick={next}>Atla</button><button className="primary practice-submit" disabled={!answer} onClick={() => void submit()}>Cevabımı kontrol et <ChevronRight size={16} /></button></> : <button className="primary practice-submit" onClick={next}>{index + 1 < questions.length ? 'Sıradaki soru' : 'Tamamla'} <ChevronRight size={16} /></button>}</div>
      </main>
      <aside className={`practice-coach-card ${result ? 'has-result' : ''}`}><div className="coach-orb"><Sparkles size={22} /></div>{!result ? <><span className="eyebrow">Nibiru’dan küçük destek</span><h2>Takıldığında önce düşünme yolunu değiştir.</h2><p>Cevabı hemen aramak yerine verilenleri, isteneni ve seçeneklerdeki ipuçlarını ayır. İstersen kısa bir ipucu açabilirsin.</p><div className="coach-tip"><Lightbulb size={15} /><span>İpucu, doğru cevabı söylemez.</span></div></> : <><span className="eyebrow">Cevap sonucu</span><h2>{result.correct ? 'Harika, doğru yoldasın! 🎯' : 'Bu sefer olmadı; şimdi öğrenme zamanı.'}</h2><p>{result.correct ? 'Bu kazanımdaki kanıtın güçlendi. Bir sonraki soruya geçebilirsin.' : 'Yanlış cevap da rotayı netleştirir. Çözüm notunu okuyup benzer bir soruda tekrar dene.'}</p><div className={`coach-result ${result.correct ? 'correct' : 'wrong'}`}><strong>Doğru cevap: {result.correctAnswer}</strong>{result.solutionText && <span>{result.solutionText}</span>}</div></>}</aside>
    </div>}
  </div>;
}
