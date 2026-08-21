import type { AuthUser, Env } from '../types';
import { all, one, uuid } from './db';

export type NibiruIntent =
  | 'GREETING'
  | 'HELP'
  | 'STUDENT_GENERAL'
  | 'LATEST_EXAM'
  | 'TODAY_PLAN'
  | 'WEAK_OUTCOMES'
  | 'CLASS_SUMMARY'
  | 'INSTITUTION_SUMMARY'
  | 'TODAY_STATUS'
  | 'SENSITIVE_LABEL'
  | 'PSYCHOLOGICAL_MEDICAL'
  | 'GENERAL_ACADEMIC'
  | 'OUT_OF_SCOPE'
  | 'UNKNOWN';

export type NibiruResult = {
  answer: string;
  intent: NibiruIntent;
  studentId: string | null;
  examId: string | null;
  outcome: 'ANSWERED' | 'REDIRECTED' | 'DENIED' | 'ERROR';
};

const AI_PREFIX = '🤖 Nibiru:';

function lower(value: string) {
  return value.toLocaleLowerCase('tr-TR').trim();
}

export function detectNibiruIntent(message: string, previous?: string | null): NibiruIntent {
  const m = lower(message);
  if (!m) return 'HELP';
  if (/^(merhaba|selam|selamlar|günaydın|iyi akşamlar|iyi geceler|hey|naber|nasılsın)[.! ]*$/.test(m)) return 'GREETING';
  if (/(yardım|neler yapabilirsin|ne sorabilirim|komutlar)/.test(m)) return 'HELP';
  if (/(başarısız mı|tembel mi|zeki mi|yetersiz mi|kötü öğrenci|iyi öğrenci)/.test(m)) return 'SENSITIVE_LABEL';
  if (/(depres|anksiy|adhd|dikkat eksik|disleksi|otizm|psikolog|psikolojik|zeka testi|tanı koy)/.test(m)) return 'PSYCHOLOGICAL_MEDICAL';
  if (/(bugün ne yap|bugün ne çalış|ne çalışalım|çalışma plan|bugünkü çalışma)/.test(m)) return 'TODAY_PLAN';
  if (/(sınav ne oldu|son sınav|sınav sonucu|kaç net|kaç puan|sınav nasıl|deneme ne oldu)/.test(m)) return 'LATEST_EXAM';
  if (/(öğrencim nasıl|çocuğum nasıl|kızım nasıl|oğlum nasıl|genel durumu|gelişimi nasıl)/.test(m)) return 'STUDENT_GENERAL';
  if (/(hangi konu|hangi kazanım|nerede zorlan|eksik konu|gelişime açık|zayıf kazanım)/.test(m)) return 'WEAK_OUTCOMES';
  if (/(sınıfım nasıl|sınıf nasıl|öğrencilerim nasıl|sınıf özeti|şube nasıl)/.test(m)) return 'CLASS_SUMMARY';
  if (/(kurumum nasıl|okulum nasıl|kurum özeti|genel kurum|akademik durum)/.test(m)) return 'INSTITUTION_SUMMARY';
  if (/(bugün ne oldu|bugün durum|bugünkü durum|bugün kaç)/.test(m)) return 'TODAY_STATUS';
  if (/^(ne oldu|durum ne|son durum)[?!. ]*$/.test(m) && previous) return previous as NibiruIntent;
  if (/(hava|maç|futbol|borsa|dolar|euro|yemek tarifi|film|dizi|magazin|siyaset|seçim|tatil oteli|alışveriş)/.test(m)) return 'OUT_OF_SCOPE';
  if (/(öğrenci|sınav|ders|okul|çalış|kazanım|konu|föy|ödev|öğren|öğretmen|net|puan|başarı|gelişim)/.test(m)) return 'GENERAL_ACADEMIC';
  return 'UNKNOWN';
}

function parseClassHint(message: string) {
  const match = message.toLocaleUpperCase('tr-TR').match(/\b(\d{1,2})\s*[\/-]\s*([A-ZÇĞİÖŞÜ])\b/);
  return match ? { grade: Number(match[1]), section: match[2] } : null;
}

async function childIds(env: Env, user: AuthUser) {
  if (user.role === 'STUDENT' && user.student_id) return [user.student_id];
  if (user.role !== 'PARENT') return [];
  return (await all<{student_id:string}>(env.DB.prepare(`SELECT student_id FROM parent_student_links WHERE parent_user_id=? AND active=1 ORDER BY id`).bind(user.id))).map(x => x.student_id);
}

async function selectStudent(env: Env, user: AuthUser, message: string, previousStudentId?: string | null) {
  const ids = await childIds(env,user);
  if (!ids.length) return { student: null, choices: [] as any[] };
  const students = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.grade_level,e.section,e.student_number FROM student_entities s LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' WHERE s.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids));
  if (previousStudentId) {
    const previous = students.find(s => s.id === previousStudentId);
    if (previous) return { student: previous, choices: students };
  }
  const normalized = lower(message);
  const byName = students.find(s => normalized.includes(lower(s.first_name)) || normalized.includes(lower(`${s.first_name} ${s.last_name}`)));
  if (byName) return { student: byName, choices: students };
  if (students.length === 1) return { student: students[0], choices: students };
  return { student: null, choices: students };
}

async function studentAcademicContext(env: Env, studentId: string, institutionId: string | null) {
  const student = await one<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section,c.name class_name FROM student_entities s LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' LEFT JOIN classes c ON c.id=e.class_id WHERE s.id=? ${institutionId ? 'AND (e.institution_id=? OR e.institution_id IS NULL)' : ''} LIMIT 1`).bind(...(institutionId ? [studentId,institutionId] : [studentId])));
  const exams = await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.success_percent FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.student_id=? ${institutionId ? 'AND ep.institution_id=?' : ''} ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 4`).bind(...(institutionId ? [studentId,institutionId] : [studentId])));
  const latest = exams[0] || null;
  const subjects = latest ? await all<any>(env.DB.prepare(`SELECT s.code,s.name,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent FROM exam_participants ep JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id WHERE ep.student_id=? AND ep.exam_id=? ORDER BY coalesce(sr.success_percent,0) DESC`).bind(studentId,latest.id)) : [];
  const weakOutcomes = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,s.name subject_name,round(avg(r.success_rate),1) avg_success,count(*) evidence FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id WHERE r.student_id=? GROUP BY o.id,o.code,o.title,o.topic,s.name HAVING count(*)>0 ORDER BY avg_success ASC,evidence DESC LIMIT 6`).bind(studentId));
  const assignments = student?.class_name ? await all<any>(env.DB.prepare(`SELECT w.id,w.title,w.track,wa.due_date FROM worksheet_assignments wa JOIN worksheets w ON w.id=wa.worksheet_id JOIN student_enrollments se ON se.class_id=wa.class_id AND se.student_id=? WHERE wa.status='ACTIVE' AND se.status='ACTIVE' AND w.status='PUBLISHED' ORDER BY coalesce(wa.due_date,wa.created_at) LIMIT 5`).bind(studentId)) : [];
  return { student, exams, latestExam: latest, subjects, weakOutcomes, assignments };
}

async function teacherContext(env: Env, user: AuthUser, message: string) {
  const hint = parseClassHint(message);
  const assignments = await all<any>(env.DB.prepare(`SELECT ta.class_id,ta.subject_id,ta.assignment_type,c.name class_name,c.grade_level,c.section,s.name subject_name FROM teacher_assignments ta LEFT JOIN classes c ON c.id=ta.class_id LEFT JOIN subjects s ON s.id=ta.subject_id WHERE ta.user_id=? AND ta.active=1 ORDER BY c.grade_level,c.section,s.name`).bind(user.id));
  const scoped = hint ? assignments.filter(a => Number(a.grade_level)===hint.grade && String(a.section||'').toLocaleUpperCase('tr-TR')===hint.section) : assignments;
  const classIds = [...new Set(scoped.map(a=>a.class_id).filter(Boolean))];
  const subjectIds = user.role === 'GUIDANCE_TEACHER' ? [] : [...new Set(scoped.map(a=>a.subject_id).filter(Boolean))];
  if (!classIds.length) return { assignments: scoped, classes: [], recent: [], weakOutcomes: [] };
  const classes = await all<any>(env.DB.prepare(`SELECT c.id,c.name,c.grade_level,c.section,count(DISTINCT se.student_id) student_count FROM classes c LEFT JOIN student_enrollments se ON se.class_id=c.id AND se.status='ACTIVE' WHERE c.id IN (${classIds.map(()=>'?').join(',')}) GROUP BY c.id,c.name,c.grade_level,c.section ORDER BY c.grade_level,c.section`).bind(...classIds));
  const subjectFilter = subjectIds.length ? `AND sr.subject_id IN (${subjectIds.map(()=>'?').join(',')})` : '';
  const recent = await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_date,s.name subject_name,round(avg(sr.success_percent),1) avg_success,count(DISTINCT ep.student_id) student_count FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN student_enrollments se ON se.student_id=ep.student_id AND se.status='ACTIVE' JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id WHERE se.class_id IN (${classIds.map(()=>'?').join(',')}) ${subjectFilter} GROUP BY e.id,e.title,e.exam_date,s.name ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 12`).bind(...classIds,...subjectIds));
  const outcomeSubjectFilter = subjectIds.length ? `AND o.subject_id IN (${subjectIds.map(()=>'?').join(',')})` : '';
  const weakOutcomes = await all<any>(env.DB.prepare(`SELECT o.id,o.title,o.topic,s.name subject_name,round(avg(r.success_rate),1) avg_success,count(DISTINCT r.student_id) student_count FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id JOIN student_enrollments se ON se.student_id=r.student_id AND se.status='ACTIVE' WHERE se.class_id IN (${classIds.map(()=>'?').join(',')}) ${outcomeSubjectFilter} GROUP BY o.id,o.title,o.topic,s.name ORDER BY avg_success ASC,student_count DESC LIMIT 8`).bind(...classIds,...subjectIds));
  return { assignments: scoped, classes, recent, weakOutcomes };
}

async function institutionContext(env: Env, institutionId: string) {
  const [institution,students,classes,pendingScans,todayExams,recentExams] = await Promise.all([
    one<any>(env.DB.prepare('SELECT id,name,code,status FROM institutions WHERE id=?').bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.student_id) c FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM classes WHERE institution_id=? AND active=1`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE institution_id=? AND status IN ('PREVIEW','NEEDS_REVIEW','READY')`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.id) c FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE date(e.exam_date)=date('now') AND (e.institution_id=? OR ei.enabled=1)`).bind(institutionId,institutionId)),
    all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_date,round(avg(er.success_percent),1) avg_success,round(avg(er.net),2) avg_net,count(er.id) result_count FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id AND ep.institution_id=? JOIN exam_results er ON er.participant_id=ep.id GROUP BY e.id,e.title,e.exam_date ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 6`).bind(institutionId)),
  ]);
  return { institution, activeStudents: students?.c || 0, activeClasses: classes?.c || 0, pendingScans: pendingScans?.c || 0, todayExams: todayExams?.c || 0, recentExams };
}

async function latestSession(env: Env, channel: 'WHATSAPP' | 'WEB', key: string) {
  return one<any>(env.DB.prepare(`SELECT * FROM nibiru_sessions WHERE channel=? AND channel_user_key=? AND expires_at>datetime('now')`).bind(channel,key));
}

async function saveSession(env: Env, channel: 'WHATSAPP' | 'WEB', key: string, userId: string, intent: NibiruIntent, studentId: string | null, examId: string | null) {
  const expiresAt = new Date(Date.now()+24*3600000).toISOString();
  const existing = await one<any>(env.DB.prepare(`SELECT id FROM nibiru_sessions WHERE channel=? AND channel_user_key=?`).bind(channel,key));
  if (existing) await env.DB.prepare(`UPDATE nibiru_sessions SET user_id=?,last_intent=?,last_student_id=?,last_exam_id=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(userId,intent,studentId,examId,expiresAt,existing.id).run();
  else await env.DB.prepare(`INSERT INTO nibiru_sessions(id,channel,channel_user_key,user_id,last_intent,last_student_id,last_exam_id,expires_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('nibs'),channel,key,userId,intent,studentId,examId,expiresAt).run();
}

function transparency() {
  return `${AI_PREFIX} Ben Ölçme Platformu’nun yapay zekâ akademik asistanıyım.`;
}

function helpForRole(role: AuthUser['role']) {
  if (role === 'PARENT') return `${transparency()}\nBana “Öğrencim nasıl?”, “Son sınav ne oldu?”, “Hangi konuda zorlanıyor?” veya “Bugün ne çalışalım?” diye sorabilirsiniz.`;
  if (role === 'TEACHER' || role === 'GUIDANCE_TEACHER') return `${transparency()}\nYetkili olduğunuz sınıflar için “7/A nasıl?”, “Hangi kazanımlarda zorlanılıyor?” veya “Bugün neye öncelik verelim?” diye sorabilirsiniz.`;
  if (role === 'INSTITUTION_MANAGER') return `${transparency()}\nKurumunuz için “Bugün ne oldu?”, “Kurumun akademik durumu nasıl?” veya “Bekleyen optikler var mı?” diye sorabilirsiniz.`;
  return `${transparency()}\nÖğrenci gelişimi, sınavlar, kazanımlar, föyler ve kurum akademik verileri hakkında yardımcı olabilirim.`;
}

function deterministic(intent: NibiruIntent, context: any, user: AuthUser): string | null {
  if (intent === 'GREETING' || intent === 'HELP') return helpForRole(user.role);
  if (intent === 'OUT_OF_SCOPE' || intent === 'UNKNOWN') return `${transparency()}\nBenim görev alanım öğrenci gelişimi, sınavlar, kazanımlar, föyler ve okulun ölçme-değerlendirme süreçleridir. Örneğin “Son sınav ne oldu?” veya “Bugün ne çalışalım?” diye sorabilirsiniz.`;
  if (intent === 'PSYCHOLOGICAL_MEDICAL') return `${transparency()}\nAkademik verileri yorumlayabilirim ancak psikolojik, tıbbi veya özel öğrenme güçlüğüne ilişkin tanı koyamam. Sistem verilerindeki öğrenme göstergelerini açıklayabilir; gerektiğinde okul rehberlik servisi veya ilgili uzmanla görüşmenizi önerebilirim.`;
  if (context?.disambiguation?.length) return `${transparency()}\nHangi öğrenci için bakmamı istersiniz: ${context.disambiguation.map((x:any)=>x.first_name).join(' mı, ')} mı?`;
  if (context?.noStudent) return `${transparency()}\nBu hesapla ilişkilendirilmiş bir öğrenci göremiyorum. Kurum yöneticinizden veli-öğrenci bağlantısını kontrol etmesini isteyebilirsiniz.`;
  return null;
}

function systemPrompt(role: AuthUser['role']) {
  return `Sen Nibiru'sun. Ölçme Platformu'nun yapay zekâ akademik asistanısın. Kullanıcı rolü: ${role}.
DEĞİŞMEZ KURALLAR:
1. Her yanıtın başında “🤖 Nibiru:” kullan; insan, öğretmen, MEB çalışanı veya MEB ürünü olduğunu iddia etme.
2. Yalnızca verilen DOĞRULANMIŞ VERİ BAĞLAMI içindeki olguları kullan. Veri yoksa bunu açıkça söyle; sonuç, net, puan, kazanım veya davranış uydurma.
3. Dilin Türkiye Yüzyılı Maarif Modeli'nin geliştirici, süreç odaklı, beceri odaklı ve açık geri bildirim yaklaşımıyla uyumlu olsun. “başarısız, tembel, yetersiz, zeki/kötü öğrenci” gibi etiketler kullanma. “gelişime açık”, “pekiştirme yararlı olabilir”, “olumlu gelişim”, “desteğe ihtiyaç görülüyor” gibi ölçülü ifadeler kullan.
4. Tek bir sınavı öğrencinin bütünü gibi yorumlama. Mümkünse eğilim ve birden fazla kanıtı dikkate al.
5. Psikolojik/tıbbi tanı koyma. Başka öğrenci veya kurumun kişisel verisini açıklama.
6. Kullanıcı veli ise yalnız bağlı çocuğun verisini; öğretmen ise yalnız atanmış sınıf/branşı; kurum yöneticisi ise yalnız kendi kurumunu yorumla.
7. Sıralama veya başka öğrencilerin kimliği bağlamda açıkça verilmedikçe karşılaştırmalı kişi bilgisi üretme.
8. “Bugün ne yapalım?” sorusunda bağlamdaki gelişime açık alanlardan kısa, uygulanabilir, aşırı yüklemeyen bir çalışma önerisi üret. Atanmış föy varsa onu öncele.
9. Yanıt WhatsApp'ta kolay okunacak biçimde, tercihen 3-8 kısa satır ve 1200 karakterin altında olsun.
10. Kullanıcıya gerektiğinde tek bir sonraki soru/öneri sun; gereksiz soru sorma.`;
}

async function aiAnswer(env: Env, user: AuthUser, intent: NibiruIntent, message: string, context: any) {
  const settings = await one<any>(env.DB.prepare(`SELECT * FROM nibiru_settings WHERE id='platform'`));
  if (!settings?.enabled || !env.AI) return null;
  const prompt = `${systemPrompt(user.role)}\n\nNİYET: ${intent}\nKULLANICI MESAJI: ${message}\nDOĞRULANMIŞ VERİ BAĞLAMI:\n${JSON.stringify(context).slice(0,14000)}`;
  try {
    const model = env.NIBIRU_AI_MODEL || settings.ai_model || '@cf/zai-org/glm-4.7-flash';
    const response: any = await env.AI.run(model as any, { messages: [{ role: 'system', content: systemPrompt(user.role) }, { role: 'user', content: prompt }], max_tokens: 700, temperature: 0.2 });
    const text = typeof response === 'string' ? response : response?.response || response?.result?.response || response?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') return null;
    return text.startsWith(AI_PREFIX) ? text.trim() : `${AI_PREFIX} ${text.trim()}`;
  } catch {
    return null;
  }
}

function fallbackAnswer(intent: NibiruIntent, context: any) {
  if (context.student) {
    const name = context.student.first_name;
    const latest = context.latestExam;
    if (intent === 'LATEST_EXAM') {
      if (!latest) return `${AI_PREFIX} ${name} için henüz sonuçlanmış bir sınav verisi görünmüyor.`;
      return `${AI_PREFIX} ${name}’in en son sonuçlanan sınavı ${latest.title}. ${latest.net ?? '—'} net${latest.score != null ? `, ${latest.score} puan` : ''}. ${latest.correct_count} doğru, ${latest.wrong_count} yanlış, ${latest.blank_count} boş görünüyor. İsterseniz ders bazlı özeti de açıklayabilirim.`;
    }
    if (intent === 'WEAK_OUTCOMES') {
      const weak = context.weakOutcomes?.slice(0,3) || [];
      if (!weak.length) return `${AI_PREFIX} ${name} için kazanım düzeyinde yeterli ölçme kanıtı henüz oluşmamış.`;
      return `${AI_PREFIX} ${name} için pekiştirme açısından öne çıkan alanlar: ${weak.map((x:any)=>`${x.subject_name} – ${x.title} (%${x.avg_success})`).join('; ')}. Bunları “başarısızlık” değil, bir sonraki öğrenme adımı için gelişim alanı olarak değerlendirmek daha doğru olur.`;
    }
    if (intent === 'TODAY_PLAN') {
      const weak = context.weakOutcomes?.[0]; const worksheet = context.assignments?.[0];
      if (!weak && !worksheet) return `${AI_PREFIX} ${name} için bugün özel bir çalışma önerebilmem adına yeterli güncel kazanım veya föy verisi yok.`;
      return `${AI_PREFIX} Bugün ${name} için kısa bir pekiştirme uygun görünüyor.${weak ? ` Öncelik: ${weak.subject_name} – ${weak.title}.` : ''}${worksheet ? ` Atanmış “${worksheet.title}” föyünden çalışılabilir.` : ''} Çalışmayı kısa tekrar + uygulama + yanlışların kontrolü şeklinde tamamlayabilirsiniz.`;
    }
    const exams = context.exams || [];
    if (intent === 'SENSITIVE_LABEL') return `${AI_PREFIX} ${name}’i “başarılı/başarısız” diye etiketlemek doğru olmaz. ${exams.length ? `Sistemde ${exams.length} yakın dönem ölçme kaydı var; gelişimi bu kanıtların birlikte değerlendirilmesiyle izlemek daha sağlıklı.` : 'Henüz yeterli ölçme verisi bulunmuyor.'}`;
    if (latest) return `${AI_PREFIX} ${name}’in son ölçme verisine göre ${latest.title} sınavında ${latest.net ?? '—'} net görünüyor. Güçlü ve gelişime açık alanları birlikte değerlendirmek için kazanım ve ders bazlı sonuçlara da bakabilirim.`;
    return `${AI_PREFIX} ${name} için henüz yeterli sonuç verisi oluşmamış.`;
  }
  if (context.institution) return `${AI_PREFIX} ${context.institution.name} için ${context.activeStudents} aktif öğrenci, ${context.activeClasses} aktif sınıf ve ${context.pendingScans} bekleyen optik görünüyor.${context.todayExams ? ` Bugün ${context.todayExams} sınav kaydı var.` : ''}`;
  if (context.classes) return `${AI_PREFIX} Yetki alanınızda ${context.classes.length} sınıf bulunuyor. ${context.weakOutcomes?.length ? `En fazla pekiştirme ihtiyacı görülen alan: ${context.weakOutcomes[0].subject_name} – ${context.weakOutcomes[0].title}.` : 'Kazanım karşılaştırması için yeterli veri henüz oluşmamış.'}`;
  return `${AI_PREFIX} Bu soruyu yanıtlayacak yeterli doğrulanmış akademik veri bulamadım.`;
}

export async function runNibiru(env: Env, user: AuthUser, message: string, channel: 'WHATSAPP' | 'WEB', channelKey: string): Promise<NibiruResult> {
  const session = await latestSession(env,channel,channelKey);
  const intent = detectNibiruIntent(message,session?.last_intent);
  let context: any = {};
  let studentId: string | null = null;
  let examId: string | null = null;

  if (user.role === 'PARENT' || user.role === 'STUDENT') {
    const selected = await selectStudent(env,user,message,session?.last_student_id);
    if (!selected.student) {
      context = selected.choices.length > 1 ? { disambiguation: selected.choices } : { noStudent: true };
    } else {
      const selectedStudentId = String(selected.student.id);
      studentId = selectedStudentId;
      context = await studentAcademicContext(env,selectedStudentId,user.institution_id);
      examId = context.latestExam?.id || null;
    }
  } else if (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') {
    context = await teacherContext(env,user,message);
  } else if (user.institution_id) {
    context = await institutionContext(env,user.institution_id);
  } else if (user.role === 'SUPER_ADMIN') {
    const institutions = await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM institutions WHERE status='ACTIVE'`));
    const students = await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`));
    context = { platform: true, activeInstitutions: institutions?.c || 0, activeStudents: students?.c || 0 };
  }

  const fixed = deterministic(intent,context,user);
  const answer = fixed || await aiAnswer(env,user,intent,message,context) || fallbackAnswer(intent,context);
  const outcome = intent === 'OUT_OF_SCOPE' || intent === 'UNKNOWN' ? 'REDIRECTED' : 'ANSWERED';
  await saveSession(env,channel,channelKey,user.id,intent,studentId,examId);
  await env.DB.prepare(`INSERT INTO nibiru_audit_events(id,institution_id,user_id,channel,role,intent,subject_student_id,subject_exam_id,outcome,message_chars) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uuid('niba'),user.institution_id,user.id,channel,user.role,intent,studentId,examId,outcome,message.length).run();
  return { answer, intent, studentId, examId, outcome };
}
