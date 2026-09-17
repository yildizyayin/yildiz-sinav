import { useEffect, useState } from 'react';
import { Layers3, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';

type Operation='ASSIGN_WORKSHEET'|'CREATE_EXAM_PARTICIPANTS'|'ASSIGN_RECOVERY_RECOMMENDATIONS';

type RecoveryRecommendation={
  classId:string;
  className:string;
  gradeLevel:number;
  section:string;
  studentCount:number;
  state:'READY'|'NO_ACTION'|'INSUFFICIENT_EVIDENCE'|'NO_WORKSHEET'|'ALREADY_ASSIGNED';
  reason:string;
  evidenceCount:number;
  weakOutcomes:Array<{outcomeId:string;outcomeCode?:string|null;outcomeTitle:string;subjectName:string;successRate:number;evidenceCount:number;measuredStudents:number}>;
  worksheet:null|{id:string;title:string;matchedOutcomeCount:number;alreadyAssigned:boolean};
};

type RecoveryPreview={
  policy:{source:string;humanApprovalRequired:boolean;autoAssignment:boolean;minEvidencePerOutcome:number;weaknessThresholdPercent:number;fabricatedIdsAllowed:boolean};
  summary:{classes:number;ready:number;noAction:number;insufficientEvidence:number;noWorksheet:number;alreadyAssigned:number};
  recommendations:RecoveryRecommendation[];
};

function stateLabel(state:RecoveryRecommendation['state']){
  if(state==='READY')return 'Onay bekliyor';
  if(state==='NO_ACTION')return 'Atama gerekmiyor';
  if(state==='INSUFFICIENT_EVIDENCE')return 'Ölçüm gerekli';
  if(state==='NO_WORKSHEET')return 'Föy eşleşmesi yok';
  return 'Zaten atanmış';
}

export function BulkOperations(){
  const { user }=useAuth();
  const [institutions,setInstitutions]=useState<any[]>([]);
  const [institutionId,setInstitutionId]=useState('');
  const [data,setData]=useState<any>({classes:[],worksheets:[],exams:[]});
  const [selected,setSelected]=useState<string[]>([]);
  const [operation,setOperation]=useState<Operation>('ASSIGN_WORKSHEET');
  const [worksheetId,setWorksheetId]=useState('');
  const [examId,setExamId]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [recovery,setRecovery]=useState<RecoveryPreview|null>(null);
  const [approvedRecovery,setApprovedRecovery]=useState<string[]>([]);

  useEffect(()=>{
    if(user?.role==='SUPER_ADMIN')void api<any>('/api/institutions').then(r=>{
      setInstitutions(r.institutions||[]);
      if(r.institutions?.[0])setInstitutionId(r.institutions[0].id);
    });
  },[user?.role]);

  const clearRecovery=()=>{setRecovery(null);setApprovedRecovery([])};

  const load=async()=>{
    setError('');
    try{
      const r=await api<any>(`/api/v2/bulk/options${qs({institutionId:user?.role==='SUPER_ADMIN'?institutionId:null})}`);
      setData(r);
      setSelected([]);
      clearRecovery();
      if(r.worksheets?.[0])setWorksheetId(r.worksheets[0].id);
      if(r.exams?.[0])setExamId(r.exams[0].id);
    }catch(e:any){setError(e.message)}
  };

  useEffect(()=>{if(user?.role!=='SUPER_ADMIN'||institutionId)void load()},[institutionId,user?.role]);

  const toggle=(id:string,on:boolean)=>{
    clearRecovery();
    setSelected(cur=>on?[...new Set([...cur,id])]:cur.filter(x=>x!==id));
  };

  const toggleAll=(on:boolean)=>{
    clearRecovery();
    setSelected(on?data.classes.map((c:any)=>c.id):[]);
  };

  const previewRecovery=async()=>{
    if(!selected.length)return;
    setBusy(true);setError('');setNotice('');
    try{
      const r=await api<RecoveryPreview>('/api/v2/bulk/recovery-preview',{method:'POST',body:JSON.stringify({institutionId:user?.role==='SUPER_ADMIN'?institutionId:undefined,classIds:selected})});
      setRecovery(r);
      setApprovedRecovery(r.recommendations.filter(x=>x.state==='READY').map(x=>x.classId));
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const run=async()=>{
    const targetClassIds=operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'?approvedRecovery:selected;
    if(!targetClassIds.length)return;
    setBusy(true);setError('');setNotice('');
    try{
      const r=await api<any>('/api/v2/bulk/execute',{method:'POST',body:JSON.stringify({
        institutionId:user?.role==='SUPER_ADMIN'?institutionId:undefined,
        operation,
        classIds:targetClassIds,
        worksheetId:operation==='ASSIGN_WORKSHEET'?worksheetId:undefined,
        examId:operation==='CREATE_EXAM_PARTICIPANTS'?examId:undefined,
        dueDate:dueDate||null,
      })});
      if(operation==='ASSIGN_RECOVERY_RECOMMENDATIONS')setNotice(`Nibiru Recovery tamamlandı. ${r.summary.created||0} föy atandı, ${r.summary.skipped||0} mevcut atama korundu.`);
      else setNotice(`İşlem tamamlandı. ${r.summary.created||0} kayıt oluşturuldu, ${r.summary.skipped||0} mevcut kayıt atlandı.`);
      await load();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const changeOperation=(value:Operation)=>{setOperation(value);clearRecovery();setNotice('');setError('')};
  const toggleRecovery=(classId:string,on:boolean)=>setApprovedRecovery(cur=>on?[...new Set([...cur,classId])]:cur.filter(x=>x!==classId));

  return <>
    <div className="page-head">
      <div>
        <span className="eyebrow">Anunex · Toplu İşlemler</span>
        <h1>Sınıf bazlı hızlı operasyon</h1>
        <p>Föy atama, sınav katılımcısı oluşturma ve Nibiru Recovery önerilerini kurum sınırı içinde güvenli biçimde yönetin.</p>
      </div>
      <button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button>
    </div>

    {error&&<div className="alert error">{error}</div>}
    {notice&&<div className="alert success">{notice}</div>}

    <div className="panel">
      <div className="panel-head">
        <div><h2>İşlem seçimi</h2><p>Tüm gerçek işlemler kurum kapsamı ve audit kaydıyla çalışır.</p></div>
        <Layers3/>
      </div>
      <div className="form-grid">
        {user?.role==='SUPER_ADMIN'&&<label>Kurum<select value={institutionId} onChange={e=>{setInstitutionId(e.target.value);clearRecovery()}}>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
        <label>İşlem<select value={operation} onChange={e=>changeOperation(e.target.value as Operation)}>
          <option value="ASSIGN_WORKSHEET">Föy Ata</option>
          <option value="CREATE_EXAM_PARTICIPANTS">Sınav Katılımcılarını Oluştur</option>
          <option value="ASSIGN_RECOVERY_RECOMMENDATIONS">Nibiru Recovery Önerisi</option>
        </select></label>
        {operation==='ASSIGN_WORKSHEET'?<>
          <label>Föy<select value={worksheetId} onChange={e=>setWorksheetId(e.target.value)}>{data.worksheets.map((w:any)=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
          <label>Son tarih<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
        </>:operation==='CREATE_EXAM_PARTICIPANTS'?<label>Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}>{data.exams.map((x:any)=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>:<label>Recovery son tarihi<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}
      </div>
    </div>

    {operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-head">
        <div><h2>Nibiru Recovery güvenlik kuralı</h2><p>Öneri yalnız ölçülmüş kazanım verisinden çıkar. Nibiru kimlik veya kazanım uydurmaz; otomatik atama yapmaz.</p></div>
        <ShieldCheck/>
      </div>
      <p>Bir kazanımın Recovery adayı olması için en az 3 kanıt gerekir ve sınıf başarı oranı %60’ın altında olmalıdır. Eşleşen yayınlanmış föy yoksa sistem bunu açıkça bildirir.</p>
    </div>}

    <div className="table-card" style={{marginTop:16}}>
      <table>
        <thead><tr><th><input type="checkbox" checked={data.classes.length>0&&selected.length===data.classes.length} onChange={e=>toggleAll(e.target.checked)}/></th><th>Sınıf</th><th>Düzey</th><th>Öğrenci</th></tr></thead>
        <tbody>{data.classes.map((c:any)=><tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/></td><td><strong>{c.name}</strong></td><td>{c.grade_level}. sınıf / {c.section}</td><td>{c.student_count}</td></tr>)}</tbody>
      </table>
      {!data.classes.length&&<div className="empty">Aktif sınıf bulunmuyor.</div>}
    </div>

    {operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&recovery&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-head">
        <div><h2>Nibiru Recovery önizlemesi</h2><p>{recovery.summary.ready} sınıf için doğrulanmış föy önerisi hazır. Atama için aşağıdaki seçimleri siz onaylayın.</p></div>
        <Sparkles/>
      </div>
      <div className="table-card">
        <table>
          <thead><tr><th>Onay</th><th>Sınıf</th><th>Durum</th><th>Zayıf kazanımlar</th><th>Önerilen föy</th><th>Gerekçe</th></tr></thead>
          <tbody>{recovery.recommendations.map(rec=><tr key={rec.classId}>
            <td><input type="checkbox" disabled={rec.state!=='READY'} checked={approvedRecovery.includes(rec.classId)} onChange={e=>toggleRecovery(rec.classId,e.target.checked)}/></td>
            <td><strong>{rec.className}</strong><div>{rec.studentCount} öğrenci · {rec.evidenceCount} kanıt</div></td>
            <td>{stateLabel(rec.state)}</td>
            <td>{rec.weakOutcomes.length?rec.weakOutcomes.slice(0,3).map(x=><div key={x.outcomeId}><strong>{x.subjectName}</strong> · %{x.successRate} · {x.outcomeTitle}</div>):'—'}</td>
            <td>{rec.worksheet?<><strong>{rec.worksheet.title}</strong><div>{rec.worksheet.matchedOutcomeCount} kazanım eşleşti</div></>:'—'}</td>
            <td>{rec.reason}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}

    <div style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap'}}>
      {operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&!recovery?<button className="primary" disabled={!selected.length||busy} onClick={()=>void previewRecovery()}>{busy?'Analiz ediliyor…':`Nibiru ile ${selected.length} sınıfı analiz et`}</button>:operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'?<><button className="ghost" disabled={busy} onClick={()=>void previewRecovery()}><RefreshCw size={16}/> Önizlemeyi yenile</button><button className="primary" disabled={!approvedRecovery.length||busy} onClick={()=>void run()}>{busy?'İşleniyor…':`${approvedRecovery.length} Recovery önerisini onayla ve ata`}</button></>:<button className="primary" disabled={!selected.length||busy||(operation==='ASSIGN_WORKSHEET'&&!worksheetId)||(operation==='CREATE_EXAM_PARTICIPANTS'&&!examId)} onClick={()=>void run()}>{busy?'İşleniyor…':`${selected.length} sınıfa uygula`}</button>}
    </div>
  </>;
}
