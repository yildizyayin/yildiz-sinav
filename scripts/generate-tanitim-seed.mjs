// ANUNEX Tanıtım ortamı (demo.anunex.com) — synthetic showcase data for the 2027–2028 season (owner, 11 Nov 2026).
// Runs after the migrations and after the verified 2027–2028 MEB programs are copied in. No real person, no real
// institution: every name below is invented. Activity contents are written by ANUNEX for the showcase, labelled
// "TANITIM" and left waiting for approval, so the owner approves them in Evren Merkezi like any other content.
// Usage: DEMO_PASSWORD=… node scripts/generate-tanitim-seed.mjs   → tmp/tanitim-seed.sql + tmp/tanitim-accounts.txt
import { mkdirSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const out = [];
const q = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const ins = (sql) => out.push(sql.endsWith(';') ? sql : `${sql};`);
const PASSWORD = process.env.DEMO_PASSWORD || `Tanitim.${randomBytes(4).toString('hex')}!`;
const hash = () => { const salt = randomBytes(16); return { salt: salt.toString('base64'), hash: pbkdf2Sync(PASSWORD, salt, 100000, 32, 'sha256').toString('base64') }; };
const norm = (s) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replaceAll('ı', 'i').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const INST = 'inst_tanitim', SEASON = 'season_tanitim_2728', YEAR = '2027-2028';
export const GRADES = [4, 5, 6, 7, 8, 9, 10, 11, 12];

ins('PRAGMA foreign_keys = ON');
ins(`INSERT OR REPLACE INTO institutions (id,name,code,city,district,status,demo_mode) VALUES (${q(INST)},'ANUNEX Tanıtım Okulu','TANITIM','Tanıtım','Tanıtım','ACTIVE',1)`);
ins(`INSERT OR REPLACE INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES (${q(SEASON)},${q(INST)},${q(YEAR)},'ACTIVE','2027-09-13')`);
ins(`INSERT OR REPLACE INTO institution_license_state (id,institution_id,season_id,licensed_student_limit,licensed_student_count,agreement_status,note) VALUES ('lic_tanitim',${q(INST)},${q(SEASON)},500,72,'ACTIVE','Tanıtım ortamı')`);
for (const f of ['LEARNING_UNIVERSE', 'PERSONAL_BOOKS', 'GAMES']) ins(`INSERT OR REPLACE INTO institution_feature_overrides (institution_id,feature_key,enabled) SELECT ${q(INST)},feature_key,1 FROM platform_features WHERE feature_key=${q(f)}`);
for (const g of GRADES) ins(`INSERT OR REPLACE INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES (${q(`cls_t${g}a`)},${q(INST)},${q(SEASON)},${g},'A',${q(`${g}/A`)})`);

// invented names; eight students in every grade
const FIRST = ['Aras', 'Defne', 'Efe', 'Elif', 'Mert', 'Zeynep', 'Kerem', 'İpek', 'Can', 'Duru', 'Emir', 'Ada', 'Bora', 'Nehir', 'Kaan', 'Eylül'];
const LAST = ['Yıldırım', 'Akın', 'Toprak', 'Ilgaz', 'Uçar', 'Gündoğdu', 'Erkan', 'Tuna', 'Bayraktar', 'Sezer', 'Altay', 'Karan'];
const students = {};
for (const g of GRADES) {
  students[g] = [];
  for (let i = 1; i <= 8; i++) {
    const id = `stu_t${g}_${i}`, first = FIRST[(g * 3 + i) % FIRST.length], last = LAST[(g + i * 5) % LAST.length];
    students[g].push({ id, first, last });
    ins(`INSERT OR REPLACE INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES (${q(id)},${q(first)},${q(last)},${q(norm(`${first} ${last}`))},'ACTIVE','2027-09-13')`);
    ins(`INSERT OR REPLACE INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES (${q(`enr_t${g}_${i}`)},${q(id)},${q(INST)},${q(SEASON)},${q(`cls_t${g}a`)},${q(String(g * 100 + i))},${g},'A','ACTIVE')`);
  }
}

const accounts = [];
const user = (id, role, displayName, username, studentId = null, institutionId = INST) => {
  const h = hash();
  ins(`INSERT OR REPLACE INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES (${q(id)},${q(institutionId)},${q(studentId)},${q(role)},${q(displayName)},${q(`${username}@tanitim.anunex.com`)},${q(username)},${q(h.hash)},${q(h.salt)},100000,'PBKDF2-SHA256-v1',1)`);
  accounts.push([username, role, displayName]);
};
user('usr_t_admin', 'SUPER_ADMIN', 'Tanıtım Süper Admin', 'admin.tanitim', null, null);
user('usr_t_manager', 'INSTITUTION_MANAGER', 'Tanıtım Okul Müdürü', 'mudur.tanitim');
user('usr_t_guidance', 'GUIDANCE_TEACHER', 'Tanıtım Rehber Öğretmen', 'rehber.tanitim');
const TEACHERS = [['mat', 'sub_mat', 'Matematik'], ['tur', 'sub_tur', 'Türkçe'], ['fen', 'sub_fen', 'Fen Bilimleri'], ['ing', 'sub_ing', 'İngilizce'], ['edb', 'sub_edb', 'Türk Dili ve Edebiyatı'], ['fiz', 'sub_fiz', 'Fizik']];
for (const [code, subjectId, name] of TEACHERS) {
  user(`usr_t_${code}`, 'TEACHER', `Tanıtım ${name} Öğretmeni`, `ogretmen.${code}`);
  for (const g of GRADES) ins(`INSERT OR REPLACE INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) SELECT ${q(`ta_t_${code}_${g}`)},${q(`usr_t_${code}`)},${q(INST)},${q(SEASON)},${q(`cls_t${g}a`)},id,'SUBJECT',1 FROM subjects WHERE id=${q(subjectId)}`);
}
for (const g of GRADES) ins(`INSERT OR REPLACE INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (${q(`ta_t_guid_${g}`)},'usr_t_guidance',${q(INST)},${q(SEASON)},${q(`cls_t${g}a`)},NULL,'GUIDANCE',1)`);
// one student account per grade, so every age group can be shown
for (const g of GRADES) { const s = students[g][0]; user(`usr_t_stu${g}`, 'STUDENT', `${s.first} ${s.last}`, `ogrenci${g}.tanitim`, s.id); }
// one parent with two children (grade 5 and grade 8)
user('usr_t_parent', 'PARENT', 'Tanıtım Veli', 'veli.tanitim');
ins(`INSERT OR REPLACE INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES ('psl_t5','usr_t_parent',${q(students[5][0].id)},'Veli',1),('psl_t8','usr_t_parent',${q(students[8][0].id)},'Veli',1)`);

// TANITIM activity contents: written for the showcase, tied to a verified 2027–2028 outcome by its code, waiting for approval
const outcomeOf = (code) => `(SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND cv.academic_year=${q(YEAR)} AND o.active=1 AND o.code=${q(code)} LIMIT 1)`;
let n = 0;
const content = (code, kind, title, pub, answer) => {
  n++;
  ins(`INSERT OR REPLACE INTO lu_game_contents (id,content_kind,outcome_id,academic_year,grade_level,subject_id,title,public_json,answer_json,owner_type,owner_id,copyright_status,review_status)
    SELECT ${q(`luc_tanitim_${n}`)},${q(kind)},o.id,${q(YEAR)},o.grade_level,o.subject_id,${q(`TANITIM · ${title}`)},${q(JSON.stringify(pub))},${q(JSON.stringify(answer))},'PLATFORM',NULL,'OWNED','REVIEW' FROM outcomes o WHERE o.id=${outcomeOf(code)}`);
};
const pairs = (rows) => ({ pub: { left: rows.map((r, k) => ({ id: `l${k + 1}`, text: r[0] })), right: rows.map((r, k) => ({ id: `r${k + 1}`, text: r[1] })) }, answer: { pairs: rows.map((_, k) => [`l${k + 1}`, `r${k + 1}`]) } });
const seq = (prompt, items) => ({ pub: { prompt, items: items.map((t, k) => ({ id: `s${k + 1}`, text: t })) }, answer: { order: items.map((_, k) => `s${k + 1}`) } });
const steps = (problem, rows) => ({ pub: { problem, steps: rows.map(([p], k) => ({ id: `t${k + 1}`, prompt: p })) }, answer: { steps: Object.fromEntries(rows.map(([, a], k) => [`t${k + 1}`, { numeric: { value: a }, accept: [String(a).replace('.', ',')] }])) } });
const cloze = (text, answers) => ({ pub: { text: answers.reduce((t, _, k) => t.replace('[?]', `[b${k + 1}]`), text), blanks: answers.map((_, k) => ({ id: `b${k + 1}` })) }, answer: { blanks: Object.fromEntries(answers.map((a, k) => [`b${k + 1}`, typeof a === 'number' ? { numeric: { value: a }, accept: [String(a)] } : { accept: [a] }])) } });
const add = (code, kind, title, c) => content(code, kind, title, c.pub, c.answer);

// 4. sınıf matematik
add('MAT.4.1.8', 'SEQUENCE', 'Birim kesirleri sırala', seq('Birim kesirleri küçükten büyüğe sırala.', ['1/8', '1/6', '1/4', '1/2']));
add('MAT.4.1.8', 'SEQUENCE', 'Pizza dilimleri', seq('Aynı büyüklükteki pizzalardan alınan dilimleri küçükten büyüğe sırala.', ['10 eş parçadan biri', '5 eş parçadan biri', '3 eş parçadan biri']));
add('MAT.4.3.7', 'PAIRS', 'Açıları sınıflandır', pairs([['30°', 'Dar açı'], ['90°', 'Dik açı'], ['120°', 'Geniş açı']]));
add('MAT.4.3.7', 'PAIRS', 'Saatteki açılar', pairs([['Saat 3:00 (akrep ile yelkovan)', 'Dik açı'], ['Saat 1:00', 'Dar açı'], ['Saat 5:00', 'Geniş açı']]));
// 5. sınıf matematik
add('MAT.5.2.2', 'STEPS', 'İşlem önceliği', steps('3 + 4 × 2 işleminin sonucunu adım adım bul.', [['Önce çarpma: 4 × 2 = ?', 8], ['Sonra toplama: 3 + 8 = ?', 11]]));
add('MAT.5.2.2', 'CLOZE', 'Önce hangisi?', cloze('12 − 6 ÷ 3 = [?] ve (12 − 6) ÷ 3 = [?]', [10, 2]));
add('MAT.5.2.2', 'CLOZE', 'Parantez', cloze('2 × (5 + 3) = [?]', [16]));
// 8. sınıf matematik
add('MAT.8.1.1', 'PAIRS', 'Üslü ifadeler', pairs([['2³', '8'], ['3²', '9'], ['5⁰', '1'], ['10⁻¹', '0,1']]));
add('MAT.8.1.1', 'SEQUENCE', 'Üslü ifadeleri sırala', seq('Değerleri küçükten büyüğe sırala.', ['2⁻¹', '2⁰', '2²', '3²']));
add('MAT.8.1.1', 'CLOZE', 'Çarpma kuralı', cloze('2⁴ · 2³ = 2 üzeri [?]', [7]));
add('MAT.8.1.1', 'CLOZE', 'Bölme kuralı', cloze('5⁶ ÷ 5² = 5 üzeri [?]', [4]));
add('MAT.8.3.6', 'STEPS', 'Pisagor', steps('Dik kenarları 6 cm ve 8 cm olan dik üçgenin hipotenüsünü bul.', [['6² + 8² = ?', 100], ['Hipotenüs = √100 = ? (cm)', 10]]));
add('MAT.8.3.6', 'STEPS', 'Merdiven', steps('5 m uzunluğundaki merdiven duvardan 3 m uzağa yaslanmış. Merdiven duvara kaç metre yükseklikte değer?', [['5² − 3² = ?', 16], ['Yükseklik = √16 = ? (m)', 4]]));
// 6. sınıf fen
add('FB.6.1.1', 'SEQUENCE', 'Güneşe yakınlık', seq('Gezegenleri Güneşe en yakından başlayarak sırala.', ['Merkür', 'Venüs', 'Dünya', 'Mars']));
add('FB.6.1.1', 'PAIRS', 'Gezegen kartları', pairs([['Güneşe en yakın gezegen', 'Merkür'], ['En büyük gezegen', 'Jüpiter'], ['Belirgin halkalarıyla bilinen', 'Satürn'], ['Kızıl gezegen', 'Mars']]));
add('FB.6.2.3', 'PAIRS', 'Sürat mi hız mı?', pairs([['Yön belirtilmeden 60 km/sa', 'Sürat'], ['Kuzeye doğru 60 km/sa', 'Hız']]));
// 10. sınıf matematik
add('MAT.10.3.1', 'STEPS', 'Asal çarpanlar', steps('60 sayısını asal çarpanlarına ayır.', [['60 ÷ 2 = ?', 30], ['30 ÷ 2 = ?', 15], ['15 ÷ 3 = ?', 5]]));
add('MAT.10.3.1', 'CLOZE', 'Asal çarpan', cloze('36 = 2² · [?]²', [3]));
add('MAT.10.3.1', 'PAIRS', 'Sayı ve asal çarpanları', pairs([['12', '2² · 3'], ['18', '2 · 3²'], ['20', '2² · 5']]));

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/tanitim-seed.sql', `${out.join('\n')}\n`);
writeFileSync('tmp/tanitim-accounts.txt', `ANUNEX Tanıtım ortamı hesapları (şifre hepsinde aynı)\nŞifre: ${PASSWORD}\n\n${accounts.map(([u, r, d]) => `${u}\t${r}\t${d}`).join('\n')}\n`);
console.log(`Generated ${out.length} statements, ${accounts.length} accounts, ${n} TANITIM activities → tmp/tanitim-seed.sql`);
