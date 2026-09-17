import type { AuthUser, Env } from '../types';
import { all, one } from './db';

function todayIso(){return new Date().toISOString().slice(0,10)}

export async function worksheetAdvice(env:Env,user:AuthUser){
  if(!user.institution_id)return null;
  let classIds:string[]=[];let subjectIds:string[]=[];
  if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'){
    const assignments=await all<any>(env.DB.prepare(`SELECT DISTINCT class_id,subject_id FROM teacher_assignments WHERE user_id=? AND active=1 AND class_id IS NOT NULL`).bind(user.id));
    classIds=[...new Set(assignments.map(x=>x.class_id).filter(Boolean))];
    if(user.role==='TEACHER')subjectIds=[...new Set(assignments.map(x=>x.subject_id).filter(Boolean))];
  }
  const classFilter=classIds.length?`AND (ce.class_id IS NULL OR ce.class_id IN (${classIds.map(()=>'?').join(',')}))`:'';
  const subjectFilter=subjectIds.length?`AND EXISTS(SELECT 1 FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id AND ws.subject_id IN (${subjectIds.map(()=>'?').join(',')}))`:'';
  const entries=await all<any>(env.DB.prepare(`SELECT ce.id,ce.planned_date,ce.actual_date,ce.status,w.id worksheet_id,w.title,w.sequence_no,w.grade_level,w.track,c.name class_name,(SELECT group_concat(DISTINCT s.name) FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects,(SELECT group_concat(DISTINCT o.title) FROM worksheet_outcomes wo JOIN outcomes o ON o.id=wo.outcome_id WHERE wo.worksheet_id=w.id) outcomes FROM worksheet_calendar_entries ce JOIN worksheets w ON w.id=ce.worksheet_id LEFT JOIN classes c ON c.id=ce.class_id WHERE w.status='PUBLISHED' AND (ce.institution_id=? OR ce.institution_id IS NULL) AND ce.status IN ('PLANNED','ASSIGNED') AND ce.planned_date>=date('now','-2 day') AND ce.planned_date<=date('now','+10 day') ${classFilter} ${subjectFilter} ORDER BY ce.planned_date,w.sequence_no LIMIT 8`).bind(user.institution_id,...classIds,...subjectIds));
  if(!entries.length)return `🤖 Nibiru: ${todayIso()} için yetki alanınızda yakın tarihli planlanmış bir föy görünmüyor. Föy Takvimi sekmesinden yıllık planı kontrol edebilirsiniz.`;
  const first=entries[0];
  const weak=classIds.length?await all<any>(env.DB.prepare(`SELECT s.name subject_name,o.title,round(avg(r.success_rate),1) avg_success FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id JOIN student_enrollments se ON se.student_id=r.student_id AND se.status='ACTIVE' WHERE se.class_id IN (${classIds.map(()=>'?').join(',')}) ${subjectIds.length?`AND o.subject_id IN (${subjectIds.map(()=>'?').join(',')})`:''} GROUP BY o.id,o.title,s.name ORDER BY avg_success ASC LIMIT 3`).bind(...classIds,...subjectIds)):[];
  const schedule=`${first.planned_date}: Föy ${first.sequence_no} – ${first.title}${first.class_name?` (${first.class_name})`:''}`;
  const outcomes=first.outcomes?String(first.outcomes).split(',').slice(0,3).join(', '):'kazanım eşleşmesi bekleniyor';
  const weakText=weak.length?` Son ölçümlerde ayrıca ${weak.map(x=>`${x.subject_name} – ${x.title} (%${x.avg_success})`).join('; ')} alanları gelişime açık görünüyor.`:'';
  return `🤖 Nibiru: Takvime göre sıradaki uygulama ${schedule}. İlgili kazanımlar: ${outcomes}.${weakText} Takvim ile ölçme sonuçları çelişirse önce gelişime açık kazanımı kısa pekiştirip ardından planlanan föye geçmenizi öneririm.`;
}

export async function institutionTodaySummary(env:Env,user:AuthUser){
  if(!user.institution_id||user.role!=='INSTITUTION_MANAGER')return null;
  const [exams,scans,announcements,worksheets]=await Promise.all([
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.id) c FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE date(e.exam_date)=date('now') AND (e.institution_id=? OR ei.enabled=1)`).bind(user.institution_id,user.institution_id)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE institution_id=? AND date(created_at)=date('now')`).bind(user.institution_id)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM announcements WHERE institution_id=? AND date(coalesce(sent_at,created_at))=date('now')`).bind(user.institution_id)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheet_calendar_entries WHERE institution_id=? AND planned_date=date('now')`).bind(user.institution_id)),
  ]);
  return `🤖 Nibiru: Bugün kurumunuzda ${exams?.c||0} sınav, ${scans?.c||0} optik işlem grubu, ${announcements?.c||0} duyuru ve ${worksheets?.c||0} planlı föy kaydı görünüyor.`;
}
