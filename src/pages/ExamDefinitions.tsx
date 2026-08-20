import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Plus, RefreshCw, Save, Send } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';

type ExamRow = any;
type SubjectConfig = { subjectId: string; questionCount: number; wrongDivisor: number; sortOrder: number };
type KeyEntry = { subjectId: string; bookletCode: string; answers: string };
type OutcomeMap = { subjectId: string; questionNo: number; outcomeId: string };

export function ExamDefinitions() {
  const { user } = useAuth();
  const [options,setOptions]=useState<any>({subjects:[],scoringVersions:[],institutions:[],outcomes:[]});
  const [rows,setRows]=useState<ExamRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [detail,setDetail]=useState<any>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  const [createForm,setCreateForm]=useState({
    ownerType: user?.role==='SUPER_ADMIN' ? 'CENTRAL' : 'INSTITUTION', institutionId:'inst_demo', academicYear:'2026-2027', title:'', examType:'KURUM', gradeLevel:'7', examDate:'', scoringRuleVersionId:'srv_demo',
  });
  const [booklets,setBooklets]=useState('A,B');
  const [subjects,setSubjects]=useState<SubjectConfig[]>([]);
  const [keyEntries,setKeyEntries]=useState<KeyEntry[]>([]);
  const [outcomeMappings,setOutcomeMappings]=useState<OutcomeMap[]>([]);
  const [assignedInstitutions,setAssignedInstitutions]=useState<string[]>([]);

  const loadOptions=async(gradeLevel?:number)=>{
    const data=await api<any>(`/api/exam-definitions/options${qs({gradeLevel:gradeLevel||null})}`);
    setOptions(data);
    if(!createForm.scoringRuleVersionId && data.scoringVersions?.[0]?.id) setCreateForm(f=>({...f,scoringRuleVersionId:data.scoringVersions[0].id}));
  };
  const loadRows=async()=>{const data=await api<any>('/api/exam-definitions');setRows(data.exams||[])};
  const loadDetail=async(id:string)=>{
    if(!id){setDetail(null);return}
    const data=await api<any>(`/api/exam-definitions/${id}`); setDetail(data);
    setBooklets((data.booklets||[]).map((b:any)=>b.code).join(','));
    setSubjects((data.subjects||[]).map((s:any)=>({subjectId:s.subject_id,questionCount:Number(s.question_count),wrongDivisor:Number(s.wrong_divisor),sortOrder:Number(s.sort_order)})));
    const entries:KeyEntry[]=[];
    for(const s of data.subjects||[]) for(const b of data.booklets||[]){
      const chars=(data.answerKey||[]).filter((x:any)=>x.subject_id===s.subject_id&&x.booklet_code===b.code).sort((a:any,b:any)=>a.question_no-b.question_no).map((x:any)=>x.correct_answer||'').join('');
      entries.push({subjectId:s.subject_id,bookletCode:b.code,answers:chars});
    }
    setKeyEntries(entries);
    const maps:OutcomeMap[]=[]; const seen=new Set<string>();
    for(const r of data.answerKey||[]){
      for(const outcomeId of String(r.outcome_ids||'').split(',').filter(Boolean)){
        const k=`${r.subject_id}:${r.question_no}:${outcomeId}`; if(seen.has(k))continue;seen.add(k);
        maps.push({subjectId:r.subject_id,questionNo:Number(r.question_no),outcomeId});
      }
    }
    setOutcomeMappings(maps);
    setAssignedInstitutions((data.institutions||[]).filter((x:any)=>x.enabled).map((x:any)=>x.institution_id));
    await loadOptions(Number(data.exam.grade_level)||undefined);
  };

  useEffect(()=>{void Promise.all([loadRows(),loadOptions()]).catch(e=>setError(e.message))},[]);
  useEffect(()=>{if(selectedId)void loadDetail(selectedId).catch(e=>setError(e.message))},[selectedId]);

  const selectedSubjectIds=useMemo(()=>new Set(subjects.map(s=>s.subjectId)),[subjects]);

  const createExam=async()=>{
    setBusy(true);setError('');setNotice('');
    try{
      const r=await api<any>('/api/exam-definitions',{method:'POST',body:JSON.stringify({
        ownerType:createForm.ownerType,
        institutionId:createForm.ownerType==='INSTITUTION'?createForm.institutionId:null,
        academicYear:createForm.academicYear,title:createForm.title,examType:createForm.examType,
        gradeLevel:createForm.gradeLevel?Number(createForm.gradeLevel):null,examDate:createForm.examDate||null,
        scoringRuleVersionId:createForm.scoringRuleVersionId||null,
      })});
      setNotice('Sınav taslağı oluşturuldu. Şimdi ders, kitapçık ve cevap anahtarını tamamlayın.');
      setCreateForm(f=>({...f,title:''})); await loadRows(); setSelectedId(r.id);
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const toggleSubject=(subjectId:string,checked:boolean)=>{
    setSubjects(current=>checked
      ? [...current,{subjectId,questionCount:20,wrongDivisor:4,sortOrder:current.length+1}]
      : current.filter(s=>s.subjectId!==subjectId).map((s,i)=>({...s,sortOrder:i+1})));
  };
  const patchSubject=(subjectId:string,patch:Partial<SubjectConfig>)=>setSubjects(current=>current.map(s=>s.subjectId===subjectId?{...s,...patch}:s));

  const saveStructure=async()=>{
    if(!selectedId)return;setBusy(true);setError('');setNotice('');
    try{
      await api(`/api/exam-definitions/${selectedId}/structure`,{method:'PUT',body:JSON.stringify({booklets:booklets.split(',').map(x=>x.trim()),subjects})});
      setNotice('Ders, soru sayısı ve kitapçık yapısı kaydedildi.');await loadDetail(selectedId);await loadRows();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const setKey=(subjectId:string,bookletCode:string,answers:string)=>setKeyEntries(current=>{
    const next=current.filter(x=>!(x.subjectId===subjectId&&x.bookletCode===bookletCode));
    next.push({subjectId,bookletCode,answers:answers.toUpperCase().replace(/\s+/g,'')});return next;
  });

  const setOutcome=(subjectId:string,questionNo:number,outcomeId:string)=>setOutcomeMappings(current=>{
    const next=current.filter(x=>!(x.subjectId===subjectId&&x.questionNo===questionNo));
    if(outcomeId)next.push({subjectId,questionNo,outcomeId});return next;
  });

  const saveAnswerKey=async()=>{
    if(!selectedId)return;setBusy(true);setError('');setNotice('');
    try{
      await api(`/api/exam-definitions/${selectedId}/answer-key`,{method:'PUT',body:JSON.stringify({entries:keyEntries,outcomeMappings})});
      setNotice('Cevap anahtarı ve kazanım eşleştirmeleri kaydedildi.');await loadDetail(selectedId);await loadRows();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const saveInstitutions=async()=>{
    if(!selectedId)return;setBusy(true);setError('');setNotice('');
    try{await api(`/api/exam-definitions/${selectedId}/institutions`,{method:'PUT',body:JSON.stringify({institutionIds:assignedInstitutions})});setNotice('Merkezi sınavın kurum dağıtımı kaydedildi.');await loadDetail(selectedId);await loadRows()}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const publish=async()=>{
    if(!selectedId)return;if(!confirm('Sınav ACTIVE durumuna alınsın mı? Aktif olduktan sonra soru yapısı ve cevap anahtarı kilitlenir.'))return;
    setBusy(true);setError('');setNotice('');
    try{await api(`/api/exam-definitions/${selectedId}/status`,{method:'PATCH',body:JSON.stringify({status:'ACTIVE'})});setNotice('Sınav yayınlandı ve değerlendirmeye açıldı.');await loadDetail(selectedId);await loadRows()}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Sınav Tanımlama Merkezi</span><h1>Sınavı bir kez tanımla, değerlendirmede tekrar sorma</h1><p>Dersler, soru sayıları, kitapçıklar, cevap anahtarı, kazanımlar ve kurum dağıtımı sınav kaydına bağlanır.</p></div><button className="ghost" onClick={()=>void loadRows()}><RefreshCw size={16}/> Yenile</button></div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

    <div className="table-card" style={{marginBottom:20}}><div style={{padding:20}}><h2>Yeni sınav taslağı</h2><div className="form-grid">
      {user?.role==='SUPER_ADMIN'&&<label>Sahiplik<select value={createForm.ownerType} onChange={e=>setCreateForm(f=>({...f,ownerType:e.target.value}))}><option value="CENTRAL">Merkezi Sınav</option><option value="INSTITUTION">Kuruma Özel</option></select></label>}
      {user?.role==='SUPER_ADMIN'&&createForm.ownerType==='INSTITUTION'&&<label>Kurum<select value={createForm.institutionId} onChange={e=>setCreateForm(f=>({...f,institutionId:e.target.value}))}>{options.institutions?.map((i:any)=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      <label>Sınav adı<input value={createForm.title} onChange={e=>setCreateForm(f=>({...f,title:e.target.value}))} placeholder="Örn. Türkiye Geneli LGS-01"/></label>
      <label>Eğitim yılı<input value={createForm.academicYear} onChange={e=>setCreateForm(f=>({...f,academicYear:e.target.value}))}/></label>
      <label>Sınav türü<input value={createForm.examType} onChange={e=>setCreateForm(f=>({...f,examType:e.target.value}))} placeholder="LGS / TYT / AYT / KURUM"/></label>
      <label>Sınıf<input type="number" min="1" max="12" value={createForm.gradeLevel} onChange={e=>setCreateForm(f=>({...f,gradeLevel:e.target.value}))}/></label>
      <label>Tarih<input type="date" value={createForm.examDate} onChange={e=>setCreateForm(f=>({...f,examDate:e.target.value}))}/></label>
      <label>Puanlama<select value={createForm.scoringRuleVersionId} onChange={e=>setCreateForm(f=>({...f,scoringRuleVersionId:e.target.value}))}><option value="">Seçiniz</option>{options.scoringVersions?.map((s:any)=><option key={s.id} value={s.id}>{s.rule_name} · {s.academic_year} {s.version}{s.verified?' · Doğrulandı':' · Tanım gerekli'}</option>)}</select></label>
    </div><button className="primary" disabled={busy||!createForm.title} onClick={createExam}><Plus size={17}/> Taslak Oluştur</button></div></div>

    <div className="table-card" style={{marginBottom:20}}><table><thead><tr><th>Sınav</th><th>Tür</th><th>Durum</th><th>Ders/Soru</th><th>Kitapçık</th><th>Cevap</th><th>Kazanım</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.title}</strong><br/><small>{r.academic_year}{r.institution_name?` · ${r.institution_name}`:''}</small></td><td>{r.owner_type==='CENTRAL'?'Merkezi':'Kurum'} · {r.exam_type}</td><td><span className={`status ${r.status==='ACTIVE'?'ok':'neutral'}`}>{r.status}</span></td><td>{r.subject_count} / {r.question_count}</td><td>{r.booklet_count}</td><td>{r.answer_count}</td><td>{r.outcome_mapped_count}</td><td><button className="ghost" onClick={()=>setSelectedId(r.id)}>Düzenle</button></td></tr>)}</tbody></table></div>

    {detail&&<>
      <div className="section-head"><div><h2>{detail.exam.title}</h2><p>{detail.exam.status==='DRAFT'?'Taslak yapılandırması':'Sınav yapısı kilitli'} · {detail.exam.exam_type} · {detail.exam.grade_level?`${detail.exam.grade_level}. sınıf`:''}</p></div>{detail.readiness?.ready_to_publish&&detail.exam.status==='DRAFT'&&<button className="primary" disabled={busy} onClick={publish}><Send size={17}/> Sınavı Yayınla</button>}</div>
      <div className="kpi-grid" style={{marginBottom:20}}>
        <div className="kpi-card"><span>Soru</span><strong>{detail.readiness?.actual_questions||0}/{detail.readiness?.expected_questions||0}</strong></div>
        <div className="kpi-card"><span>Cevap Anahtarı</span><strong>{detail.readiness?.actual_answers||0}/{detail.readiness?.expected_answers||0}</strong></div>
        <div className="kpi-card"><span>Kazanım Eşleşen</span><strong>{detail.readiness?.outcome_mapped_questions||0}</strong></div>
        <div className="kpi-card"><span>Yayın Durumu</span><strong>{detail.readiness?.ready_to_publish?'Hazır':'Eksik'}</strong></div>
      </div>
      {detail.exam.status==='DRAFT'&&<>
        <div className="table-card" style={{marginBottom:20}}><div style={{padding:20}}><h2>1. Dersler ve kitapçıklar</h2><label>Kitapçık kodları (virgülle)<input value={booklets} onChange={e=>setBooklets(e.target.value)} placeholder="A,B veya A,B,C,D"/></label><div className="cards-list" style={{marginTop:12}}>{options.subjects?.map((s:any)=>{const cfg=subjects.find(x=>x.subjectId===s.id);return <div className="list-card" key={s.id} style={{alignItems:'center'}}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={e=>toggleSubject(s.id,e.target.checked)}/><div style={{flex:1}}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg&&<><label className="compact-field">Soru<input type="number" min="1" max="200" value={cfg.questionCount} onChange={e=>patchSubject(s.id,{questionCount:Number(e.target.value)})}/></label><label className="compact-field">Yanlış götürme<input type="number" min="1" max="20" step="0.5" value={cfg.wrongDivisor} onChange={e=>patchSubject(s.id,{wrongDivisor:Number(e.target.value)})}/></label></>}</div>})}</div><button className="primary" disabled={busy} onClick={saveStructure}><Save size={17}/> Yapıyı Kaydet</button></div></div>

        {!!detail.subjects?.length&&!!detail.booklets?.length&&<div className="table-card" style={{marginBottom:20}}><div style={{padding:20}}><h2>2. Cevap anahtarı ve kazanımlar</h2><p>Her kitapçık için soru sayısı kadar cevap girin. Boşluklar otomatik temizlenir.</p>{detail.subjects.map((s:any)=><div key={s.subject_id} style={{margin:'18px 0',padding:'16px',border:'1px solid var(--border, #e5e7eb)',borderRadius:12}}><h3>{s.name} · {s.question_count} soru</h3><div className="form-grid">{detail.booklets.map((b:any)=>{const current=keyEntries.find(x=>x.subjectId===s.subject_id&&x.bookletCode===b.code)?.answers||'';return <label key={b.code}>{b.code} kitapçığı cevapları<input value={current} maxLength={Number(s.question_count)} onChange={e=>setKey(s.subject_id,b.code,e.target.value)} placeholder={'A'.repeat(Math.min(Number(s.question_count),20))}/><small>{current.length}/{s.question_count}</small></label>})}</div><details><summary>Kazanım eşleştirmeleri</summary><div className="table-card" style={{marginTop:10}}><table><thead><tr><th>Soru</th><th>Kazanım</th></tr></thead><tbody>{Array.from({length:Number(s.question_count)},(_,i)=>i+1).map(q=>{const current=outcomeMappings.find(x=>x.subjectId===s.subject_id&&x.questionNo===q)?.outcomeId||'';const outs=(options.outcomes||[]).filter((o:any)=>o.subject_id===s.subject_id);return <tr key={q}><td>{q}</td><td><select value={current} onChange={e=>setOutcome(s.subject_id,q,e.target.value)}><option value="">Eşleştirilmedi</option>{outs.map((o:any)=><option key={o.id} value={o.id}>{o.topic?`${o.topic} · `:''}{o.title}</option>)}</select></td></tr>})}</tbody></table></div></details></div>)}<button className="primary" disabled={busy} onClick={saveAnswerKey}><Save size={17}/> Cevap Anahtarını Kaydet</button></div></div>}

        {user?.role==='SUPER_ADMIN'&&detail.exam.owner_type==='CENTRAL'&&<div className="table-card" style={{marginBottom:20}}><div style={{padding:20}}><h2>3. Kurumlara aç</h2><p>Merkezi sınav yalnız burada seçtiğiniz kurumların sınav listesinde görünür.</p><div className="cards-list">{options.institutions?.map((i:any)=><label className="list-card" key={i.id}><input type="checkbox" checked={assignedInstitutions.includes(i.id)} onChange={e=>setAssignedInstitutions(cur=>e.target.checked?[...cur,i.id]:cur.filter(x=>x!==i.id))}/><div><strong>{i.name}</strong><span>{i.code} · {i.status}</span></div></label>)}</div><button className="primary" disabled={busy} onClick={saveInstitutions}><Save size={17}/> Kurum Dağıtımını Kaydet</button></div></div>}
      </>}
      <div className={`alert ${detail.readiness?.ready_to_publish?'success':'error'}`}>{detail.readiness?.ready_to_publish?<><CheckCircle2 size={17}/> Sınav yayınlanmaya hazır.</>:<><CircleAlert size={17}/> Yayınlamak için ders/kitapçık, tam cevap anahtarı ve doğrulanmış puanlama kuralı gereklidir.</>}</div>
    </>}
  </>;
}
