import { useAuth } from '../auth';

const sourceName = (value: string) => (({EXAM:'Sınav',QUESTION_BANK:'Soru pratiği',MINI_TEST:'Yeni mini test',FOY:'Föy'} as Record<string,string>)[value] || value);

export function FrozenOutcomeFeedback({feedback,groups}:{feedback:any;groups:any[]}) {
 const {user}=useAuth();
 if(feedback?.policy!=='SELECTED_FROZEN_OUTCOME_FORMATIVE_FEEDBACK_V1'||!Array.isArray(feedback.rows))return null;
 const heading=user?.role==='TEACHER'?'Branş için çalışma önerileri':user?.role==='GUIDANCE_TEACHER'?'Öğrenme desteği önerileri':user?.role==='PARENT'?'Birlikte planlanacak çalışmalar':'Öğrenme çıktıları ve sonraki çalışma';
 return <section aria-label="Öğrenme çıktısı geri bildirimi" style={{marginTop:20}}>
  <h3>{heading}</h3>
  <p className="muted">{feedback.message}</p>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Öğrenme çıktısı</th><th>Seçili kanıt</th><th>Sonraki çalışma</th></tr></thead><tbody>
   {feedback.rows.map((row:any)=>{
    const context=groups.find(g=>g.subjectId===row.subjectId&&g.curriculumVersionId===row.curriculumVersionId&&g.academicYear===row.academicYear&&g.gradeLevel===row.gradeLevel&&(g.programVersion??null)===(row.programVersion??null));
    return <tr key={JSON.stringify([row.subjectId,row.curriculumVersionId,row.academicYear,row.gradeLevel,row.programVersion,row.outcomeId])}>
     <td><strong>{row.outcomeCode||row.outcomeId}</strong><br/>{row.outcomeTitle||'Öğrenme çıktısı adı bu kayıtta sabitlenmemiş.'}<br/><small>{context?.subjectName||'Ders adı mevcut değil'} · {row.gradeLevel}. sınıf · {row.academicYear}{row.programVersion?` · ${row.programVersion}`:''}</small>{row.titleConflict&&<div><small>Seçili kayıtlardaki çıktı adları farklı; adı doğrulamak için kaynakları ayrı inceleyin.</small></div>}</td>
     <td>{row.correct} doğru / {row.wrong} yanlış / {row.blank} boş<br/><strong>{row.evidenceCount} soru kanıtı · {row.accuracyPercent==null?'Doğruluk hesaplanamadı':`%${Number(row.accuracyPercent).toFixed(1)} doğruluk`}</strong>{row.invalid>0&&<div><small>{row.invalid} iptal/geçersiz soru doğruluk paydasına katılmadı.</small></div>}{row.sourceBreakdown?.map((part:any,index:number)=><div key={`${part.sourceType}:${index}`}><small>{sourceName(part.sourceType)}: {part.evidenceCount} kanıt</small></div>)}</td>
     <td>{Array.isArray(row.suggestions)&&row.suggestions.map((suggestion:string,index:number)=><p key={index}>{suggestion}</p>)}</td>
    </tr>;
   })}
  </tbody></table></div>
  {!feedback.rows.length&&<div className="empty">Seçili kayıtlarda öğrenme çıktısına bağlanmış sabit soru kanıtı bulunmuyor.</div>}
  {feedback.rows.length>0&&<p><strong>Çalışma sonrası değerlendirme:</strong> Hangi adımı kendi başıma açıklayabiliyorum, hangi adımda destek istiyorum?</p>}
 </section>;
}
