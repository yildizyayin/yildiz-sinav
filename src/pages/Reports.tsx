import { RubricObservationReport } from '../components/RubricObservationReport';
import {GuidanceFrozenReport} from '../components/GuidanceFrozenReport';
import {InstitutionFrozenReport} from '../components/InstitutionFrozenReport';
import { FrozenExamReport } from '../components/FrozenExamReport';
import { FrozenPracticeReport } from '../components/FrozenPracticeReport';
import { FrozenFoyGameReport } from '../components/FrozenFoyGameReport';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, Printer, RefreshCw, Target, TrendingUp, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { resolveReportStudentId } from '../lib/reportSelection';

type StudentRow = { id:string; first_name:string; last_name:string; student_number?:string; grade_level?:number; section?:string; class_name?:string; institution_name?:string };

const reportViews: Record<string,{title:string;description:string;focus:string}> = {
 STUDENT:{title:'Bireysel gelişim karnem',description:'Seçtiğin sınav ve çalışmalar üzerinden güçlü alanlarını ve gelişimini incele.',focus:'Önce geliştirilecek kazanımları, sonra bu alanlara ait çalışma sonuçlarını incele.'},
 PARENT:{title:'Öğrenci gelişim karnesi',description:'Bağlı öğrencinin seçilen sınav ve çalışmalarındaki gelişimini takip edin.',focus:'Sonucu tek sınavla değerlendirmeyin; farklı tarihlerdeki kanıtları birlikte inceleyin.'},
 TEACHER:{title:'Branş gelişim karnesi',description:'Yetkili olduğunuz öğrencilerin kendi branşınızdaki öğrenme kanıtlarını inceleyin.',focus:'Ders gelişimini ve geliştirilecek kazanımları bir sonraki dersin çalışma planında kullanın.'},
 GUIDANCE_TEACHER:{title:'Rehberlik gelişim karnesi',description:'Yetkili sınıflarınızdaki öğrencilerin dersler arasındaki gelişimini birlikte inceleyin.',focus:'Destek görüşmesinde güçlü alanları ve gelişim ihtiyacını birlikte ele alın. Bu rapor psikolojik değerlendirme değildir.'},
 INSTITUTION_MANAGER:{title:'Kurum öğrenci karnesi',description:'Kurumunuzdaki öğrencilerin seçili öğrenme kanıtlarını ve ders gelişimini inceleyin.',focus:'Bu görünüm seçilen öğrenciye aittir. Kurum genelinin ortalaması olarak kullanmayın.'},
 SUPER_ADMIN:{title:'Öğrenci karne yönetimi',description:'Yetkili kurum ve öğrenciyi seçerek öğrenme kanıtlarını inceleyin.',focus:'Rapor kaynaklarını ve kapsam bilgisini birlikte kontrol edin.'},
};

export function Reports(){
 const {user}=useAuth();
 const [searchParams,setSearchParams]=useSearchParams();
 const [institutions,setInstitutions]=useState<any[]>([]);
 const [institutionId,setInstitutionId]=useState('');
 const [studentList,setStudentList]=useState<{scope:string;rows:StudentRow[]}>({scope:'',rows:[]});
 const [studentId,setStudentId]=useState('');
 const [rawReport,setReport]=useState<any>(null);
 const [selectedExams,setSelectedExams]=useState<string[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);

 const listScope=JSON.stringify([institutionId,user?.id,user?.role]);
 const currentListScope=useRef(listScope);currentListScope.current=listScope;
 const listGeneration=useRef(0);
 const currentStudentId=useRef(studentId);currentStudentId.current=studentId;
 const students=studentList.scope===listScope?studentList.rows:[];
 const scopeKey=JSON.stringify([studentId,institutionId,user?.id,user?.role]);
 const currentScope=useRef(scopeKey);currentScope.current=scopeKey;
 const requestGeneration=useRef(0);
 const report=rawReport?._scope===scopeKey?rawReport:null;
 const canChooseInstitution=user?.role==='SUPER_ADMIN';
 const view=reportViews[user?.role||'']||{title:'Gelişim karnesi',description:'Yetkili olduğunuz öğrenme kanıtlarını inceleyin.',focus:'Kaynak ve kapsam bilgisini kontrol edin.'};
 const savedExamIds:Array<string>=Array.isArray(report?.selectedExamIds)?report.selectedExamIds:[];
 const selectionPending=Boolean(report)&&JSON.stringify([...new Set(selectedExams)].sort())!==JSON.stringify([...new Set(savedExamIds)].sort());

 const loadInstitutions=async()=>{
   if(!canChooseInstitution)return;
   const r=await api<any>('/api/institutions');
   const active=(r.institutions||[]).filter((x:any)=>x.status==='ACTIVE');
   setInstitutions(active);
   if(!institutionId&&active[0])setInstitutionId(active[0].id);
 };

 const loadStudents=async()=>{
   const requestScope=listScope,attempt=++listGeneration.current,requestedStudent=searchParams.get('studentId');
   setError('');setStudentList({scope:requestScope,rows:[]});setReport(null);setSelectedExams([]);
   ++requestGeneration.current;setBusy(false);
   try{
     if(canChooseInstitution&&!institutionId)return;
     const r=await api<any>(`/api/reporting/students${qs({institutionId:canChooseInstitution?institutionId:null})}`);
     if(currentListScope.current!==requestScope||listGeneration.current!==attempt)return;
     const rows:StudentRow[]=r.students||[];setStudentList({scope:requestScope,rows});
     setStudentId(resolveReportStudentId(rows,requestedStudent,currentStudentId.current));
   }catch(e:any){if(currentListScope.current===requestScope&&listGeneration.current===attempt)setError(e.message)}
 };

 const loadReport=async(ids?:string[])=>{
   if(!studentId)return;const requestScope=scopeKey,attempt=++requestGeneration.current;setBusy(true);setError('');
   try{
     const examIds=(ids??selectedExams).join(',');
     const r=await api<any>(`/api/reporting/students/${studentId}/combined${qs({examIds:examIds||null})}`);
     if(currentScope.current!==requestScope||requestGeneration.current!==attempt)return;
     setReport({...r,_scope:requestScope});
     if(!(ids??selectedExams).length)setSelectedExams(r.selectedExamIds||[]);
   }catch(e:any){if(currentScope.current===requestScope&&requestGeneration.current===attempt)setError(e.message)}finally{if(currentScope.current===requestScope&&requestGeneration.current===attempt)setBusy(false)}
 };

 useEffect(()=>{void loadInstitutions().catch(e=>setError(e.message))},[]);
 useEffect(()=>{void loadStudents()},[institutionId,user?.id,user?.role,searchParams.get('studentId')]);
 useEffect(()=>{++requestGeneration.current;setBusy(false);if(studentId)void loadReport([])},[scopeKey,studentList]);

 const selectedStudent=useMemo(()=>students.find(s=>s.id===studentId),[students,studentId]);
 const toggleExam=(id:string)=>setSelectedExams(cur=>cur.includes(id)?cur.filter(x=>x!==id):cur.length<20?[...cur,id]:cur);
 const selectStudent=(id:string)=>{setReport(null);setSelectedExams([]);setStudentId(id);if(user?.role==='PARENT'){const next=new URLSearchParams(searchParams);if(id)next.set('studentId',id);else next.delete('studentId');setSearchParams(next,{replace:true});}};

 const exportCsv=()=>{
   if(!report||selectionPending||busy)return;
   const rows:string[][]=[['Öğrenci','Sınav','Tarih','Ders','Doğru','Yanlış','Boş','Net','Başarı %']];
   const name=`${report.student.first_name} ${report.student.last_name}`;
   for(const r of report.subjectTrend||[])rows.push([name,r.title,r.exam_date||'',r.subject_name,String(r.correct_count??''),String(r.wrong_count??''),String(r.blank_count??''),String(r.net??''),String(r.success_percent??'')]);
   const csv='\uFEFF'+rows.map(cols=>cols.map(csvCell).join(';')).join('\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=`birlesik-rapor-${slug(name)}.csv`;a.click();URL.revokeObjectURL(url);
 };

 return <>
   <div className="page-head"><div><span className="eyebrow">Birleşik Rapor Merkezi</span><h1>{view.title}</h1><p>{view.description}</p></div><div style={{display:'flex',gap:8}}><button className="ghost" onClick={()=>void loadStudents()}><RefreshCw size={16}/> Yenile</button>{report&&<><button className="secondary" disabled={busy||selectionPending} onClick={exportCsv}><Download size={16}/> CSV</button><button className="primary" disabled={busy||selectionPending} onClick={()=>{if(!busy&&!selectionPending)window.print()}}><Printer size={16}/> Yazdır / PDF</button></>}</div></div>
   {error&&<div className="alert error">{error}</div>}

   <div className="panel report-controls">
    <div className="form-grid">
     {canChooseInstitution&&<label>Kurum<select value={institutionId} onChange={e=>{setReport(null);setSelectedExams([]);setStudentId('');setInstitutionId(e.target.value)}}><option value="">Kurum seçin</option>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
     {user?.role!=='STUDENT'&&<label>{user?.role==='PARENT'?'Çocuk':'Öğrenci'}<select value={studentId} onChange={e=>selectStudent(e.target.value)}><option value="">{user?.role==='PARENT'?'Çocuk seçin':'Öğrenci seçin'}</option>{students.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}{s.class_name?` · ${s.class_name}`:''}</option>)}</select></label>}
    </div>
    {!students.length&&<div className="empty">Bu kapsamda raporlanabilir aktif öğrenci bulunmuyor.</div>}
    {user?.role==='PARENT'&&students.length>1&&!studentId&&<div className="alert info">Birden fazla bağlı öğrenci var. Gelişimini görmek istediğiniz çocuğu seçin.</div>}
   </div>

   {user?.role==='GUIDANCE_TEACHER'&&<GuidanceFrozenReport key={listScope} institutionId={user.institution_id||''}/>}
   {['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user?.role||'')&&<InstitutionFrozenReport key={listScope} institutionId={canChooseInstitution?institutionId:(user?.institution_id||'')}/>}

   {report&&<>
    <div className="alert info"><strong>{view.title}</strong><p>{view.focus}</p><p>Sınav, soru pratiği, mini test ve föy kanıtları ilgili bölümlerde seçilebilir. Mini oyun puanı öğrenme etkinliği olarak ayrı gösterilir.</p></div>
    {selectionPending&&<div className="alert info" role="status">Sınav seçimi değişti. Önce Raporu Güncelle'ye basın; gösterilen sınav özeti son hazırlanan seçime aittir. CSV ve PDF güncellemeden sonra kullanılabilir.</div>}
    <div className="section-head"><div><h2>{report.student.first_name} {report.student.last_name}</h2><p>{report.student.institution_name||selectedStudent?.institution_name||''}{report.student.class_name?` · ${report.student.class_name}`:''}{report.restrictedToSubjects?' · Branş yetkisiyle filtrelendi':''}</p></div></div>

    <div className="panel" style={{marginBottom:20}}><div className="panel-head"><div><h2>Raporlanacak sınavlar</h2><p>En fazla 20 sınav seçebilirsiniz. Seçimi değiştirince sınav özetini güncelleyin; diğer çalışma kaynakları kendi bölümlerinden seçilir.</p></div><button className="secondary" onClick={()=>void loadReport()} disabled={!selectedExams.length||busy}><BarChart3 size={16}/> {busy?'Hazırlanıyor…':'Raporu Güncelle'}</button></div><div className="cards-list">{(report.availableExams||[]).map((e:any)=><label className="list-card" key={e.exam_id} style={{alignItems:'center',cursor:'pointer'}}><input type="checkbox" checked={selectedExams.includes(e.exam_id)} disabled={!selectedExams.includes(e.exam_id)&&selectedExams.length>=20} onChange={()=>toggleExam(e.exam_id)}/><div><strong>{e.title}</strong><span>{e.exam_date||'Tarih yok'} · {e.exam_type}</span></div></label>)}</div></div>

    <RubricObservationReport key={`${scopeKey}-rubric`} studentId={studentId} userId={user?.id||''} allowHistory={['SUPER_ADMIN','INSTITUTION_MANAGER','STUDENT','PARENT'].includes(user?.role||'')}/>
    <FrozenExamReport key={scopeKey} studentId={studentId} exams={report.availableExams||[]} selectedExamIds={selectedExams}/>
    <FrozenPracticeReport key={scopeKey} studentId={studentId} exams={report.availableExams||[]} selectedExamIds={selectedExams}/>
    <FrozenFoyGameReport key={`${scopeKey}-foy-game`} studentId={studentId} exams={report.availableExams||[]} selectedExamIds={selectedExams}/>

    {report.summary?<div className="kpi-grid" style={{marginBottom:20}}><Kpi label="Sınav" value={report.summary.exam_count}/><Kpi label="İlk Net" value={fmt(report.summary.first_net)}/><Kpi label="Son Net" value={fmt(report.summary.last_net)}/><Kpi label="Net Değişimi" value={`${report.summary.delta_net>0?'+':''}${fmt(report.summary.delta_net)}`}/><Kpi label="Ortalama Net" value={fmt(report.summary.average_net)}/></div>:<div className="alert info">Bu görünüm branş öğretmeni yetkisiyle sınırlandırılmıştır; toplam sınav neti yerine yalnız yetkili branş verileri gösterilir.</div>}

    <div className="report-grid">
     <div className="panel"><div className="panel-head"><div><h2>Ders gelişimi</h2><p>Seçili sınavlar içindeki ilk ve son net farkı.</p></div><TrendingUp size={20}/></div>{(report.subjectSummary||[]).map((s:any)=><div className="issue-row" key={s.subject_id}><div><strong>{s.subject_name}</strong><span>{s.exam_count} sınav · Ortalama {fmt(s.average_net)}</span></div><div style={{textAlign:'right'}}><strong>{fmt(s.first_net)} → {fmt(s.last_net)}</strong><span className={s.delta_net>=0?'status ok':'status warn'}>{s.delta_net>0?'+':''}{fmt(s.delta_net)}</span></div></div>)}{!report.subjectSummary?.length&&<div className="empty">Ders sonucu bulunmuyor.</div>}</div>
     <div className="panel"><div className="panel-head"><div><h2>Geliştirilecek kazanımlar</h2><p>Tek bir yanlışla değil, en az 3 kanıt üzerinden değerlendirilir.</p></div><Target size={20}/></div>{(report.developing||[]).slice(0,10).map((o:any)=><OutcomeRow key={o.outcome_id} row={o}/>) }{!report.developing?.length&&<div className="empty">Seçili sınavlarda yeterli kanıtla geliştirilecek kazanım bulunmuyor.</div>}</div>
    </div>

    <div className="table-card" style={{marginTop:20}}><div style={{padding:'18px 20px'}}><h2>Sınav geçmişi</h2></div><table><thead><tr><th>Sınav</th><th>Tarih</th>{!report.restrictedToSubjects&&<><th>D/Y/B</th><th>Net</th><th>Başarı</th><th>Kurum Sırası</th></>}</tr></thead><tbody>{(report.exams||[]).map((r:any)=><tr key={r.exam_id}><td><strong>{r.title}</strong><br/><small>{r.exam_type}</small></td><td>{r.exam_date||'—'}</td>{!report.restrictedToSubjects&&<><td>{r.correct_count??'—'} / {r.wrong_count??'—'} / {r.blank_count??'—'}</td><td><strong>{fmt(r.net)}</strong></td><td>{r.success_percent!=null?`%${Number(r.success_percent).toFixed(1)}`:'—'}</td><td>{r.institution_rank||'—'}</td></>}</tr>)}</tbody></table></div>

    <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Güçlü kazanımlar</h2><p>Yeterli kanıt sayısına ulaşan güçlü alanlar.</p></div><UserRound size={20}/></div><div className="cards-list">{(report.strong||[]).slice(0,20).map((o:any)=><OutcomeRow key={o.outcome_id} row={o}/>)}</div>{!report.strong?.length&&<div className="empty">Henüz yeterli kanıt oluşmamış.</div>}</div>
   </>}
 </>;
}

function Kpi({label,value}:{label:string;value:string|number}){return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>}
function OutcomeRow({row}:{row:any}){return <div className="issue-row"><div><strong>{row.subject_name} · {row.title}</strong><span>{row.topic||'Konu'} · {row.correct_count}/{row.evidence_count} doğru</span></div><strong>%{Math.round(Number(row.success_rate||0)*100)}</strong></div>}
function fmt(v:any){return v==null?'—':Number(v).toFixed(2)}
function csvCell(v:string){return `"${String(v??'').replace(/"/g,'""')}"`}
function slug(v:string){return v.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi,'-').replace(/^-|-$/g,'')}
