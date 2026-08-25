export type ReadinessState='READY'|'CONFIG_REQUIRED'|'MISSING';
export type ReadinessCheck={key:string;label:string;state:ReadinessState;detail:string};

export const STANDARD_MODULES=[
  {key:'IDENTITY',label:'Kimlik / Tenant / Yetki',tables:['institutions','users','sessions']},
  {key:'STUDENT_CORE',label:'Öğrenci / Sınıf / Şube',tables:['student_entities','student_enrollments','classes']},
  {key:'TEACHER_CORE',label:'Öğretmen / Branş / Rehberlik',tables:['teacher_assignments','subjects']},
  {key:'EXAM_CENTER',label:'Sınav Merkezi',tables:['exams','exam_questions','answer_keys','exam_participants']},
  {key:'OPTICAL_CENTER',label:'Optik Hazırla / Bas / Oku',tables:['optical_templates','optical_template_versions','printer_optical_calibrations','scan_batches','scan_records']},
  {key:'EVALUATION',label:'Değerlendirme Motoru',tables:['student_answers','exam_results','subject_results']},
  {key:'OUTCOMES',label:'Kazanım Motoru',tables:['outcomes','question_outcomes','outcome_results']},
  {key:'WORKSHEETS',label:'Föy Merkezi',tables:['worksheets','worksheet_subjects','worksheet_assets','video_links']},
  {key:'QUESTION_BANK',label:'Soru Havuzu',tables:['question_bank','question_learning_links']},
  {key:'TARGETS',label:'LGS / YKS Hedef Motoru',tables:['student_academic_targets','secondary_school_targets','university_program_targets']},
  {key:'PERSONAL_BOOKS',label:'Kişiye Özel Kitap',tables:['student_personal_books','student_personal_book_items']},
  {key:'ZERO_ERROR',label:'Sıfır Hata Kitapçığı',tables:['zero_error_booklets','zero_error_booklet_items','zero_error_attempts']},
  {key:'NOTIFICATIONS',label:'Bildirim Merkezi',tables:['notifications']},
] as const;

export function evaluateStandardReadiness(existingTables:Iterable<string>,config:{files:boolean;ai:boolean;youtube:boolean;whatsapp:boolean}){
  const tables=new Set(existingTables);
  const checks:ReadinessCheck[]=STANDARD_MODULES.map(m=>{
    const missing=m.tables.filter(t=>!tables.has(t));
    return {key:m.key,label:m.label,state:missing.length?'MISSING':'READY',detail:missing.length?`Eksik tablo: ${missing.join(', ')}`:'Veri modeli hazır'};
  });
  checks.push({key:'R2',label:'Dosya / PDF / Baskı Depolama',state:config.files?'READY':'MISSING',detail:config.files?'R2 binding hazır':'FILES R2 binding eksik'});
  checks.push({key:'NIBIRU_BASIC',label:'Nibiru Standard AI',state:config.ai?'READY':'CONFIG_REQUIRED',detail:config.ai?'Workers AI binding hazır':'AI binding yapılandırılmalı'});
  checks.push({key:'YOUTUBE_MICRO',label:'YouTube Mikro Konu Videosu',state:config.youtube?'READY':'CONFIG_REQUIRED',detail:config.youtube?'YouTube API anahtarı hazır':'YOUTUBE_API_KEY secret gerekli'});
  checks.push({key:'WHATSAPP',label:'WhatsApp Akademik Kanalı',state:config.whatsapp?'READY':'CONFIG_REQUIRED',detail:config.whatsapp?'WhatsApp bağlantısı hazır':'WhatsApp secret/telefon kimliği yapılandırılmalı'});
  const ready=checks.filter(x=>x.state==='READY').length;
  const missing=checks.filter(x=>x.state==='MISSING').length;
  const configRequired=checks.filter(x=>x.state==='CONFIG_REQUIRED').length;
  return {checks,summary:{total:checks.length,ready,missing,configRequired,coreReady:missing===0}};
}
