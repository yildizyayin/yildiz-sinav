import { mkdirSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const out = [];
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const ins = (sql) => out.push(sql.endsWith(';') ? sql : `${sql};`);
const password = (value) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(value, salt, 100000, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
};
const norm = (value) => value.toLocaleLowerCase('tr-TR').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replaceAll('ı', 'i').replaceAll('ğ', 'g')
  .replaceAll('ü', 'u').replaceAll('ş', 's').replaceAll('ö', 'o').replaceAll('ç', 'c')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

ins('PRAGMA foreign_keys = ON');

// The original smoke fixture keeps 65 grade-7 students. The presentation tenant is
// deliberately normalized to 20 students per grade without touching guest records.
ins("UPDATE student_enrollments SET status='INACTIVE' WHERE student_id GLOB 'stu_a0[2-6][1-9]' OR student_id GLOB 'stu_a0[3-6]0'");
ins("UPDATE student_entities SET status='INACTIVE' WHERE id GLOB 'stu_a0[2-6][1-9]' OR id GLOB 'stu_a0[3-6]0'");

for (const grade of [5, 6, 7, 8, 9, 10, 11, 12]) {
  ins(`INSERT OR REPLACE INTO classes (id,institution_id,season_id,grade_level,section,name,active) VALUES (${q(`class_${grade}a`)},'inst_demo','season_2627',${grade},'A',${q(`${grade}/A`)},1)`);
}

const subjects = [
  ['sub_mat', 'MAT', 'Matematik', 'NUMERIC'],
  ['sub_tur', 'TUR', 'Türkçe', 'VERBAL'],
  ['sub_fen', 'FEN', 'Fen Bilimleri', 'NUMERIC'],
  ['sub_sos', 'SOS', 'Sosyal Bilgiler', 'VERBAL'],
  ['sub_ink', 'INK', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'VERBAL'],
  ['sub_din', 'DIN', 'Din Kültürü ve Ahlak Bilgisi', 'VERBAL'],
  ['sub_ing', 'ING', 'İngilizce', 'VERBAL'],
  ['sub_fiz', 'FIZ', 'Fizik', 'NUMERIC'],
  ['sub_kim', 'KIM', 'Kimya', 'NUMERIC'],
  ['sub_biy', 'BIY', 'Biyoloji', 'NUMERIC'],
  ['sub_tar', 'TAR', 'Tarih', 'VERBAL'],
  ['sub_cog', 'COG', 'Coğrafya', 'VERBAL'],
  ['sub_fel', 'FEL', 'Felsefe', 'VERBAL'],
  ['sub_edb', 'EDB', 'Türk Dili ve Edebiyatı', 'VERBAL'],
];
for (const [id, code, name, category] of subjects) {
  ins(`INSERT OR REPLACE INTO subjects (id,code,name,category,active) VALUES (${q(id)},${q(code)},${q(name)},${q(category)},1)`);
}

const firstNames = ['Aras', 'Defne', 'Efe', 'Elif', 'Mert', 'Zeynep', 'Kerem', 'İpek', 'Can', 'Duru', 'Emir', 'Ada', 'Bora', 'Nehir', 'Kaan', 'Eylül', 'Deniz', 'Mina', 'Atlas', 'Selin'];
const lastNames = ['Bulut', 'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Arslan', 'Koç', 'Kurt', 'Özdemir', 'Aksoy', 'Polat', 'Güneş', 'Yıldız', 'Eren', 'Taş', 'Kaplan', 'Keskin', 'Öztürk'];
for (const grade of [5, 6, 7, 8, 9, 10, 11, 12]) {
  for (let index = 1; index <= 20; index++) {
    const id = grade === 7 ? `stu_a${String(index).padStart(3, '0')}` : `stu_demo_${grade}_${String(index).padStart(2, '0')}`;
    const first = grade === 8 && index === 1 ? 'Aras' : firstNames[(index + grade) % firstNames.length];
    const last = grade === 8 && index === 1 ? 'Bulut' : lastNames[(index * 3 + grade) % lastNames.length];
    const studentNumber = String(grade * 1000 + index);
    ins(`INSERT OR REPLACE INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES (${q(id)},${q(first)},${q(last)},${q(norm(`${first} ${last}`))},'ACTIVE','2026-09-01')`);
    ins(`INSERT OR REPLACE INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES (${q(`enr_demo_${grade}_${index}`)},${q(id)},'inst_demo','season_2627',${q(`class_${grade}a`)},${q(studentNumber)},${grade},'A','ACTIVE')`);
  }
}

const roleAccounts = [
  ['usr_show_manager', null, 'INSTITUTION_MANAGER', 'Demo Koleji Kurum Yöneticisi', 'manager.demo', 'manager.demo@anunex.com', 'Anunex.Kurum!26'],
  ['usr_show_teacher', null, 'TEACHER', 'Demo Branş Öğretmeni', 'teacher.demo', 'teacher.demo@anunex.com', 'Anunex.Ogretmen!26'],
  ['usr_show_guidance', null, 'GUIDANCE_TEACHER', 'Demo Rehber Öğretmen', 'guidance.demo', 'guidance.demo@anunex.com', 'Anunex.Rehber!26'],
  ['usr_show_student', 'stu_demo_8_01', 'STUDENT', 'Aras Bulut', 'student.demo', 'student.demo@anunex.com', 'Anunex.Ogrenci!26'],
  ['usr_show_parent', null, 'PARENT', 'Seval Bulut', 'parent.demo', 'parent.demo@anunex.com', 'Anunex.Veli!26'],
];
for (const [id, studentId, role, displayName, username, email, rawPassword] of roleAccounts) {
  const credentials = password(rawPassword);
  ins(`INSERT OR REPLACE INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES (${q(id)},'inst_demo',${q(studentId)},${q(role)},${q(displayName)},${q(email)},${q(username)},${q(credentials.hash)},${q(credentials.salt)},100000,'PBKDF2-SHA256-v1',1)`);
}
ins("INSERT OR REPLACE INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES ('psl_showcase','usr_show_parent','stu_demo_8_01','Anne',1)");

const branchTeachers = subjects.map(([subjectId, code, subjectName], index) => [
  `usr_branch_${code.toLowerCase()}`, subjectId, `${subjectName} Öğretmeni`, `branch.${code.toLowerCase()}`, `branch.${code.toLowerCase()}@demo.anunex.com`, index,
]);
for (const [userId, subjectId, displayName, username, email] of branchTeachers) {
  const credentials = password('Anunex.Brans!26');
  ins(`INSERT OR REPLACE INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES (${q(userId)},'inst_demo',NULL,'TEACHER',${q(displayName)},${q(email)},${q(username)},${q(credentials.hash)},${q(credentials.salt)},100000,'PBKDF2-SHA256-v1',1)`);
  for (const grade of [5, 6, 7, 8, 9, 10, 11, 12]) {
    ins(`INSERT OR REPLACE INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (${q(`ta_${userId}_${grade}`)},${q(userId)},'inst_demo','season_2627',${q(`class_${grade}a`)},${q(subjectId)},'SUBJECT',1)`);
  }
}
for (const grade of [5, 6, 7, 8, 9, 10, 11, 12]) {
  ins(`INSERT OR REPLACE INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (${q(`ta_show_teacher_${grade}`)},'usr_show_teacher','inst_demo','season_2627',${q(`class_${grade}a`)},'sub_mat','SUBJECT',1)`);
  ins(`INSERT OR REPLACE INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (${q(`ta_show_guidance_${grade}`)},'usr_show_guidance','inst_demo','season_2627',${q(`class_${grade}a`)},NULL,'GUIDANCE',1)`);
}
ins("UPDATE institution_license_state SET licensed_student_limit=500,licensed_student_count=160 WHERE id='lic_demo'");

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/demo-college-showcase.sql', `${out.join('\n')}\n`);
console.log(`Generated ${out.length} Demo Koleji showcase statements at tmp/demo-college-showcase.sql`);
