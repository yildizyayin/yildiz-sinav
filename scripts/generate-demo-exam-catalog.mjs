import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const data = JSON.parse(readFileSync('data/demo-exams-2026-2027.json', 'utf8'));
const out = ['PRAGMA foreign_keys = ON;'];
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const ins = (sql) => out.push(sql.endsWith(';') ? sql : `${sql};`);
const key = (value) => createHash('sha1').update(value).digest('hex').slice(0, 18);
const sourceHashes = {
  cap: 'eacde86e0d830ae1fc6b460c68941cb81cd04874792df054fcceda04d4083ed8',
  ankara: 'b2c67e1e579b155b6720cf3e0156a0ee67dc077da231bcd9c4ca1c69d796d45a',
};
const sourceFiles = {
  cap: 'CAP_TYT_0_KAZANIM_TABLOSU_CEVAP_ANAHTARLI.xlsx',
  ankara: 'ANKARA_8_SINIF_HAZIR_BULUNUSLUK_KAZANIM_TABLOSU.xlsx',
};
const publisherIds = { cap: 'pub_cap', ankara: 'pub_ankara' };
const subjectFor = (exam, question) => {
  if (exam.id === 'cap') {
    if (question.test.includes('Türkçe')) return 'sub_tyt_tur';
    if (question.test.includes('Matematik')) return 'sub_tyt_mat';
    if (question.test.includes('Sosyal')) return 'sub_tyt_sos';
    return 'sub_tyt_fen';
  }
  const map = {
    'Türkçe': 'sub_tur', 'Matematik': 'sub_mat', 'Fen Bilimleri': 'sub_fen',
    'Sosyal Bilgiler': 'sub_sos', 'Din Kültürü': 'sub_din', 'İngilizce': 'sub_ing',
  };
  return map[question.test] || 'sub_sos';
};

ins("INSERT OR IGNORE INTO publishers(id,name,code,active) VALUES ('pub_cap','ÇAP Yayınları','CAP',1)");
ins("INSERT OR IGNORE INTO publishers(id,name,code,active) VALUES ('pub_ankara','Ankara Yayınları','ANKARA',1)");
const sekonic7108 = {
  type: 'fixed-width', recordLength: 171, signature: '7108',
  encoding: 'windows-1254',
  fields: {
    institution_code: { start: 4, end: 10 },
    student_number: { start: 10, end: 15 },
    name: { start: 15, end: 35 },
    class: { start: 35, end: 37 },
    identity_reference: { start: 37, end: 48 },
    booklet: { start: 50, end: 51 },
  },
  answers: {
    TUR: { start: 51, end: 71 }, SOS: { start: 71, end: 91 },
    DIN: { start: 91, end: 111 }, ING: { start: 111, end: 131 },
    MAT: { start: 131, end: 151 }, FEN: { start: 151, end: 171 },
  },
};
const sekonic129 = {
  type: 'fixed-width', recordLength: 222, encoding: 'windows-1254',
  fields: {
    institution_code: { start: 3, end: 11 },
    student_number: { start: 11, end: 16 },
    name: { start: 16, end: 36 },
    identity_reference: { start: 36, end: 47 },
    class: { start: 48, end: 51 },
    booklet: { start: 55, end: 56 },
  },
  answers: {
    TYT_TUR: { start: 56, end: 96 }, TYT_SOS: { start: 96, end: 142 },
    TYT_MAT: { start: 142, end: 182 }, TYT_FEN: { start: 182, end: 222 },
  },
};
ins("INSERT OR IGNORE INTO optical_templates(id,name,vendor,status,active) VALUES ('opt7108','Optik 7108 LGS','Sekonic','READY',1)");
ins(`INSERT OR REPLACE INTO optical_template_versions(id,template_id,version,page_width_mm,page_height_mm,parser_definition,active) VALUES ('v_opt7108_sekonic','opt7108','sekonic-fmt-2026-09',210,297,${q(JSON.stringify(sekonic7108))},1)`);
ins(`INSERT OR REPLACE INTO optical_template_versions(id,template_id,version,page_width_mm,page_height_mm,parser_definition,active) VALUES ('v_opt129_sekonic','opt129','sekonic-fmt-2026-09',210,297,${q(JSON.stringify(sekonic129))},1)`);
ins("UPDATE optical_templates SET vendor='Sekonic',status='READY',active=1 WHERE id IN ('opt129','opt7108')");
ins("INSERT OR REPLACE INTO optical_definition_validations(optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error) VALUES ('v_opt7108_sekonic',1,61,'2026-09-02',NULL)");
ins("INSERT OR REPLACE INTO optical_definition_validations(optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error) VALUES ('v_opt129_sekonic',1,40,'2026-09-02',NULL)");

for (const exam of data.exams) {
  const examId = exam.id === 'cap' ? 'exam_demo_cap_tyt_0' : 'exam_demo_ankara_hbs_8';
  const catalogCode = exam.id === 'cap' ? 'CAP-TYT-0-2627' : 'ANK-HBS-8-2627';
  const scoringId = exam.examType === 'TYT' ? 'srv_anunex_tyt_2627' : 'srv_anunex_lgs_2627';
  const publisherId = publisherIds[exam.id];
  const programCode = exam.examType === 'TYT' ? 'TYT' : 'SCHOOL';
  ins(`INSERT OR REPLACE INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,exam_date,status,scoring_rule_version_id,sponsor_mode,created_by) VALUES (${q(examId)},'CENTRAL',${q(exam.academicYear)},${q(exam.title)},${q(exam.examType)},${exam.gradeLevel},'2026-09-01','ACTIVE',${q(scoringId)},'ADMIN_SPONSORED','usr_super')`);
  ins(`INSERT OR REPLACE INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES (${q(`ei_${examId}`)},${q(examId)},'inst_demo',1)`);
  ins(`INSERT OR REPLACE INTO exam_delivery_profiles(exam_id,scope,publisher_id,catalog_code,verified_catalog,result_freeze_status,snapshot_version,expected_participants) VALUES (${q(examId)},'INSTITUTION',${q(publisherId)},${q(catalogCode)},0,'OPEN',0,20)`);
  ins(`INSERT OR REPLACE INTO exam_source_packages(exam_id,source_kind,source_exam_id,source_file_name,source_file_hash,rights_basis,contains_question_text,verification_status,note,created_by) VALUES (${q(examId)},'USER_PROVIDED',${q(exam.sourceExamId)},${q(sourceFiles[exam.id])},${q(sourceHashes[exam.id])},'USER_PROVIDED',0,'DECLARED',${q(exam.sourceNotice)},'usr_super')`);
  ins(`INSERT OR REPLACE INTO exam_booklets(id,exam_id,code,active) VALUES (${q(`book_${examId}_A`)},${q(examId)},'A',1)`);
  const subjectCounts = new Map();
  const subjectOrder = [];
  for (const question of exam.questions) {
    const subjectId = subjectFor(exam, question);
    if (!subjectCounts.has(subjectId)) subjectOrder.push(subjectId);
    subjectCounts.set(subjectId, (subjectCounts.get(subjectId) || 0) + 1);
  }
  subjectOrder.forEach((subjectId, index) => {
    ins(`INSERT OR REPLACE INTO exam_subjects(id,exam_id,subject_id,question_count,sort_order,wrong_divisor) VALUES (${q(`es_${examId}_${subjectId}`)},${q(examId)},${q(subjectId)},${subjectCounts.get(subjectId)},${index + 1},${exam.examType === 'LGS' ? 3 : 4})`);
  });
  const counters = new Map();
  exam.questions.forEach((question, globalIndex) => {
    const subjectId = subjectFor(exam, question);
    const subjectQuestionNo = (counters.get(subjectId) || 0) + 1;
    counters.set(subjectId, subjectQuestionNo);
    const questionId = `q_${examId}_${String(globalIndex + 1).padStart(3, '0')}`;
    ins(`INSERT OR REPLACE INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES (${q(questionId)},${q(examId)},${q(subjectId)},${subjectQuestionNo},${globalIndex + 1})`);
    ins(`INSERT OR REPLACE INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES (${q(`ak_${questionId}_A`)},${q(questionId)},'A',${q(question.answer)})`);
    const labelPath = JSON.stringify(question.outcomePath);
    const detectedGrade = exam.id === 'ankara' && /^7\./.test(question.publisherOutcomeCode) ? 7 : null;
    const mappingId = `pol_${key([publisherId,subjectId,question.publisherOutcomeCode,labelPath].join('|'))}`;
    const reviewNote = exam.id === 'ankara'
      ? 'Dosya başlığı 8. sınıf, iç satır meta verisi 5. sınıf ve kazanım kodları 7. sınıf gösteriyor; resmî MEB sürümü seçilmeden eşleştirme onaylanamaz.'
      : 'Yayınevi konu/kazanım etiketi korundu; resmî ÖSYM/MEB karşılığı editör onayı bekliyor.';
    ins(`INSERT OR IGNORE INTO publisher_outcome_labels(id,publisher_id,academic_year,program_code,grade_level,subject_id,publisher_code,label_path_json,detected_grade_level,mapping_status,confidence,review_note) VALUES (${q(mappingId)},${q(publisherId)},${q(exam.academicYear)},${q(programCode)},${exam.gradeLevel},${q(subjectId)},${q(question.publisherOutcomeCode)},${q(labelPath)},${detectedGrade ?? 'NULL'},'REVIEW_REQUIRED',0,${q(reviewNote)})`);
    ins(`INSERT OR IGNORE INTO question_publisher_outcomes(exam_question_id,publisher_outcome_id) VALUES (${q(questionId)},${q(mappingId)})`);
  });
}

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/demo-exam-catalog.sql', `${out.join('\n')}\n`);
console.log(`Generated ${out.length} licensed metadata statements at tmp/demo-exam-catalog.sql`);
