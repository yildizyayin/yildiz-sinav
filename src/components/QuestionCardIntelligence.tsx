import {useEffect,useState} from 'react';
import {api} from '../api';
const safeUrl=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:undefined}catch{return undefined}};
export function QuestionCardIntelligence({questionId,revision}:{questionId:string;revision?:number}){
 const [state,setState]=useState<{id:string;data?:any;error?:string}>({id:''});
 useEffect(()=>{let active=true;setState({id:questionId});api<any>(`/api/question-bank-standard/${encodeURIComponent(questionId)}/intelligence`).then(data=>{if(active)setState({id:questionId,data})}).catch(e=>{if(active)setState({id:questionId,error:e.message||'Kaynak bilgileri alınamadı.'})});return()=>{active=false}},[questionId,revision]);
 const data=state.id===questionId?state.data:null;
 return <section className="solution-preview" aria-label="Kazanım ve sınav geçmişi"><h3>Kazanım ve sınav geçmişi</h3>{state.id===questionId&&state.error?<p role="alert">{state.error}</p>:!data?<p role="status">Kaynaklı bilgiler yükleniyor…</p>:<>
 {data.revision!==revision&&revision!==undefined&&<p role="alert">Soru sürümü değişti. Güncel soruyu yeniden açın.</p>}
 <h4>Doğrulanmış ana kazanımlar</h4>{data.outcomes.length?data.outcomes.map((o:any)=><p key={o.id}><b>{o.code} · {o.title}</b><br/>{o.grade_level}. sınıf · {o.program_version}{safeUrl(o.source_url)&&<> · <a href={safeUrl(o.source_url)} target="_blank" rel="noreferrer">Resmî kaynak</a></>}</p>):<p>Bu soru bağlamında doğrulanmış kazanım bağlantısı bulunamadı.</p>}
 <h4>Önceki sınıf ve ön öğrenmeler</h4>{data.priorLearning.references.length?<ul>{data.priorLearning.references.map((r:string,i:number)=><li key={i}>{r}</li>)}</ul>:<p>Ön öğrenme bağlantısı henüz eklenmemiş.</p>}<small>{data.priorLearning.note}</small>
 <h4>Zorluk</h4><p>{data.difficulty.level??'—'} / 6 · Editoryal tahmin. Öğrenci yanıtlarıyla ölçülmüş zorluk henüz yok.</p>
 <h4>Son beş yıl · {data.history.fromYear}–{data.history.toYear}</h4><table><thead><tr><th>Sınav</th><th>Gözlenen kayıt</th><th>Yıl bazında</th></tr></thead><tbody>{data.history.families.map((f:any)=><tr key={f.family}><th scope="row">{f.family}</th><td>{f.observedQuestionCount??'Veri yok'}</td><td>{f.perYear.map((y:any)=>`${y.year}: ${y.count??'doğrulanmış kayıt yok'}`).join(' · ')}</td></tr>)}</tbody></table><p>{data.history.note}</p>{data.history.truncated&&<p>Gösterim sınırı aşıldı; sayılar yalnız getirilen kayıtların alt sınırıdır.</p>}
 {data.history.facts.length>0&&<details><summary>Sınav ve kaynak kanıtları</summary><ul>{data.history.facts.map((f:any,i:number)=><li key={i}>{f.exam_year} {f.exam_family} · {f.session_code} · {f.subject_name} · Soru {f.question_no}{safeUrl(f.document_url||f.landing_url)&&<> · <a href={safeUrl(f.document_url||f.landing_url)} target="_blank" rel="noreferrer">Kaynak</a></>}</li>)}</ul></details>}
 <h4>Sınavda çıkma olasılığı</h4><p>{data.prediction.note}</p><small>Bilgiler güncel kayıtlardan okunur. Boş alanlar tahminle doldurulmaz.</small>
 </>}</section>;
}
