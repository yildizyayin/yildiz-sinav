import type { ReactNode } from 'react';
import '../pages/result-student-review.css';
import { ArrowLeft, ChevronRight, Download, FileText, PlayCircle } from 'lucide-react';
import { ResultNibiruPanel } from './ResultNibiruPanel';
import { ResultOutcomes, ResultSubjectBreakdown } from './ResultLearningDetails';
type Props={result:any;detail:any;busy:boolean;onOpenExam:(id:string)=>void;onCloseDetail:()=>void;onPrint:()=>void;onLogout:()=>void;renderNationalRank:(exam:any)=>ReactNode};
const value=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2});
const rankText=(v:any,n:any)=>v&&n?`${Number(v).toLocaleString('tr-TR')} / ${Number(n).toLocaleString('tr-TR')}`:'—';
const ranks=[['class','Şube'],['grade','Sınıf'],['institution','Kurum'],['network','Zincir'],['district','İlçe'],['city','İl']] as const;
/** Presentation only; session, authorization and actions remain in ResultPortal. */
export function StudentResultsWorkspace({result,detail,busy,onOpenExam,onCloseDetail,onPrint,onLogout,renderNationalRank}:Props){
 const printResults=()=>{const prepare=()=>document.querySelectorAll<HTMLDetailsElement>('#print-root .sr-branch details').forEach(d=>{d.open=true;});window.addEventListener('beforeprint',prepare);try{onPrint();}finally{window.removeEventListener('beforeprint',prepare);}};
 const exam=detail?.exam;
 const summary=exam?result.exams.find((x:any)=>x.exam_id===(exam.exam_id||exam.id))||exam:null;

 const nibiru=<ResultNibiruPanel key={detail?.exam?.exam_id||detail?.exam?.id||'list'} result={result} detail={detail}/>;
 return <div className="result-dashboard student-results-v2" data-view={detail?'detail':'exams'}>
  <div className="result-student-head sr-header"><div><span className="result-kicker">ÖĞRENCİ SONUÇ MERKEZİ</span><h2>{result.student.name}</h2><p>{result.student.institution} · {result.student.gradeLevel}. sınıf</p></div><div className="result-student-actions sr-header-actions"><span className="sr-combined-unavailable"><button type="button" disabled title="Birleşik karne bu portalda henüz kullanıma açılmadı.">Birleşik karne</button><small>Planlanan</small></span><button onClick={printResults}><Download/> Sonuç karnesi</button><button onClick={onLogout}><ArrowLeft/> Güvenli çıkış</button></div></div>
  {!!result.unavailableSnapshotExamIds?.length&&<p className="sr-status" role="status">Bazı eski yayınların sabit sonuç kaydı bulunmuyor. Bu sınavların sonuçları için kurumunuzla iletişime geçin.</p>}
  {!detail?<><div className="sr-list-intro"><h2>Sınavlarım</h2><p>Yayımlanmış sınav sonuçlarını seçerek ayrıntılı analizini inceleyebilirsin.</p></div>{nibiru}<div className="result-exams sr-exam-list"><h3>Sınav geçmişim <span>{result.exams.length}</span></h3>{result.exams.map((x:any)=><button key={x.exam_id} className="sr-exam-card" aria-busy={busy} onClick={()=>onOpenExam(x.exam_id)}><div className="sr-exam-identity"><FileText aria-hidden="true"/><div><strong>{x.title}</strong><span>{x.academic_year} · {x.exam_type} · {x.exam_date||'Tarih yok'}</span></div></div><div className="exam-metrics sr-exam-values"><div className="sr-value"><strong>{value(x.score)}</strong><small>puan</small></div><div className="sr-value"><strong>{value(x.net)}</strong><small>net</small></div></div><span className="sr-exam-arrow">Sonucu incele <ChevronRight aria-hidden="true"/></span></button>)}{!result.exams.length&&<p className="result-empty sr-empty">Görüntülenecek yayımlanmış sınav sonucu bulunmuyor.</p>}</div></>:<section className="result-detail sr-detail">
   <div className="detail-head sr-detail-top"><div><h3>Sınav analizi</h3>{exam?.title&&<h2>{exam.title}</h2>}{exam&&<p>{exam.academic_year} · {exam.exam_type} · {exam.exam_date||'Tarih yok'}</p>}</div><button onClick={onCloseDetail}><ArrowLeft aria-hidden="true"/> Kapat</button></div>
   <div className="sr-summary" aria-label="Sınav özeti">{[[summary?.score,'Puan'],[summary?.net,'Toplam net'],[summary?.correct_count,'Doğru'],[summary?.wrong_count,'Yanlış'],[summary?.blank_count,'Boş']].map(([v,label])=><div className="sr-value" key={String(label)}><strong>{value(v)}</strong><small>{label}</small></div>)}</div>
   <div className="sr-detail-grid"><div className="sr-main"><ResultSubjectBreakdown subjects={detail.subjects} examType={exam?.exam_type} optionalPhilosophy={detail.optionalPhilosophy||[]}/><ResultOutcomes key={exam?.exam_id||exam?.id||'detail'} outcomes={detail.outcomes} status={detail.outcomesStatus}/></div>
   <div className="sr-side"><section className="sr-panel sr-ranking"><h3>Sıralamaların</h3><dl>{ranks.map(([key,label])=><div key={key}><dt>{label}</dt><dd className="result-rank-line">{rankText(summary?.[`${key}_rank`],summary?.[`${key}_count`])}</dd></div>)}{renderNationalRank(summary||{})}</dl></section>{nibiru}{!!detail.videos.length&&<section className="sr-panel sr-videos"><h3>Tanımlı video çözümleri</h3><div className="video-grid">{detail.videos.map((x:any)=><a key={`${x.url}-${x.question_no}`} href={x.url} target="_blank" rel="noreferrer"><PlayCircle aria-hidden="true"/><span><strong>{x.title||`${x.question_no}. soru çözümü`}</strong><small>Onaylı video</small></span></a>)}</div></section>}</div></div>
  </section>}
 </div>;
}
