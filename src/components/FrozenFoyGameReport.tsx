import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api';

type Row = { id:string; completedAt:string; gameCode?:string; score?:number; contextValid?:number };
type Source = 'FOY'|'MINI_GAME';

function useFrozenActivitySelection(studentId:string,year:string,source:Source,maximum:number){
 const scope=JSON.stringify([studentId,year,source]);
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<string[]>([]),[loadedScope,setLoadedScope]=useState('');
 const [restricted,setRestricted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>{generation.current++;setRows([]);setSelected([]);setLoadedScope('');setRestricted(false);setBusy(false);setError('')},[scope]);
 useEffect(()=>()=>{generation.current++},[]);
 const loaded=loadedScope===scope;
 const load=async()=>{
  const requestScope=scope,attempt=++generation.current;setBusy(true);setError('');setSelected([]);setLoadedScope('');
  try{
   const path=source==='FOY'?'foy-runs':'game-sessions';
   const result=await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/${path}${qs({academicYear:year})}`);
   if(scopeRef.current!==requestScope||generation.current!==attempt)return;
   const raw=source==='FOY'?result.runs:result.sessions;
   const next:Array<Row>=Array.isArray(raw)?raw.filter((row:any)=>typeof row?.id==='string'&&row.id.length>0&&row.id.length<=100&&typeof row.completedAt==='string').slice(0,100):[];
   setRows(next);setLoadedScope(requestScope);setRestricted(Boolean(result.restrictedToSubjects));
  }catch(e:any){if(scopeRef.current===requestScope&&generation.current===attempt)setError(e.message||'Kayıtlar alınamadı.')}
  finally{if(scopeRef.current===requestScope&&generation.current===attempt)setBusy(false)}
 };
 const toggle=(id:string)=>setSelected(previous=>previous.includes(id)?previous.filter(value=>value!==id):previous.length<maximum?[...previous,id]:previous);
 return{rows:loaded?rows:[],selected:loaded?selected:[],loaded,restricted:loaded&&restricted,busy,error,load,toggle,maximum};
}

function Selector({title,selection,valid,source}:{title:string;selection:ReturnType<typeof useFrozenActivitySelection>;valid:boolean;source:Source}){
 return <div style={{marginTop:16}}>
  <h3>{title}</h3>
  <button className="secondary" onClick={()=>void selection.load()} disabled={!valid||selection.busy}>{selection.busy?'Yükleniyor…':title+' Kayıtlarını Yükle'}</button>
  {selection.error&&<div className="alert error" role="alert">{selection.error}</div>}
  {selection.restricted&&<div className="alert info">Yalnız yetkili branşınızdaki kayıtlar gösteriliyor.</div>}
  {selection.loaded&&<>
   <p>{selection.selected.length} kayıt seçili · En fazla {selection.maximum} kayıt.</p>
   <div className="cards-list">{selection.rows.map((row,index)=><label className="list-card" key={row.id} style={{alignItems:'center',cursor:'pointer'}}>
    <input type="checkbox" checked={selection.selected.includes(row.id)} disabled={!selection.selected.includes(row.id)&&selection.selected.length>=selection.maximum} onChange={()=>selection.toggle(row.id)}/>
    <div><strong>{source==='FOY'?`Föy çözümü ${index+1}`:(row.gameCode||`Mini oyun ${index+1}`)}</strong><span>{new Date(row.completedAt).toLocaleString('tr-TR')}{source==='MINI_GAME'&&Number.isFinite(Number(row.score))?` · Puan ${Number(row.score).toFixed(0)}`:''}</span></div>
   </label>)}</div>
   {!selection.rows.length&&<div className="empty">Bu eğitim yılında rapora uygun {source==='FOY'?'föy çözümü':'mini oyun oturumu'} bulunmuyor.</div>}
  </>}
 </div>;
}

export function FrozenFoyGameReport({studentId,exams=[],selectedExamIds=[]}:{studentId:string;exams?:any[];selectedExamIds?:string[]}){
 const years=useMemo(()=>[...new Set(exams.map(e=>e.academic_year).filter(y=>typeof y==='string'&&/^\d{4}-\d{4}$/.test(y)))].sort().reverse() as string[],[exams]);
 const [year,setYear]=useState(''),[includeExams,setIncludeExams]=useState(false),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const chosenYear=year||years[0]||'',validYear=/^\d{4}-\d{4}$/.test(chosenYear)&&Number(chosenYear.slice(5))===Number(chosenYear.slice(0,4))+1;
 const foy=useFrozenActivitySelection(studentId,chosenYear,'FOY',50),games=useFrozenActivitySelection(studentId,chosenYear,'MINI_GAME',100);
 const examIds=[...new Set(selectedExamIds.filter(id=>exams.some(e=>e.exam_id===id&&e.academic_year===chosenYear)))].sort();
 const scope=JSON.stringify([studentId,chosenYear]),key=JSON.stringify([scope,[...foy.selected].sort(),[...games.selected].sort(),includeExams,examIds]);
 const keyRef=useRef(key),generation=useRef(0);keyRef.current=key;
 useEffect(()=>{generation.current++;setData(null);setError('');setBusy(false);setIncludeExams(false)},[scope]);
 useEffect(()=>{generation.current++;setData(null);setError('');setBusy(false)},[key]);
 useEffect(()=>()=>{generation.current++},[]);
 const hasSelection=foy.selected.length>0||games.selected.length>0||(includeExams&&examIds.length>0);
 const load=async()=>{
  const requestKey=key,attempt=++generation.current;setBusy(true);setError('');setData(null);
  try{
   const result=await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/frozen-expanded${qs({academicYear:chosenYear,foyRunIds:foy.selected.length?foy.selected.join(','):null,gameSessionIds:games.selected.length?games.selected.join(','):null,examIds:includeExams&&examIds.length?examIds.join(','):null})}`);
   if(keyRef.current===requestKey&&generation.current===attempt)setData({key:requestKey,result});
  }catch(e:any){if(keyRef.current===requestKey&&generation.current===attempt)setError(e.message||'Föy ve mini oyun karnesi hazırlanamadı.')}
  finally{if(keyRef.current===requestKey&&generation.current===attempt)setBusy(false)}
 };
 const result=data?.key===key?data.result:null;
 return <section className="panel" style={{marginBottom:20}} aria-label="Föy ve mini oyun karnesi">
  <div className="panel-head"><div><h2>Föy ve mini oyun karnesi</h2><p>Föy doğruluğunu dondurulmuş soru kanıtıyla izleyin. Mini oyun puanı sınav başarısına çevrilmez; ayrı etkinlik metriği olarak gösterilir.</p></div></div>
  <div className="form-grid"><label>Eğitim yılı<input value={chosenYear} onChange={e=>setYear(e.target.value)} placeholder="2026-2027" list="foy-game-report-years"/><datalist id="foy-game-report-years">{years.map(value=><option key={value} value={value}/>)}</datalist></label></div>
  <Selector title="Föy" selection={foy} valid={Boolean(studentId)&&validYear} source="FOY"/>
  <Selector title="Mini oyun" selection={games} valid={Boolean(studentId)&&validYear} source="MINI_GAME"/>
  <label><input type="checkbox" checked={includeExams} onChange={e=>setIncludeExams(e.target.checked)}/> Üstte seçili, bu eğitim yılındaki {examIds.length} sınavı föy doğruluğuyla karşılaştır</label>
  <div style={{marginTop:16}}><button className="secondary" disabled={busy||!studentId||!validYear||!hasSelection||(includeExams&&examIds.length>20)} onClick={()=>void load()}>{busy?'Hazırlanıyor…':'Föy ve Oyun Karnesini Hazırla'}</button></div>
  <p className="muted">Föy kanıtı yalnız çözüm anında dondurulmuş doğrulanmış program bağlamından hesaplanır. Mini oyun puanı doğru/yanlış/boş toplamına katılmaz. Yazdır / PDF ile bu görünüm de çıktıya dahil edilir.</p>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {result&&<>
   <div className="alert info">{result.message}</div>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Ders</th><th>Sınıf</th><th>Doğru / Yanlış / Boş</th><th>Kanıt</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups||[]).map((group:any)=><tr key={JSON.stringify([group.subjectId,group.curriculumVersionId,group.academicYear,group.gradeLevel,group.programVersion])}><td>{group.subjectName||'Ders adı mevcut değil'}{group.programVersion&&<><br/><small>{group.programVersion}</small></>}</td><td>{group.gradeLevel}</td><td>{group.correct} / {group.wrong} / {group.blank}</td><td>{group.evidenceCount}{group.sourceBreakdown?.map((part:any)=><div key={part.sourceType}><small>{part.sourceType==='FOY'?'Föy':part.sourceType==='EXAM'?'Sınav':part.sourceType}: {part.evidenceCount}</small></div>)}</td><td>{group.accuracyPercent===null?'—':`%${Number(group.accuracyPercent).toFixed(1)}`}</td></tr>)}</tbody></table></div>
   {!result.groups?.length&&<div className="empty">Seçili föy/sınav kapsamında doğrulanmış doğruluk kanıtı bulunmuyor.</div>}
   {result.gameActivity&&<div style={{marginTop:16}}><h3>Mini oyun etkinliği</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Ders</th><th>Sınıf</th><th>Oturum</th><th>Ortalama oyun puanı</th><th>XP</th><th>Süre</th></tr></thead><tbody>{(result.gameActivity.groups||[]).map((group:any)=><tr key={JSON.stringify([group.subjectId,group.curriculumVersionId,group.academicYear,group.gradeLevel,group.programVersion])}><td>{group.subjectName||'Ders adı mevcut değil'}</td><td>{group.gradeLevel}</td><td>{group.sessionCount}</td><td>{group.averageScore==null?'—':Number(group.averageScore).toFixed(1)}</td><td>{group.totalXp}</td><td>{group.totalDurationSeconds} sn</td></tr>)}</tbody></table></div>{!result.gameActivity.groups?.length&&<div className="empty">Seçili mini oyunlarda doğrulanmış program bağlamı bulunmuyor.</div>}</div>}
  </>}
 </section>;
}
