import { useState, type ReactNode } from 'react';
import '../pages/result-student-review.css';
import '../pages/result-portal-priority.css';
import {ResultStudentEntrance} from './ResultStudentEntrance';
import '../pages/result-student-print.css';
import { ArrowLeft, ChevronRight, FileText, PlayCircle, Printer } from 'lucide-react';
import { ResultNibiruPanel } from './ResultNibiruPanel';
import { ResultOutcomes, ResultSubjectBreakdown } from './ResultLearningDetails';
import { ResultExamCountdown } from './ResultExamCountdown';
import { ResultCombinedReport } from './ResultCombinedReport';
import '../pages/result-combined-report.css';
import '../pages/result-exam-countdown.css';
const themes = [
 ['ocean', 'Okyanus'], ['night', 'Gece'], ['lavender', 'Lavanta'], ['sunset', 'Gün batımı'], ['forest', 'Orman'],
] as const;
export type StudentTheme = typeof themes[number][0];
export function readStudentTheme(): StudentTheme {
 try { const saved = localStorage.getItem('anunex_sr_theme'); return themes.find(([id]) => id === saved)?.[0] ?? 'ocean'; }
 catch { return 'ocean'; }
}
export function saveStudentTheme(theme: StudentTheme) {
 try { localStorage.setItem('anunex_sr_theme', theme); } catch { /* Storage may be unavailable. */ }
}
type Props={theme:StudentTheme;onThemeChange:(theme:StudentTheme)=>void;entrance?:boolean;result:any;detail:any;busy:boolean;onOpenExam:(id:string)=>void;onCloseDetail:()=>void;onLogout:()=>void;renderNationalRank:(exam:any)=>ReactNode};
const numeric = (v: unknown) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const value = (v: unknown) => numeric(v)?.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) ?? 'Yayımlanmadı';

function ProgressChart({exams}:{exams:any[]}) {
 const ordered = [...exams].reverse();
 return <section className="sr-panel sr-progress"><h3>Gelişim grafiği</h3><div className="sr-progress-grid">
  {([['score','Puan'],['net','Net']] as const).map(([field,label]) => {
   const values = ordered.map(exam => numeric(exam[field]));
   const published = values.filter((v): v is number => v !== null);
   if (published.length < 2) return <div key={field}><h4>{label}</h4><p>Grafik için en az iki sonuç yayımlanmalı.</p></div>;
   const low = Math.min(...published), high = Math.max(...published);
   const points = values.map((v,i) => v === null ? null : [12 + 296 * i / (values.length - 1), 68 - (high === low ? 28 : 56 * (v-low)/(high-low))]);
   const path = points.map((point,i) => point ? `${i && points[i-1] ? 'L' : 'M'}${point.join(',')}` : '').join(' ');
   return <div key={field}><h4>{label}</h4><svg viewBox="0 0 320 80" role="img" aria-label={`${label} gelişimi`}>
    <title>{ordered.map((exam,i) => `${exam.title}: ${value(values[i])}`).join(' · ')}</title>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5"/>
    {points.map((point,i) => point && <circle key={i} cx={point[0]} cy={point[1]} r="3.5" fill="currentColor"><title>{ordered[i].title} · {value(values[i])}</title></circle>)}
   </svg><p>İlk sonuç {value(published[0])} · Son sonuç {value(published.at(-1))}</p></div>;
  })}
 </div></section>;
}

const rankText=(v:any,n:any)=>v&&n?`${Number(v).toLocaleString('tr-TR')} / ${Number(n).toLocaleString('tr-TR')}`:'Yayımlanmadı';
const ranks=[['class','Şube'],['grade','Sınıf'],['institution','Kurum'],['network','Zincir'],['district','İlçe'],['city','İl']] as const;
/** Presentation only; session, authorization and actions remain in ResultPortal. */
export function StudentResultsWorkspace({theme,onThemeChange,result,detail,busy,onOpenExam,onCloseDetail,onLogout,renderNationalRank,entrance=false}:Props){
 const [combined,setCombined]=useState(false);
 const exam=detail?.exam;
 const summary=exam?{...(result.exams.find((x:any)=>x.exam_id===(exam.exam_id||exam.id))||{}),...exam}:null;

 const latest=result.exams?.[0];
 const examIndex = result.exams.findIndex((item:any) => item.exam_id === (exam?.exam_id || exam?.id));
 const previous = examIndex >= 0 ? result.exams[examIndex + 1] : undefined;
 const [desktop] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 761px)').matches);
 const nibiru=<ResultNibiruPanel key={detail?.exam?.exam_id||detail?.exam?.id||'list'} result={result} detail={detail}/>;
 return <div className="result-dashboard student-results-v2 result-student-priority" data-sr-theme={theme} data-view={detail?'detail':'exams'}>
  {entrance&&<ResultStudentEntrance grade={result.student.gradeLevel}/>}
  <div className="result-student-head sr-header"><div><span className="result-kicker">ÖĞRENCİ SONUÇ MERKEZİ</span><h2>{result.student.name}</h2><p>{result.student.institution} · {result.student.gradeLevel}. sınıf</p></div><div className="result-student-actions sr-header-actions"><div className="sr-theme-picker" role="group" aria-label="Renk teması">{themes.map(([id,label])=><button key={id} type="button" data-swatch={id} aria-label={label} title={label} aria-pressed={theme===id} onClick={()=>onThemeChange(id)}><span aria-hidden="true">{theme===id?'✓':''}</span></button>)}</div><button type="button" aria-pressed={combined} onClick={()=>{if(detail)onCloseDetail();setCombined(x=>!x)}}>Birleşik karne</button><button type="button" onClick={()=>window.print()} disabled={busy}><Printer aria-hidden="true"/> Yazdır</button><button onClick={onLogout}><ArrowLeft/> Güvenli çıkış</button></div></div>
  {!!result.unavailableSnapshotExamIds?.length&&<p className="sr-status" role="status">Bazı eski yayınların sabit sonuç kaydı bulunmuyor. Bu sınavların sonuçları için kurumunuzla iletişime geçin.</p>}
  {combined?<ResultCombinedReport onClose={()=>setCombined(false)}/>:!detail?<><ResultExamCountdown countdown={result.countdown}/><div className="sr-list-intro"><h2>Sınavlarım</h2><p>Yayımlanmış sınav sonuçlarını seçerek ayrıntılı analizini inceleyebilirsin.</p></div>{latest&&<section className="rsp-overview"><div className="rsp-latest"><span className="result-kicker">SON SINAVIN</span><h3>{latest.title}</h3><div className="rsp-main-values"><div><strong>{value(latest.score)}</strong><span>{latest.exam_type} puan</span></div><div><strong>{value(latest.net)}</strong><span>net</span></div></div>{latest.score==null&&<p className="sr-data-note">Puan henüz yayımlanmadı.</p>}<button type="button" className="rsp-primary" disabled={busy} onClick={()=>onOpenExam(latest.exam_id)}>Sınavı incele <ChevronRight aria-hidden="true"/></button></div><div className="rsp-combined-teaser"><h3>Birleşik karne</h3><p>Seçtiğin sınavları birlikte incele.</p><p>Son 5 sınav · Tümü · Kendim seçeyim</p><button type="button" onClick={()=>setCombined(true)}>Karne hazırla</button></div></section>}{result.exams.length>=2&&<ProgressChart exams={result.exams}/>}{nibiru}<div className="result-exams sr-exam-list"><h3>Sınav geçmişim <span>{result.exams.length}</span></h3>{result.exams.map((x:any)=><button key={x.exam_id} className="sr-exam-card" aria-busy={busy} onClick={()=>{setCombined(false);onOpenExam(x.exam_id)}}><div className="sr-exam-identity"><FileText aria-hidden="true"/><div><strong>{x.title}</strong><span>{x.academic_year} · {x.exam_type} · {x.exam_date||'Tarih yok'}</span>{x.score==null&&<small className="rsp-score-pending">Puan henüz yayımlanmadı.</small>}</div></div><div className="exam-metrics sr-exam-values"><div className="sr-value"><strong>{value(x.score)}</strong><small>{x.exam_type} puan</small></div><div className="sr-value"><strong>{value(x.net)}</strong><small>net</small></div></div><span className="sr-exam-arrow">Sonucu incele <ChevronRight aria-hidden="true"/></span></button>)}{!result.exams.length&&<p className="result-empty sr-empty">Görüntülenecek yayımlanmış sınav sonucu bulunmuyor.</p>}</div></>:<section className="result-detail sr-detail">
   <div className="detail-head sr-detail-top"><div><h3>Sınav analizi</h3>{exam?.title&&<h2>{exam.title}</h2>}{exam&&<p>{exam.academic_year} · {exam.exam_type} · {exam.exam_date||'Tarih yok'}</p>}</div><button onClick={onCloseDetail}><ArrowLeft aria-hidden="true"/> Kapat</button></div>
   <div className="sr-summary" aria-label="Sınav özeti">{([['score','Puan'],['net','Toplam net'],['correct_count','Doğru'],['wrong_count','Yanlış'],['blank_count','Boş']] as const).map(([field,label])=>{
     const current = numeric(summary?.[field]), before = numeric(previous?.[field]);
     const diff = current !== null && before !== null ? Math.round((current-before)*100)/100 : null;
     return <div className="sr-value" data-metric={field} key={field}><strong>{value(current)}</strong><small>{label}</small>
       {diff !== null && <span className="sr-delta" data-direction={diff>0?'up':diff<0?'down':'same'} title={`Önceki sınav: ${previous.title}`}>{diff>0?'↑':diff<0?'↓':'='} {value(Math.abs(diff))} <small>önceki sınava göre</small></span>}
     </div>;
   })}</div>
   {summary?.score==null&&<p className="sr-data-note">Puan henüz yayımlanmadı.</p>}<div className="sr-detail-grid"><div className="sr-main"><details className="sr-section-fold" open={desktop}><summary>Ders performansı</summary><ResultSubjectBreakdown subjects={detail.subjects} examType={exam?.exam_type} optionalPhilosophy={detail.optionalPhilosophy||[]}/></details><details className="sr-section-fold" open={desktop}><summary>Kazanım rotası</summary><ResultOutcomes key={exam?.exam_id||exam?.id||'detail'} outcomes={detail.outcomes} status={detail.outcomesStatus} truncated={Boolean(detail.outcomesTruncated)}/></details></div>
   <div className="sr-side"><section className="sr-panel sr-ranking"><h3>Sıralamaların</h3><dl>{ranks.map(([key,label])=><div key={key}><dt>{label}</dt><dd className="result-rank-line">{rankText(summary?.[`${key}_rank`],summary?.[`${key}_count`])}</dd></div>)}{renderNationalRank(summary||{})}</dl></section>{nibiru}{!!detail.videos?.length&&<section className="sr-panel sr-videos"><h3>Tanımlı video çözümleri</h3><div className="video-grid">{detail.videos.map((x:any)=><a key={`${x.url}-${x.question_no}`} href={x.url} target="_blank" rel="noreferrer"><PlayCircle aria-hidden="true"/><span><strong>{x.title||`${x.question_no}. soru çözümü`}</strong><small>Onaylı video</small></span></a>)}</div></section>}</div></div>
  </section>}
 </div>;
}
